CREATE TABLE IF NOT EXISTS "campaign_reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"reminder_index" integer NOT NULL,
	"recipient_ref" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_reminder_log_campaign_id_reminder_index_recipient_ref_unique" UNIQUE("campaign_id","reminder_index","recipient_ref")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_reminder_log" ADD CONSTRAINT "campaign_reminder_log_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
