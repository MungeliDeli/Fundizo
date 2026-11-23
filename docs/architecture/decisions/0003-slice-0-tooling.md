# 0003. Slice 0 tooling choices

- **Status:** Accepted
- **Date:** 2026-11-23
- **Feature IDs:** F-01

## Context

Setting up the monorepo surfaced choices the spec doesn't cover.

## Decision

| Topic                           | Choice                                                                                                            | Why                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Module system                   | **ESM everywhere** (`"type": "module"`, `.js` in relative imports)                                                | NestJS 12 ships ESM only                                                                              |
| How the browser reaches the API | **Same-origin proxy**: Next rewrites `/api/*` to the API; the API has no CORS                                     | First-party cookies for login (slice 1), no CORS attack surface, one public origin                    |
| Database access in Nest         | Our own small `DatabaseModule` (pg `Pool` + Drizzle)                                                              | `@nestjs/drizzle` is at 0.0.x and needs Drizzle release candidates                                    |
| Linting                         | **oxlint** (type-aware) for `apps/api` and `packages/shared`; **ESLint** with `eslint-config-next` for `apps/web` | oxlint is what Nest 12 generates and is fast; Next's React and accessibility rules are ESLint plugins |
| Tests                           | **Vitest** everywhere; API integration tests run against real Postgres and Redis                                  | One runner; no mocked database for money code                                                         |
| Shared package                  | Compiled to `dist/` (ESM + types); Turbo builds it before dependants                                              | The API runs plain Node, which can't import TypeScript source                                         |
| Config                          | Zod-validated env; dev defaults match docker-compose; **none in production**                                      | `pnpm dev` works with zero setup, and production fails loudly on missing secrets                      |

## Consequences

- Two linters to maintain (small configs).
- Every new endpoint's request/response shape goes in `packages/shared` first.
- Revisit `@nestjs/drizzle` when it reaches 1.0.
