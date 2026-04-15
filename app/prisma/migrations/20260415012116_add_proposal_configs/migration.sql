-- AlterTable
ALTER TABLE "Actor" ADD COLUMN     "responseConfig" JSONB;

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "promptConfig" JSONB;

-- AlterTable
ALTER TABLE "Turn" ADD COLUMN     "proposals" JSONB;
