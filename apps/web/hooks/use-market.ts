import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import {
  fetchMarket,
  fetchMarketById,
  fetchAllMarkets,
  contractsDeployed,
} from "@/lib/contracts/client";
import { getMockMarkets, getMockMarket } from "@/lib/mock-data";
import type { Market, MarketFilters } from "@stellarpm/shared";

// ─── Fetch strategy: API → chain → mock ──────────────────────────────────────
// API is preferred for the list because it is fast (one DB query vs 3+ RPC calls
// per market). The chain is kept as a fallback so the list works even when the
// backend is down. Chain is always used for single-market reads (freshest prices).

async function fetchMarketsWithFallback(
  filters: MarketFilters
): Promise<{ markets: Market[]; total: number }> {
  // 1. Try backend API first — one DB round-trip, has all indexed data
  try {
    const result = await apiClient.markets.list(filters);
    if (result.markets.length > 0) return result;
  } catch {}

  // 2. Fall back to chain (authoritative but slower)
  if (contractsDeployed) {
    try {
      const markets = await fetchAllMarkets(filters.offset ?? 0, filters.limit ?? 50);
      if (markets.length > 0) return { markets, total: markets.length };
    } catch {}
  }

  // 3. Mock data (offline dev only)
  const all = getMockMarkets();
  let filtered = all;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }
  if (filters.status && filters.status !== "all") {
    filtered = filtered.filter((m) => m.status === filters.status);
  }
  if (filters.category && filters.category !== "all") {
    filtered = filtered.filter((m) => m.category === filters.category);
  }
  return { markets: filtered, total: filtered.length };
}

async function fetchMarketWithFallback(id: string): Promise<Market | null> {
  // 1. Chain: contract address (C...) or hex market ID
  if (contractsDeployed) {
    try {
      if (id.startsWith("C") && id.length === 56) {
        const m = await fetchMarket(id);
        if (m) return m;
      } else if (/^[0-9a-f]{64}$/.test(id)) {
        const m = await fetchMarketById(id);
        if (m) return m;
      }
    } catch {}
  }

  // 2. Try API
  try {
    return await apiClient.markets.get(id);
  } catch {}

  // 3. Mock
  return getMockMarket(id);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useMarkets(filters: MarketFilters = {}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["markets", filters],
    queryFn: () => fetchMarketsWithFallback(filters),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  return {
    markets: data?.markets ?? [],
    total: data?.total ?? 0,
    isLoading,
    error,
  };
}

export function useMarket(id: string) {
  const { data: market, isLoading, error } = useQuery({
    queryKey: ["market", id],
    queryFn: () => fetchMarketWithFallback(id),
    staleTime: 3_000,
    refetchInterval: 8_000,
    enabled: !!id,
  });

  return { market, isLoading, error };
}

export function useMarketStats(id: string) {
  const { data, isLoading } = useQuery({
    queryKey: ["market-stats", id],
    queryFn: async () => {
      try {
        return await apiClient.markets.getStats(id);
      } catch {
        return null;
      }
    },
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: !!id,
  });

  return { stats: data, isLoading };
}

export function useMarketPriceHistory(
  id: string,
  interval: "1h" | "4h" | "1d" = "1h"
) {
  const { data, isLoading } = useQuery({
    queryKey: ["market-price-history", id, interval],
    queryFn: async () => {
      try {
        return await apiClient.markets.getPriceHistory(id, interval);
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
    refetchInterval: 20_000,
    enabled: !!id,
  });

  return { priceHistory: data ?? [], isLoading };
}

// ─── Protocol-wide stats ──────────────────────────────────────────────────────

import type { ProtocolStats } from "@/lib/api/client";

export function useProtocolStats() {
  const { data, isLoading } = useQuery({
    queryKey: ["protocol-stats"],
    queryFn: async () => {
      try {
        return await apiClient.stats.get();
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  return { stats: data ?? null, isLoading };
}

// ─── Trade history (portfolio) ────────────────────────────────────────────────

import type { TradeRecord } from "@/lib/api/client";

export function useTrades(address?: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["trades", address],
    queryFn: () => apiClient.trades.list(address!),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
  return { trades: (data ?? []) as TradeRecord[], isLoading };
}
