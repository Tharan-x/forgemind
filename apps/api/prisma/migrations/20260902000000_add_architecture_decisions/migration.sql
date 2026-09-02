-- CreateTable
CREATE TABLE "architecture_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repository_id" UUID NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "commit_url" TEXT,
    "commit_message" TEXT,
    "author" TEXT,
    "committed_at" TIMESTAMP(3),
    "pr_number" INTEGER,
    "pr_url" TEXT,
    "pr_title" TEXT,
    "pr_body" TEXT,
    "affected_paths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changed_files" JSONB,
    "health_score_delta" INTEGER,
    "evidence_metadata" JSONB,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "architecture_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "architecture_decisions_repository_id_commit_hash_key" ON "architecture_decisions"("repository_id", "commit_hash");

-- CreateIndex
CREATE INDEX "architecture_decisions_repository_id_idx" ON "architecture_decisions"("repository_id");

-- CreateIndex
CREATE INDEX "architecture_decisions_repository_id_pr_number_idx" ON "architecture_decisions"("repository_id", "pr_number");

-- AddForeignKey
ALTER TABLE "architecture_decisions" ADD CONSTRAINT "architecture_decisions_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
