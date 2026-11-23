-- Baseline migration (slice 0). Proves the migration pipeline end to end; tables arrive with the
-- slices that need them (users in slice 1). Applied migrations are recorded in drizzle.__drizzle_migrations.
SELECT 1;
