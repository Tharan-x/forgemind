-- CreateTable
CREATE TABLE "repository_symbols" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repository_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "start_line" INTEGER,
    "end_line" INTEGER,
    "exported" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_symbols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_dependencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repository_id" UUID NOT NULL,
    "source_file_id" UUID NOT NULL,
    "source_path" TEXT NOT NULL,
    "target_path" TEXT NOT NULL,
    "is_external" BOOLEAN NOT NULL DEFAULT false,
    "imported_symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repository_symbols_repository_id_idx" ON "repository_symbols"("repository_id");

-- CreateIndex
CREATE INDEX "repository_symbols_file_id_idx" ON "repository_symbols"("file_id");

-- CreateIndex
CREATE INDEX "file_dependencies_repository_id_idx" ON "file_dependencies"("repository_id");

-- CreateIndex
CREATE INDEX "file_dependencies_source_file_id_idx" ON "file_dependencies"("source_file_id");

-- AddForeignKey
ALTER TABLE "repository_symbols" ADD CONSTRAINT "repository_symbols_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_symbols" ADD CONSTRAINT "repository_symbols_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "repository_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_dependencies" ADD CONSTRAINT "file_dependencies_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_dependencies" ADD CONSTRAINT "file_dependencies_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "repository_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
