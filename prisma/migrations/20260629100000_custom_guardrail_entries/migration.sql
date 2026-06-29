-- CreateTable
CREATE TABLE "CustomGuardrailDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomGuardrailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomGuardrailFunction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "domainSlug" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomGuardrailFunction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomGuardrailDomain_tenantId_idx" ON "CustomGuardrailDomain"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomGuardrailDomain_tenantId_slug_key" ON "CustomGuardrailDomain"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "CustomGuardrailFunction_tenantId_idx" ON "CustomGuardrailFunction"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomGuardrailFunction_tenantId_domainSlug_slug_key" ON "CustomGuardrailFunction"("tenantId", "domainSlug", "slug");
