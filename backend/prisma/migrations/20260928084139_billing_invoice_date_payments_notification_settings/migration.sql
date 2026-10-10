-- AlterTable
ALTER TABLE "billing_items" ADD COLUMN     "invoiceDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "billing_payments" (
    "id" TEXT NOT NULL,
    "billingItemId" TEXT NOT NULL,
    "amountReceived" DECIMAL(14,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_notification_settings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dueDays" INTEGER NOT NULL DEFAULT 30,
    "visibleStatuses" TEXT[] DEFAULT ARRAY['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']::TEXT[],
    "visibleFields" TEXT[] DEFAULT ARRAY['project', 'invoiceNo', 'invoiceDate', 'invoiceAmount', 'amountReceived', 'outstandingAmount', 'dueDate', 'paymentStatus']::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_payments_billingItemId_idx" ON "billing_payments"("billingItemId");

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_billingItemId_fkey" FOREIGN KEY ("billingItemId") REFERENCES "billing_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_notification_settings" ADD CONSTRAINT "billing_notification_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
