-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "worldDescription" TEXT NOT NULL,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actor" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "traits" JSONB NOT NULL DEFAULT '[]',
    "isPlayer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorResource" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "minValue" INTEGER NOT NULL DEFAULT 0,
    "maxValue" INTEGER NOT NULL DEFAULT 9999,

    CONSTRAINT "ActorResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorRelationship" (
    "id" TEXT NOT NULL,
    "fromActorId" TEXT NOT NULL,
    "toActorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'neutral',
    "strength" INTEGER NOT NULL DEFAULT 50,
    "description" TEXT,

    CONSTRAINT "ActorRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldVariable" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'number',
    "minValue" TEXT,
    "maxValue" TEXT,

    CONSTRAINT "WorldVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "turn" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "playerChoiceId" TEXT,
    "playerChoiceText" TEXT,
    "stateChanges" JSONB NOT NULL DEFAULT '[]',
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActorResponse" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reasoning" TEXT,

    CONSTRAINT "ActorResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderedPage" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "stateSummary" JSONB NOT NULL,
    "choices" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenderedPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Actor_scenarioId_idx" ON "Actor"("scenarioId");

-- CreateIndex
CREATE INDEX "ActorResource_actorId_idx" ON "ActorResource"("actorId");

-- CreateIndex
CREATE INDEX "ActorRelationship_fromActorId_idx" ON "ActorRelationship"("fromActorId");

-- CreateIndex
CREATE INDEX "ActorRelationship_toActorId_idx" ON "ActorRelationship"("toActorId");

-- CreateIndex
CREATE UNIQUE INDEX "ActorRelationship_fromActorId_toActorId_key" ON "ActorRelationship"("fromActorId", "toActorId");

-- CreateIndex
CREATE INDEX "WorldVariable_scenarioId_idx" ON "WorldVariable"("scenarioId");

-- CreateIndex
CREATE INDEX "GameSession_scenarioId_idx" ON "GameSession"("scenarioId");

-- CreateIndex
CREATE INDEX "Turn_sessionId_idx" ON "Turn"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_sessionId_turnNumber_key" ON "Turn"("sessionId", "turnNumber");

-- CreateIndex
CREATE INDEX "ActorResponse_turnId_idx" ON "ActorResponse"("turnId");

-- CreateIndex
CREATE INDEX "ActorResponse_actorId_idx" ON "ActorResponse"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "RenderedPage_turnId_key" ON "RenderedPage"("turnId");

-- AddForeignKey
ALTER TABLE "Actor" ADD CONSTRAINT "Actor_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorResource" ADD CONSTRAINT "ActorResource_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorRelationship" ADD CONSTRAINT "ActorRelationship_fromActorId_fkey" FOREIGN KEY ("fromActorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorRelationship" ADD CONSTRAINT "ActorRelationship_toActorId_fkey" FOREIGN KEY ("toActorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldVariable" ADD CONSTRAINT "WorldVariable_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorResponse" ADD CONSTRAINT "ActorResponse_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActorResponse" ADD CONSTRAINT "ActorResponse_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderedPage" ADD CONSTRAINT "RenderedPage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "Turn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
