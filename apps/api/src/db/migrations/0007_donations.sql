CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"amount_ngwee" bigint NOT NULL,
	"tip_ngwee" bigint NOT NULL,
	"network_fee_ngwee" bigint,
	"donor_name" text,
	"anonymous" boolean NOT NULL,
	"message" text,
	"phone_e164" text NOT NULL,
	"network" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donations_amount_positive" CHECK ("donations"."amount_ngwee" > 0),
	CONSTRAINT "donations_tip_nonnegative" CHECK ("donations"."tip_ngwee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donation_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"network" text NOT NULL,
	"phone_e164" text NOT NULL,
	"amount_ngwee" bigint NOT NULL,
	"status" text DEFAULT 'initiated' NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_ref" text,
	"failure_reason" text,
	"fee_ngwee" bigint,
	"prompt_sent_at" timestamp with time zone,
	"check_count" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempts_amount_positive" CHECK ("payment_attempts"."amount_ngwee" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "donations_idempotency_key" ON "donations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "donations_campaign_wall" ON "donations" USING btree ("campaign_id","settled_at") WHERE "donations"."status" = 'successful';--> statement-breakpoint
CREATE INDEX "payment_attempts_donation" ON "payment_attempts" USING btree ("donation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_idempotency_key" ON "payment_attempts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_one_open" ON "payment_attempts" USING btree ("donation_id") WHERE "payment_attempts"."status" in ('initiated', 'pending', 'unknown');--> statement-breakpoint
-- Hand-written (D-09): statuses are a closed set, and money records are never deleted by the app.
ALTER TABLE "donations" ADD CONSTRAINT "donations_status" CHECK ("status" IN ('pending', 'successful', 'failed', 'expired', 'unknown'));--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_network" CHECK ("network" IN ('MTN', 'AIRTEL'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_status" CHECK ("status" IN ('initiated', 'pending', 'successful', 'failed', 'expired', 'unknown'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_provider" CHECK ("provider" IN ('FAKE', 'ZYNLE'));--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_network" CHECK ("network" IN ('MTN', 'AIRTEL'));--> statement-breakpoint
REVOKE DELETE, TRUNCATE ON "donations", "payment_attempts" FROM fundizo_app;
