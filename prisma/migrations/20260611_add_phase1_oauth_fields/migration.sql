-- Phase 1: OAuth Integration Fields
-- Adds Google & GitHub OAuth support + session tracking

-- Add OAuth identifiers to User
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
ALTER TABLE "User" ADD COLUMN "githubId" INTEGER;

-- Make passwordHash nullable (OAuth-only users don't have passwords)
ALTER TABLE "User" MODIFY "passwordHash" TEXT;

-- Create unique indexes for OAuth fields
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- Add session tracking fields to AuthSession
ALTER TABLE "AuthSession" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create index on updatedAt for session cleanup queries
CREATE INDEX "AuthSession_updatedAt_idx" ON "AuthSession"("updatedAt");
