"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Clock, BarChart2, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Market } from "@stellarpm/shared";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";

// ─── Inline sparkline ─────────────────────────────────────────────────────────

function Sparkline({ yes, id }: { yes: number; id: string }) {
  const count = 10;
  const points = Array.from({ length: count }, (_, i) => {
    const seed = id.charCodeAt(i % id.length) + i;
    const noise = Math.sin(seed * 0.7) * 10 + Math.cos(seed * 1.3) * 6;
    return Math.max(5, Math.min(95, yes - 8 + noise + (i / count) * 8));
  });

  const svgPoints = points
    .map((p, i) => `${(i / (count - 1)) * 60},${30 - (p / 100) * 30}`)
    .join(" ");

  const isUp = points[points.length - 1] > points[0];

  return (
    <svg width="60" height="30" viewBox="0 0 60 30" className="opacity-60">
      <polyline
        points={svgPoints}
        fill="none"
        stroke={isUp ? "#22c55e" : "#ef4444"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Market Card ─────────────────────────────────────────────────────────────

interface MarketCardProps {
  market: Market;
  index?: number;
}

export function MarketCard({ market, index = 0 }: MarketCardProps) {
  const yesPrice = market.yesPrice;
  const noPrice = market.noPrice;
  const expiresIn = formatDistanceToNow(
    new Date(market.expiryTimestamp * 1000),
    { addSuffix: true }
  );

  const isHot = market.volume > 500000;
  const isTrending = market.yesPrice > 60 || market.yesPrice < 40;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="h-full"
    >
      <div className="h-full rounded-2xl border border-border/50 bg-card hover:border-stellar/30 hover:bg-card/90 transition-all duration-300 overflow-hidden group flex flex-col">
        {/* Card body */}
        <div className="p-5 flex-1 flex flex-col">
          {/* Top row: category + expiry + sparkline */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs capitalize">
                {market.category.replace("_", " ")}
              </Badge>
              {isHot && (
                <Badge className="text-[10px] bg-no/15 text-no border-no/20 px-1.5 py-0">
                  🔥 Hot
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Sparkline yes={yesPrice} id={market.id} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {expiresIn}
              </span>
            </div>
          </div>

          {/* Title */}
          <h3 className="font-semibold leading-snug mb-4 group-hover:text-stellar-light transition-colors line-clamp-2 flex-1 min-h-[2.5rem]">
            {market.title}
          </h3>

          {/* Probability Bar + labels */}
          <div className="mb-4">
            <div
              className="h-2 rounded-full probability-bar mb-2"
              style={{ "--yes-pct": `${yesPrice}%` } as React.CSSProperties}
            />
            <div className="flex justify-between text-sm font-bold">
              <span className={cn("flex items-center gap-1", yesPrice > noPrice ? "text-yes" : "text-muted-foreground")}>
                {yesPrice > noPrice ? <TrendingUp className="h-3 w-3" /> : null}
                YES {yesPrice.toFixed(0)}¢
              </span>
              <span className={cn("flex items-center gap-1", noPrice > yesPrice ? "text-no" : "text-muted-foreground")}>
                {noPrice > yesPrice ? <TrendingDown className="h-3 w-3" /> : null}
                NO {noPrice.toFixed(0)}¢
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <BarChart2 className="h-3 w-3" />
              Vol: {formatUsd(market.volume)}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              TVL: {formatUsd(market.tvl)}
            </span>
          </div>
        </div>

        {/* CTA Buttons — anchored to bottom */}
        <div className="px-5 pb-5 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-yes/30 bg-yes/5 text-yes hover:bg-yes/15 hover:border-yes/60 hover:text-yes font-semibold transition-all"
            asChild
          >
            <Link href={`/markets/${market.id}?outcome=yes`}>Buy YES</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-no/30 bg-no/5 text-no hover:bg-no/15 hover:border-no/60 hover:text-no font-semibold transition-all"
            asChild
          >
            <Link href={`/markets/${market.id}?outcome=no`}>Buy NO</Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
