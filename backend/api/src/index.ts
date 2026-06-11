/**
 * Polaris REST API
 *
 * Serves indexed market data from Neon Postgres (via Prisma) to the frontend.
 * Read-only — all writes go directly on-chain via Soroban.
 */

import * as http from "http";
import { prisma, connectWithRetry, loadEnv, type Prisma } from "@stellarpm/db";
import { createLogger } from "./logger";

const logger = createLogger("api");
const env = loadEnv();
const PORT = env.API_PORT;

// ─── Minimal router ───────────────────────────────────────────────────────────

type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  params: Record<string, string>,
  query: URLSearchParams
) => Promise<void>;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: RouteHandler }[] = [];

function addRoute(method: string, path: string, handler: RouteHandler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" + path.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$"
  );
  routes.push({ method, pattern, keys, handler });
}

async function respond(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

const num = (v: unknown) => Number(v ?? 0);

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy(); // guard against oversized bodies
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

// GET /api/markets
addRoute("GET", "/api/markets", async (_req, res, _p, query) => {
  const status = query.get("status");
  const category = query.get("category");
  const search = query.get("search");
  const sortBy = query.get("sortBy") ?? "volume";
  const limit = Math.min(parseInt(query.get("limit") ?? "50", 10), 200);
  const offset = parseInt(query.get("offset") ?? "0", 10);

  const where: Prisma.MarketWhereInput = {};
  if (status && status !== "all") where.status = status as any;
  if (category && category !== "all") where.category = category;
  if (search) where.title = { contains: search, mode: "insensitive" };

  const orderBy: Prisma.MarketOrderByWithRelationInput =
    sortBy === "newest"
      ? { createdAt: "desc" }
      : sortBy === "expiry"
      ? { expiryTimestamp: "asc" }
      : { volume: "desc" };

  const [total, markets] = await Promise.all([
    prisma.market.count({ where }),
    prisma.market.findMany({ where, orderBy, take: limit, skip: offset }),
  ]);

  await respond(res, 200, { markets: markets.map(mapMarket), total });
});

// GET /api/markets/:id
addRoute("GET", "/api/markets/:id", async (_req, res, { id }) => {
  const market = await prisma.market.findUnique({ where: { id } });
  if (!market) return respond(res, 404, { error: "Market not found" });
  await respond(res, 200, mapMarket(market));
});

// GET /api/markets/:id/stats
addRoute("GET", "/api/markets/:id/stats", async (_req, res, { id }) => {
  const market = await prisma.market.findUnique({ where: { id } });
  if (!market) return respond(res, 404, { error: "Not found" });

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const [vol24h, traders, lps, priceThen] = await Promise.all([
    prisma.trade.aggregate({
      where: { marketId: id, timestamp: { gt: since24h } },
      _sum: { amountIn: true },
    }),
    prisma.trade.findMany({
      where: { marketId: id },
      distinct: ["trader"],
      select: { trader: true },
    }),
    prisma.lpPosition.count({ where: { marketId: id, lpShares: { gt: 0n } } }),
    // Earliest price point in the last 24h → basis for % change.
    prisma.priceHistory.findFirst({
      where: { marketId: id, timestamp: { gt: since24h } },
      orderBy: { timestamp: "asc" },
    }),
  ]);

  const yesNow = num(market.yesPrice);
  const noNow = num(market.noPrice);
  const yesThen = priceThen ? num(priceThen.yesPrice) : yesNow;
  const noThen = priceThen ? num(priceThen.noPrice) : noNow;

  await respond(res, 200, {
    totalVolume: num(market.volume),
    tvl: num(market.tvl),
    yesPrice: yesNow,
    noPrice: noNow,
    yesPriceChange24h: yesThen ? +(yesNow - yesThen).toFixed(2) : 0,
    noPriceChange24h: noThen ? +(noNow - noThen).toFixed(2) : 0,
    volume24h: num(vol24h._sum.amountIn),
    traders: traders.length,
    lps,
  });
});

// GET /api/markets/:id/price-history
addRoute("GET", "/api/markets/:id/price-history", async (_req, res, { id }) => {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const points = await prisma.priceHistory.findMany({
    where: { marketId: id, timestamp: { gt: since } },
    orderBy: { timestamp: "asc" },
  });
  await respond(
    res,
    200,
    points.map((p) => ({
      timestamp: Math.floor(p.timestamp.getTime() / 1000),
      yesPrice: num(p.yesPrice),
      noPrice: num(p.noPrice),
      volume: Number(p.volume),
    }))
  );
});

// GET /api/positions?address=...
addRoute("GET", "/api/positions", async (_req, res, _p, query) => {
  const address = query.get("address");
  if (!address) return respond(res, 400, { error: "address required" });
  const positions = await prisma.position.findMany({
    where: { userAddress: address, tokenBalance: { gt: 0n } },
    include: { market: true },
  });
  await respond(res, 200, positions.map(mapPosition));
});

// GET /api/lp-positions?address=...
addRoute("GET", "/api/lp-positions", async (_req, res, _p, query) => {
  const address = query.get("address");
  if (!address) return respond(res, 400, { error: "address required" });
  const lps = await prisma.lpPosition.findMany({
    where: { provider: address, lpShares: { gt: 0n } },
    include: { market: true },
  });
  await respond(
    res,
    200,
    lps.map((lp) => ({
      marketId: lp.marketId,
      market: { id: lp.market.id, title: lp.market.title, status: lp.market.status },
      provider: lp.provider,
      lpShares: lp.lpShares.toString(),
      depositedValue: lp.depositedValue.toString(),
      feeEarned: lp.feeEarned.toString(),
    }))
  );
});

// GET /api/health
addRoute("GET", "/api/health", async (_req, res) => {
  const row = await prisma.indexerState.findUnique({ where: { key: "last_ledger" } });
  await respond(res, 200, { status: "ok", ledger: row?.value ?? "0" });
});

// GET /api/stats — protocol-wide aggregates for landing page + governance
addRoute("GET", "/api/stats", async (_req, res) => {
  const [markets, traderRows] = await Promise.all([
    prisma.market.findMany({ select: { status: true, volume: true, tvl: true } }),
    prisma.trade.findMany({ distinct: ["trader"], select: { trader: true } }),
  ]);
  const totalVolume = markets.reduce((s, m) => s + num(m.volume), 0);
  const totalTVL = markets.reduce((s, m) => s + num(m.tvl), 0);
  const openMarkets = markets.filter((m) => m.status === "open").length;
  await respond(res, 200, {
    totalVolume,
    totalTVL,
    openMarkets,
    totalMarkets: markets.length,
    totalTraders: traderRows.length,
  });
});

// GET /api/trades?address=... — raw trade history for a wallet (for portfolio history tab)
addRoute("GET", "/api/trades", async (_req, res, _p, query) => {
  const address = query.get("address");
  if (!address) return respond(res, 400, { error: "address required" });
  const limit = Math.min(parseInt(query.get("limit") ?? "50", 10), 200);

  const trades = await prisma.trade.findMany({
    where: { trader: address },
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { market: { select: { id: true, title: true, contractAddress: true } } },
  });

  await respond(res, 200, trades.map((t) => ({
    id: t.id.toString(),
    marketId: t.marketId,
    market: { id: t.market.id, title: t.market.title },
    side: t.side,
    outcome: t.tokenIn === "usdc" ? null : t.side === "buy" ? t.tokenIn : null,
    amountIn: Number(t.amountIn) / 1e7,
    amountOut: Number(t.amountOut) / 1e7,
    fee: Number(t.fee) / 1e7,
    txHash: t.txHash,
    timestamp: Math.floor(t.timestamp.getTime() / 1000),
  })));
});


// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapMarket(m: Prisma.MarketGetPayload<{}>) {
  return {
    id: m.id,
    contractAddress: m.contractAddress,
    ammContract: m.ammContract,
    yesToken: m.yesToken,
    noToken: m.noToken,
    lpToken: m.lpToken,
    title: m.title,
    description: m.description,
    category: m.category,
    creator: m.creator,
    expiryTimestamp: Math.floor(m.expiryTimestamp.getTime() / 1000),
    status: m.status,
    yesPrice: num(m.yesPrice),
    noPrice: num(m.noPrice),
    volume: num(m.volume),
    tvl: num(m.tvl),
    oracleSource: m.oracleSource,
    thresholdValue: m.thresholdValue ? Number(m.thresholdValue) : 0,
    thresholdOperator: m.thresholdOperator,
    resolution: m.resolution,
    createdAt: Math.floor(m.createdAt.getTime() / 1000),
  };
}

