-- AlterTable
ALTER TABLE "CompanyProfile" ADD COLUMN     "logoBase64" TEXT,
ADD COLUMN     "quotationPrefix" TEXT DEFAULT 'TGIT/QUOT',
ADD COLUMN     "salesPrefix" TEXT DEFAULT 'TGIT';
