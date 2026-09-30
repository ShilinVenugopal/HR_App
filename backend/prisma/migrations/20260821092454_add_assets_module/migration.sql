-- AlterEnum
ALTER TYPE "ModuleName" ADD VALUE 'ASSETS';

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "itemDescription" TEXT NOT NULL,
    "unit" "Unit" NOT NULL,
    "workingQuantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "nonWorkingQuantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_projectId_idx" ON "assets"("projectId");

-- CreateIndex
CREATE INDEX "assets_costCodeId_idx" ON "assets"("costCodeId");

-- CreateIndex
CREATE INDEX "assets_itemDescription_idx" ON "assets"("itemDescription");

-- CreateIndex
CREATE INDEX "assets_date_idx" ON "assets"("date");

-- CreateIndex
CREATE INDEX "assets_createdAt_idx" ON "assets"("createdAt");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
