"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, Search, TrendingUp, Activity, Filter } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MarketCard } from "@/components/markets/market-card";
import { MarketFilters } from "@/components/markets/market-filters";
import { useQueryClient } from "@tanstack/react-query";
import { useMarkets } from "@/hooks/use-market";
import { useMarketRealtime } from "@/hooks/use-realtime";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { useAppStore } from "@/store";
import type { MarketStatus } from "@stellarpm/shared";
import { formatUsd } from "@stellarpm/shared";

const CATEGORIES = ["all", "crypto", "macro", "politics", "sports", "tech"];

export default function MarketsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MarketStatus | "all">("all");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"volume" | "newest" | "expiry">("volume");

  const { markets: apiMarkets, isLoading } = useMarkets({ search, status, category, sortBy });
  const storeMarkets = useAppStore((s) => s.markets);

  // Use API markets if available, fall back to mock
  const baseMarkets = apiMarkets.length > 0
    ? apiMarkets
    : storeMarkets.length > 0
    ? storeMarkets
    : MOCK_MARKETS;

  // Realtime: patch query cache instantly so market cards update without waiting
  // for a full refetch. Also sync the Zustand store so WS updateMarket works.
  const queryClient = useQueryClient();
  const { setMarkets } = useAppStore();

  // Keep the store in sync with the query result (enables WS updateMarket).
  useEffect(() => {
    if (apiMarkets.length > 0) setMarkets(apiMarkets);
  }, [apiMarkets.length]);

  useMarketRealtime(baseMarkets.length > 0 ? baseMarkets : MOCK_MARKETS, {
    onEvent: (type, data) => {
      const isTradeOrLiquidity =
        type === "buy" || type === "sell" || type === "swap" ||
        type === "add_liquidity" || type === "remove_liquidity";
      const isSettlement =
        type === "market_settled" || type === "market_resolved";

      if (!isTradeOrLiquidity && !isSettlement) return;

      // 1. Patch every markets query cache entry immediately with new price/TVL.
      const yesBps = Number((data.yesPriceBps as string) ?? 0);
      if (yesBps > 0 && isTradeOrLiquidity) {
        const yesPrice = parseFloat(((yesBps / 10000) * 100).toFixed(1));
        const noPrice = parseFloat((100 - yesPrice).toFixed(1));
        const tvl = data.usdcReserves ? Number(data.usdcReserves) / 1e7 : undefined;
        const marketId = data.marketId as string | undefined;
        const ammAddr = data.ammContract as string | undefined;

        queryClient.setQueriesData<{ markets: any[]; total: number }>(
          { queryKey: ["markets"] },
          (old) => {
            if (!old?.markets) return old;
            return {
              ...old,
              markets: old.markets.map((m) => {
                const matches =
                  (marketId && (m.id === marketId || m.contractAddress === marketId)) ||
                  (ammAddr && m.ammContract === ammAddr);
                if (!matches) return m;
                return { ...m, yesPrice, noPrice, ...(tvl != null ? { tvl } : {}) };
              }),
            };
          }
        );
      }

      // 2. Still invalidate for authoritative DB refetch (catches volume, TVL updates).
      queryClient.invalidateQueries({ queryKey: ["markets"] });
    },
  });

  // Filter/sort in-memory when using mock data
  const markets = useMemo(() => {
    if (apiMarkets.length > 0) return apiMarkets;
    let result = [...baseMarkets];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) => m.title.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)
      );
    }
    if (status !== "all") result = result.filter((m) => m.status === status);
    if (category !== "all") result = result.filter((m) => m.category === category);

    if (sortBy === "volume") result.sort((a, b) => b.volume - a.volume);
    else if (sortBy === "newest") result.sort((a, b) => b.createdAt - a.createdAt);
    else if (sortBy === "expiry") result.sort((a, b) => a.expiryTimestamp - b.expiryTimestamp);

    return result;
  }, [baseMarkets, search, status, category, sortBy, apiMarkets.length]);

  const totalVolume = markets.reduce((acc, m) => acc + m.volume, 0);

  return (
    <div className="container mx-auto px-4 py-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold"
          >
            Prediction Markets
          </motion.h1>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3 mt-2"
          >
            <span className="text-muted-foreground text-sm">
              {markets.length} open markets
            </span>
            <span className="text-border">·</span>
            <span className="text-muted-foreground text-sm">
              {formatUsd(totalVolume)} total volume
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Button className="bg-stellar hover:bg-stellar-dark text-white font-semibold" asChild>
            <Link href="/markets/create">
              <Plus className="mr-2 h-4 w-4" />
              Create Market
            </Link>
          </Button>
        </motion.div>
      </div>

      {/* Category pills */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap gap-2 mb-5"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 capitalize ${
              category === cat
                ? "bg-stellar text-white"
                : "bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground border border-border/50"
            }`}
          >
            {cat}
          </button>
        ))}
      </motion.div>

      {/* Search + Sort Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="flex flex-col md:flex-row gap-3 mb-8"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search markets..."
            className="pl-9 bg-card border-border/50 focus:border-stellar/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <MarketFilters
          status={status}
          onStatusChange={setStatus}
          category={category}
          onCategoryChange={setCategory}
          sortBy={sortBy}
          onSortByChange={setSortBy}
        />
      </motion.div>

      {/* Market Grid */}
      {isLoading && markets.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-56 rounded-2xl shimmer" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-24 text-muted-foreground"
        >
          <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">No markets found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {markets.map((market, i) => (
              <MarketCard key={market.id} market={market} index={i} />
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Bottom stats */}
      {markets.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-10 pt-8 border-t border-border/30 flex items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          <Activity className="h-3 w-3" />
          Showing {markets.length} markets · Prices update in real time
        </motion.div>
      )}
    </div>
  );
}
