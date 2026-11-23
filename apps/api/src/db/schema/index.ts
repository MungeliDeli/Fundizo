/**
 * Drizzle schema: one file per module (identity.ts, campaigns.ts, ledger.ts…), re-exported here.
 * Tables arrive with the slices that need them (users in slice 1). `pnpm db:generate` turns
 * changes here into a SQL migration in ../migrations; review it, then `pnpm db:migrate`.
 */
export const SCHEMA_MODULES = [] as const;
