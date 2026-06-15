-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Baseline" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "CalibrationDataset" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Experiment" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN "tenantId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_externalId_key" ON "Tenant"("externalId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuthSession_tenantId_idx" ON "AuthSession"("tenantId");

-- CreateIndex
CREATE INDEX "Baseline_tenantId_idx" ON "Baseline"("tenantId");

-- CreateIndex
CREATE INDEX "CalibrationDataset_tenantId_idx" ON "CalibrationDataset"("tenantId");

-- CreateIndex
CREATE INDEX "Experiment_tenantId_idx" ON "Experiment"("tenantId");

-- CreateIndex
CREATE INDEX "Run_tenantId_idx" ON "Run"("tenantId");

-- CreateIndex
CREATE INDEX "Scenario_tenantId_idx" ON "Scenario"("tenantId");

-- CreateIndex
CREATE INDEX "Schedule_tenantId_idx" ON "Schedule"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
