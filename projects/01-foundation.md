# Project 1: Foundation

## Goal
Scaffold the Next.js app with Prisma + Postgres, Tailwind + shadcn/ui, and the base project structure. Everything builds and connects to the database.

## Tech Stack
- Next.js 14 (App Router)
- TypeScript
- Prisma ORM + PostgreSQL
- Tailwind CSS + shadcn/ui
- pnpm

## Subprojects

### 1.1 Next.js App Scaffold
- `npx create-next-app@latest` with App Router, TypeScript, Tailwind
- Configure path aliases (`@/`)
- Basic layout with sidebar placeholder + main content area
- shadcn/ui init + install base components (Button, Card, Input, Textarea, Dialog, Select, Badge)

### 1.2 Prisma + Database Schema
- Install Prisma, configure for PostgreSQL
- `.env` with `DATABASE_URL` pointing to local Postgres on Hetzner
- Initial schema covering all core entities:

```prisma
model Scenario {
  id          String   @id @default(cuid())
  name        String
  description String   @db.Text
  worldDescription String @db.Text
  status      ScenarioStatus @default(DRAFT) // DRAFT, ACTIVE, COMPLETED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  actors      Actor[]
  worldVariables WorldVariable[]
  sessions    GameSession[]
}

model Actor {
  id          String   @id @default(cuid())
  scenarioId  String
  scenario    Scenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  name        String
  description String   @db.Text
  goals       String   @db.Text       // JSON string of goals
  traits      String   @db.Text       // JSON string of traits
  isPlayer    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  resources       ActorResource[]
  relationshipsFrom ActorRelationship[] @relation("fromActor")
  relationshipsTo   ActorRelationship[] @relation("toActor")
  actorResponses  ActorResponse[]
}

model ActorResource {
  id       String @id @default(cuid())
  actorId  String
  actor    Actor  @relation(fields: [actorId], references: [id], onDelete: Cascade)
  name     String   // e.g. "gold", "troops", "influence"
  value    Int
  minValue Int      @default(0)
  maxValue Int      @default(9999)
}

model ActorRelationship {
  id          String @id @default(cuid())
  fromActorId String
  fromActor   Actor  @relation("fromActor", fields: [fromActorId], references: [id], onDelete: Cascade)
  toActorId   String
  toActor     Actor  @relation("toActor", fields: [toActorId], references: [id], onDelete: Cascade)
  type        String   // e.g. "ally", "rival", "neutral", "vassal"
  strength    Int      @default(50) // 0-100
  description String?  @db.Text
}

model WorldVariable {
  id         String   @id @default(cuid())
  scenarioId String
  scenario   Scenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  name       String
  value      String   // stored as string, typed on read
  type       String   @default("number") // number, string, boolean
  minValue   String?
  maxValue   String?
}

model GameSession {
  id         String   @id @default(cuid())
  scenarioId String
  scenario   Scenario @relation(fields: [scenarioId], references: [id], onDelete: Cascade)
  turn       Int      @default(0)
  state      Json     // snapshot of current ScenarioState
  status     SessionStatus @default(ACTIVE) // ACTIVE, PAUSED, COMPLETED
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  turns      Turn[]
}

model Turn {
  id            String      @id @default(cuid())
  sessionId     String
  session       GameSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  turnNumber    Int
  playerChoiceId String?
  playerChoiceText String?  @db.Text
  stateChanges  Json       // array of changes applied
  events        Json       // array of events that occurred
  createdAt     DateTime   @default(now())

  actorResponses ActorResponse[]
  renderedPage   RenderedPage?
}

model ActorResponse {
  id       String @id @default(cuid())
  turnId   String
  turn     Turn   @relation(fields: [turnId], references: [id], onDelete: Cascade)
  actorId  String
  actor    Actor  @relation(fields: [actorId], references: [id], onDelete: Cascade)
  action   String @db.Text
  reasoning String? @db.Text
}

model RenderedPage {
  id           String @id @default(cuid())
  turnId       String @unique
  turn         Turn   @relation(fields: [turnId], references: [id], onDelete: Cascade)
  title        String
  narrative    String @db.Text
  stateSummary Json
  choices      Json   // array of { id, text, description }
  createdAt    DateTime @default(now())
}

enum ScenarioStatus {
  DRAFT
  ACTIVE
  COMPLETED
}

enum SessionStatus {
  ACTIVE
  PAUSED
  COMPLETED
}
```

- Run `prisma migrate dev` to create initial migration
- Seed script with one example scenario (e.g. "Trade War" with 3 actors)

### 1.3 Project Structure
```
src/
  app/
    layout.tsx
    page.tsx              # home / scenario list
    scenarios/
      page.tsx            # scenario list
      new/page.tsx        # create scenario
      [id]/
        page.tsx          # scenario detail / editor
        play/page.tsx     # game session
    api/
      scenarios/          # CRUD routes
      actors/             # CRUD routes
      sessions/           # game session routes
      turns/              # turn resolution routes
  lib/
    db.ts                 # Prisma client singleton
    types.ts              # shared TypeScript types
    llm/
      provider.ts         # LLM provider abstraction
      openrouter.ts       # OpenRouter client
      anthropic.ts        # Anthropic client (fallback)
      prompts/            # prompt templates
    simulation/
      engine.ts           # turn resolution logic
      validation.ts       # state validation
      state.ts            # state management helpers
  components/
    ui/                   # shadcn components
    scenario/             # scenario editor components
    game/                 # game UI components
    layout/               # shared layout components
```

### 1.4 Base API Routes
- `GET/POST /api/scenarios` — list and create
- `GET/PUT/DELETE /api/scenarios/[id]` — single scenario CRUD
- Basic error handling pattern
- Prisma client singleton (`lib/db.ts`)

## Done When
- `pnpm dev` starts and shows a page
- Prisma connects to Postgres and migrations run
- Seed data loads
- API routes return scenario data
- shadcn components render correctly
