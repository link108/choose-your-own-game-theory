-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "resolverConfig" JSONB;

-- AlterTable
ALTER TABLE "Turn" ADD COLUMN     "resolverLog" JSONB;
