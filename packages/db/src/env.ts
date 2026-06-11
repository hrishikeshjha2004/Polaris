/**
 * Centralised, validated backend environment.
 *
 * Secrets live only in `.env` (never hardcoded). This module loads the repo
 * root `.env` regardless of which workspace's cwd the process started in, then
 * validates everything with zod so a misconfigured deploy fails fast and loud
 * instead of throwing opaque errors deep in a query.
 */
import * as path from "path";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { z } from "zod";

// Load .env from the monorepo root (packages/db/src -> ../../../) and, if
// present, the process cwd. Later files do not override already-set vars.
const repoRoot = path.resolve(__dirname, "..", "..", "..");
for (const p of [path.join(repoRoot, ".env"), path.join(process.cwd(), ".env")]) {
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
    message: "must be a postgres:// connection string",
  });

const EnvSchema = z.object({
  // ─── Database (Neon) — required everywhere ────────────────────────────────
  // Pooled (-pooler / PgBouncer) endpoint for runtime queries.
  DATABASE_URL: postgresUrl,
  // Direct (non-pooled) endpoint, used by `prisma migrate` only.
  DIRECT_URL: postgresUrl.optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // ─── Chain / indexer (optional: the API doesn't need these) ───────────────
  SOROBAN_RPC_URL: z.string().url().optional(),
  FACTORY_CONTRACT_ID: z.string().optional(),
  ORACLE_CONTRACT_ID: z.string().optional(),
  SETTLEMENT_CONTRACT_ID: z.string().optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  // ─── Ports ────────────────────────────────────────────────────────────────
  WS_PORT: z.coerce.number().int().positive().default(4001),
  API_PORT: z.coerce.number().int().positive().default(4000),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Validate and return the environment (memoised). Throws on invalid config. */
export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Asserts the chain/indexer vars are present (call from the indexer only). */
export function requireIndexerEnv(): Required<
  Pick<Env, "SOROBAN_RPC_URL" | "FACTORY_CONTRACT_ID" | "ORACLE_CONTRACT_ID" | "SETTLEMENT_CONTRACT_ID">
> &
  Env {
  const env = loadEnv();
  const missing = (
    ["SOROBAN_RPC_URL", "FACTORY_CONTRACT_ID", "ORACLE_CONTRACT_ID", "SETTLEMENT_CONTRACT_ID"] as const
  ).filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Indexer requires env vars: ${missing.join(", ")}`);
  }
  return env as any;
}
