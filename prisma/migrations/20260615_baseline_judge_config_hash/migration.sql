-- Phase 2: baseline judge-version drift
-- Capture the committee config hash at baseline time so regression comparisons
-- can detect when the judge configuration has drifted (nullable — safe).

ALTER TABLE "Baseline" ADD COLUMN "judgeConfigHash" TEXT;
