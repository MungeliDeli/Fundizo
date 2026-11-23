# 0005. Campaign photos are uploaded through the API and re-encoded before storage

- **Status:** Accepted
- **Date:** 2026-11-23
- **Feature IDs:** C-05, O-02
- **Partly supersedes:** the spec's "presigned uploads; files never pass through the app servers" (SPEC → Recommended stack, File storage) and the matching line in CLAUDE.md, **for public campaign photos only**. KYC documents (A-04, slice 13) get their own decision.

## Context

The spec planned direct-to-S3 uploads with presigned URLs. Our security rules also require every image to be **re-encoded on the server with EXIF/GPS removed before anything is public**. With direct uploads that needs a second pipeline: a private "quarantine" bucket, a background job that reads, cleans and re-writes each file, and a way to tell the browser when the clean version is ready. AWS (S3) only arrives in slice 7. In Codespaces, a browser also can't reach a local S3 emulator on another port without extra setup.

## Decision

1. **The phone compresses first** (canvas, longest edge 1600 px, JPEG ~85%). A 4 MB camera photo becomes roughly 300 KB, which is kinder to 3G data bundles.
2. **The browser sends the photo as the raw request body** to `POST /campaigns/:id/photos` through the same-origin `/api` proxy. The upload route only accepts `image/jpeg|png|webp` and at most **8 MB**, and the limit is enforced before the body is read.
3. **The API validates and re-encodes** with `sharp`:
   - the format is read from the bytes, never from `Content-Type`;
   - limits are 50 megapixels max and 400 × 300 px min;
   - the camera's rotation is applied;
   - **all metadata is dropped**;
   - three WebP versions are written: `w1200`, `w400` and a heavily blurred `blur`.
4. **Only the cleaned WebP files are stored.** The original upload is never kept.
5. **Storage sits behind an `ObjectStorage` adapter:**
   - `local` for now: a git-ignored `apps/api/.storage`, served by the API at `/media/*` and proxied by the web app;
   - `s3` + CDN arrives in slice 7, and production refuses to start until then;
   - keys are `photos/<photoId>/<variant>.webp`, so public URLs never reveal campaign ids.

## Alternatives considered

| Option                                               | Why not (now)                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Presigned direct upload + quarantine bucket + worker | Two storage locations, a job queue (slice 5) and polling for "ready", just to keep ~300 KB off our servers |
| Presigned upload, re-encode on first view            | Unprocessed (GPS-bearing) files would sit in public-facing storage                                         |
| A local S3 emulator in Docker                        | Extra moving parts; presigned URLs signed for one host don't survive the Codespaces port proxy             |

## Consequences

- Upload traffic and image processing use API CPU. That's fine at MVP scale (≤ 10 photos per campaign, rate-limited to 60 uploads per hour per user).
- If it grows, move processing to a worker (slice 5 brings BullMQ) or switch to presigned direct uploads; the `ObjectStorage` interface and `/campaigns/:id/photos` contract stay the same.
- KYC images (NRC, selfies) are more sensitive. They'll use a separate private, encrypted bucket and short-lived signed URLs, decided in their own ADR.
