import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";
import { validateScenarioPackage } from "../src/lib/scenario-dsl";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });

const IDS = {
  scenario: "scenario_silk_road_standoff",
  actors: {
    valdris: "actor_valdris_aldric",
    korath: "actor_korath_kira",
    themis: "actor_themis_lyra",
  },
  resources: {
    valdrisGold: "resource_valdris_gold",
    valdrisTroops: "resource_valdris_troops",
    valdrisInfluence: "resource_valdris_influence",
    valdrisFood: "resource_valdris_food",
    korathGold: "resource_korath_gold",
    korathTroops: "resource_korath_troops",
    korathInfluence: "resource_korath_influence",
    korathFood: "resource_korath_food",
    themisGold: "resource_themis_gold",
    themisTroops: "resource_themis_troops",
    themisInfluence: "resource_themis_influence",
    themisFood: "resource_themis_food",
  },
  world: {
    season: "world_season",
    winterCountdown: "world_turns_until_winter",
    tradeRouteStatus: "world_trade_route_status",
    regionalTension: "world_regional_tension",
    banditThreat: "world_bandit_threat",
  },
  relationships: {
    valdrisToKorath: "rel_valdris_to_korath",
    korathToValdris: "rel_korath_to_valdris",
    valdrisToThemis: "rel_valdris_to_themis",
    themisToValdris: "rel_themis_to_valdris",
    korathToThemis: "rel_korath_to_themis",
    themisToKorath: "rel_themis_to_korath",
  },
  objectTypes: {
    location: "object_type_location",
    agreement: "object_type_agreement",
    obligation: "object_type_obligation",
    preparation: "object_type_preparation",
  },
  objects: {
    westernPass: "object_western_pass",
    centralPass: "object_central_pass",
    easternPass: "object_eastern_pass",
    winterReadiness: "object_valdris_winter_readiness",
  },
};

