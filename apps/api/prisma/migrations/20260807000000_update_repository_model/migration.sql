-- DropForeignKey
ALTER TABLE "repositories" DROP CONSTRAINT "repositories_owner_id_fkey";

-- AlterTable
ALTER TABLE "repositories" DROP COLUMN "github_url",
DROP COLUMN "is_private",
DROP COLUMN "owner_id",
DROP COLUMN "status",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "forks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "github_id" INTEGER NOT NULL,
ADD COLUMN     "html_url" TEXT NOT NULL,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "owner" TEXT NOT NULL,
ADD COLUMN     "private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stars" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "user_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "repositories_github_id_key" ON "repositories"("github_id");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
