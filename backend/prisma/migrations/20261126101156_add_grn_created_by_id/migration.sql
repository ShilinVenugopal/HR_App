-- AlterTable
ALTER TABLE "goods_received_notes" ADD COLUMN     "createdById" TEXT;

-- AddForeignKey
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
