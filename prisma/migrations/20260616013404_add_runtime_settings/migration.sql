-- CreateTable
CREATE TABLE "RuntimeSettings" (
    "tenantId" TEXT NOT NULL,
    "json" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuntimeSettings_pkey" PRIMARY KEY ("tenantId")
);
