-- DropIndex
DROP INDEX "goods_received_notes_grnNumber_key";

-- DropIndex
DROP INDEX "purchase_requisitions_requestNumber_key";

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "projectNumber" TEXT;

-- AlterTable
ALTER TABLE "purchase_requisitions" ADD COLUMN     "siteInchargeName" TEXT,
ADD COLUMN     "storeInchargeName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "goods_received_notes_projectId_grnNumber_key" ON "goods_received_notes"("projectId", "grnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_projectId_requestNumber_key" ON "purchase_requisitions"("projectId", "requestNumber");

