import Link from "next/link";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteScenarioButton } from "@/components/scenario/delete-scenario-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  const scenarios = await db.scenario.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { actors: true, sessions: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scenarios</h1>
          <p className="text-muted-foreground">
            Create and manage your strategy scenarios
          </p>
        </div>
        <Link href="/scenarios/new">
          <Button>New Scenario</Button>
        </Link>
      </div>

      {scenarios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              No scenarios yet. Create your first one!
            </p>
            <Link href="/scenarios/new">
              <Button>Create Scenario</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((scenario) => (
            <Link key={scenario.id} href={`/scenarios/${scenario.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{scenario.name}</CardTitle>
                    <Badge
                      variant={
                        scenario.status === "ACTIVE"
                          ? "default"
                          : scenario.status === "COMPLETED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {scenario.status.toLowerCase()}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {scenario.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{scenario._count.actors} actors</span>
                      <span>{scenario._count.sessions} sessions</span>
                    </div>
                    <DeleteScenarioButton scenarioId={scenario.id} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
