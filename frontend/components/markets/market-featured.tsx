"use client";

import { useMemo } from "react";
import { useMarkets } from "@/hooks/use-market";
import { MOCK_MARKETS } from "@/lib/mock-data";
import { MarketCard } from "./market-card";
import { Skeleton } from "@/components/ui/skeleton";

export function MarketFeatured() {
  const { markets: apiMarkets, isLoading } = useMarkets({
    sortBy: "volume",
    status: "open",
    limit: 3,
  });

  const markets = useMemo(() => {
    const base = apiMarkets.length > 0 ? apiMarkets : MOCK_MARKETS;
    return base.slice(0, 3);
  }, [apiMarkets]);

  if (isLoading && apiMarkets.length === 0) {
    return (
      <div className="grid md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-52 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {markets.map((market, i) => (
        <MarketCard key={market.id} market={market} index={i} />
      ))}
    </div>
  );
}
