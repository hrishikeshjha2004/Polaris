import type {
  Market,
  MarketFilters,
  MarketStats,
  PriceDataPoint,
  Position,
  LpPosition,
  Settlement,
} from "@stellarpm/shared";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

// ─── Markets API ──────────────────────────────────────────────────────────────

const markets = {
  list: (filters: MarketFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status && filters.status !== "all")
      params.set("status", filters.status);
    if (filters.category && filters.category !== "all")
      params.set("category", filters.category);
    if (filters.sortBy) params.set("sortBy", filters.sortBy);
    if (filters.limit) params.set("limit", filters.limit.toString());
    if (filters.offset) params.set("offset", filters.offset.toString());
    const qs = params.toString();
    return fetchJson<{ markets: Market[]; total: number }>(
      `/markets${qs ? `?${qs}` : ""}`
    );
  },

  get: (id: string) => fetchJson<Market>(`/markets/${id}`),

  getStats: (id: string) => fetchJson<MarketStats>(`/markets/${id}/stats`),

  getPriceHistory: (id: string, interval: "1h" | "4h" | "1d" = "1h") =>
    fetchJson<PriceDataPoint[]>(
      `/markets/${id}/price-history?interval=${interval}`
    ),
};

// ─── Positions API ────────────────────────────────────────────────────────────

const positions = {
  list: (address: string) =>
    fetchJson<Position[]>(`/positions?address=${address}`),

  lpList: (address: string) =>
    fetchJson<LpPosition[]>(`/lp-positions?address=${address}`),
};

// ─── Settlements API ──────────────────────────────────────────────────────────

const settlements = {
  list: (address: string) =>
    fetchJson<Settlement[]>(`/settlements?address=${address}`),
  get: (marketId: string) => fetchJson<Settlement>(`/settlements/${marketId}`),
};

// ─── Protocol Stats ───────────────────────────────────────────────────────────

export interface ProtocolStats {
  totalVolume: number;
  totalTVL: number;
  openMarkets: number;
  totalMarkets: number;
  totalTraders: number;
}

const stats = {
  get: () => fetchJson<ProtocolStats>("/stats"),
};

// ─── Trade History ────────────────────────────────────────────────────────────

export interface TradeRecord {
  id: string;
  marketId: string;
  market: { id: string; title: string };
  side: string;
  outcome: string | null;
  amountIn: number;
  amountOut: number;
  fee: number;
  txHash: string;
  timestamp: number;
}

const trades = {
  list: (address: string, limit = 50) =>
    fetchJson<TradeRecord[]>(`/trades?address=${address}&limit=${limit}`),
};

// ─── Exported client ──────────────────────────────────────────────────────────

export const apiClient = { markets, positions, settlements, stats, trades };
