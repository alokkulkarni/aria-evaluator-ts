-- CreateTable
CREATE TABLE "Explanation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'shapley-turn',
    "configHash" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Explanation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Explanation_runId_idx" ON "Explanation"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Explanation_runId_dimensionId_method_key" ON "Explanation"("runId", "dimensionId", "method");

-- AddForeignKey
ALTER TABLE "Explanation" ADD CONSTRAINT "Explanation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
