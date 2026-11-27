-- CreateEnum
CREATE TYPE "SubcontractorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ContractingType" AS ENUM ('VEHICLE', 'MANPOWER_SUPPLY', 'SERVICE_PROVIDER', 'OTHERS');

-- CreateEnum
CREATE TYPE "MSMEType" AS ENUM ('MICRO', 'SMALL', 'MEDIUM', 'OTHERS');

-- CreateEnum
CREATE TYPE "AdditionalAmountType" AS ENUM ('OT', 'EXTRA_HOURS', 'EXTRA_KMS', 'OTHERS');

-- CreateEnum
CREATE TYPE "TdsCalculationMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "SubcontractorPaymentStatus" AS ENUM ('PROCESSED', 'PAID');

-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'SUBCONTRACTORS';

-- CreateTable
CREATE TABLE "subcontractors" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "address" TEXT,
    "gstNumber" TEXT,
    "panNumber" TEXT,
    "msmeAvailable" BOOLEAN NOT NULL DEFAULT false,
    "msmeNumber" TEXT,
    "msmeType" "MSMEType",
    "contactNumber" TEXT NOT NULL,
    "email" TEXT,
    "bankAccountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "contractingType" "ContractingType" NOT NULL,
    "status" "SubcontractorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_bills" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "billingMonth" INTEGER NOT NULL,
    "billingYear" INTEGER NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "foraysWoNumber" TEXT,
    "basicAmount" DECIMAL(14,2) NOT NULL,
    "additionalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "additionalAmountType" "AdditionalAmountType",
    "gstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsPercentage" INTEGER,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsCalculationMode" "TdsCalculationMode" NOT NULL DEFAULT 'AUTO',
    "tollAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossBillAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcontractor_payment_transactions" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "amountProcessed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstAmountProcessed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tdsAmountDeducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentReference" TEXT,
    "remarks" TEXT,
    "status" "SubcontractorPaymentStatus" NOT NULL DEFAULT 'PROCESSED',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcontractor_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcontractors_companyName_idx" ON "subcontractors"("companyName");

-- CreateIndex
CREATE INDEX "subcontractors_contractingType_idx" ON "subcontractors"("contractingType");

-- CreateIndex
CREATE INDEX "subcontractors_status_idx" ON "subcontractors"("status");

-- CreateIndex
CREATE INDEX "subcontractor_bills_projectId_idx" ON "subcontractor_bills"("projectId");

-- CreateIndex
CREATE INDEX "subcontractor_bills_subcontractorId_idx" ON "subcontractor_bills"("subcontractorId");

-- CreateIndex
CREATE INDEX "subcontractor_bills_billingMonth_billingYear_idx" ON "subcontractor_bills"("billingMonth", "billingYear");

-- CreateIndex
CREATE INDEX "subcontractor_bills_invoiceDate_idx" ON "subcontractor_bills"("invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "subcontractor_bills_subcontractorId_invoiceNumber_key" ON "subcontractor_bills"("subcontractorId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "subcontractor_payment_transactions_billId_idx" ON "subcontractor_payment_transactions"("billId");

-- AddForeignKey
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_bills" ADD CONSTRAINT "subcontractor_bills_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_bills" ADD CONSTRAINT "subcontractor_bills_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "subcontractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_bills" ADD CONSTRAINT "subcontractor_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_bills" ADD CONSTRAINT "subcontractor_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payment_transactions" ADD CONSTRAINT "subcontractor_payment_transactions_billId_fkey" FOREIGN KEY ("billId") REFERENCES "subcontractor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payment_transactions" ADD CONSTRAINT "subcontractor_payment_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payment_transactions" ADD CONSTRAINT "subcontractor_payment_transactions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
