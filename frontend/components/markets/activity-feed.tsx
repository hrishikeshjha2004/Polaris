"use client";

import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Activity } from "lucide-react";
import { useRealtimeActivity } from "@/hooks/use-realtime";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";

interface ActivityFeedProps {
  marketId: string;
  marketTitle: string;
}

export function ActivityFeed({ marketId }: ActivityFeedProps) {
  // Real trades streamed over the WebSocket (plus the user's own optimistic
  // entries). No fabricated seed data — an empty market shows an empty feed.
  const allTrades = useRealtimeActivity();
  const displayed = allTrades.filter((t) => t.marketId === marketId).slice(0, 20);

  if (displayed.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-6 text-center text-sm text-muted-foreground">
        <Activity className="h-6 w-6 mx-auto mb-2 opacity-30" />
        No trades yet — be the first to trade this market.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
        <span className="text-xs font-medium text-muted-foreground">Recent Trades</span>
        <span className="ml-auto text-xs text-muted-foreground">{displayed.length} trades</span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-4 px-4 py-2 text-xs text-muted-foreground border-b border-border/20">
        <span>Type</span>
        <span>Amount</span>
        <span>Price</span>
        <span className="text-right">Time</span>
      </div>

      <div className="divide-y divide-border/20 max-h-80 overflow-y-auto">
        <AnimatePresence initial={false}>
          {displayed.map((trade, i) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, height: 0, x: -8 }}
              animate={{ opacity: 1, height: "auto", x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                "grid grid-cols-4 px-4 py-2.5 text-xs items-center",
                i === 0 ? "bg-accent/30" : "",
                trade.optimistic ? "opacity-70" : ""
              )}
            >
              <span
                className={cn(
                  "font-bold w-fit px-1.5 py-0.5 rounded text-[10px]",
                  trade.outcome === "yes"
                    ? "bg-yes/15 text-yes"
                    : "bg-no/15 text-no"
                )}
              >
                {trade.side === "sell" ? "SELL " : ""}{trade.outcome.toUpperCase()}
              </span>
              <span className="font-medium">{formatUsd(trade.amount)}</span>
              <span className="text-muted-foreground tabular-nums">{trade.price.toFixed(1)}¢</span>
              <span className="text-right text-muted-foreground tabular-nums">
                {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
