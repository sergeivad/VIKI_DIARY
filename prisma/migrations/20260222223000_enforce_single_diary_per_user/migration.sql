-- DropIndex
DROP INDEX "baby_members_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "baby_members_user_id_key" ON "baby_members"("user_id");
