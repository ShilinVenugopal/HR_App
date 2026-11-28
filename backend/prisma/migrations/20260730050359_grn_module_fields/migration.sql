-- AlterTable
ALTER TABLE "goods_received_notes" ADD COLUMN     "grnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "inventoryUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "inventoryUpdatedById" TEXT;

-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "rejectedQtyChange" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_inventoryUpdatedById_fkey" FOREIGN KEY ("inventoryUpdatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

