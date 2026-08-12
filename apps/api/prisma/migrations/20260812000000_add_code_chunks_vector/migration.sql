-- Enable pgvector extension if not already present
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "code_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repository_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "language" TEXT,
    "start_line" INTEGER NOT NULL,
    "end_line" INTEGER NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "lines_count" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL,
    "metadata" JSONB,
    "embedding" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "code_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "code_chunks_repository_id_idx" ON "code_chunks"("repository_id");
CREATE INDEX "code_chunks_file_id_idx" ON "code_chunks"("file_id");
CREATE INDEX "code_chunks_checksum_idx" ON "code_chunks"("checksum");
CREATE UNIQUE INDEX "code_chunks_file_id_chunk_index_key" ON "code_chunks"("file_id", "chunk_index");

-- Create HNSW Vector Index for Cosine Distance Search
CREATE INDEX IF NOT EXISTS "code_chunks_embedding_idx" ON "code_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKeys
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "repository_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
