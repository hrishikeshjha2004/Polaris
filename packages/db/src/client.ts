/**
 * Shared PrismaClient singleton.
 *
 * Runtime queries go through the pooled Neon endpoint (DATABASE_URL, PgBouncer)
 * so a burst of serverless/long-running connections is multiplexed safely. We
 * keep a single client per process and reuse it across hot reloads in dev to
 * avoid exhausting the pool.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./env";

loadEnv(); // fail fast on bad config before the client touches the network

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Verify connectivity with a bounded number of retries + exponential backoff.
 * Neon cold-starts a suspended compute on the first connection, so the first
 * attempt can be slow or transiently fail — retrying makes startup robust.
 */
export async function connectWithRetry(
  retries = 6,
  baseDelayMs = 500
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(
    `Database unreachable after ${retries} attempts: ${String(lastErr)}`
  );
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
