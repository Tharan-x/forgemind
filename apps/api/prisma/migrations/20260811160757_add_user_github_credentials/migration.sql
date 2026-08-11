-- CreateTable
CREATE TABLE "user_github_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "github_username" TEXT,
    "github_avatar_url" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_github_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_github_credentials_user_id_key" ON "user_github_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "user_github_credentials" ADD CONSTRAINT "user_github_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
