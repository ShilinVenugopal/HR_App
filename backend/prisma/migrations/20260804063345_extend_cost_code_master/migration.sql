-- AlterTable
ALTER TABLE "cost_codes" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "itemsToConsider" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "responsiblePerson" TEXT,
ADD COLUMN     "updatedById" TEXT;

-- AddForeignKey
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_codes" ADD CONSTRAINT "cost_codes_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
