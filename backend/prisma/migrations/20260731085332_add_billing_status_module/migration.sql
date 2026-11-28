-- CreateEnum
CREATE TYPE "BillingItemStatus" AS ENUM ('PENDING_CERTIFICATION', 'A1_PENDING', 'A2_PENDING', 'ACCOUNTS_PENDING', 'INVOICE_DONE');

-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'BILLING_STATUS';

-- CreateTable
CREATE TABLE "billing_records" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billingMonth" INTEGER NOT NULL,
    "billingYear" INTEGER NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_items" (
    "id" TEXT NOT NULL,
    "billingRecordId" TEXT NOT NULL,
    "srNo" INTEGER NOT NULL,
    "plantUnit" TEXT NOT NULL,
    "invoiceNo" TEXT,
    "jmsNo" TEXT,
    "abstractAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "BillingItemStatus" NOT NULL DEFAULT 'PENDING_CERTIFICATION',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_records_projectId_idx" ON "billing_records"("projectId");

-- CreateIndex
CREATE INDEX "billing_records_billingMonth_billingYear_idx" ON "billing_records"("billingMonth", "billingYear");

-- CreateIndex
CREATE INDEX "billing_items_billingRecordId_idx" ON "billing_items"("billingRecordId");

-- CreateIndex
CREATE INDEX "billing_items_status_idx" ON "billing_items"("status");

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
