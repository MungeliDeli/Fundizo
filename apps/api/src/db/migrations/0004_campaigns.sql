CREATE TABLE "campaign_beneficiaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"relationship" text,
	"phone_e164" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_beneficiaries_kind_check" CHECK ("campaign_beneficiaries"."kind" in ('self', 'someone_else')),
	CONSTRAINT "campaign_beneficiaries_named_check" CHECK ("campaign_beneficiaries"."kind" = 'self' or ("campaign_beneficiaries"."name" is not null and "campaign_beneficiaries"."relationship" is not null))
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"slug" text,
	"type" text DEFAULT 'standard' NOT NULL,
	"type_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category" text,
	"title" text DEFAULT '' NOT NULL,
	"story" jsonb DEFAULT '{"whatHappened":"","moneyFor":"","extra":""}'::jsonb NOT NULL,
	"goal_ngwee" bigint,
	"end_date" date,
	"province" text,
	"district" text,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_status_check" CHECK ("campaigns"."status" in ('draft', 'published')),
	CONSTRAINT "campaigns_category_check" CHECK ("campaigns"."category" is null or "campaigns"."category" in ('medical', 'funeral', 'education', 'emergency', 'community', 'event', 'other')),
	CONSTRAINT "campaigns_goal_check" CHECK ("campaigns"."goal_ngwee" is null or "campaigns"."goal_ngwee" > 0),
	CONSTRAINT "campaigns_verification_check" CHECK ("campaigns"."verification_status" in ('unverified', 'verified')),
	CONSTRAINT "campaigns_published_check" CHECK ("campaigns"."status" = 'draft' or ("campaigns"."slug" is not null and "campaigns"."published_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "campaign_beneficiaries" ADD CONSTRAINT "campaign_beneficiaries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_beneficiaries_campaign_key" ON "campaign_beneficiaries" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "campaigns_owner_idx" ON "campaigns" USING btree ("owner_user_id");