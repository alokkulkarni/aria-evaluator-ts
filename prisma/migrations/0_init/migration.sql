-- Squashed baseline of the full schema (replaces the earlier incremental
-- migrations, which had no initial create-tables migration and so were not
-- replayable from an empty database). Generated from prisma/schema.prisma.

-- CreateTable
CREATE TABLE "BootstrapState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "ssoSubject" TEXT,
    "passwordHash" TEXT,
    "googleSub" TEXT,
    "githubId" INTEGER,
    "microsoftSub" TEXT,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "metadataJson" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filePath" TEXT NOT NULL,
    "sourceRef" TEXT,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "description" TEXT,
    "yamlContent" TEXT NOT NULL,
    "owner" TEXT,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
    "contentHash" TEXT,
    "lastRevisionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScenarioRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "yamlContent" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "changedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioRevision_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT,
    "scenarioName" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "audioPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Run_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payloadJson" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "workerId" TEXT,
    "claimedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "durationMs" INTEGER,
    "timestampMs" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Turn_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "overallScore" REAL NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "dimensionScores" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendation" TEXT,
    "judgeModel" TEXT NOT NULL,
    "scenarioType" TEXT,
    "judgeTokenInputEstimate" INTEGER,
    "judgeTokenOutputEstimate" INTEGER,
    "judgeTokenTotalEstimate" INTEGER,
    "judgeEstimatedCostUsd" REAL,
    "costPricingVersion" INTEGER,
    "securityScore" REAL,
    "judgeModels" TEXT,
    "judgeAgreement" REAL,
    "requiresHumanReview" BOOLEAN,
    "judgeConfigHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvalResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evalResultId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "scoreOverride" REAL,
    "passedOverride" BOOLEAN,
    "notes" TEXT,
    "dimensionOverridesJson" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_evalResultId_fkey" FOREIGN KEY ("evalResultId") REFERENCES "EvalResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "totalRuns" INTEGER NOT NULL,
    "passRate" REAL NOT NULL,
    "avgScore" REAL NOT NULL,
    "avgLatencyMs" INTEGER NOT NULL,
    "dimensionIdsJson" TEXT NOT NULL,
    "dimensionMetricsJson" TEXT NOT NULL,
    "judgeModel" TEXT NOT NULL,
    "judgeVersion" INTEGER NOT NULL,
    "judgeConfigHash" TEXT,
    "thresholdOverridesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "notes" TEXT,
    CONSTRAINT "Baseline_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Baseline_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Experiment_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Experiment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExperimentLeg" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "description" TEXT,
    "targetRunCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExperimentLeg_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExperimentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "tagsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExperimentRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExperimentRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExperimentRun_legId_fkey" FOREIGN KEY ("legId") REFERENCES "ExperimentLeg" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RunTelemetry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "tokenInputEstimate" INTEGER,
    "tokenOutputEstimate" INTEGER,
    "tokenTotalEstimate" INTEGER,
    "failureClass" TEXT,
    "estimatorVersion" INTEGER NOT NULL DEFAULT 1,
    "attackCategory" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RunTelemetry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SecurityAttack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "inferred" BOOLEAN NOT NULL DEFAULT true,
    "target" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityAttack_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "htmlPath" TEXT NOT NULL,
    "jsonPath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "frequency" TEXT NOT NULL,
    "cronExpression" TEXT,
    "dayOfWeek" INTEGER,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "scenarioId" TEXT,
    "scenarioFile" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'connect',
    "channel" TEXT NOT NULL DEFAULT 'chat',
    "customMetadata" TEXT,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME NOT NULL,
    "lastStatus" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "maxFailures" INTEGER NOT NULL DEFAULT 5,
    CONSTRAINT "Schedule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CalibrationDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "PairwiseDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'import',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);

-- CreateTable
CREATE TABLE "PairwiseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "responseA" TEXT NOT NULL,
    "responseB" TEXT NOT NULL,
    "humanWinner" TEXT NOT NULL,
    "modelA" TEXT,
    "modelB" TEXT,
    "language" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairwiseItem_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "PairwiseDataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PairwiseVerdict" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "judgeProvider" TEXT NOT NULL,
    "judgeModelId" TEXT NOT NULL,
    "preferred" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairwiseVerdict_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PairwiseItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PairwiseCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "judgeProvider" TEXT NOT NULL,
    "judgeModelId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "agreementAccuracy" REAL NOT NULL,
    "binaryKappa" REAL NOT NULL,
    "tieRate" REAL NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PairwiseCalibration_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "PairwiseDataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_ssoSubject_key" ON "User"("ssoSubject");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftSub_key" ON "User"("microsoftSub");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_filePath_key" ON "Scenario"("filePath");

-- CreateIndex
CREATE INDEX "Scenario_sourceRef_idx" ON "Scenario"("sourceRef");

