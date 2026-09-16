-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'EXPENSE';

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "uom" "Unit",
    "manpower" DECIMAL(10,2) NOT NULL,
    "basicSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalManpowerNetSalary" DECIMAL(14,2) NOT NULL,
    "leavePay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pf" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "esic" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "transportation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accommodation" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "operationalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "labLicenseBgFund" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ppe" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "coverall" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "medicalExpense" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "toolsAndMachinery" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mobDemobCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "insurance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "consumables" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "misc" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_projectId_idx" ON "expenses"("projectId");

-- CreateIndex
CREATE INDEX "expenses_year_month_idx" ON "expenses"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_projectId_year_month_key" ON "expenses"("projectId", "year", "month");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
