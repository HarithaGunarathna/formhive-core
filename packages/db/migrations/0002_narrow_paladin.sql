-- Add email column: nullable first so existing rows aren't rejected,
-- then backfill a placeholder, then enforce NOT NULL + UNIQUE.
ALTER TABLE "tenants" ADD COLUMN "email" text;--> statement-breakpoint
UPDATE "tenants" SET "email" = concat('tenant-', "id", '@placeholder.local') WHERE "email" IS NULL;--> statement-breakpoint
ALTER TABLE "tenants" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_email_unique" UNIQUE("email");
