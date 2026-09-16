-- AlterTable
ALTER TABLE "po_items" ADD COLUMN     "remarks" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "poDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

