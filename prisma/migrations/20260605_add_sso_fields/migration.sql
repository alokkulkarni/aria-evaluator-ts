-- Add SSO fields to User for control-plane SSO login support
-- email: the user's email address (used for SSO upsert lookup)
-- ssoSubject: the control-plane userId, used as stable identity key for SSO users

ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "ssoSubject" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_ssoSubject_key" ON "User"("ssoSubject");
