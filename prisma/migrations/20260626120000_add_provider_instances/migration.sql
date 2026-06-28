-- AlterTable
ALTER TABLE "RunTelemetry" ADD COLUMN     "providerInstanceId" TEXT,
ADD COLUMN     "providerInstanceName" TEXT;

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "providerInstanceId" TEXT;

-- CreateTable
CREATE TABLE "ProviderInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "providerType" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderInstance_tenantId_providerType_idx" ON "ProviderInstance"("tenantId", "providerType");

