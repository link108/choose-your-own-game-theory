/*
  Warnings:

  - You are about to drop the column `type` on the `WorldVariable` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "WorldVariable" DROP COLUMN "type",
ADD COLUMN     "config" JSONB,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'resource';
