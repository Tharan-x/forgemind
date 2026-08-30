-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "action" TEXT,
    "repository_id" UUID,
    "github_repo_id" INTEGER,
    "pr_number" INTEGER,
    "head_sha" TEXT,
    "base_sha" TEXT,
    "sender" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "ignored_reason" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_delivery_id_key" ON "webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_delivery_id_idx" ON "webhook_deliveries"("delivery_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_repository_id_pr_number_idx" ON "webhook_deliveries"("repository_id", "pr_number");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
