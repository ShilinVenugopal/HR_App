-- CreateEnum
CREATE TYPE "EmployeeCostCode" AS ENUM ('F01A', 'F02A', 'F03A');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "costCode" "EmployeeCostCode";

-- AlterTable
ALTER TABLE "recruitment_candidates" ADD COLUMN     "costCode" "EmployeeCostCode";
