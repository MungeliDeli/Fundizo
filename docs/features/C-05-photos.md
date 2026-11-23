# C-05 — Fundraiser photos

|                 |                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Feature IDs** | C-05 (photos), O-02 (link previews now include the cover image)                                                                                              |
| **Phase**       | 1 · MVP slice 4                                                                                                                                              |
| **Status**      | Shipped (local storage; S3 + CDN in slice 7)                                                                                                                 |
| **Module(s)**   | API `modules/campaigns` (`campaign-photos.*`), `infra/images`, `infra/storage`; web `features/campaigns/photos`, wizard step `photos`; shared `campaigns.ts` |
| **ADRs**        | [0005 Photo uploads through the API](../architecture/decisions/0005-photo-uploads-through-the-api.md)                                                        |

## 1. Summary

The wizard has a new **Photos** step (5 of 6). Organisers add a cover photo and up to 9 more. Photos are shrunk on the phone, then cleaned on the server: turned upright, location and camera data removed, saved as WebP. **A cover photo is now required to publish.** Any photo can be made the cover, and graphic or private medical photos can be marked **"Blur (sensitive)"**: donors see a blurred version until they tap **Show photo**.

The public page shows the cover at the top and the rest in a Photos section. WhatsApp and Facebook previews show the cover (the blurred version if it's marked sensitive).

## 2. Flow

1. **Pick photos:** **Add a cover photo** / **Add photos** opens the phone's gallery or camera (`accept="image/*"`, several at once).
2. **Compress on the phone:** `createImageBitmap` (camera rotation applied) → canvas → JPEG at 85%, longest edge 1600 px. HEIC that the browser can't read gets a plain-words message.
3. **Upload one at a time:** `POST /api/campaigns/:id/photos`, raw body, `Content-Type: image/jpeg`, CSRF header. Each photo shows its own "Adding photo…" tile; a failure shows the reason on the tile.
4. **Server:** check ownership and draft status, max 10, read and validate the image, re-encode to `w1200`, `w400` and `blur`, store, and record the photo row (appended last).
5. **Tile actions:** **Make cover**, **Blur (sensitive)** / **Show clearly**, **Remove** (deletes the row and the files).
6. **Continue** goes to Review, which has a **Photos** row (count, plus "some shown blurred").

## 3. API

All `/campaigns/...` photo routes need a session and the CSRF header, and act on **the session user's own draft** (another person's campaign or photo is 404). Live fundraisers can't change photos yet (409), as with other edits.

| Method & path                           | Body                                                          | Success          | Errors                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `POST /campaigns/:id/photos`            | raw image (`image/jpeg`, `image/png` or `image/webp`; ≤ 8 MB) | 201 `{ photos }` | 415 / 422 `bad_image` (not an image, wrong format, too small, unreadable), 413 `bad_image` (too big), 409 `too_many_photos` |
| `PATCH /campaigns/:id/photos/:photoId`  | `{ cover: true }` or `{ sensitive: boolean }` (strict)        | 200 `{ photos }` | 404                                                                                                                         |
| `DELETE /campaigns/:id/photos/:photoId` | —                                                             | 200 `{ photos }` | 404                                                                                                                         |
| `GET /media/photos/<id>/<w1200          | w400                                                          | blur>.webp`      | —                                                                                                                           | 200 `image/webp` | 404 for anything else. Dev/local storage only; production serves from the CDN. |

`Photo` = `{ id, url, thumbUrl, blurUrl, sensitive, width, height }`. `OwnCampaign` and `PublicCampaign` both gained `photos` (cover first). URLs are **relative** (`/media/...`) by default, so they load from whichever address the page was opened on. Production sets `MEDIA_PUBLIC_BASE_URL` to the CDN. Publishing now lists `photos: "Add a cover photo."` when none exist.

## 4. Data and storage

