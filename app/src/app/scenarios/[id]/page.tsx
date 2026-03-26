import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ScenarioEditor } from "@/components/scenario/scenario-editor";

export const dynamic = "force-dynamic";

export default async function ScenarioEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scenario = await db.scenario.findUnique({
    where: { id },
    include: {
      actors: {
        include: {
          resources: true,
          relationshipsFrom: {
            include: { toActor: { select: { id: true, name: true } } },
          },
          relationshipsTo: {
            include: { fromActor: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      worldVariables: { orderBy: { name: "asc" } },
    },
  });

  if (!scenario) {
    notFound();
  }

  return <ScenarioEditor scenario={JSON.parse(JSON.stringify(scenario))} />;
}