async function main() {
  // Clean existing data
  await prisma.scenario.deleteMany();

  // Create "Trade War" scenario
  const scenario = await prisma.scenario.create({
    data: {
      id: IDS.scenario,
      name: "The Silk Road Standoff",
      description:
        "Three city-states compete for control of a vital trade route through the mountains. Alliances shift, resources dwindle, and winter approaches. As the leader of Valdris, you must navigate diplomacy, trade, and the threat of war to secure your city's future.",
      worldDescription:
        "The year is 847 of the Third Age. Three city-states — Valdris, Korath, and Themis — sit at the crossroads of the Great Silk Road. The mountain passes that connect East and West run through their territories. Control of these passes means wealth, influence, and survival. But the passes are narrow, and winter is coming. Only those who control the trade route will thrive. The others will starve.",
      status: "DRAFT",
      resolverConfig: {
        ruleset: {
          military_escalation: {
            minor:    { "Regional Tension": 5,  "Troops": -10 },
            moderate: { "Regional Tension": 12, "Troops": -25 },
            major:    { "Regional Tension": 25, "Troops": -60 },
          },
          military_buildup: {
            minor:    { "Troops": 20,  "Gold": -30  },
            moderate: { "Troops": 60,  "Gold": -80  },
            major:    { "Troops": 120, "Gold": -150 },
          },
          trade_disruption: {
            minor:    { "Gold": -30,  "Food": -20  },
            moderate: { "Gold": -80,  "Food": -50  },
            major:    { "Gold": -150, "Food": -100 },
          },
          trade_agreement: {
            minor:    { "Gold": 40,  "Influence": 3  },
            moderate: { "Gold": 100, "Influence": 7  },
            major:    { "Gold": 200, "Influence": 15 },
          },
          diplomatic_incident: {
            minor:    { "Influence": -5,  "Regional Tension": 4  },
            moderate: { "Influence": -12, "Regional Tension": 10 },
            major:    { "Influence": -25, "Regional Tension": 20 },
          },
          diplomatic_breakthrough: {
            minor:    { "Influence": 5,  "Regional Tension": -4  },
            moderate: { "Influence": 12, "Regional Tension": -10 },
            major:    { "Influence": 25, "Regional Tension": -20 },
          },
          bandit_activity: {
            minor:    { "Bandit Threat": 8,  "Gold": -20 },
            moderate: { "Bandit Threat": 18, "Gold": -50 },
            major:    { "Bandit Threat": 35, "Gold": -100 },
          },
          bandit_suppression: {
            minor:    { "Bandit Threat": -8,  "Troops": -10, "Gold": -20  },
            moderate: { "Bandit Threat": -18, "Troops": -25, "Gold": -50  },
            major:    { "Bandit Threat": -35, "Troops": -50, "Gold": -100 },
          },
          economic_sanctions: {
            minor:    { "Gold": -40,  "Influence": -3  },
            moderate: { "Gold": -100, "Influence": -8  },
            major:    { "Gold": -200, "Influence": -15 },
          },
          food_shortage: {
            minor:    { "Food": -40,  "Influence": -2  },
            moderate: { "Food": -100, "Influence": -5  },
            major:    { "Food": -200, "Influence": -10 },
          },
          alliance_formed: {
            minor:    { "Influence": 8,  "Regional Tension": -5  },
            moderate: { "Influence": 18, "Regional Tension": -12 },
            major:    { "Influence": 30, "Regional Tension": -22 },
          },
          alliance_broken: {
            minor:    { "Influence": -8,  "Regional Tension": 5  },
            moderate: { "Influence": -18, "Regional Tension": 12 },
            major:    { "Influence": -30, "Regional Tension": 22 },
          },
          pass_contested: {
            minor:    { "Regional Tension": 8,  "Gold": -30  },
            moderate: { "Regional Tension": 18, "Gold": -70  },
            major:    { "Regional Tension": 30, "Gold": -130 },
          },
        },
        constraints: {
          maxDeltaPerTurn: {
            "Gold": 300,
            "Troops": 150,
            "Influence": 35,
            "Food": 250,
            "Regional Tension": 40,
            "Bandit Threat": 40,
          },
          fieldBounds: {
            "Gold":             { min: 0,   max: 10000 },
            "Troops":           { min: 0,   max: 1000  },
            "Influence":        { min: 0,   max: 100   },
            "Food":             { min: 0,   max: 5000  },
            "Regional Tension": { min: 0,   max: 100   },
            "Bandit Threat":    { min: 0,   max: 100   },
          },
          maxEffectsPerTurn: 12,
          allowUnknownEffects: false,
        },
      },
      promptConfig: {
        effectTypeDescriptions: {
          military_escalation:
            "Armed threats, skirmishes, raids, or military pressure that raises regional tension.",
          military_buildup:
            "Recruitment, fortification, drilling, or provisioning that increases military readiness at a resource cost.",
          trade_disruption:
            "Tariffs, blockades, unsafe roads, seized caravans, or bargaining failures that damage commerce.",
          trade_agreement:
            "A concrete bargain that improves trade access, trust, or leverage between parties.",
          diplomatic_incident:
            "A public insult, betrayal, failed negotiation, or coercive move that damages standing.",
          diplomatic_breakthrough:
            "A credible diplomatic success that lowers tension or improves a city's position.",
          bandit_activity:
            "Bandits exploiting weak patrols, disrupted trade, or political instability.",
          bandit_suppression:
            "Patrols, escorts, intelligence, or enforcement that reduces bandit freedom of action.",
          economic_sanctions:
            "Embargoes, punitive tolls, market exclusion, or financial pressure.",
          food_shortage:
            "Worsening supply, hoarding, failed logistics, or winter preparation failures.",
          alliance_formed:
            "A new, explicit alignment or mutual-defense commitment.",
          alliance_broken:
            "A damaged, abandoned, or publicly repudiated alliance.",
          pass_contested:
            "A dispute over control, tolls, patrol rights, or access through a mountain pass.",
        },
        stateEmphasis: [
          "Gold",
          "Troops",
          "Influence",
          "Food",
          "Regional Tension",
          "Bandit Threat",
          "Trade Route Status",
          "Turns Until Winter",
        ],
        scenarioContext:
          "The player leads Valdris. Keep the simulation grounded in trade-route control, winter preparation, city-state diplomacy, military deterrence, and opportunistic banditry. Use only visible state and listed entity IDs. Do not change the winter countdown directly; it advances automatically each turn. Prefer immediate, concrete consequences over distant speculation.",
        intensityMappings: {
          actor_resource_delta: {
            [IDS.resources.valdrisGold]: { minor: -30, moderate: -80, major: -150 },
            [IDS.resources.valdrisTroops]: { minor: 20, moderate: 60, major: 120 },
            [IDS.resources.valdrisInfluence]: { minor: 5, moderate: 12, major: 25 },
            [IDS.resources.valdrisFood]: { minor: -40, moderate: -100, major: -200 },
            [IDS.resources.korathGold]: { minor: -30, moderate: -80, major: -150 },
            [IDS.resources.korathTroops]: { minor: 20, moderate: 60, major: 120 },
            [IDS.resources.korathInfluence]: { minor: 5, moderate: 12, major: 25 },
            [IDS.resources.korathFood]: { minor: -40, moderate: -100, major: -200 },
            [IDS.resources.themisGold]: { minor: -30, moderate: -80, major: -150 },
            [IDS.resources.themisTroops]: { minor: 20, moderate: 60, major: 120 },
            [IDS.resources.themisInfluence]: { minor: 5, moderate: 12, major: 25 },
            [IDS.resources.themisFood]: { minor: -40, moderate: -100, major: -200 },
          },
          world_numeric_delta: {
            [IDS.world.regionalTension]: { minor: 5, moderate: 12, major: 25 },
            [IDS.world.banditThreat]: { minor: 8, moderate: 18, major: 35 },
          },
          relationship_strength_delta: {
            [IDS.relationships.valdrisToKorath]: { minor: 5, moderate: 12, major: 25 },
            [IDS.relationships.korathToValdris]: { minor: 5, moderate: 12, major: 25 },
            [IDS.relationships.valdrisToThemis]: { minor: 5, moderate: 12, major: 25 },
            [IDS.relationships.themisToValdris]: { minor: 5, moderate: 12, major: 25 },
            [IDS.relationships.korathToThemis]: { minor: 5, moderate: 12, major: 25 },
            [IDS.relationships.themisToKorath]: { minor: 5, moderate: 12, major: 25 },
          },
        },
      },
      actors: {
        create: [
          {
            id: IDS.actors.valdris,
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
            responseConfig: {
              availableEffectTypes: [],
              resourcePriorities: ["Gold", "Food", "Influence", "Troops"],
              responseHints:
                "Valdris favors negotiated advantage, resilient supply, selective force, and preserving merchant credibility.",
            },
            resources: {
              create: [
                { id: IDS.resources.valdrisGold, name: "Gold", value: 500, minValue: 0, maxValue: 10000 },
                { id: IDS.resources.valdrisTroops, name: "Troops", value: 200, minValue: 0, maxValue: 1000 },
                { id: IDS.resources.valdrisInfluence, name: "Influence", value: 60, minValue: 0, maxValue: 100 },
                { id: IDS.resources.valdrisFood, name: "Food", value: 300, minValue: 0, maxValue: 5000 },
              ],
            },
          },
          {
            id: IDS.actors.korath,
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
            responseConfig: {
              availableEffectTypes: [],
              resourcePriorities: ["Troops", "Food", "Gold", "Influence"],
              responseHints:
                "Kira respects strength, exploits hesitation, protects Korath's central pass, and uses intimidation before compromise.",
            },
            resources: {
              create: [
                { id: IDS.resources.korathGold, name: "Gold", value: 200, minValue: 0, maxValue: 10000 },
                { id: IDS.resources.korathTroops, name: "Troops", value: 500, minValue: 0, maxValue: 1000 },
                { id: IDS.resources.korathInfluence, name: "Influence", value: 40, minValue: 0, maxValue: 100 },
                { id: IDS.resources.korathFood, name: "Food", value: 150, minValue: 0, maxValue: 5000 },
              ],
            },
          },
          {
            id: IDS.actors.themis,
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
            responseConfig: {
              availableEffectTypes: [],
              resourcePriorities: ["Influence", "Gold", "Food", "Troops"],
              responseHints:
                "Lyra prefers leverage, mediation, information advantage, and playing Valdris and Korath against each other.",
            },
            resources: {
              create: [
                { id: IDS.resources.themisGold, name: "Gold", value: 400, minValue: 0, maxValue: 10000 },
                { id: IDS.resources.themisTroops, name: "Troops", value: 80, minValue: 0, maxValue: 1000 },
                { id: IDS.resources.themisInfluence, name: "Influence", value: 75, minValue: 0, maxValue: 100 },
                { id: IDS.resources.themisFood, name: "Food", value: 250, minValue: 0, maxValue: 5000 },
              ],
            },
          },
        ],
      },
      worldVariables: {
        create: [
          { id: IDS.world.season, name: "Season", value: "Autumn", kind: "text" },
          { id: IDS.world.winterCountdown, name: "Turns Until Winter", value: "8", kind: "countdown", minValue: "0" },
          { id: IDS.world.tradeRouteStatus, name: "Trade Route Status", value: "Open", kind: "text" },
          {
            id: IDS.world.regionalTension,
            name: "Regional Tension",
            value: "45",
            kind: "resource",
            minValue: "0",
            maxValue: "100",
          },
          { id: IDS.world.banditThreat, name: "Bandit Threat", value: "20", kind: "resource", minValue: "0", maxValue: "100" },
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
        id: IDS.relationships.valdrisToKorath,
        fromActorId: aldric.id,
        toActorId: kira.id,
        type: "rival",
        strength: 35,
        description: "Tense trade rivalry. Korath has been taxing Valdris merchants heavily.",
      },
      {
        id: IDS.relationships.korathToValdris,
        fromActorId: kira.id,
        toActorId: aldric.id,
        type: "rival",
        strength: 30,
        description: "Views Valdris as wealthy but weak. A prime target.",
      },
      {
        id: IDS.relationships.valdrisToThemis,
        fromActorId: aldric.id,
        toActorId: lyra.id,
        type: "trade_partner",
        strength: 55,
        description: "Cordial trading relationship. Themis buys Valdris grain.",
      },
      {
        id: IDS.relationships.themisToValdris,
        fromActorId: lyra.id,
        toActorId: aldric.id,
        type: "trade_partner",
        strength: 50,
        description: "Useful trading partner, but Lyra sees Aldric as a pawn to be positioned.",
      },
      {
        id: IDS.relationships.korathToThemis,
        fromActorId: kira.id,
        toActorId: lyra.id,
        type: "neutral",
        strength: 40,
        description: "Mutual wariness. Kira needs Themis knowledge but distrusts their scheming.",
      },
      {
        id: IDS.relationships.themisToKorath,
        fromActorId: lyra.id,
        toActorId: kira.id,
        type: "neutral",
        strength: 45,
        description: "Lyra sees Korath as a useful counterweight to Valdris, but fears their aggression.",
      },
    ],
  });

  console.log("Created actor relationships");

  const scenarioPackage = {
    version: 1,
    metadata: {
      title: "The Silk Road Standoff",
      summary:
        "A package-backed setup for mountain pass control, winter pressure, city-state agreements, obligations, and military preparation.",
    },
    stateExtensions: {
      objectTypes: [
        {
          id: IDS.objectTypes.location,
          label: "Location",
          description:
            "A controllable or strategically relevant place in the scenario.",
          fields: {
            controller: {
              kind: "string",
              label: "Controller",
              required: true,
            },
            status: {
              kind: "enum",
              label: "Status",
              required: true,
              values: ["open", "contested", "blocked", "snowbound"],
            },
            defense: {
              kind: "number",
              label: "Defense",
              required: true,
              min: 0,
              max: 100,
            },
            movement: {
              kind: "enum",
              label: "Movement",
              required: true,
              values: ["normal", "restricted", "severe"],
            },
            tradeAccess: {
              kind: "enum",
              label: "Trade Access",
              required: true,
              values: ["open", "taxed", "restricted", "blocked"],
            },
          },
        },
        {
          id: IDS.objectTypes.agreement,
          label: "Agreement",
          description:
            "A structured pact, trade deal, or political arrangement between actors.",
          fields: {
            partyA: {
              kind: "string",
              label: "Party A",
              required: true,
            },
            partyB: {
              kind: "string",
              label: "Party B",
              required: true,
            },
            agreementType: {
              kind: "enum",
              label: "Type",
              required: true,
              values: ["trade", "military", "mediation", "intelligence"],
            },
            status: {
              kind: "enum",
              label: "Status",
              required: true,
              values: ["proposed", "active", "strained", "broken"],
            },
          },
        },
        {
          id: IDS.objectTypes.obligation,
          label: "Obligation",
          description:
            "A debt, promise, tribute demand, or future commitment created by play.",
          fields: {
            debtor: {
              kind: "string",
              label: "Debtor",
              required: true,
            },
            creditor: {
              kind: "string",
              label: "Creditor",
              required: true,
            },
            obligationType: {
              kind: "enum",
              label: "Type",
              required: true,
              values: ["loan", "tribute", "favor", "military_support"],
            },
            amount: {
              kind: "number",
              label: "Amount",
              required: true,
              min: 0,
              max: 10000,
            },
            status: {
              kind: "enum",
              label: "Status",
              required: true,
              values: ["active", "paid", "defaulted", "waived"],
            },
          },
        },
        {
          id: IDS.objectTypes.preparation,
          label: "Preparation",
          description:
            "A persistent readiness track for a specific actor or institution.",
          fields: {
            owner: {
              kind: "string",
              label: "Owner",
              required: true,
            },
            preparationType: {
              kind: "enum",
              label: "Type",
              required: true,
              values: ["winter_logistics", "military_readiness"],
            },
            level: {
              kind: "number",
              label: "Level",
              required: true,
              min: 0,
              max: 100,
            },
          },
        },
      ],
      objects: [
        {
          id: IDS.objects.westernPass,
          typeId: IDS.objectTypes.location,
          name: "Western Pass",
          visibility: "visible",
          fields: {
            controller: IDS.actors.valdris,
            status: "open",
            defense: 35,
            movement: "normal",
            tradeAccess: "open",
          },
        },
        {
          id: IDS.objects.centralPass,
          typeId: IDS.objectTypes.location,
          name: "Central Pass",
          visibility: "visible",
          fields: {
            controller: IDS.actors.korath,
            status: "contested",
            defense: 55,
            movement: "normal",
            tradeAccess: "taxed",
          },
        },
        {
          id: IDS.objects.easternPass,
          typeId: IDS.objectTypes.location,
          name: "Eastern Pass",
          visibility: "visible",
          fields: {
            controller: IDS.actors.themis,
            status: "open",
            defense: 25,
            movement: "normal",
            tradeAccess: "open",
          },
        },
        {
          id: IDS.objects.winterReadiness,
          typeId: IDS.objectTypes.preparation,
          name: "Valdris Winter Readiness",
          visibility: "visible",
          fields: {
            owner: IDS.actors.valdris,
            preparationType: "winter_logistics",
            level: 20,
          },
        },
      ],
    },
    effectDefinitions: [
      {
        id: "fortify_location",
        label: "Fortify Location",
        description:
          "Spend resources to improve defenses at a known scenario location.",
        parameters: {
          actor: { type: "actor", required: true },
          location: {
            type: "object",
            objectType: IDS.objectTypes.location,
            required: true,
          },
        },
        intensities: {
          minor: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisGold,
              delta: -30,
            },
            {
              op: "adjustObjectField",
              object: "$location",
              field: "defense",
              delta: 10,
            },
          ],
          moderate: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisGold,
              delta: -80,
            },
            {
              op: "adjustObjectField",
              object: "$location",
              field: "defense",
              delta: 25,
            },
          ],
          major: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisGold,
              delta: -150,
            },
            {
              op: "adjustObjectField",
              object: "$location",
              field: "defense",
              delta: 45,
            },
          ],
        },
      },
      {
        id: "seize_location",
        label: "Seize Location",
        description:
          "Use force or coercive control to take over a strategic location.",
        parameters: {
          actor: { type: "actor", required: true },
          location: {
            type: "object",
            objectType: IDS.objectTypes.location,
            required: true,
          },
        },
        intensities: {
          moderate: [
            {
              op: "setObjectField",
              object: "$location",
              field: "controller",
              value: "$actor",
            },
            {
              op: "setObjectField",
              object: "$location",
              field: "status",
              value: "contested",
            },
            {
              op: "adjustWorldVariable",
              variable: IDS.world.regionalTension,
              delta: 12,
            },
          ],
          major: [
            {
              op: "setObjectField",
              object: "$location",
              field: "controller",
              value: "$actor",
            },
            {
              op: "setObjectField",
              object: "$location",
              field: "status",
              value: "blocked",
            },
            {
              op: "setObjectField",
              object: "$location",
              field: "tradeAccess",
              value: "blocked",
            },
            {
              op: "adjustWorldVariable",
              variable: IDS.world.regionalTension,
              delta: 25,
            },
          ],
        },
      },
      {
        id: "negotiate_trade_terms",
        label: "Negotiate Trade Terms",
        description:
          "Create or improve a trade relationship between two actors.",
        parameters: {
          actor: { type: "actor", required: true },
          partner: { type: "actor", required: true },
        },
        intensities: {
          minor: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisGold,
              delta: 40,
            },
            {
              op: "adjustWorldVariable",
              variable: IDS.world.regionalTension,
              delta: -4,
            },
          ],
          moderate: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisGold,
              delta: 100,
            },
            {
              op: "adjustWorldVariable",
              variable: IDS.world.regionalTension,
              delta: -10,
            },
            {
              op: "createObject",
              object: {
                id: "object_trade_agreement_draft",
                typeId: IDS.objectTypes.agreement,
                name: "Draft Trade Agreement",
                visibility: "visible",
                fields: {
                  partyA: "$actor",
                  partyB: "$partner",
                  agreementType: "trade",
                  status: "proposed",
                },
              },
            },
          ],
        },
      },
      {
        id: "request_loan",
        label: "Request Loan",
        description:
          "Take on a financial obligation in exchange for immediate gold.",
        parameters: {
          debtor: { type: "actor", required: true },
          creditor: { type: "actor", required: true },
        },
        intensities: {
          minor: [
            {
              op: "adjustActorResource",
              actor: "$debtor",
              resource: IDS.resources.valdrisGold,
              delta: 40,
            },
            {
              op: "createObject",
              object: {
                id: "object_minor_loan_obligation",
                typeId: IDS.objectTypes.obligation,
                name: "Modest Loan Obligation",
                visibility: "visible",
                fields: {
                  debtor: "$debtor",
                  creditor: "$creditor",
                  obligationType: "loan",
                  amount: 40,
                  status: "active",
                },
              },
            },
          ],
          moderate: [
            {
              op: "adjustActorResource",
              actor: "$debtor",
              resource: IDS.resources.valdrisGold,
              delta: 100,
            },
            {
              op: "createObject",
              object: {
                id: "object_moderate_loan_obligation",
                typeId: IDS.objectTypes.obligation,
                name: "Substantial Loan Obligation",
                visibility: "visible",
                fields: {
                  debtor: "$debtor",
                  creditor: "$creditor",
                  obligationType: "loan",
                  amount: 100,
                  status: "active",
                },
              },
            },
          ],
        },
      },
      {
        id: "train_for_winter",
        label: "Train For Winter",
        description:
          "Improve winter logistics and readiness at a material cost.",
        parameters: {
          actor: { type: "actor", required: true },
        },
        intensities: {
          moderate: [
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisGold,
              delta: -40,
            },
            {
              op: "adjustActorResource",
              actor: "$actor",
              resource: IDS.resources.valdrisFood,
              delta: -50,
            },
            {
              op: "adjustObjectField",
              object: IDS.objects.winterReadiness,
              field: "level",
              delta: 30,
            },
          ],
        },
      },
    ],
    actorCapabilities: [
      {
        actorId: IDS.actors.valdris,
        effectIds: [
          "fortify_location",
          "negotiate_trade_terms",
          "request_loan",
          "train_for_winter",
        ],
      },
      {
        actorId: IDS.actors.korath,
        effectIds: ["seize_location"],
      },
      {
        actorId: IDS.actors.themis,
        effectIds: ["negotiate_trade_terms"],
      },
    ],
    triggerRules: [
      {
        id: "winter_arrival",
        description:
          "When the winter countdown reaches zero, the season changes and pass movement worsens.",
        once: true,
        when: {
          worldVariable: IDS.world.winterCountdown,
          lte: 0,
        },
        operations: [
          {
            op: "setWorldVariable",
            variable: IDS.world.season,
            value: "Winter",
          },
          {
            op: "setWorldVariable",
            variable: IDS.world.tradeRouteStatus,
            value: "Restricted",
          },
          {
            op: "setObjectField",
            object: IDS.objects.westernPass,
            field: "movement",
            value: "severe",
          },
          {
            op: "setObjectField",
            object: IDS.objects.centralPass,
            field: "movement",
            value: "severe",
          },
          {
            op: "setObjectField",
            object: IDS.objects.easternPass,
            field: "movement",
            value: "severe",
          },
        ],
      },
    ],
    choicePolicy: {
      minChoices: 3,
      maxChoices: 5,
      guidance:
        "Prefer choices that address pass control, winter readiness, gold scarcity, food security, alliances, obligations, or active actor tensions.",
      preferredEffectIds: [
        "fortify_location",
        "seize_location",
        "negotiate_trade_terms",
        "request_loan",
        "train_for_winter",
      ],
    },
    visibilityRules: [
      {
        id: "visible_public_state",
        description:
          "Show public pass status, agreements, obligations, and preparation tracks; keep private intentions hidden until explicitly revealed.",
      },
    ],
  };

  const packageValidation = validateScenarioPackage(scenarioPackage, {
    actorIds: Object.values(IDS.actors),
    resourceIds: Object.values(IDS.resources),
    worldVariableIds: Object.values(IDS.world),
    relationshipIds: Object.values(IDS.relationships),
  });

  if (!packageValidation.valid) {
    console.error("Scenario package validation failed:", packageValidation.issues);
    throw new Error("Seed scenario package is invalid");
  }

  await prisma.scenario.update({
    where: { id: scenario.id },
    data: {
      scenarioPackage: scenarioPackage as Prisma.InputJsonValue,
    },
  });

  console.log("Attached validated scenario package");
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
