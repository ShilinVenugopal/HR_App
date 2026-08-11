-- AlterTable
ALTER TABLE "communication_message_logs" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "communication_message_logs_deletedAt_idx" ON "communication_message_logs"("deletedAt");

-- AddForeignKey
ALTER TABLE "communication_message_logs" ADD CONSTRAINT "communication_message_logs_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
