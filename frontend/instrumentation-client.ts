// Sentry client-side initialization (browser).
// No-op unless NEXT_PUBLIC_SENTRY_DSN is set, so local/dev builds stay clean.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    // Capture 100% in non-prod, 20% in prod to keep quota sane.
    tracesSampleRate:
      process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false })],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
