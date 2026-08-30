-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "base_sha" TEXT,
ADD COLUMN     "head_sha" TEXT,
ADD COLUMN     "pr_number" INTEGER,
ADD COLUMN     "target_ref" TEXT,
ADD COLUMN     "trigger_source" TEXT DEFAULT 'manual';

-- CreateIndex
CREATE INDEX "analysis_jobs_repository_id_pr_number_head_sha_idx" ON "analysis_jobs"("repository_id", "pr_number", "head_sha");
