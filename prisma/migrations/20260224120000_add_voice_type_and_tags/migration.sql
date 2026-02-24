-- AlterEnum
ALTER TYPE "EntryItemType" ADD VALUE 'voice';

-- AlterTable
ALTER TABLE "diary_entries" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
