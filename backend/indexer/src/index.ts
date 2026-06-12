/**
 * Polaris Event Indexer
 *
 * Polls the Soroban RPC for events from known contracts, persists them to
 * Neon Postgres (via Prisma), and fans them out over a WebSocket with durable
 * replay. Resilient to RPC hiccups and DB disconnects via bounded retries.
 */

import { SorobanRpc } from "@stellar/stellar-sdk";
import { WebSocketServer } from "ws";
import {
  prisma,
  connectWithRetry,
  requireIndexerEnv,
  disconnect,
} from "@stellarpm/db";
import { createLogger } from "./logger";
import { EventParser, type EventType } from "./event-parser";
import { DatabaseWriter } from "./database";
import { SubscriptionManager } from "./subscriptions";
import { PoolReader } from "./pool-reader";

const logger = createLogger("indexer");

// Event types emitted by an AMM pool that carry no market id and need a fresh
// pool read to reconcile price/TVL.
const POOL_EVENTS: ReadonlySet<EventType> = new Set([
  "buy",
  "sell",
  "swap",
  "add_liquidity",
  "remove_liquidity",
]);

async function main() {
  logger.info("Starting Polaris Indexer...");

  // Fail fast on bad config (validated env).
  const env = requireIndexerEnv();

  const WATCHED_CONTRACTS = [
    env.FACTORY_CONTRACT_ID,
    env.ORACLE_CONTRACT_ID,
    env.SETTLEMENT_CONTRACT_ID,
    // Market/AMM contracts are added dynamically (below + on market_created).
  ].filter(Boolean) as string[];

  // ─── Database ───────────────────────────────────────────────────────────────
  await connectWithRetry();
  logger.info("Database connected (Neon, pooled)");
  const dbWriter = new DatabaseWriter(logger);

  // ─── Market ↔ AMM resolver ────────────────────────────────────────────────
  // Trade/LP events arrive tagged only with the emitting contract address (the
  // AMM pool, or the Market contract). Map those back to a market id, and make
  // sure every such contract is in the RPC event filter.
  const contractToMarket = new Map<string, string>();

  const trackMarket = (id: string, amm?: string | null, marketContract?: string | null) => {
    for (const addr of [amm, marketContract]) {
      if (!addr) continue;
      contractToMarket.set(addr, id);
      if (!WATCHED_CONTRACTS.includes(addr)) {
        WATCHED_CONTRACTS.push(addr);
        logger.info(`Now watching contract ${addr} (market ${id})`);
      }
    }
  };

  const loadKnownMarkets = async () => {
    const markets = await prisma.market.findMany({
      select: { id: true, ammContract: true, contractAddress: true },
    });
    for (const m of markets) trackMarket(m.id, m.ammContract, m.contractAddress);
    logger.info(`Watching ${markets.length} known markets' pools`);
  };
  await loadKnownMarkets();

  // ─── WebSocket Server ────────────────────────────────────────────────────────
  const wss = new WebSocketServer({ port: env.WS_PORT });
  const subscriptions = new SubscriptionManager(wss, logger);
  logger.info(`WebSocket server listening on port ${env.WS_PORT}`);

  // ─── Soroban RPC Client ───────────────────────────────────────────────────
  const server = new SorobanRpc.Server(env.SOROBAN_RPC_URL, {
    allowHttp: env.SOROBAN_RPC_URL.startsWith("http://"),
  });
  const parser = new EventParser(logger);
  const poolReader = new PoolReader(server, logger);

  let lastLedger = await getLastIndexedLedger();
  // Fresh start (or a cursor older than RPC retention): begin from the current
  // ledger so we index new events going forward. Existing market state is
  // already loaded by the seed, so we don't need to backfill ancient history.
  // Testnet RPC only retains a sliding window (~120k ledgers); resuming from a
  // cursor below that floor makes getEvents reject every poll with
  // "startLedger must be within the ledger range". So if the stored cursor is
  // 0 OR has fallen too far behind the latest ledger, jump to the current one.
  const STALE_LEDGER_GAP = 100_000;
  try {
    const latest = (await server.getLatestLedger()).sequence;
    if (lastLedger === 0 || latest - lastLedger > STALE_LEDGER_GAP) {
      const reason = lastLedger === 0 ? "Fresh start" : `Stored cursor ${lastLedger} is stale`;
      lastLedger = latest;
      await setLastIndexedLedger(lastLedger);
      logger.info(`${reason} — beginning from current ledger ${lastLedger}`);
    } else {
      logger.info(`Resuming from ledger ${lastLedger}`);
    }
  } catch (err) {
    logger.warn({ err }, "Could not fetch latest ledger at startup");
  }

  let consecutiveErrors = 0;

  async function poll() {
    try {
      const latestLedger = await server.getLatestLedger();
      const latestSeq = latestLedger.sequence;
      if (latestSeq <= lastLedger) {
        consecutiveErrors = 0;
        return;
      }

      // Soroban RPC allows max 5 contract IDs per filter object; split the
      // watch list into chunks of 5 and merge all results.
      const CHUNK = 5;
      const chunks: string[][] = [];
      for (let i = 0; i < WATCHED_CONTRACTS.length; i += CHUNK) {
        chunks.push(WATCHED_CONTRACTS.slice(i, i + CHUNK));
      }

      const allEventResponses = await Promise.all(
        chunks.map((contractIds) =>
          server.getEvents({
            startLedger: lastLedger + 1,
            filters: [{ type: "contract", contractIds }],
            limit: 1000,
          })
        )
      );

      // Merge + sort by ledger/id so processing order is deterministic.
      const events = allEventResponses
        .flatMap((r) => r.events ?? [])
        .sort((a, b) => {
          if (a.ledger !== b.ledger) return a.ledger - b.ledger;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        });
      if (events.length) {
        logger.debug(
          `Fetched ${events.length} events (ledger ${lastLedger + 1}..${latestSeq})`
        );
      }

      for (const event of events) {
        try {
          const parsed = parser.parseEvent(event);
          if (!parsed) continue;

          // Resolve the market + read a fresh pool snapshot for AMM events, so
          // we can attach a usable marketId to the broadcast and reconcile
          // authoritative price/TVL. (Reads happen outside the DB transaction.)
          let marketId: string | undefined =
            (parsed.data.marketId as string | undefined) ??
            contractToMarket.get(parsed.contractId);
          const amm = (parsed.data.ammContract as string | undefined) ?? parsed.contractId;
          let pool = null;

          if (POOL_EVENTS.has(parsed.type) && amm) {
            if (!marketId) marketId = contractToMarket.get(amm);
            pool = await poolReader.getPoolState(amm);
          }

          await dbWriter.writeEvent(parsed, { marketId, pool });

          // Enrich the realtime payload so the frontend can match the event to a
          // market (by id or by ammContract) and update prices immediately.
          const payload = {
            ...parsed.data,
            marketId: marketId ?? parsed.data.marketId ?? null,
            ammContract: amm ?? null,
            txHash: parsed.txHash,
            ...(pool
              ? {
                  yesPriceBps: pool.yesPriceBps.toString(),
                  noPriceBps: pool.noPriceBps.toString(),
                  usdcReserves: pool.usdcReserves.toString(),
                  yesReserves: pool.yesReserves.toString(),
                  noReserves: pool.noReserves.toString(),
                }
              : {}),
          };
          await subscriptions.broadcast(parsed.type, payload, marketId);
        } catch (err) {
          logger.error({ err, eventId: event.id }, "Failed to process event");
        }
      }

      lastLedger = latestSeq;
      await setLastIndexedLedger(lastLedger);
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      // Exponential backoff (capped) so a flaky RPC/DB doesn't hot-loop.
      const backoff = Math.min(30_000, env.POLL_INTERVAL_MS * 2 ** consecutiveErrors);
      logger.error({ err, consecutiveErrors, backoff }, "Poll error; backing off");
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  const interval = setInterval(poll, env.POLL_INTERVAL_MS);
  await poll();

  // Dynamic market discovery — watch new market + AMM contracts as they appear.
  // The market_created event only carries the Market contract address, so we
  // re-read the markets table to pick up the AMM/token addresses the DB writer
  // recorded for it.
  subscriptions.on("market_created", (data: Record<string, unknown>) => {
    const id = data.marketId as string | undefined;
    const marketContract = data.contractAddress as string | undefined;
    if (id) trackMarket(id, undefined, marketContract);
    loadKnownMarkets().catch((err) =>
      logger.error({ err }, "Failed to refresh markets after market_created")
    );
  });

  // Graceful shutdown.
  const shutdown = async () => {
    logger.info("Shutting down...");
    clearInterval(interval);
    wss.close();
    await disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

async function getLastIndexedLedger(): Promise<number> {
  const row = await prisma.indexerState.findUnique({ where: { key: "last_ledger" } });
  return row ? parseInt(row.value, 10) : 0;
}

async function setLastIndexedLedger(ledger: number): Promise<void> {
  await prisma.indexerState.upsert({
    where: { key: "last_ledger" },
    create: { key: "last_ledger", value: ledger.toString() },
    update: { value: ledger.toString() },
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
