-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "scenarioOverridesJson" TEXT;

-- CreateTable
CREATE TABLE "ScenarioEval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioIndex" INTEGER NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "scenarioType" TEXT,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "summary" TEXT,
    "dimensionScores" TEXT NOT NULL,
    "judgeModels" TEXT,
    "judgeAgreement" DOUBLE PRECISION,
    "requiresHumanReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioEval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScenarioEval_runId_idx" ON "ScenarioEval"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioEval_runId_scenarioIndex_key" ON "ScenarioEval"("runId", "scenarioIndex");

-- AddForeignKey
ALTER TABLE "ScenarioEval" ADD CONSTRAINT "ScenarioEval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
