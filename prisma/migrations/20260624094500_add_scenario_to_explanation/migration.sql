-- AlterTable
ALTER TABLE "Explanation" ADD COLUMN     "scenarioName" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "Explanation_runId_dimensionId_method_key";

-- CreateIndex
CREATE UNIQUE INDEX "Explanation_runId_scenarioName_dimensionId_method_key" ON "Explanation"("runId", "scenarioName", "dimensionId", "method");
