import type { Market, Position, LpPosition, PriceDataPoint, MarketStats, Settlement } from "@stellarpm/shared";

// ─── Mock Markets ─────────────────────────────────────────────────────────────

export const MOCK_MARKETS: Market[] = [
  {
    id: "btc-100k-2026",
    contractAddress: "CABC...0001",
    ammContract: "CAMM...0001",
    yesToken: "CYES...0001",
    noToken: "CNO...0001",
    lpToken: "CLP...0001",
    title: "Will BTC exceed $100,000 before July 2026?",
    description:
      "This market resolves YES if Bitcoin (BTC) closes above $100,000 USD on any major exchange before or on July 1, 2026. Resolution source: Binance BTC/USDT closing price.",
    category: "crypto",
    creator: "GABCD...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 25,
    status: "open",
    yesPrice: 67,
    noPrice: 33,
    volume: 842300,
    tvl: 312000,
    oracleSource: "Binance BTC/USDT",
    thresholdValue: 10000000,
    thresholdOperator: 1,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 7,
  },
  {
    id: "eth-5k-q2",
    contractAddress: "CABC...0002",
    ammContract: "CAMM...0002",
    yesToken: "CYES...0002",
    noToken: "CNO...0002",
    lpToken: "CLP...0002",
    title: "Will ETH hit $5,000 in Q2 2026?",
    description:
      "Market resolves YES if Ethereum (ETH) reaches $5,000 USD at any point during Q2 2026 (April 1 – June 30). Resolution source: CoinGecko ETH/USD daily close.",
    category: "crypto",
    creator: "GXYZ...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 18,
    status: "open",
    yesPrice: 43,
    noPrice: 57,
    volume: 524100,
    tvl: 198000,
    oracleSource: "CoinGecko ETH/USD",
    thresholdValue: 500000,
    thresholdOperator: 1,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 5,
  },
  {
    id: "sol-300-june",
    contractAddress: "CABC...0003",
    ammContract: "CAMM...0003",
    yesToken: "CYES...0003",
    noToken: "CNO...0003",
    lpToken: "CLP...0003",
    title: "Will SOL trade above $300 by June 30?",
    description:
      "Market resolves YES if Solana (SOL) closes above $300 USD on Binance on or before June 30, 2026.",
    category: "crypto",
    creator: "GABC...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 27,
    status: "open",
    yesPrice: 29,
    noPrice: 71,
    volume: 287400,
    tvl: 104500,
    oracleSource: "Binance SOL/USDT",
    thresholdValue: 30000,
    thresholdOperator: 1,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 3,
  },
  {
    id: "xlm-breakout-2026",
    contractAddress: "CABC...0004",
    ammContract: "CAMM...0004",
    yesToken: "CYES...0004",
    noToken: "CNO...0004",
    lpToken: "CLP...0004",
    title: "Will XLM reach $1.00 in 2026?",
    description:
      "Market resolves YES if Stellar Lumens (XLM) closes at or above $1.00 USD on any day in 2026.",
    category: "crypto",
    creator: "GDEF...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 45,
    status: "open",
    yesPrice: 54,
    noPrice: 46,
    volume: 193200,
    tvl: 88700,
    oracleSource: "Binance XLM/USDT",
    thresholdValue: 100,
    thresholdOperator: 1,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 10,
  },
  {
    id: "btc-halving-dump",
    contractAddress: "CABC...0005",
    ammContract: "CAMM...0005",
    yesToken: "CYES...0005",
    noToken: "CNO...0005",
    lpToken: "CLP...0005",
    title: "Will BTC drop below $60k within 30 days of halving?",
    description:
      "Market resolves YES if Bitcoin closes below $60,000 within 30 days after the 2024 halving block.",
    category: "crypto",
    creator: "GHIJ...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 12,
    status: "open",
    yesPrice: 22,
    noPrice: 78,
    volume: 631000,
    tvl: 245000,
    oracleSource: "CoinGecko BTC/USD",
    thresholdValue: 6000000,
    thresholdOperator: 0,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 14,
  },
  {
    id: "fed-rate-cut-june",
    contractAddress: "CABC...0006",
    ammContract: "CAMM...0006",
    yesToken: "CYES...0006",
    noToken: "CNO...0006",
    lpToken: "CLP...0006",
    title: "Will the Fed cut rates in June 2026 FOMC?",
    description:
      "Market resolves YES if the Federal Reserve announces a rate cut at the June 2026 FOMC meeting.",
    category: "macro",
    creator: "GKLM...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 55,
    status: "open",
    yesPrice: 61,
    noPrice: 39,
    volume: 429000,
    tvl: 177000,
    oracleSource: "Fed FOMC statement",
    thresholdValue: 0,
    thresholdOperator: 0,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 21,
  },
  {
    id: "xrp-lawsuit-resolved",
    contractAddress: "CABC...0007",
    ammContract: "CAMM...0007",
    yesToken: "CYES...0007",
    noToken: "CNO...0007",
    lpToken: "CLP...0007",
    title: "Will XRP close above $3.00 by end of Q2?",
    description:
      "Market resolves YES if XRP/USDT closes at or above $3.00 on Binance on June 30, 2026.",
    category: "crypto",
    creator: "GNOP...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 28,
    status: "open",
    yesPrice: 38,
    noPrice: 62,
    volume: 315700,
    tvl: 132000,
    oracleSource: "Binance XRP/USDT",
    thresholdValue: 300,
    thresholdOperator: 1,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 4,
  },
  {
    id: "eth-etf-flows",
    contractAddress: "CABC...0008",
    ammContract: "CAMM...0008",
    yesToken: "CYES...0008",
    noToken: "CNO...0008",
    lpToken: "CLP...0008",
    title: "Will ETH ETF cumulative flows exceed $5B in Q2?",
    description:
      "Market resolves YES if cumulative US spot ETH ETF net flows exceed $5 billion by June 30, 2026. Source: Bloomberg ETF data.",
    category: "macro",
    creator: "GQRS...CREATOR",
    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 29,
    status: "open",
    yesPrice: 71,
    noPrice: 29,
    volume: 762000,
    tvl: 298000,
    oracleSource: "Bloomberg ETF flows",
    thresholdValue: 500000000,
    thresholdOperator: 1,
    createdAt: Math.floor(Date.now() / 1000) - 86400 * 8,
  },
];

