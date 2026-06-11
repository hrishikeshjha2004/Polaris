"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { MarketDetail } from "@/components/markets/market-detail";
import { TradePanel } from "@/components/trade/trade-panel";
import { PriceChart } from "@/components/trade/price-chart";
import { MarketStats } from "@/components/markets/market-stats";
import { ActivityFeed } from "@/components/markets/activity-feed";
import { useMarket } from "@/hooks/use-market";
import { useMarketRealtime } from "@/hooks/use-realtime";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { ArrowLeft, Clock, BarChart2, Users, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";

export default function MarketPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const defaultOutcome = searchParams.get("outcome") as "yes" | "no" | null;

  const { market: apiMarket, isLoading } = useMarket(id);
  const queryClient = useQueryClient();

  // Instant WS price overlay — updated the moment a trade event arrives, before
  // the query refetch completes. Clears when the query returns fresh data.
  const [priceOverride, setPriceOverride] = useState<{
    yesPrice: number; noPrice: number; tvl?: number; volume?: number;
  } | null>(null);

  const market = useMemo(() => {
    const base = apiMarket ?? (MOCK_MARKETS.find((m) => m.id === id) ?? null);
    if (!base) return null;
    // Merge instant WS overlay for realtime price/TVL display.
    return priceOverride ? { ...base, ...priceOverride } : base;
  }, [apiMarket, id, priceOverride]);

  // Subscribe to WS events for this market only.
  useMarketRealtime(market ? [market] : [], {
    onEvent: (type, data) => {
      // Only react to events that belong to this market (by id or AMM contract).
      const evMarket = (data.marketId as string | undefined);
      const evAmm = (data.ammContract as string | undefined);
      const mine =
        (!evMarket && !evAmm) ||
        evMarket === id ||
        evMarket === market?.contractAddress ||
        evAmm === market?.ammContract;
      if (!mine) return;

      const isTradeOrLiquidity =
        type === "buy" || type === "sell" || type === "swap" ||
        type === "add_liquidity" || type === "remove_liquidity";
      const isSettlement = type === "market_settled" || type === "market_resolved";

      if (isTradeOrLiquidity || isSettlement) {
        // 1. Instant overlay: flip prices without waiting for the refetch.
        const yesBps = Number(data.yesPriceBps ?? 0);
        if (yesBps > 0 && isTradeOrLiquidity) {
          const yesPrice = parseFloat(((yesBps / 10000) * 100).toFixed(1));
          const noPrice = parseFloat((100 - yesPrice).toFixed(1));
          const tvl = data.usdcReserves ? Number(data.usdcReserves) / 1e7 : undefined;
          setPriceOverride((prev) => ({ ...prev, yesPrice, noPrice, ...(tvl != null ? { tvl } : {}) }));
        }

        // 2. Authoritative refetch — clears the override once fresh data lands.
        queryClient.invalidateQueries({ queryKey: ["market", id] }).then(() =>
          setPriceOverride(null)
        );
        queryClient.invalidateQueries({ queryKey: ["market-stats", id] });
        queryClient.invalidateQueries({ queryKey: ["market-price-history", id] });
        queryClient.invalidateQueries({ queryKey: ["quote"] });
        queryClient.invalidateQueries({ queryKey: ["balances"] });
        queryClient.invalidateQueries({ queryKey: ["positions"] });
        queryClient.invalidateQueries({ queryKey: ["chain-positions"] });
        queryClient.invalidateQueries({ queryKey: ["markets"] });
      }
    },
  });

  if (isLoading && !market) {
    return <MarketPageSkeleton />;
  }

  if (!market) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground text-lg">Market not found</p>
        <Button variant="ghost" className="mt-4" asChild>
          <Link href="/markets">← Back to Markets</Link>
        </Button>
      </div>
    );
  }

  const expiresIn = formatDistanceToNow(new Date(market.expiryTimestamp * 1000), { addSuffix: true });
  const statusColor =
    market.status === "open"
      ? "bg-yes/15 text-yes border-yes/25"
      : market.status === "resolved"
      ? "bg-muted text-muted-foreground"
      : "bg-no/15 text-no border-no/25";

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-5 -ml-2 text-muted-foreground hover:text-foreground"
        asChild
      >
        <Link href="/markets">
          <ArrowLeft className="mr-2 h-4 w-4" />
          All Markets
        </Link>
      </Button>

      {/* Market Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-start gap-3 mb-3 flex-wrap">
          <h1 className="text-xl md:text-2xl font-bold leading-tight flex-1 min-w-0">
            {market.title}
          </h1>
          <Badge
            className={cn("shrink-0 uppercase text-xs font-bold border", statusColor)}
          >
            {market.status}
          </Badge>
        </div>

        {/* Key stats row */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-5">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Expires {expiresIn}
          </span>
          <span className="flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5" />
            {formatUsd(market.volume)} volume
          </span>
          <span className="flex items-center gap-1.5">
            <Droplets className="h-3.5 w-3.5" />
            {formatUsd(market.tvl)} TVL
          </span>
        </div>

        {/* Probability display */}
        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold text-yes tabular-nums">{market.yesPrice.toFixed(0)}¢</span>
            <span className="text-sm text-muted-foreground">YES</span>
          </div>
          <div className="flex-1 h-3 rounded-full probability-bar"
            style={{ "--yes-pct": `${market.yesPrice}%` } as React.CSSProperties}
          />
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm text-muted-foreground">NO</span>
            <span className="text-4xl font-bold text-no tabular-nums">{market.noPrice.toFixed(0)}¢</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {market.yesPrice}% chance of YES · Oracle: {market.oracleSource}
        </p>
      </motion.div>

      {/* Main Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left/main column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Price Chart */}
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <PriceChart marketId={id} />
            </motion.div>
          </Suspense>

          {/* Tabs: Details / Stats / Activity */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <Tabs defaultValue="details">
              <TabsList className="w-full bg-card border border-border/50">
                <TabsTrigger value="details" className="flex-1 text-xs">Details</TabsTrigger>
                <TabsTrigger value="stats" className="flex-1 text-xs">Stats</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1 text-xs">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-0">
                <MarketDetail market={market} />
              </TabsContent>
              <TabsContent value="stats" className="mt-0">
                <MarketStats marketId={id} />
              </TabsContent>
              <TabsContent value="activity" className="mt-0">
                <ActivityFeed marketId={id} marketTitle={market.title} />
              </TabsContent>
            </Tabs>
          </motion.div>
        </div>

        {/* Right: Trade Panel */}
        <motion.div
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-1"
        >
          <TradePanel market={market} defaultOutcome={defaultOutcome ?? "yes"} />
        </motion.div>
      </div>
    </div>
  );
}

function MarketPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    </div>
  );
}
