-- AlterTable
ALTER TABLE "CompanyProfile" ADD COLUMN     "nonGstPrefix" TEXT DEFAULT 'TGIT/NG';

-- AlterTable
ALTER TABLE "PurchaseInvoice" ADD COLUMN     "roundOffMode" TEXT DEFAULT 'NEAREST';

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "roundOffMode" TEXT DEFAULT 'NEAREST';

-- CreateTable
CREATE TABLE "NonGstBill" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "billNumber" TEXT NOT NULL,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" UUID,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "paymentMode" TEXT,
    "notes" TEXT,
    "taxableTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOffMode" TEXT DEFAULT 'NEAREST',
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonGstBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonGstBillItem" (
    "id" UUID NOT NULL,
    "billId" UUID NOT NULL,
    "productId" UUID,
    "description" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "NonGstBillItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NonGstBill_organizationId_billNumber_key" ON "NonGstBill"("organizationId", "billNumber");

-- AddForeignKey
ALTER TABLE "NonGstBill" ADD CONSTRAINT "NonGstBill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonGstBill" ADD CONSTRAINT "NonGstBill_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonGstBill" ADD CONSTRAINT "NonGstBill_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonGstBillItem" ADD CONSTRAINT "NonGstBillItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "NonGstBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonGstBillItem" ADD CONSTRAINT "NonGstBillItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
