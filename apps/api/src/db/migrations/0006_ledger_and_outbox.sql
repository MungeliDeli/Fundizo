CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"owner_id" uuid,
	"provider" text,
	"network" text,
	"currency" text DEFAULT 'ZMW' NOT NULL,
	"normal_balance" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_identity" UNIQUE NULLS NOT DISTINCT("kind","owner_id","provider","network"),
	CONSTRAINT "ledger_accounts_currency" CHECK ("ledger_accounts"."currency" = 'ZMW')
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_ngwee" bigint DEFAULT 0 NOT NULL,
	"credit_ngwee" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_one_side" CHECK (("ledger_entries"."debit_ngwee" > 0 and "ledger_entries"."credit_ngwee" = 0) or ("ledger_entries"."credit_ngwee" > 0 and "ledger_entries"."debit_ngwee" = 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_ref" UNIQUE("kind","ref_type","ref_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_entries_account" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "outbox_events_waiting" ON "outbox_events" USING btree ("created_at") WHERE "outbox_events"."published_at" is null;--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Hand-written below (F-06). The ledger's rules are enforced by the database, not only by code.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_kind" CHECK ("kind" IN ('campaign_funds', 'platform_tips', 'network_fees', 'provider_clearing'));--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_normal_balance" CHECK ("normal_balance" IN ('debit', 'credit'));--> statement-breakpoint

-- 1. Append-only: no UPDATE, DELETE or TRUNCATE on transactions or entries, for any role.
CREATE FUNCTION ledger_forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_change();--> statement-breakpoint
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_append_only BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_change();--> statement-breakpoint
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON "ledger_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();--> statement-breakpoint
CREATE TRIGGER ledger_accounts_no_change BEFORE UPDATE OR DELETE ON "ledger_accounts"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_change();--> statement-breakpoint
CREATE TRIGGER ledger_accounts_no_truncate BEFORE TRUNCATE ON "ledger_accounts"
  FOR EACH STATEMENT EXECUTE FUNCTION ledger_forbid_change();--> statement-breakpoint

-- 2. Balanced: at COMMIT, every transaction has at least two entries and debits = credits.
--    Deferred, so all entries of a transaction can be inserted before the check runs.
CREATE FUNCTION ledger_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  txn uuid;
  n integer;
  diff numeric;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    txn := NEW.id;
  ELSE
    txn := NEW.transaction_id;
  END IF;
  SELECT count(*), coalesce(sum(debit_ngwee), 0) - coalesce(sum(credit_ngwee), 0)
    INTO n, diff FROM ledger_entries WHERE transaction_id = txn;
  IF n < 2 OR diff <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced (% entries, debits - credits = %)', txn, n, diff
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balanced AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_transactions_balanced AFTER INSERT ON "ledger_transactions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced();--> statement-breakpoint

-- 3. Least privilege. The API connects as a login role that is a member of fundizo_app (created per
--    environment: scripts/migrate.ts in dev/test/CI, infrastructure in AWS). Migrations run as the owner.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fundizo_app') THEN
    CREATE ROLE fundizo_app NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO fundizo_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fundizo_app;--> statement-breakpoint
-- Tables created by later migrations get the same by default; append-only tables must REVOKE again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fundizo_app;--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "ledger_accounts", "ledger_transactions", "ledger_entries" FROM fundizo_app;
