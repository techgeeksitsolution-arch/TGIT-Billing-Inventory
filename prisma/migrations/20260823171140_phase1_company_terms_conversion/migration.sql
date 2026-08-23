-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "workOrderNo" TEXT;

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "quotationReference" TEXT,
ADD COLUMN     "workOrderNo" TEXT;

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Tech Geeks IT Solution',
    "gstin" TEXT,
    "udyam" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "website" TEXT,
    "state" TEXT,
    "pin" TEXT,
    "bankName" TEXT,
    "branch" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "upiId" TEXT,
    "invoiceFooter" TEXT,
    "invoiceNotes" TEXT,
    "logoStorageKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTerm" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "termType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_organizationId_key" ON "CompanyProfile"("organizationId");

-- CreateIndex
CREATE INDEX "DocumentTerm_organizationId_termType_idx" ON "DocumentTerm"("organizationId", "termType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTerm_organizationId_termType_sortOrder_key" ON "DocumentTerm"("organizationId", "termType", "sortOrder");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTerm" ADD CONSTRAINT "DocumentTerm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
