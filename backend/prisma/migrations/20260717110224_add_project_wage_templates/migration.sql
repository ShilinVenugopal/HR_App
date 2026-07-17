-- CreateEnum
CREATE TYPE "WageUploadStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "wage_project_templates" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_project_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_uploads" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "WageUploadStatus" NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errorReport" JSONB,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wage_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wage_entries" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "uploadId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "grossSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wage_project_templates_projectId_key" ON "wage_project_templates"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "wage_project_templates_code_key" ON "wage_project_templates"("code");

-- CreateIndex
CREATE INDEX "wage_uploads_templateId_month_year_idx" ON "wage_uploads"("templateId", "month", "year");

-- CreateIndex
CREATE INDEX "wage_entries_templateId_month_year_idx" ON "wage_entries"("templateId", "month", "year");

-- CreateIndex
CREATE INDEX "wage_entries_projectId_idx" ON "wage_entries"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "wage_entries_templateId_month_year_employeeCode_key" ON "wage_entries"("templateId", "month", "year", "employeeCode");

-- AddForeignKey
ALTER TABLE "wage_project_templates" ADD CONSTRAINT "wage_project_templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_uploads" ADD CONSTRAINT "wage_uploads_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "wage_project_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_uploads" ADD CONSTRAINT "wage_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "wage_project_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wage_entries" ADD CONSTRAINT "wage_entries_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "wage_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
