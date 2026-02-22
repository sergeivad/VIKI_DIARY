-- CreateEnum
CREATE TYPE "EntryItemType" AS ENUM ('text', 'photo', 'video');

-- CreateTable
CREATE TABLE "diary_entries" (
    "id" UUID NOT NULL,
    "baby_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "event_date" DATE NOT NULL,
    "merge_window_until" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diary_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_items" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "type" "EntryItemType" NOT NULL,
    "text_content" TEXT,
    "file_id" TEXT,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diary_entries_baby_id_created_at_idx" ON "diary_entries"("baby_id", "created_at");

-- CreateIndex
CREATE INDEX "diary_entries_baby_id_author_id_merge_window_until_idx" ON "diary_entries"("baby_id", "author_id", "merge_window_until");

-- CreateIndex
CREATE INDEX "entry_items_entry_id_order_index_idx" ON "entry_items"("entry_id", "order_index");

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_baby_id_fkey" FOREIGN KEY ("baby_id") REFERENCES "babies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_entries" ADD CONSTRAINT "diary_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_items" ADD CONSTRAINT "entry_items_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "diary_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
