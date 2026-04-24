CREATE TYPE "ScenarioCreationSessionStatus" AS ENUM ('ACTIVE', 'DRAFT_READY', 'ACCEPTED', 'ABANDONED');
CREATE TYPE "ScenarioCreationMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "ScenarioCreationMessageKind" AS ENUM ('CHAT', 'SUMMARY', 'OPTION_PROMPT', 'DRAFT_UPDATE');
CREATE TYPE "ScenarioCreationOptionSelectionMode" AS ENUM ('SINGLE', 'MULTIPLE');
CREATE TYPE "ScenarioCreationOptionGroupStatus" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED');

CREATE TABLE "ScenarioCreationSession" (
  "id" TEXT NOT NULL,
  "status" "ScenarioCreationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "title" TEXT,
  "sourcePrompt" TEXT NOT NULL DEFAULT '',
  "workingDraft" JSONB,
  "createdScenarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScenarioCreationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScenarioCreationMessage" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "role" "ScenarioCreationMessageRole" NOT NULL,
  "kind" "ScenarioCreationMessageKind" NOT NULL DEFAULT 'CHAT',
  "content" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScenarioCreationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScenarioCreationOptionGroup" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "selectionMode" "ScenarioCreationOptionSelectionMode" NOT NULL,
  "status" "ScenarioCreationOptionGroupStatus" NOT NULL DEFAULT 'OPEN',
  "options" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScenarioCreationOptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScenarioCreationSession_status_idx" ON "ScenarioCreationSession"("status");
CREATE INDEX "ScenarioCreationMessage_sessionId_createdAt_idx" ON "ScenarioCreationMessage"("sessionId", "createdAt");
CREATE INDEX "ScenarioCreationOptionGroup_sessionId_status_idx" ON "ScenarioCreationOptionGroup"("sessionId", "status");

ALTER TABLE "ScenarioCreationMessage"
ADD CONSTRAINT "ScenarioCreationMessage_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ScenarioCreationSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScenarioCreationOptionGroup"
ADD CONSTRAINT "ScenarioCreationOptionGroup_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ScenarioCreationSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
