/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@stellarpm/sdk", "@stellarpm/shared"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "assets.coingecko.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https://assets.coingecko.com",
              "connect-src 'self' https://*.stellar.org wss://*.stellar.org https://api.coingecko.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
              "font-src 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

const { withSentryConfig } = require("@sentry/nextjs");

// Sentry build-time config. Source map upload only runs when SENTRY_AUTH_TOKEN
// is present (CI/Vercel); local builds are unaffected. Runtime error capture is
// gated on the DSN env var inside the instrumentation files.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: "/monitoring",
});
