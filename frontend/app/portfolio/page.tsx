"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wallet, TrendingUp, TrendingDown, BarChart2,
  Droplets, DollarSign, Activity, ChevronRight,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallet } from "@/hooks/use-wallet";
import { useChainPositions } from "@/hooks/use-portfolio";
import { useMarketRealtime } from "@/hooks/use-realtime";
import { useTrades } from "@/hooks/use-market";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { MOCK_POSITIONS, MOCK_LP_POSITIONS } from "@/lib/mock-data";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";

// ─── Portfolio P&L chart data ─────────────────────────────────────────────────

function generatePnlHistory(baseValue: number) {
  const days = 30;
  let v = baseValue * 0.8;
  return Array.from({ length: days }, (_, i) => {
    const drift = (Math.random() - 0.44) * (baseValue * 0.05);
    v = Math.max(baseValue * 0.5, v + drift);
    return {
      date: format(subDays(new Date(), days - 1 - i), "MMM d"),
      value: parseFloat(v.toFixed(2)),
    };
  });
}

// ─── Allocation chart ─────────────────────────────────────────────────────────

const COLORS = ["#22c55e", "#ef4444", "#7c3aed", "#f59e0b", "#06b6d4"];

function AllocationChart({ positions }: { positions: typeof MOCK_POSITIONS }) {
  const data = positions.map((p) => ({
    name: p.market.title.slice(0, 20) + "…",
    value: (p.tokenBalance / 1e7) * p.currentPrice,
    outcome: p.outcome,
  }));

  if (data.length === 0) return null;

  return (
    <PieChart width={120} height={120}>
      <Pie
        data={data}
        cx={60}
        cy={60}
        innerRadius={35}
        outerRadius={55}
        dataKey="value"
        strokeWidth={0}
      >
        {data.map((entry, i) => (
          <Cell
            key={i}
            fill={entry.outcome === "yes" ? COLORS[i % 2 === 0 ? 0 : 2] : COLORS[1]}
            fillOpacity={0.85}
          />
        ))}
      </Pie>
    </PieChart>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, change, icon: Icon, positive }: {
  label: string;
  value: string;
  change?: string;
  icon: React.ElementType;
  positive?: boolean;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                positive === true ? "text-yes" : positive === false ? "text-no" : ""
              )}
            >
              {value}
            </p>
            {change && (
              <p
                className={cn(
                  "text-xs mt-1 flex items-center gap-1",
                  positive !== undefined
                    ? positive ? "text-yes" : "text-no"
                    : "text-muted-foreground"
                )}
              >
                {positive ? <TrendingUp className="h-3 w-3" /> : positive === false ? <TrendingDown className="h-3 w-3" /> : null}
                {change}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-stellar/10 p-2 shrink-0">
            <Icon className="h-4 w-4 text-stellar-light" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { isConnected, address } = useWallet();
  const [tab, setTab] = useState("positions");

  const queryClient = useQueryClient();

  // Real on-chain YES/NO balances (source of truth that the user owns tokens).
  const { positions: chainPositions, isLoading: chainLoading, isLive } =
    useChainPositions(address);

  const { data: apiPositions, isLoading: posLoading } = useQuery({
    queryKey: ["positions", address],
    queryFn: () => apiClient.positions.list(address!),
    enabled: !!address && !isLive,
  });
  const { data: apiLpPositions, isLoading: lpLoading } = useQuery({
    queryKey: ["lp-positions", address],
    queryFn: () => apiClient.positions.lpList(address!),
    enabled: !!address,
  });

  const { trades: tradeHistory, isLoading: tradesLoading } = useTrades(address);

  // Realtime: re-read on-chain balances/positions the instant any trade/
  // settlement event arrives (own trades or anyone's that touch our markets).
  useMarketRealtime([], {
    onEvent: (type) => {
      if (
        type === "buy" || type === "sell" || type === "swap" ||
        type === "market_settled" || type === "market_resolved" ||
        type === "payout_claimed"
      ) {
        queryClient.invalidateQueries({ queryKey: ["chain-positions"] });
        queryClient.invalidateQueries({ queryKey: ["positions"] });
        queryClient.invalidateQueries({ queryKey: ["lp-positions"] });
      }
    },
  });

  if (!isConnected) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="w-16 h-16 rounded-2xl bg-stellar/10 flex items-center justify-center mx-auto mb-4">
            <Wallet className="h-7 w-7 text-stellar-light" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Connect your wallet</h2>
          <p className="text-muted-foreground max-w-xs mx-auto text-sm">
            Connect your Freighter wallet to view your positions, P&L, and portfolio analytics.
          </p>
        </motion.div>
      </div>
    );
  }

  // Source of truth: real on-chain balances when contracts are live, else the
  // indexer API, else mock data for offline UI development.
  const positions = isLive
    ? chainPositions
    : (apiPositions && apiPositions.length > 0 ? apiPositions : MOCK_POSITIONS);
  const lpPositions = apiLpPositions && apiLpPositions.length > 0 ? apiLpPositions : MOCK_LP_POSITIONS;
  const positionsLoading = isLive ? chainLoading : posLoading;

  const totalPositionValue = positions.reduce(
    (acc, p) => acc + (p.tokenBalance / 1e7) * p.currentPrice, 0
  );
  const totalPnl = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  const lpValue = lpPositions.reduce((acc, p) => acc + p.currentValue, 0);
  const lpFees = lpPositions.reduce((acc, p) => acc + p.feesEarned, 0);

  const pnlHistory = generatePnlHistory(totalPositionValue + lpValue);

  return (
    <div className="container mx-auto px-4 py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold">Portfolio</h1>
        <p className="text-muted-foreground mt-1 text-sm">Your positions, P&L, and LP earnings</p>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Position Value"
          value={formatUsd(totalPositionValue)}
          change={`${positions.length} open positions`}
          icon={BarChart2}
        />
        <StatCard
          label="Unrealized P&L"
          value={`${totalPnl >= 0 ? "+" : ""}${formatUsd(totalPnl)}`}
          change={`${totalPnl >= 0 ? "+" : ""}${totalPositionValue > 0 ? ((totalPnl / totalPositionValue) * 100).toFixed(1) : 0}% return`}
          icon={TrendingUp}
          positive={totalPnl >= 0}
        />
        <StatCard
          label="LP Value"
          value={formatUsd(lpValue)}
          change={`${lpPositions.length} positions`}
          icon={Droplets}
        />
        <StatCard
          label="Fees Earned"
          value={formatUsd(lpFees)}
          change="From liquidity provision"
          icon={DollarSign}
          positive={true}
        />
      </div>

      {/* P&L Chart + Allocation */}
      <div className="grid lg:grid-cols-4 gap-4 mb-8">
        <Card className="lg:col-span-3 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Portfolio Value (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnlHistory} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}K`}
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(v: number) => [`$${v.toFixed(2)}`, "Value"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    fill="url(#portfolioGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Allocation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <AllocationChart positions={positions} />
            <div className="w-full space-y-2 mt-3">
              {positions.slice(0, 3).map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate text-muted-foreground">
                    {p.market.title.slice(0, 22)}…
                  </span>
                  <span className={cn(
                    "ml-auto font-medium shrink-0",
                    p.outcome === "yes" ? "text-yes" : "text-no"
                  )}>
                    {p.outcome.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Positions / LP tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="positions">Positions ({positions.length})</TabsTrigger>
          <TabsTrigger value="lp">LP Positions ({lpPositions.length})</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <Card className="border-border/50">
            <CardContent className="pt-0">
              {positionsLoading ? (
                <div className="space-y-3 pt-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : positions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <Activity className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No open positions.{" "}
                  <Link href="/markets" className="text-stellar-light hover:underline">
                    Browse markets →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {/* Table header */}
                  <div className="grid grid-cols-6 px-0 py-2.5 text-xs text-muted-foreground">
                    <span className="col-span-2">Market</span>
                    <span>Type</span>
                    <span>Tokens</span>
                    <span>Value</span>
                    <span className="text-right">P&L</span>
                  </div>
                  {positions.map((pos) => (
                    <motion.div
                      key={pos.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="grid grid-cols-6 py-4 text-sm items-center hover:bg-accent/10 transition-colors"
                    >
                      <Link
                        href={`/markets/${pos.marketId}`}
                        className="col-span-2 font-medium hover:text-stellar-light transition-colors text-xs leading-snug pr-4 flex items-center gap-2"
                      >
                        {pos.market.title.slice(0, 45)}{pos.market.title.length > 45 ? "…" : ""}
                        <ChevronRight className="h-3 w-3 opacity-40 shrink-0" />
                      </Link>
                      <span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-bold border",
                            pos.outcome === "yes"
                              ? "border-yes/30 text-yes bg-yes/5"
                              : "border-no/30 text-no bg-no/5"
                          )}
                        >
                          {pos.outcome.toUpperCase()}
                        </Badge>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {(pos.tokenBalance / 1e7).toFixed(0)}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {formatUsd((pos.tokenBalance / 1e7) * pos.currentPrice)}
                      </span>
                      <span
                        className={cn(
                          "text-right text-xs font-semibold tabular-nums",
                          pos.unrealizedPnl >= 0 ? "text-yes" : "text-no"
                        )}
                      >
                        {pos.unrealizedPnl >= 0 ? "+" : ""}
                        {formatUsd(pos.unrealizedPnl)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lp">
          <Card className="border-border/50">
            <CardContent className="pt-0">
              {lpLoading ? (
                <div className="space-y-3 pt-4">
                  {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : lpPositions.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <Droplets className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No LP positions.{" "}
                  <Link href="/liquidity" className="text-stellar-light hover:underline">
                    Provide liquidity →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  <div className="grid grid-cols-5 py-2.5 text-xs text-muted-foreground">
                    <span className="col-span-2">Market</span>
                    <span>Deposited</span>
                    <span>Current</span>
                    <span className="text-right">Fees</span>
                  </div>
                  {lpPositions.map((lp) => (
                    <div key={lp.id} className="grid grid-cols-5 py-4 text-sm items-center hover:bg-accent/10 transition-colors">
                      <Link
                        href={`/liquidity`}
                        className="col-span-2 font-medium hover:text-stellar-light transition-colors text-xs leading-snug pr-4"
                      >
                        {lp.market.title.slice(0, 45)}{lp.market.title.length > 45 ? "…" : ""}
                      </Link>
                      <span className="text-xs tabular-nums">{formatUsd(lp.depositedValue)}</span>
                      <span className="text-xs font-medium tabular-nums">{formatUsd(lp.currentValue)}</span>
                      <span className="text-right text-xs font-semibold text-yes tabular-nums">
                        +{formatUsd(lp.feesEarned)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="border-border/50">
            <CardContent className="pt-0">
              {tradesLoading ? (
                <div className="space-y-3 pt-4">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                </div>
              ) : tradeHistory.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  <Activity className="h-8 w-8 mx-auto mb-3 opacity-20" />
                  No trades yet.{" "}
                  <Link href="/markets" className="text-stellar-light hover:underline">Trade a market →</Link>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  <div className="grid grid-cols-5 py-2.5 text-xs text-muted-foreground">
                    <span className="col-span-2">Market</span>
                    <span>Side</span>
                    <span>Amount</span>
                    <span className="text-right">Time</span>
                  </div>
                  {tradeHistory.map((t) => (
                    <div key={t.id} className="grid grid-cols-5 py-3 text-sm items-center hover:bg-accent/10 transition-colors">
                      <Link href={`/markets/${t.marketId}`}
                        className="col-span-2 text-xs text-muted-foreground hover:text-stellar-light truncate pr-3">
                        {t.market.title.slice(0, 40)}{t.market.title.length > 40 ? "…" : ""}
                      </Link>
                      <span>
                        <Badge variant="outline" className={cn("text-xs font-bold border",
                          t.side === "buy" ? "border-yes/30 text-yes bg-yes/5" : "border-no/30 text-no bg-no/5"
                        )}>
                          {t.side.toUpperCase()}
                        </Badge>
                      </span>
                      <span className="text-xs tabular-nums">
                        {t.side === "buy"
                          ? `$${t.amountIn.toFixed(2)} USDC`
                          : `${t.amountIn.toFixed(2)} tokens`}
                      </span>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">
                        {new Date(t.timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
