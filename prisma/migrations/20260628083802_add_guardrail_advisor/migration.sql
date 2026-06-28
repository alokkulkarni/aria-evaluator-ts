-- CreateTable
CREATE TABLE "PlatformDocChunk" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "docUrl" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embeddingRaw" TEXT NOT NULL DEFAULT '[]',
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformDocChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailAdvisorSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "domain" TEXT NOT NULL,
    "subFunction" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "userFacing" BOOLEAN NOT NULL DEFAULT true,
    "dataTypes" TEXT NOT NULL DEFAULT '[]',
    "autonomyLevel" TEXT,
    "platform" TEXT,
    "rawAnswers" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardrailAdvisorSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuardrailRecommendationRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "guardrailId" TEXT NOT NULL,
    "guardrailType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "regulations" TEXT NOT NULL DEFAULT '[]',
    "platformConfig" TEXT,
    "sourceDocUrls" TEXT NOT NULL DEFAULT '[]',
    "configGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuardrailRecommendationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformDocChunk_platform_idx" ON "PlatformDocChunk"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformDocChunk_docUrl_chunkIndex_key" ON "PlatformDocChunk"("docUrl", "chunkIndex");

-- CreateIndex
CREATE INDEX "GuardrailAdvisorSession_tenantId_idx" ON "GuardrailAdvisorSession"("tenantId");

-- CreateIndex
CREATE INDEX "GuardrailRecommendationRecord_sessionId_idx" ON "GuardrailRecommendationRecord"("sessionId");

-- AddForeignKey
ALTER TABLE "GuardrailRecommendationRecord" ADD CONSTRAINT "GuardrailRecommendationRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GuardrailAdvisorSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
