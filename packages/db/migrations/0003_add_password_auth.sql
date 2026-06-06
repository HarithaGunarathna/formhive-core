-- Rename name → account_name, add unique constraint, add password_hash.
-- Safe for existing rows: sanitize the old name values into valid account names,
-- then backfill password_hash with a non-matching placeholder so existing
-- accounts cannot log in via password until re-provisioned.

-- 1. Rename the column
ALTER TABLE "tenants" RENAME COLUMN "name" TO "account_name";--> statement-breakpoint

-- 2. Sanitize existing account_name values to match ^[a-z0-9_]{3,30}$
--    (e.g. "Formhive Admin" → "formhive_admin")
UPDATE "tenants"
  SET "account_name" = left(
    regexp_replace(lower("account_name"), '[^a-z0-9_]', '_', 'g'),
    30
  );--> statement-breakpoint

-- 3. Add unique constraint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_account_name_unique" UNIQUE("account_name");--> statement-breakpoint

-- 4. Add password_hash as nullable first
ALTER TABLE "tenants" ADD COLUMN "password_hash" text;--> statement-breakpoint

-- 5. Backfill existing rows with a locked placeholder (never matches bcrypt.compare)
UPDATE "tenants" SET "password_hash" = 'LOCKED' WHERE "password_hash" IS NULL;--> statement-breakpoint

-- 6. Enforce NOT NULL
ALTER TABLE "tenants" ALTER COLUMN "password_hash" SET NOT NULL;