// ─── Mock Positions ───────────────────────────────────────────────────────────

export const MOCK_POSITIONS: Position[] = [
  {
    id: "pos-1",
    marketId: "btc-100k-2026",
    market: MOCK_MARKETS[0],
    userAddress: "",
    outcome: "yes",
    tokenBalance: 2500 * 10_000_000,
    averagePrice: 0.61,
    currentPrice: 0.67,
    unrealizedPnl: 150,
    claimable: 0,
  },
  {
    id: "pos-2",
    marketId: "eth-5k-q2",
    market: MOCK_MARKETS[1],
    userAddress: "",
    outcome: "no",
    tokenBalance: 1800 * 10_000_000,
    averagePrice: 0.59,
    currentPrice: 0.57,
    unrealizedPnl: 36,
    claimable: 0,
  },
  {
    id: "pos-3",
    marketId: "fed-rate-cut-june",
    market: MOCK_MARKETS[5],
    userAddress: "",
    outcome: "yes",
    tokenBalance: 1000 * 10_000_000,
    averagePrice: 0.55,
    currentPrice: 0.61,
    unrealizedPnl: 60,
    claimable: 0,
  },
];

export const MOCK_LP_POSITIONS: LpPosition[] = [
  {
    id: "lp-1",
    marketId: "btc-100k-2026",
    market: MOCK_MARKETS[0],
    userAddress: "",
    lpShares: 50000 * 10_000_000,
    depositedValue: 5000,
    currentValue: 5280,
    feesEarned: 142,
  },
  {
    id: "lp-2",
    marketId: "eth-etf-flows",
    market: MOCK_MARKETS[7],
    userAddress: "",
    lpShares: 30000 * 10_000_000,
    depositedValue: 3000,
    currentValue: 3190,
    feesEarned: 87,
  },
];

// ─── Price History Generator ──────────────────────────────────────────────────

export function generatePriceHistory(
  marketId: string,
  points = 48,
  interval: "1h" | "4h" | "1d" = "1h"
): PriceDataPoint[] {
  const market = MOCK_MARKETS.find((m) => m.id === marketId);
  const baseYes = market?.yesPrice ?? 50;
  const intervalMs = interval === "1h" ? 3600 : interval === "4h" ? 14400 : 86400;
  const now = Math.floor(Date.now() / 1000);

  let yesPrice = Math.max(5, Math.min(95, baseYes - 15 + Math.random() * 5));
  const history: PriceDataPoint[] = [];

  for (let i = points; i >= 0; i--) {
    const noise = (Math.random() - 0.48) * 3;
    yesPrice = Math.max(5, Math.min(95, yesPrice + noise));
    history.push({
      timestamp: now - i * intervalMs,
      yesPrice: parseFloat(yesPrice.toFixed(1)),
      noPrice: parseFloat((100 - yesPrice).toFixed(1)),
      volume: Math.floor(Math.random() * 50000 + 5000),
    });
  }

  // Bias towards current price at end
  history[history.length - 1].yesPrice = baseYes;
  history[history.length - 1].noPrice = 100 - baseYes;

  return history;
}

// ─── Mock Stats ───────────────────────────────────────────────────────────────

export function getMockStats(marketId: string): MarketStats {
  const market = MOCK_MARKETS.find((m) => m.id === marketId);
  const change = (Math.random() - 0.45) * 4;
  return {
    totalVolume: market?.volume ?? 100000,
    tvl: market?.tvl ?? 50000,
    yesPrice: market?.yesPrice ?? 50,
    noPrice: market?.noPrice ?? 50,
    yesPriceChange24h: parseFloat(change.toFixed(2)),
    noPriceChange24h: parseFloat((-change).toFixed(2)),
    volume24h: Math.floor((market?.volume ?? 100000) * 0.12),
    traders: Math.floor(Math.random() * 200 + 50),
    lps: Math.floor(Math.random() * 30 + 5),
  };
}

// ─── Protocol Stats ───────────────────────────────────────────────────────────

export const PROTOCOL_STATS = {
  totalVolume: 4_230_000,
  totalTVL: 1_620_000,
  openMarkets: MOCK_MARKETS.filter((m) => m.status === "open").length,
  totalTraders: 4812,
};


// ─── Convenience accessors ────────────────────────────────────────────────────

export function getMockMarkets(): Market[] {
  return MOCK_MARKETS;
}

export function getMockMarket(id: string): Market | null {
  return MOCK_MARKETS.find((m) => m.id === id) ?? null;
}
