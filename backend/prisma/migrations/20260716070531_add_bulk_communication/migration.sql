-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommBatchStatus" AS ENUM ('QUEUED', 'SENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommMessageStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'BOUNCED', 'CANCELLED');

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "category" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_batches" (
    "id" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "templateId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "attachments" JSONB,
    "scheduledAt" TIMESTAMP(3),
    "status" "CommBatchStatus" NOT NULL DEFAULT 'QUEUED',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_message_logs" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "projectId" TEXT,
    "channel" "CommChannel" NOT NULL,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "errorReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communication_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communication_templates_channel_idx" ON "communication_templates"("channel");

-- CreateIndex
CREATE INDEX "communication_batches_channel_idx" ON "communication_batches"("channel");

-- CreateIndex
CREATE INDEX "communication_batches_status_idx" ON "communication_batches"("status");

-- CreateIndex
CREATE INDEX "communication_batches_scheduledAt_idx" ON "communication_batches"("scheduledAt");

-- CreateIndex
CREATE INDEX "communication_message_logs_batchId_idx" ON "communication_message_logs"("batchId");

-- CreateIndex
CREATE INDEX "communication_message_logs_candidateId_idx" ON "communication_message_logs"("candidateId");

-- CreateIndex
CREATE INDEX "communication_message_logs_projectId_idx" ON "communication_message_logs"("projectId");

-- CreateIndex
CREATE INDEX "communication_message_logs_status_idx" ON "communication_message_logs"("status");

-- CreateIndex
CREATE INDEX "communication_message_logs_scheduledAt_idx" ON "communication_message_logs"("scheduledAt");

-- AddForeignKey
ALTER TABLE "communication_templates" ADD CONSTRAINT "communication_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_batches" ADD CONSTRAINT "communication_batches_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "communication_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_batches" ADD CONSTRAINT "communication_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_logs" ADD CONSTRAINT "communication_message_logs_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "communication_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_logs" ADD CONSTRAINT "communication_message_logs_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "recruitment_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_message_logs" ADD CONSTRAINT "communication_message_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
