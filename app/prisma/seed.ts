import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Clean existing data
  await prisma.scenario.deleteMany();

  // Create "Trade War" scenario
  const scenario = await prisma.scenario.create({
    data: {
      name: "The Silk Road Standoff",
      description:
        "Three city-states compete for control of a vital trade route through the mountains. Alliances shift, resources dwindle, and winter approaches. As the leader of Valdris, you must navigate diplomacy, trade, and the threat of war to secure your city's future.",
      worldDescription:
        "The year is 847 of the Third Age. Three city-states — Valdris, Korath, and Themis — sit at the crossroads of the Great Silk Road. The mountain passes that connect East and West run through their territories. Control of these passes means wealth, influence, and survival. But the passes are narrow, and winter is coming. Only those who control the trade route will thrive. The others will starve.",
      status: "DRAFT",
      actors: {
        create: [
          {
            name: "Duke Aldric of Valdris",
            description:
              "The player character. A pragmatic ruler of the merchant city of Valdris. Known for fair dealing but not afraid to use force when necessary. Valdris controls the western pass.",
            goals: JSON.stringify([
              "Secure exclusive control of the western trade pass",
              "Build enough gold reserves to survive winter",
              "Prevent Korath from forming an alliance with Themis",
            ]),
            traits: JSON.stringify([
              "pragmatic",
              "diplomatic",
              "cautious",
              "merchant-minded",
            ]),
            isPlayer: true,
            resources: {
              create: [
                { name: "Gold", value: 500, minValue: 0, maxValue: 10000 },
                { name: "Troops", value: 200, minValue: 0, maxValue: 1000 },
                { name: "Influence", value: 60, minValue: 0, maxValue: 100 },
                { name: "Food", value: 300, minValue: 0, maxValue: 5000 },
              ],
            },
          },
          {
            name: "Warlord Kira of Korath",
            description:
              "A fierce military leader who rules Korath through strength. Korath controls the central pass and has the largest army, but their economy is weak. Kira respects strength and despises weakness.",
            goals: JSON.stringify([
              "Dominate both remaining trade passes",
              "Weaken Valdris economically before winter",
              "Prove Korath's military superiority",
            ]),
            traits: JSON.stringify([
              "aggressive",
              "proud",
              "strategic",
              "intimidating",
            ]),
            isPlayer: false,
            resources: {
              create: [
                { name: "Gold", value: 200, minValue: 0, maxValue: 10000 },
                { name: "Troops", value: 500, minValue: 0, maxValue: 1000 },
                { name: "Influence", value: 40, minValue: 0, maxValue: 100 },
                { name: "Food", value: 150, minValue: 0, maxValue: 5000 },
              ],
            },
          },
          {
            name: "Archon Lyra of Themis",
            description:
              "A cunning diplomat who leads the scholarly city of Themis. Themis controls the eastern pass and possesses advanced knowledge and technology, but lacks military power. Lyra plays all sides against each other.",
            goals: JSON.stringify([
              "Maintain balance of power to prevent any one city from dominating",
              "Acquire military protection through alliances",
              "Establish Themis as the indispensable mediator",
            ]),
            traits: JSON.stringify([
              "cunning",
              "intellectual",
              "manipulative",
              "patient",
            ]),
            isPlayer: false,
            resources: {
              create: [
                { name: "Gold", value: 400, minValue: 0, maxValue: 10000 },
                { name: "Troops", value: 80, minValue: 0, maxValue: 1000 },
                { name: "Influence", value: 75, minValue: 0, maxValue: 100 },
                { name: "Food", value: 250, minValue: 0, maxValue: 5000 },
              ],
            },
          },
        ],
      },
      worldVariables: {
        create: [
          { name: "Season", value: "Autumn", type: "string" },
          { name: "Turns Until Winter", value: "8", type: "number", minValue: "0" },
          { name: "Trade Route Status", value: "Open", type: "string" },
          {
            name: "Regional Tension",
            value: "45",
            type: "number",
            minValue: "0",
            maxValue: "100",
          },
          { name: "Bandit Threat", value: "20", type: "number", minValue: "0", maxValue: "100" },
        ],
      },
    },
  });

  console.log(`Created scenario: ${scenario.name} (${scenario.id})`);

  // Create relationships
  const actors = await prisma.actor.findMany({
    where: { scenarioId: scenario.id },
  });
  const aldric = actors.find((a) => a.name.includes("Aldric"))!;
  const kira = actors.find((a) => a.name.includes("Kira"))!;
  const lyra = actors.find((a) => a.name.includes("Lyra"))!;

  await prisma.actorRelationship.createMany({
    data: [
      {
        fromActorId: aldric.id,
        toActorId: kira.id,
        type: "rival",
        strength: 35,
        description: "Tense trade rivalry. Korath has been taxing Valdris merchants heavily.",
      },
      {
        fromActorId: kira.id,
        toActorId: aldric.id,
        type: "rival",
        strength: 30,
        description: "Views Valdris as wealthy but weak. A prime target.",
      },
      {
        fromActorId: aldric.id,
        toActorId: lyra.id,
        type: "trade_partner",
        strength: 55,
        description: "Cordial trading relationship. Themis buys Valdris grain.",
      },
      {
        fromActorId: lyra.id,
        toActorId: aldric.id,
        type: "trade_partner",
        strength: 50,
        description: "Useful trading partner, but Lyra sees Aldric as a pawn to be positioned.",
      },
      {
        fromActorId: kira.id,
        toActorId: lyra.id,
        type: "neutral",
        strength: 40,
        description: "Mutual wariness. Kira needs Themis knowledge but distrusts their scheming.",
      },
      {
        fromActorId: lyra.id,
        toActorId: kira.id,
        type: "neutral",
        strength: 45,
        description: "Lyra sees Korath as a useful counterweight to Valdris, but fears their aggression.",
      },
    ],
  });

  console.log("Created actor relationships");
  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
