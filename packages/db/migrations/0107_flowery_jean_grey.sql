ALTER TABLE "workspace_settings" ALTER COLUMN "native_sign_enabled" SET DEFAULT true;
UPDATE "workspace_settings" SET "native_sign_enabled" = true WHERE "native_sign_enabled" = false;