-- CreateIndex
CREATE INDEX "Scenario_lifecycleStatus_idx" ON "Scenario"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "ScenarioRevision_scenarioId_createdAt_idx" ON "ScenarioRevision"("scenarioId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioRevision_scenarioId_contentHash_key" ON "ScenarioRevision"("scenarioId", "contentHash");

-- CreateIndex
CREATE INDEX "Run_status_createdAt_idx" ON "Run"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Run_scenarioId_idx" ON "Run"("scenarioId");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_runId_key" ON "Job"("runId");

-- CreateIndex
CREATE INDEX "Job_status_createdAt_idx" ON "Job"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RunEvent_runId_id_idx" ON "RunEvent"("runId", "id");

-- CreateIndex
CREATE INDEX "Turn_runId_idx" ON "Turn"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalResult_runId_key" ON "EvalResult"("runId");

-- CreateIndex
CREATE INDEX "EvalResult_passed_createdAt_idx" ON "EvalResult"("passed", "createdAt");

-- CreateIndex
CREATE INDEX "EvalResult_overallScore_idx" ON "EvalResult"("overallScore");

-- CreateIndex
CREATE UNIQUE INDEX "Review_evalResultId_key" ON "Review"("evalResultId");

-- CreateIndex
CREATE INDEX "Review_runId_idx" ON "Review"("runId");

-- CreateIndex
CREATE INDEX "Review_status_queuedAt_idx" ON "Review"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "Review_reviewedBy_idx" ON "Review"("reviewedBy");

-- CreateIndex
CREATE INDEX "Baseline_scenarioId_idx" ON "Baseline"("scenarioId");

-- CreateIndex
CREATE INDEX "Baseline_createdAt_idx" ON "Baseline"("createdAt");

-- CreateIndex
CREATE INDEX "Baseline_judgeModel_idx" ON "Baseline"("judgeModel");

-- CreateIndex
CREATE INDEX "Baseline_createdBy_idx" ON "Baseline"("createdBy");

-- CreateIndex
CREATE INDEX "Experiment_scenarioId_idx" ON "Experiment"("scenarioId");

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "Experiment"("status");

-- CreateIndex
CREATE INDEX "Experiment_createdBy_idx" ON "Experiment"("createdBy");

-- CreateIndex
CREATE INDEX "ExperimentLeg_experimentId_idx" ON "ExperimentLeg"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentRun_runId_key" ON "ExperimentRun"("runId");

-- CreateIndex
CREATE INDEX "ExperimentRun_experimentId_idx" ON "ExperimentRun"("experimentId");

-- CreateIndex
CREATE INDEX "ExperimentRun_legId_idx" ON "ExperimentRun"("legId");

-- CreateIndex
CREATE UNIQUE INDEX "RunTelemetry_runId_key" ON "RunTelemetry"("runId");

-- CreateIndex
CREATE INDEX "RunTelemetry_createdAt_idx" ON "RunTelemetry"("createdAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_completedAt_idx" ON "RunTelemetry"("completedAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_provider_createdAt_idx" ON "RunTelemetry"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_provider_completedAt_idx" ON "RunTelemetry"("provider", "completedAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_failureClass_createdAt_idx" ON "RunTelemetry"("failureClass", "createdAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_status_createdAt_idx" ON "RunTelemetry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_status_completedAt_idx" ON "RunTelemetry"("status", "completedAt");

-- CreateIndex
CREATE INDEX "RunTelemetry_attackCategory_createdAt_idx" ON "RunTelemetry"("attackCategory", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAttack_runId_key" ON "SecurityAttack"("runId");

-- CreateIndex
CREATE INDEX "SecurityAttack_category_idx" ON "SecurityAttack"("category");

-- CreateIndex
CREATE INDEX "SecurityAttack_severity_idx" ON "SecurityAttack"("severity");

-- CreateIndex
CREATE INDEX "SecurityAttack_createdAt_idx" ON "SecurityAttack"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_runId_key" ON "Report"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_name_key" ON "Schedule"("name");

-- CreateIndex
CREATE INDEX "Schedule_createdBy_status_idx" ON "Schedule"("createdBy", "status");

-- CreateIndex
CREATE INDEX "Schedule_nextRunAt_status_idx" ON "Schedule"("nextRunAt", "status");

-- CreateIndex
CREATE INDEX "Schedule_status_idx" ON "Schedule"("status");

-- CreateIndex
CREATE INDEX "ScheduleRun_scheduleId_triggeredAt_idx" ON "ScheduleRun"("scheduleId", "triggeredAt");

-- CreateIndex
CREATE INDEX "ScheduleRun_runId_idx" ON "ScheduleRun"("runId");

-- CreateIndex
CREATE INDEX "CalibrationDataset_createdAt_idx" ON "CalibrationDataset"("createdAt");

-- CreateIndex
CREATE INDEX "CalibrationLabel_datasetId_idx" ON "CalibrationLabel"("datasetId");

-- CreateIndex
CREATE INDEX "CalibrationLabel_runId_idx" ON "CalibrationLabel"("runId");

-- CreateIndex
CREATE INDEX "CalibrationLabel_dimensionId_idx" ON "CalibrationLabel"("dimensionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationLabel_runId_dimensionId_source_key" ON "CalibrationLabel"("runId", "dimensionId", "source");

-- CreateIndex
CREATE INDEX "JudgeCalibration_judgeModelId_idx" ON "JudgeCalibration"("judgeModelId");

-- CreateIndex
CREATE INDEX "JudgeCalibration_trust_idx" ON "JudgeCalibration"("trust");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeCalibration_judgeModelId_dimensionId_datasetId_key" ON "JudgeCalibration"("judgeModelId", "dimensionId", "datasetId");

-- CreateIndex
CREATE INDEX "PairwiseDataset_createdAt_idx" ON "PairwiseDataset"("createdAt");

-- CreateIndex
CREATE INDEX "PairwiseItem_datasetId_idx" ON "PairwiseItem"("datasetId");

-- CreateIndex
CREATE INDEX "PairwiseVerdict_itemId_idx" ON "PairwiseVerdict"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PairwiseVerdict_itemId_judgeModelId_key" ON "PairwiseVerdict"("itemId", "judgeModelId");

-- CreateIndex
CREATE INDEX "PairwiseCalibration_judgeModelId_idx" ON "PairwiseCalibration"("judgeModelId");

-- CreateIndex
CREATE UNIQUE INDEX "PairwiseCalibration_judgeModelId_datasetId_key" ON "PairwiseCalibration"("judgeModelId", "datasetId");

