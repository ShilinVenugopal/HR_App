-- CreateEnum
CREATE TYPE "SiteAccountStatementStatus" AS ENUM ('DRAFT', 'SAVED');

-- CreateEnum
CREATE TYPE "SiteAccountEntryType" AS ENUM ('OTHER_RECEIPT', 'EXPENSE');

-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'SITE_ACCOUNTS';

-- CreateTable
CREATE TABLE "site_account_cost_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "parentCode" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "hasSubtotal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_account_cost_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_account_statements" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "statementMonth" INTEGER NOT NULL,
    "statementYear" INTEGER NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "siteFundReceived" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "SiteAccountStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_account_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_account_entries" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "entryType" "SiteAccountEntryType" NOT NULL,
    "costCodeId" TEXT,
    "voucherNo" TEXT,
    "particulars" TEXT,
    "receiptAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "depositAdvanceAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_account_entry_dates" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_account_entry_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_account_cost_codes_code_key" ON "site_account_cost_codes"("code");

-- CreateIndex
CREATE INDEX "site_account_cost_codes_parentCode_idx" ON "site_account_cost_codes"("parentCode");

-- CreateIndex
CREATE INDEX "site_account_statements_projectId_idx" ON "site_account_statements"("projectId");

-- CreateIndex
CREATE INDEX "site_account_statements_statementMonth_statementYear_idx" ON "site_account_statements"("statementMonth", "statementYear");

-- CreateIndex
CREATE INDEX "site_account_statements_status_idx" ON "site_account_statements"("status");

-- CreateIndex
CREATE INDEX "site_account_entries_statementId_idx" ON "site_account_entries"("statementId");

-- CreateIndex
CREATE INDEX "site_account_entries_costCodeId_idx" ON "site_account_entries"("costCodeId");

-- CreateIndex
CREATE INDEX "site_account_entry_dates_entryId_idx" ON "site_account_entry_dates"("entryId");

-- AddForeignKey
ALTER TABLE "site_account_statements" ADD CONSTRAINT "site_account_statements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_statements" ADD CONSTRAINT "site_account_statements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_statements" ADD CONSTRAINT "site_account_statements_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_entries" ADD CONSTRAINT "site_account_entries_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "site_account_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_entries" ADD CONSTRAINT "site_account_entries_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "site_account_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_entries" ADD CONSTRAINT "site_account_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_entries" ADD CONSTRAINT "site_account_entries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_account_entry_dates" ADD CONSTRAINT "site_account_entry_dates_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "site_account_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
