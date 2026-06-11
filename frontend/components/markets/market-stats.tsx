"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Users, BarChart2, Droplets, DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useMarketStats } from "@/hooks/use-market";
import { getMockStats } from "@/lib/mock-data";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";

interface MarketStatsProps {
  marketId: string;
}

export function MarketStats({ marketId }: MarketStatsProps) {
  const { stats: apiStats, isLoading } = useMarketStats(marketId);
  const stats = useMemo(() => apiStats ?? getMockStats(marketId), [apiStats, marketId]);

  const statItems = [
    { label: "Total Volume", value: formatUsd(stats.totalVolume), icon: BarChart2 },
    { label: "TVL", value: formatUsd(stats.tvl), icon: Droplets },
    { label: "24h Volume", value: formatUsd(stats.volume24h), icon: DollarSign },
    {
      label: "YES Change 24h",
      value: `${stats.yesPriceChange24h > 0 ? "+" : ""}${stats.yesPriceChange24h.toFixed(1)}%`,
      icon: stats.yesPriceChange24h >= 0 ? TrendingUp : TrendingDown,
      valueClass: stats.yesPriceChange24h >= 0 ? "text-yes" : "text-no",
    },
    { label: "Traders", value: stats.traders.toLocaleString(), icon: Users },
    { label: "LPs", value: stats.lps.toLocaleString(), icon: Droplets },
  ];

  return (
    <Card className="border-border/50">
      <CardContent className="pt-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {statItems.map((item) => (
            <div key={item.label} className="rounded-xl bg-muted/20 border border-border/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </div>
              <div className={cn("text-lg font-semibold tabular-nums", item.valueClass ?? "")}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