function mapPosition(
  p: Prisma.PositionGetPayload<{ include: { market: true } }>
) {
  const currentPrice =
    p.outcome === "yes" ? num(p.market.yesPrice) : num(p.market.noPrice);
  const balance = Number(p.tokenBalance) / 1e7; // 7-decimal tokens
  const avg = num(p.avgPrice);
  // Unrealized PnL = (current price − avg cost) × token balance, in USDC terms.
  const unrealizedPnl = +((currentPrice / 100 - avg) * balance).toFixed(7);
  const claimable =
    p.market.status === "resolved" && p.market.resolution === p.outcome
      ? balance
      : 0;

  return {
    id: `${p.marketId}_${p.userAddress}_${p.outcome}`,
    marketId: p.marketId,
    market: {
      id: p.market.id,
      title: p.market.title,
      status: p.market.status,
      contractAddress: p.market.contractAddress,
      yesPrice: num(p.market.yesPrice),
      noPrice: num(p.market.noPrice),
    },
    userAddress: p.userAddress,
    outcome: p.outcome,
    tokenBalance: Number(p.tokenBalance),
    averagePrice: avg,
    currentPrice,
    unrealizedPnl,
    claimable,
  };
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const match = url.pathname.match(route.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((k, i) => (params[k] = match[i + 1]));
    try {
      await route.handler(req, res, params, url.searchParams);
    } catch (err) {
      logger.error({ err, path: url.pathname }, "Route error");
      await respond(res, 500, { error: "Internal server error" });
    }
    return;
  }
  await respond(res, 404, { error: "Not found" });
});

connectWithRetry()
  .then(() => {
    server.listen(PORT, () => logger.info(`API server listening on port ${PORT}`));
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to database");
    process.exit(1);
  });

process.on("SIGTERM", async () => {
  server.close();
  await prisma.$disconnect();
});
