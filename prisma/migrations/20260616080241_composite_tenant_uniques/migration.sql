-- Tenant-scoped uniqueness: filePath/name are unique per tenant, so different
-- tenants can reuse the same scenario filePath or schedule name.

-- DropIndex
DROP INDEX "Scenario_filePath_key";

-- DropIndex
DROP INDEX "Schedule_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_tenantId_filePath_key" ON "Scenario"("tenantId", "filePath");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_tenantId_name_key" ON "Schedule"("tenantId", "name");

