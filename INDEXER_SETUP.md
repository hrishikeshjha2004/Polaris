# Indexer & Realtime Setup (Neon Postgres + Prisma)

The StellarPM indexer polls Soroban RPC for on-chain events, persists them to
**Neon serverless Postgres** via **Prisma**, and broadcasts live updates to the
frontend over a WebSocket with durable replay.

## Architecture

```
Soroban RPC (event stream)
       ↓ poll (backoff on error)
Event Indexer (backend/indexer)
       ↓ Prisma                 ↓ persist + broadcast
Neon Postgres (pooled)     WebSocket :4001 (replayable)
       ↓ Prisma                 ↓
Backend API :4000          Frontend (live, auto-reconnect)
```

All database access goes through the shared **`@stellarpm/db`** package
(`packages/db`): one Prisma schema, one validated env, one pooled client.

## Connection strategy (Neon)

Two URLs, both in the repo-root `.env` (never hardcoded — see `.gitignore`):

| Var | Endpoint | Used for |
|-----|----------|----------|
| `DATABASE_URL` | pooled (`-pooler` host, PgBouncer, `pgbouncer=true`) | runtime queries (indexer, API) |
| `DIRECT_URL` | direct (no `-pooler`) | `prisma migrate` only |

```env
DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=10"
DIRECT_URL="postgresql://USER:PASS@ep-xxx.REGION.aws.neon.tech/neondb?sslmode=require"
```

The pooled URL multiplexes connections (important for serverless / many short
queries); `connectWithRetry()` tolerates Neon cold-starts with exponential
backoff.

## One-time setup

```bash
npm install
npm run db:generate        # generate Prisma client
npm run db:migrate:deploy  # apply migrations to Neon (uses DIRECT_URL)
npm run db:seed            # discover live markets on-chain and upsert them
```

Other db commands: `db:migrate` (dev migrations), `db:push`, `db:studio`.

## Run

```bash
npm run dev:indexer   # poller + WebSocket :4001
npm run dev:api       # REST API :4000
npm run dev           # web + indexer + api together
```

The indexer: validates env → connects to Neon (pooled) → starts WS → on a fresh
cursor begins from the **current** ledger (state is already seeded; testnet RPC
only retains recent ledgers) → polls, writing each event in one Prisma
transaction (idempotent on `events.event_id`) → persists + broadcasts.

## WebSocket events (with replay)

Every broadcast is persisted to `broadcast_events` with a monotonic `seq` and
sent to clients tagged with that seq. On (re)connect a client replays the gap:

```typescript
const ws = new WebSocket("ws://localhost:4001");
let lastSeq = "0";

ws.onopen = () => ws.send(JSON.stringify({ type: "replay", since: lastSeq }));
ws.onmessage = (m) => {
  const ev = JSON.parse(m.data);          // { type, data, seq, replayed? }
  if (ev.seq) lastSeq = ev.seq;
  // ev.type: "swap" | "add_liquidity" | "market_settled" | ...
};

// Optional per-market filter:
ws.send(JSON.stringify({ type: "subscribe", marketId: "MARKET_ID" }));
```

The frontend hook `apps/web/hooks/use-realtime.ts` does this automatically:
auto-reconnect with capped exponential backoff + jitter, resumes from the last
seq, and invalidates the markets query on each event for instant UI updates.

## Schema (Prisma — `packages/db/prisma/schema.prisma`)

| Model / table | Contents |
|---------------|----------|
| `markets` | Market metadata, status, prices, volume, tvl |
| `trades` | Per-swap fills (covers both "trades" and "swaps") |
| `liquidity_events` | Append-only add/remove liquidity log |
| `positions` / `lp_positions` | User outcome positions / LP balances |
| `oracle_submissions`, `oracle_resolutions`, `disputes` | Oracle flow |
| `settlements`, `claims` | Settlement + payout records |
| `events` | Raw event log (idempotency + audit) |
| `price_history` | Time series for charts / 24h change |
| `broadcast_events` | Persisted WebSocket messages (replay) |
| `indexer_state` | Cursor (last processed ledger) |

## Local Postgres alternative (offline)

```bash
docker compose up -d db          # Postgres on :5432, Adminer on :8080
# point BOTH urls at localhost:5432 in .env, then:
npm run db:migrate:deploy && npm run db:seed
```

## Monitoring

```bash
curl http://localhost:4000/api/health        # { status, ledger }
npm run db:studio                              # browse tables in Prisma Studio
```

## Production

Deploy the indexer + API on Railway/Fly alongside Neon. Set `DATABASE_URL`,
`DIRECT_URL`, `SOROBAN_RPC_URL`, and the contract IDs as environment variables.
The legacy raw-SQL migration at `backend/database/migrations/001_initial_schema.sql`
is superseded by Prisma migrations in `packages/db/prisma/migrations/`.
