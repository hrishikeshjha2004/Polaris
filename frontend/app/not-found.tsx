import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stellar/10">
        <Compass className="h-6 w-6 text-stellar" />
      </div>
      <h2 className="text-3xl font-bold mb-2">404</h2>
      <p className="text-sm text-muted-foreground mb-6">
        This page drifted off the star chart. Let&apos;s get you back on course.
      </p>
      <Button asChild className="bg-stellar hover:bg-stellar/85 text-white">
        <a href="/markets">Explore markets</a>
      </Button>
    </div>
  );
}
