"use client";

import { cn } from "@/lib/utils";
import type { Market } from "@stellarpm/shared";

interface MarketTickerProps {
  markets: Market[];
}

export function MarketTicker({ markets }: MarketTickerProps) {
  if (markets.length === 0) return null;
  const items = [...markets, ...markets]; // duplicate for seamless loop

  return (
    <div className="relative overflow-hidden border-b border-border/40 bg-background/60 backdrop-blur-sm">
      <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
      <div className="flex animate-ticker whitespace-nowrap py-2">
        {items.map((market, i) => (
          <TickerItem key={`${market.id}-${i}`} market={market} />
        ))}
      </div>
    </div>
  );
}

function TickerItem({ market }: { market: Market }) {
  const isYesDominant = market.yesPrice >= 50;
  return (
    <div className="inline-flex items-center gap-3 px-6 border-r border-border/30 shrink-0">
      <span className="text-xs text-muted-foreground font-medium truncate max-w-[180px]">
        {market.title.length > 40 ? market.title.slice(0, 40) + "…" : market.title}
      </span>
      <span className={cn("text-xs font-bold tabular-nums", isYesDominant ? "text-yes" : "text-no")}>
        {market.yesPrice.toFixed(1)}¢ YES
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {market.noPrice.toFixed(1)}¢ NO
      </span>
    </div>
  );
}
