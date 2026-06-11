"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Droplets, TrendingUp, DollarSign, BarChart2,
  Plus, Minus, Info, AlertTriangle, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@/hooks/use-wallet";
import { useMarkets } from "@/hooks/use-market";
import { useLiquidity } from "@/hooks/use-liquidity";
import { useMarketRealtime } from "@/hooks/use-realtime";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";
import type { Market } from "@stellarpm/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function StatCard({ label, value, sublabel, icon: Icon, color = "text-stellar-light" }: {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
            {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
          </div>
          <div className="rounded-lg bg-stellar/10 p-2">
            <Icon className="h-4 w-4 text-stellar-light" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LPPoolCard({ market, index }: { market: Market; index: number }) {
  const [addAmount, setAddAmount] = useState("");
  const [removeAmount, setRemoveAmount] = useState("");
  const [txError, setTxError] = useState<string | undefined>();
  const { isConnected } = useWallet();

  const {
    usdcBalance,
    lpBalance,
    balanceLoading,
    balanceError,
    lpBalanceLoading,
    addLiquidity,
    removeLiquidity,
    isAdding,
    isRemoving,
    needsUsdc,
    isLive,
  } = useLiquidity(market);

  const parsedAdd = parseFloat(addAmount || "0");
  const parsedRemove = parseFloat(removeAmount || "0");

  const handleAdd = async () => {
    setTxError(undefined);
    try {
      await addLiquidity(parsedAdd);
      setAddAmount("");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  const handleRemove = async () => {
    setTxError(undefined);
    try {
      await removeLiquidity(parsedRemove);
      setRemoveAmount("");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  const insufficientUsdc = !balanceLoading && !balanceError && parsedAdd > 0 && parsedAdd > usdcBalance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
    >
      <Card className="border-border/50 hover:border-stellar/25 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm leading-snug line-clamp-2">{market.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="text-xs capitalize">{market.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatUsd(market.tvl)} TVL
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-yes tabular-nums">
                {((market.tvl * 0.003 * 52) / Math.max(market.tvl, 1) * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">est. APY</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Pool stats */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-muted/20 p-2.5">
              <p className="text-muted-foreground mb-0.5">Volume 24h</p>
              <p className="font-semibold tabular-nums">{formatUsd(market.volume * 0.12)}</p>
            </div>
            <div className="rounded-lg bg-muted/20 p-2.5">
              <p className="text-muted-foreground mb-0.5">Fees 24h</p>
              <p className="font-semibold tabular-nums text-yes">{formatUsd(market.volume * 0.12 * 0.003)}</p>
            </div>
            <div className="rounded-lg bg-muted/20 p-2.5">
              <p className="text-muted-foreground mb-0.5">My LP</p>
              <p className="font-semibold tabular-nums">
                {!isConnected ? "—" : balanceLoading ? "…" : lpBalance > 0 ? lpBalance.toFixed(2) : "0"}
              </p>
            </div>
          </div>

          {/* LP probability display */}
          <div>
            <div
              className="h-1.5 rounded-full probability-bar"
              style={{ "--yes-pct": `${market.yesPrice}%` } as React.CSSProperties}
            />
            <div className="flex justify-between mt-1 text-xs font-medium">
              <span className="text-yes">YES {market.yesPrice.toFixed(0)}%</span>
              <span className="text-no">NO {market.noPrice.toFixed(0)}%</span>
            </div>
          </div>

          {/* Wallet balance row */}
          {isConnected && (
            <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
              <span className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5" /> USDC Balance
              </span>
              <span className="tabular-nums font-medium text-foreground/80">
                {balanceLoading ? "…" : balanceError ? "unavailable" : `${usdcBalance.toFixed(2)} USDC`}
              </span>
            </div>
          )}

          {/* Error message */}
          {txError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{txError}</span>
            </div>
          )}

          {/* Add / Remove tabs */}
          <Tabs defaultValue="add" className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="add" className="flex-1 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add
              </TabsTrigger>
              <TabsTrigger value="remove" className="flex-1 text-xs gap-1">
                <Minus className="h-3 w-3" /> Remove
              </TabsTrigger>
            </TabsList>

            <TabsContent value="add" className="mt-3 space-y-2">
              {!isConnected ? (
                <Button size="sm" className="w-full text-xs h-8" variant="outline" disabled>
                  Connect Wallet
                </Button>
              ) : (
                <>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input
                      type="number"
                      placeholder="0.00 USDC"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      className="pl-7 text-sm h-9"
                      min="0"
                    />
                  </div>
                  {/* Quick amounts */}
                  <div className="flex gap-1.5">
                    {[10, 25, 50, 100].map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-7 border-border/50 hover:border-stellar/40 hover:bg-stellar/5"
                        onClick={() => setAddAmount(v.toString())}
                      >
                        ${v}
                      </Button>
                    ))}
                  </div>
                  {insufficientUsdc ? (
                    <div className="flex items-start gap-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-2 text-xs text-yellow-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>Need {parsedAdd.toFixed(2)} USDC, have {usdcBalance.toFixed(2)}.</span>
                    </div>
                  ) : needsUsdc ? (
                    <a
                      href="https://faucet.circle.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-stellar transition-colors py-1"
                    >
                      Get testnet USDC at faucet.circle.com ↗
                    </a>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-stellar hover:bg-stellar-dark text-white text-xs h-8"
                      onClick={handleAdd}
                      disabled={isAdding || parsedAdd <= 0 || market.status !== "open"}
                    >
                      {isAdding ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Adding…
                        </span>
                      ) : (
                        "Add Liquidity"
                      )}
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="remove" className="mt-3 space-y-2">
              {!isConnected ? (
                <Button size="sm" className="w-full text-xs h-8" variant="outline" disabled>
                  Connect Wallet
                </Button>
              ) : (
                <>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="LP shares to remove"
                      value={removeAmount}
                      onChange={(e) => setRemoveAmount(e.target.value)}
                      className="text-sm h-9"
                      min="0"
                    />
                  </div>
                  {lpBalance > 0 && (
                    <div className="flex gap-1.5">
                      {[25, 50, 75, 100].map((pct) => (
                        <Button
                          key={pct}
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-7 border-border/50"
                          onClick={() => setRemoveAmount(((lpBalance * pct) / 100).toFixed(7))}
                        >
                          {pct}%
                        </Button>
                      ))}
                    </div>
                  )}
                  {lpBalance === 0 && !lpBalanceLoading && (
                    <p className="text-xs text-muted-foreground text-center">No LP position in this pool.</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs h-8 border-no/30 text-no hover:bg-no/10"
                    onClick={handleRemove}
                    disabled={isRemoving || parsedRemove <= 0 || parsedRemove > lpBalance}
                  >
                    {isRemoving ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-full border-2 border-no/30 border-t-no animate-spin" />
                        Removing…
                      </span>
                    ) : (
                      "Remove Liquidity"
                    )}
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>

          {/* Live badge */}
          {isLive && (
            <div className="flex items-center gap-1.5 justify-center">
              <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
              <span className="text-xs text-muted-foreground">Live on-chain</span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LPPoolCardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-5 space-y-3">
        <div className="h-4 bg-muted/30 rounded animate-pulse w-3/4" />
        <div className="h-3 bg-muted/20 rounded animate-pulse w-1/2" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 bg-muted/20 rounded animate-pulse" />
          ))}
        </div>
        <div className="h-8 bg-muted/20 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

export default function LiquidityPage() {
  const { isConnected } = useWallet();
  const { markets, isLoading } = useMarkets({ status: "open" });
  const openMarkets = markets.filter((m) => m.status === "open");
  const totalTVL = openMarkets.reduce((acc, m) => acc + (m.tvl ?? 0), 0);

  // Realtime: keep pool TVL/reserves fresh as trades and LP changes land.
  const queryClient = useQueryClient();
  useMarketRealtime(openMarkets, {
    onEvent: (type) => {
      if (
        type === "buy" || type === "sell" || type === "swap" ||
        type === "add_liquidity" || type === "remove_liquidity"
      ) {
        queryClient.invalidateQueries({ queryKey: ["markets"] });
        queryClient.invalidateQueries({ queryKey: ["balances"] });
        queryClient.invalidateQueries({ queryKey: ["lp-positions"] });
      }
    },
  });

  return (
    <div className="container mx-auto px-4 py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Droplets className="h-7 w-7 text-stellar-light" />
              Liquidity Pools
            </h1>
            <p className="text-muted-foreground mt-1">
              Provide liquidity to markets and earn 0.3% of all trading fees.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
              <span className="text-xs text-muted-foreground">{openMarkets.length} active pools</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Global stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Protocol TVL"
          value={isLoading ? "…" : formatUsd(totalTVL)}
          sublabel="Live on-chain"
          icon={DollarSign}
        />
        <StatCard
          label="Active Pools"
          value={isLoading ? "…" : String(openMarkets.length)}
          sublabel="Open markets"
          icon={Droplets}
          color={isConnected ? "text-yes" : "text-muted-foreground"}
        />
        <StatCard
          label="Swap Fee"
          value="0.30%"
          sublabel="80% to LPs"
          icon={TrendingUp}
        />
        <StatCard
          label="Est. 24h Fees"
          value={isLoading ? "…" : formatUsd(totalTVL * 0.0012)}
          sublabel="Distributed to LPs"
          icon={BarChart2}
        />
      </div>

      {/* LP Risk Warning */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 mb-8 flex items-start gap-3"
      >
        <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-yellow-400 mb-0.5">Liquidity Provider Risk</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            As an LP, you hold both YES and NO tokens and are exposed to impermanent loss if the probability shifts significantly before market resolution. High-probability markets carry more directional risk. Only provide liquidity you can afford to lose.
          </p>
        </div>
      </motion.div>

      {/* All pools */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Available Pools</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                APY is estimated based on the pool&apos;s TVL and the 0.3% swap fee. Actual returns depend on trading volume and pool utilization.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => <LPPoolCardSkeleton key={i} />)}
          </div>
        ) : openMarkets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Droplets className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No open markets found.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openMarkets.map((market, i) => (
              <LPPoolCard key={market.id} market={market} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
