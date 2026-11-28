-- AlterTable
ALTER TABLE "billing_payments" ADD COLUMN     "gstAmountReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tdsAmountDeducted" DECIMAL(14,2) NOT NULL DEFAULT 0;
