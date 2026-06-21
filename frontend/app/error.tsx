"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

// App Router error boundary — catches render/runtime errors in any route segment
// and reports them to Sentry while showing a recoverable UI.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-6">
        An unexpected error occurred. Our team has been notified. You can try
        again or head back to the markets.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button onClick={reset} className="bg-stellar hover:bg-stellar/85 text-white">
          Try again
        </Button>
        <Button variant="outline" asChild>
          <a href="/markets">Back to markets</a>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-6 text-xs text-muted-foreground/60">
          Error ref: {error.digest}
        </p>
      )}
    </div>
  );
}
