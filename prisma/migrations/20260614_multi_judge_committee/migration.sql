-- Phase 1: Multi-judge committee
-- Adds ensemble metadata to EvalResult (nullable — safe for existing rows).

ALTER TABLE "EvalResult" ADD COLUMN "judgeModels" TEXT;
ALTER TABLE "EvalResult" ADD COLUMN "judgeAgreement" REAL;
ALTER TABLE "EvalResult" ADD COLUMN "requiresHumanReview" BOOLEAN;
ALTER TABLE "EvalResult" ADD COLUMN "judgeConfigHash" TEXT;
