"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar,
} from "recharts";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketPriceHistory } from "@/hooks/use-market";
import { useLivePricePoints } from "@/hooks/use-realtime";
import { generatePriceHistory } from "@/lib/mock-data";

type Interval = "1h" | "4h" | "1d";
type ChartType = "probability" | "volume";

interface PriceChartProps {
  marketId: string;
}

function ChartTooltip({ active, payload, label, interval }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: number;
  interval?: Interval;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl border border-border/50 p-3 text-xs shadow-xl">
      <p className="text-muted-foreground mb-2">
        {label ? format(new Date(label * 1000), interval === "1d" ? "MMM d" : "MMM d, HH:mm") : ""}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-0.5">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
          <span className="text-muted-foreground capitalize">{entry.name}:</span>
          <span className="font-semibold ml-auto pl-3">
            {entry.name === "volume"
              ? `$${(entry.value / 1000).toFixed(1)}K`
              : `${entry.value.toFixed(1)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PriceChart({ marketId }: PriceChartProps) {
  const [interval, setInterval] = useState<Interval>("1h");
  const [chartType, setChartType] = useState<ChartType>("probability");

  const { priceHistory: apiData, isLoading } = useMarketPriceHistory(marketId, interval);
  // Live points streamed in over the WebSocket as trades execute — appended on
  // top of the historical series so the chart updates the instant a trade lands.
  const livePoints = useLivePricePoints(marketId);

  const data = useMemo(() => {
    const base =
      apiData && apiData.length > 0
        ? apiData
        : generatePriceHistory(marketId, interval === "1d" ? 30 : 48, interval);
    if (livePoints.length === 0) return base;

    // Append only points newer than the last historical point, de-duped by ts.
    const lastTs = base.length ? base[base.length - 1].timestamp : 0;
    const fresh = livePoints.filter((p) => p.timestamp >= lastTs);
    const merged = [...base];
    for (const p of fresh) {
      const prev = merged[merged.length - 1];
      if (prev && prev.timestamp === p.timestamp) {
        merged[merged.length - 1] = { ...prev, yesPrice: p.yesPrice, noPrice: p.noPrice };
      } else {
        merged.push({
          timestamp: p.timestamp,
          yesPrice: p.yesPrice,
          noPrice: p.noPrice,
          volume: p.volume,
        });
      }
    }
    return merged;
  }, [marketId, interval, apiData, livePoints]);

  if (isLoading && !data?.length) {
    return <Skeleton className="h-72 w-full rounded-2xl" />;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {(["probability", "volume"] as ChartType[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={chartType === t ? "secondary" : "ghost"}
                className="h-7 px-3 text-xs capitalize"
                onClick={() => setChartType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["1h", "4h", "1d"] as Interval[]).map((iv) => (
              <Button
                key={iv}
                size="sm"
                variant={interval === iv ? "secondary" : "ghost"}
                className="h-7 w-10 text-xs"
                onClick={() => setInterval(iv)}
              >
                {iv}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "probability" ? (
              <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="yesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.01} />
                  </linearGradient>
                  <linearGradient id="noGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(t: number) =>
                    format(new Date(t * 1000), interval === "1d" ? "MMM d" : "HH:mm")
                  }
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip interval={interval} />} />
                <Area
                  type="monotone"
                  dataKey="yesPrice"
                  name="yes"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#yesGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="noPrice"
                  name="no"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  fill="url(#noGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }}
                  strokeDasharray="5 2"
                />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(t: number) =>
                    format(new Date(t * 1000), interval === "1d" ? "MMM d" : "HH:mm")
                  }
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip interval={interval} />} />
                <Bar
                  dataKey="volume"
                  name="volume"
                  fill="#7c3aed"
                  fillOpacity={0.65}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
