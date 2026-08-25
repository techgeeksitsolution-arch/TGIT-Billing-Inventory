-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "convertedInvoiceId" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "convertedInvoiceNumber" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "convertedAt" TIMESTAMP(3);
