// Sentry server + edge initialization.
// No-op unless SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is set.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || "development",
      tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.2 : 1.0,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV || "development",
      tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.2 : 1.0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
