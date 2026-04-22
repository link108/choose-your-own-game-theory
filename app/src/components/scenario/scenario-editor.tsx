"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorldSetup } from "./world-setup";
import { ActorManager } from "./actor-manager";
import { RelationshipEditor } from "./relationship-editor";
import { ScenarioPackagePanel } from "./scenario-package-panel";
import { ReviewLaunch } from "./review-launch";
import type { ScenarioData } from "./types";

export function ScenarioEditor({ scenario }: { scenario: ScenarioData }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("world");

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{scenario.name}</h1>
          <p className="text-muted-foreground text-sm">
            {scenario.status === "DRAFT" ? "Draft" : scenario.status.toLowerCase()} — Edit your scenario below
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="world">World</TabsTrigger>
          <TabsTrigger value="actors">
            Actors ({scenario.actors.length})
          </TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="package">Package</TabsTrigger>
          <TabsTrigger value="review">Review & Launch</TabsTrigger>
        </TabsList>

        <TabsContent value="world" className="mt-6">
          <WorldSetup scenario={scenario} onSave={refresh} />
        </TabsContent>

        <TabsContent value="actors" className="mt-6">
          <ActorManager
            scenarioId={scenario.id}
            actors={scenario.actors}
            onUpdate={refresh}
          />
        </TabsContent>

        <TabsContent value="relationships" className="mt-6">
          <RelationshipEditor
            actors={scenario.actors}
            onUpdate={refresh}
          />
        </TabsContent>

        <TabsContent value="package" className="mt-6">
          <ScenarioPackagePanel
            scenarioId={scenario.id}
            scenarioPackage={scenario.scenarioPackage}
            actors={scenario.actors}
            worldVariables={scenario.worldVariables}
            onScenarioPackageSaved={refresh}
          />
        </TabsContent>

        <TabsContent value="review" className="mt-6">
          <ReviewLaunch scenario={scenario} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
