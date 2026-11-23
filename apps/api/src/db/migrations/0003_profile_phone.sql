ALTER TABLE "one_time_tokens" DROP CONSTRAINT "one_time_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD COLUMN "target" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "province" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "district" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users" USING btree ("phone_e164");--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_purpose_check" CHECK ("one_time_tokens"."purpose" in ('verify_email', 'reset_password', 'verify_phone'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_language_check" CHECK ("users"."language" in ('en', 'bem', 'nya', 'toi'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_pair_check" CHECK (("users"."phone_e164" is null) = ("users"."phone_verified_at" is null));