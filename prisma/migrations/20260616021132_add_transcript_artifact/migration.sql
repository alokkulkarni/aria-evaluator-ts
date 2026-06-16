-- CreateTable
CREATE TABLE "TranscriptArtifact" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "scenarioName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptArtifact_runId_idx" ON "TranscriptArtifact"("runId");

-- CreateIndex
CREATE INDEX "TranscriptArtifact_createdAt_idx" ON "TranscriptArtifact"("createdAt");

-- CreateIndex
CREATE INDEX "TranscriptArtifact_tenantId_idx" ON "TranscriptArtifact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptArtifact_runId_ref_key" ON "TranscriptArtifact"("runId", "ref");

-- AddForeignKey
ALTER TABLE "TranscriptArtifact" ADD CONSTRAINT "TranscriptArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
