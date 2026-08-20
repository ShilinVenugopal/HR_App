-- CreateEnum
CREATE TYPE "AssetUnit" AS ENUM ('NOS', 'MTR', 'LOT', 'EA', 'KG', 'TON', 'LITER', 'PAIR');

-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'ASSETS';

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "srNo" SERIAL NOT NULL,
    "costCode" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "unit" "AssetUnit" NOT NULL,
    "workingQuantity" DECIMAL(12,2) NOT NULL,
    "nonWorkingQuantity" DECIMAL(12,2) NOT NULL,
    "remarks" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_srNo_key" ON "assets"("srNo");

-- CreateIndex
CREATE INDEX "assets_projectId_idx" ON "assets"("projectId");

-- CreateIndex
CREATE INDEX "assets_costCode_idx" ON "assets"("costCode");

-- CreateIndex
CREATE INDEX "assets_itemDescription_idx" ON "assets"("itemDescription");

-- CreateIndex
CREATE INDEX "assets_date_idx" ON "assets"("date");

-- CreateIndex
CREATE INDEX "assets_createdAt_idx" ON "assets"("createdAt");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
