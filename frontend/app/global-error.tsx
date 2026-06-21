"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches errors thrown in the root layout itself (which the segment-level
// error.tsx cannot). Must render its own <html>/<body>.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0f",
          color: "#e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: "0.875rem", opacity: 0.7 }}>
            Please refresh the page. If the problem persists, try again later.
          </p>
        </div>
      </body>
    </html>
  );
}