- **Migration `0005_campaign_media`:** `campaign_media` (campaign, width, height, `sensitive`, `sort`; the lowest `sort` is the cover). "Make cover" sets `sort` below the current minimum.
- **Files:** `photos/<photoId>/w1200.webp`, `w400.webp`, `blur.webp`. Keyed by the photo's own random id, so URLs never reveal the campaign's internal id. Only cleaned files are stored; originals are discarded.
- **Local storage:** `apps/api/.storage/` (git-ignored). Tests use a throwaway temp folder.
- **Config:**
  - `STORAGE_DRIVER=local` (default; production refuses it, and `s3` arrives in slice 7);
  - `STORAGE_LOCAL_DIR`;
  - `MEDIA_PUBLIC_BASE_URL` (optional).

## 5. Security & privacy

- **Ownership:** every photo change first loads the campaign with the session user's id (404 otherwise), then checks the photo belongs to that campaign.
- **Content checks (server):**
  - the format is read from the bytes (an SVG or PDF labelled `image/jpeg` is refused);
  - only JPEG, PNG and WebP;
  - 400 × 300 px min, 50 MP max (decompression bombs);
  - 8 MB max enforced by the body parser before reading.
- **Metadata:** the camera rotation is applied, then **EXIF, GPS and ICC are dropped**. Tests prove a photo carrying GPS coordinates and a camera name comes out with neither, both in unit tests and on the served file in the browser test.
- **Serving:**
  - `Content-Type: image/webp`, `nosniff`, `Content-Security-Policy: default-src 'none'`;
  - immutable caching (keys never change);
  - strict key pattern, plus a check that paths stay inside the storage folder.
- **Sensitive photos:** the blurred version is made on the server. The clear version isn't downloaded until the viewer taps **Show photo**, and link previews use the blurred version.
- **Draft photos** are reachable only by their unguessable URL (random UUIDs), the same as a public bucket would be. Moderation (T-02) comes later.
- **Rate limit:** 60 uploads per user per hour.

## 6. Failure modes & edge cases

| Situation                                   | What happens                                                 | Test            |
| ------------------------------------------- | ------------------------------------------------------------ | --------------- |
| Not an image (even if labelled JPEG)        | 422 "That file isn't a photo we can read…" on the tile       | ✅ API + web    |
| Over 8 MB                                   | 413 "That photo is too big…"                                 | ✅ API          |
| 11th photo                                  | 409; the add tile disappears at 10                           | ✅ API          |
| Tiny image                                  | 422 "too small"                                              | ✅ unit         |
| Sideways phone photo (EXIF orientation)     | Stored upright                                               | ✅ unit         |
| HEIC the browser can't read                 | Message on the tile; nothing uploaded                        | manual          |
| Someone else's campaign or photo            | 404                                                          | ✅ API          |
| Removed photo                               | Row and files gone; URL 404                                  | ✅ API          |
| Publish without photos                      | 422 `photos: "Add a cover photo."`; review links to the step | ✅ API + shared |
| Path tricks on `/media`                     | 404                                                          | ✅ API          |
| Fundraisers published before photos existed | Category illustration stays as the cover                     | ✅ web          |

## 7. Testing

- **Unit:** `image-processor.spec.ts` (WebP outputs, EXIF/GPS stripped, rotation applied, SVG/PDF/GIF refused, size limits).
- **API:** `test/photos.e2e-spec.ts` (11 tests): serving clean files, limits, ownership, cover/blur/delete, publish rule, public photos, media route safety. `campaigns.e2e-spec.ts` updated (publishing needs a cover).
- **Web:** Photos step (upload request shape, errors on tiles, cover/blur/remove), the sensitive cover on the public page (blurred → Show photo → clear), `resumeStep` → photos.
- **Browser (Chromium):** the full journey with real JPEGs carrying GPS and camera EXIF: compressed in the browser, uploaded, cover changed, one blurred, published. The served file has no EXIF; `og:image` points at the cover; the public gallery reveals on tap. Screenshots at 390 px and 1440 px, light and dark.

## Changelog

| Date       | Change          |
| ---------- | --------------- |
| 2026-11-23 | Slice 4 shipped |
