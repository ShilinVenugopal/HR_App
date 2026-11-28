-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('OD', 'CURRENT', 'CC');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BankTransactionType" AS ENUM ('RECEIPT', 'PAYMENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "BankEntryType" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "BankSourceModule" AS ENUM ('BILLING_STATUS', 'SUBCONTRACTOR_PAYMENTS', 'ADVANCES', 'WAGES', 'SITE_ACCOUNTS', 'MANUAL', 'TRANSFER');

-- CreateEnum
CREATE TYPE "BankReconciliationStatus" AS ENUM ('RECONCILED', 'RECONCILIATION_REQUIRED');

-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'BANK_ACCOUNTS';

-- AlterTable
ALTER TABLE "advances" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "billing_payments" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "site_account_statements" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "subcontractor_payment_transactions" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "wage_records" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolderName" TEXT NOT NULL,
    "accountType" "BankAccountType" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branchName" TEXT,
    "ifscCode" TEXT,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3) NOT NULL,
    "status" "BankAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "transactionType" "BankTransactionType" NOT NULL,
    "projectId" TEXT,
    "description" TEXT NOT NULL,
    "remarks" TEXT,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "modifiedAmount" DECIMAL(14,2),
    "sourceModule" "BankSourceModule" NOT NULL,
    "sourceRecordId" TEXT,
    "transferGroupId" TEXT,
    "entryType" "BankEntryType" NOT NULL DEFAULT 'MANUAL',
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconciliations" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "totalReceipts" DECIMAL(14,2) NOT NULL,
    "totalPayments" DECIMAL(14,2) NOT NULL,
    "closingBookBalance" DECIMAL(14,2) NOT NULL,
    "bankStatementBalance" DECIMAL(14,2) NOT NULL,
    "bankStatementDate" TIMESTAMP(3),
    "bankStatementRemarks" TEXT,
    "reconciliationDifference" DECIMAL(14,2) NOT NULL,
    "reconciliationStatus" "BankReconciliationStatus" NOT NULL,
    "remarks" TEXT,
    "reconciledById" TEXT NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_accounts_status_idx" ON "bank_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_accountNumber_key" ON "bank_accounts"("accountNumber");

-- CreateIndex
CREATE INDEX "bank_transactions_bankAccountId_idx" ON "bank_transactions"("bankAccountId");

-- CreateIndex
CREATE INDEX "bank_transactions_transactionDate_idx" ON "bank_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "bank_transactions_transactionType_idx" ON "bank_transactions"("transactionType");

-- CreateIndex
CREATE INDEX "bank_transactions_sourceModule_sourceRecordId_idx" ON "bank_transactions"("sourceModule", "sourceRecordId");

-- CreateIndex
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions"("status");

-- CreateIndex
CREATE INDEX "bank_reconciliations_bankAccountId_idx" ON "bank_reconciliations"("bankAccountId");

-- CreateIndex
CREATE INDEX "bank_reconciliations_periodFrom_periodTo_idx" ON "bank_reconciliations"("periodFrom", "periodTo");

-- AddForeignKey
ALTER TABLE "wage_records" ADD CONSTRAINT "wage_records_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payments" ADD CONSTRAINT "billing_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_statements" ADD CONSTRAINT "site_account_statements_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcontractor_payment_transactions" ADD CONSTRAINT "subcontractor_payment_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
