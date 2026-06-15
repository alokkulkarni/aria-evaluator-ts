-- Phase 3: Calibration subsystem
-- Human ground-truth labels + per-judge agreement (Cohen's κ).

CREATE TABLE "CalibrationDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

CREATE TABLE "CalibrationLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT,
    "source" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "humanScore" REAL NOT NULL,
    "labeledBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalibrationLabel_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "CalibrationDataset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "JudgeCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "judgeProvider" TEXT NOT NULL,
    "judgeModelId" TEXT NOT NULL,
    "dimensionId" TEXT,
    "datasetId" TEXT,
    "sampleCount" INTEGER NOT NULL,
    "weightedKappa" REAL NOT NULL,
    "binaryKappa" REAL,
    "withinOneRate" REAL NOT NULL,
    "exactAgreement" REAL NOT NULL,
    "meanAbsError" REAL NOT NULL,
    "trust" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JudgeCalibration_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "CalibrationDataset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CalibrationDataset_createdAt_idx" ON "CalibrationDataset"("createdAt");
CREATE UNIQUE INDEX "CalibrationLabel_runId_dimensionId_source_key" ON "CalibrationLabel"("runId", "dimensionId", "source");
CREATE INDEX "CalibrationLabel_datasetId_idx" ON "CalibrationLabel"("datasetId");
CREATE INDEX "CalibrationLabel_runId_idx" ON "CalibrationLabel"("runId");
CREATE INDEX "CalibrationLabel_dimensionId_idx" ON "CalibrationLabel"("dimensionId");
CREATE UNIQUE INDEX "JudgeCalibration_judgeModelId_dimensionId_datasetId_key" ON "JudgeCalibration"("judgeModelId", "dimensionId", "datasetId");
CREATE INDEX "JudgeCalibration_judgeModelId_idx" ON "JudgeCalibration"("judgeModelId");
CREATE INDEX "JudgeCalibration_trust_idx" ON "JudgeCalibration"("trust");
