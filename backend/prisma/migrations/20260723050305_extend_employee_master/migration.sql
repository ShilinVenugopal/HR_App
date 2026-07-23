-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmployeeStatus" ADD VALUE 'ON_LEAVE';
ALTER TYPE "EmployeeStatus" ADD VALUE 'BLACKLISTED';

-- DropIndex
DROP INDEX "employees_employeeId_key";

-- Backfill: contactNumber is becoming mandatory. Any pre-existing rows
-- without one (there should be none in a normal setup) get a visible
-- placeholder instead of failing the migration outright, so this is safe
-- to apply against a database with real data in it.
UPDATE "employees" SET "contactNumber" = '0000000000' WHERE "contactNumber" IS NULL;

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "employeeId",
ADD COLUMN     "aadhaarNumber" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankIfscCode" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "esicNumber" TEXT,
ADD COLUMN     "fatherName" TEXT,
ADD COLUMN     "panNumber" TEXT,
ADD COLUMN     "passportNumber" TEXT,
ADD COLUMN     "pfNumber" TEXT,
ADD COLUMN     "uanNumber" TEXT,
ALTER COLUMN "contactNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "employees_aadhaarNumber_key" ON "employees"("aadhaarNumber");
