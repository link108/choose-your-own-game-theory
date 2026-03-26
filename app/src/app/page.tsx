import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Strategy Simulator
        </h1>
        <p className="text-muted-foreground text-lg max-w-xl">
          Define a world. Make choices. Experience consequences. An AI-powered
          choose-your-own-adventure where game theory meets interactive fiction.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 max-w-2xl w-full">
        <Card>
          <CardHeader>
            <CardTitle>Create Scenario</CardTitle>
            <CardDescription>
              Design a new world with actors, resources, and tensions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/scenarios/new">
              <Button className="w-full">New Scenario</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Browse Scenarios</CardTitle>
            <CardDescription>
              Continue editing or play an existing scenario
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/scenarios">
              <Button variant="secondary" className="w-full">
                View Scenarios
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
