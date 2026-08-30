-- CreateTable (Architecture Health Snapshots)
CREATE TABLE IF NOT EXISTS "architecture_health_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repository_id" UUID NOT NULL,
    "analysis_job_id" UUID NOT NULL,
    "commit_hash" TEXT,
    "health_score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "total_files" INTEGER NOT NULL DEFAULT 0,
    "total_dependencies" INTEGER NOT NULL DEFAULT 0,
    "circular_cycle_count" INTEGER NOT NULL DEFAULT 0,
    "layer_violation_count" INTEGER NOT NULL DEFAULT 0,
    "hotspot_count" INTEGER NOT NULL DEFAULT 0,
    "orphan_export_count" INTEGER NOT NULL DEFAULT 0,
    "score_breakdown" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "fan_metrics" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "architecture_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "architecture_health_snapshots_analysis_job_id_key" ON "architecture_health_snapshots"("analysis_job_id");
CREATE INDEX IF NOT EXISTS "architecture_health_snapshots_repository_id_created_at_idx" ON "architecture_health_snapshots"("repository_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "architecture_health_snapshots_repository_id_idx" ON "architecture_health_snapshots"("repository_id");

-- AddForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'architecture_health_snapshots_repository_id_fkey'
    ) THEN
        ALTER TABLE "architecture_health_snapshots" ADD CONSTRAINT "architecture_health_snapshots_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'architecture_health_snapshots_analysis_job_id_fkey'
    ) THEN
        ALTER TABLE "architecture_health_snapshots" ADD CONSTRAINT "architecture_health_snapshots_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
