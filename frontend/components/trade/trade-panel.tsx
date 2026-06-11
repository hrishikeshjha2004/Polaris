"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Settings, Info, ExternalLink, Wallet,
  TrendingUp, TrendingDown, ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TransactionModal, type TxStatus } from "@/components/ui/transaction-modal";
import { useWallet } from "@/hooks/use-wallet";
import { useTrade, type TradeSide } from "@/hooks/use-trade";
import type { Market } from "@stellarpm/shared";
import { formatUsd } from "@stellarpm/shared";
import { cn } from "@/lib/utils";

interface TradePanelProps {
  market: Market;
  defaultOutcome?: "yes" | "no";
}

export function TradePanel({ market, defaultOutcome = "yes" }: TradePanelProps) {
  const { isConnected } = useWallet();
  const {
    side,
    setSide,
    outcome,
    setOutcome,
    amount,
    setAmount,
    slippage,
    setSlippage,
    quote,
    quoteLoading,
    executeTrade,
    isExecuting,
    usdcBalance,
    tokenBalance,
    balanceLoading,
    balanceError,
    needsUsdc,
    needsTokens,
    poolEmpty,
  } = useTrade(market);

  const [showSlippage, setShowSlippage] = useState(false);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | undefined>();
  const [txError, setTxError] = useState<string | undefined>();

  // Sync defaultOutcome on first mount only.
  useState(() => { if (defaultOutcome) setOutcome(defaultOutcome); });

  const parsedAmount = parseFloat(amount || "0");

  // In BUY mode: "disabled if amount ≤ 0 or insufficient USDC".
  // In SELL mode: "disabled if amount ≤ 0 or insufficient tokens".
  const isDisabled =
    market.status !== "open" ||
    !isConnected ||
    parsedAmount <= 0 ||
    isExecuting ||
    (side === "buy" ? needsUsdc : needsTokens);

  // Display helpers (amountOut and fee are in raw 7-decimal units for both buy and sell).
  // buy:  amountOut = outcome tokens received
  // sell: amountOut = USDC received
  const amountOutHuman = quote?.amountOut != null ? quote.amountOut / 1e7 : undefined;
  const feeHuman = quote?.fee != null ? quote.fee / 1e7 : undefined;

  // Aliases for readability
  const tokensOut = side === "buy" ? amountOutHuman : undefined;
  const usdcOut   = side === "sell" ? amountOutHuman : undefined;

  // Post-trade payout = winning tokens redeem 1:1 for USDC at settlement.
  const payout = tokensOut;

  const handleTrade = async () => {
    if (isDisabled) return;
    setTxError(undefined);
    setTxStatus("pending");
    try {
      const hash = await executeTrade();
      setTxHash(hash);
      setTxStatus("success");
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Something went wrong.");
      setTxStatus("error");
    }
  };

  const outcomeColor = outcome === "yes" ? "text-yes" : "text-no";
  const outcomeActiveClass =
    outcome === "yes"
      ? "data-[state=active]:bg-yes/20 data-[state=active]:text-yes data-[state=active]:border data-[state=active]:border-yes/30"
      : "data-[state=active]:bg-no/20 data-[state=active]:text-no data-[state=active]:border data-[state=active]:border-no/30";

  return (
    <>
      <TransactionModal
        open={txStatus !== "idle"}
        status={txStatus}
        txHash={txHash}
        errorMsg={txError}
        outcome={outcome}
        amount={amount}
        tokensOut={tokensOut}
        onClose={() => {
          setTxStatus("idle");
          setTxHash(undefined);
          setTxError(undefined);
          if (txStatus === "success") setAmount("");
        }}
      />

      <Card className="sticky top-20 border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Trade</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setShowSlippage(!showSlippage)}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>

          <AnimatePresence>
            {showSlippage && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 pt-2">
                  <Label className="text-xs text-muted-foreground shrink-0">Slippage:</Label>
                  {[0.5, 1, 2, 3].map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={slippage === v ? "default" : "outline"}
                      className={cn("h-6 px-2 text-xs", slippage === v ? "bg-stellar text-white" : "")}
                      onClick={() => setSlippage(v)}
                    >
                      {v}%
                    </Button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardHeader>

        <CardContent className="space-y-3">

          {/* ── Buy / Sell toggle ─────────────────────────────────────────── */}
          <div className="flex rounded-lg border border-border/50 overflow-hidden">
            {(["buy", "sell"] as TradeSide[]).map((s) => (
              <button
                key={s}
                onClick={() => { setSide(s); setAmount(""); }}
                className={cn(
                  "flex-1 py-2 text-xs font-semibold capitalize transition-colors",
                  side === s
                    ? s === "buy"
                      ? "bg-yes text-white"
                      : "bg-no text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {s === "buy" ? <span className="flex items-center justify-center gap-1"><TrendingUp className="h-3 w-3" />Buy</span>
                            : <span className="flex items-center justify-center gap-1"><TrendingDown className="h-3 w-3" />Sell</span>}
              </button>
            ))}
          </div>

          {/* ── YES / NO outcome tabs ─────────────────────────────────────── */}
          <Tabs value={outcome} onValueChange={(v) => { setOutcome(v as "yes" | "no"); setAmount(""); }}>
            <TabsList className="w-full p-1 h-auto">
              <TabsTrigger
                value="yes"
                className="flex-1 py-2.5 font-semibold data-[state=active]:bg-yes/20 data-[state=active]:text-yes data-[state=active]:border data-[state=active]:border-yes/30"
              >
                YES · {market.yesPrice.toFixed(0)}¢
              </TabsTrigger>
              <TabsTrigger
                value="no"
                className="flex-1 py-2.5 font-semibold data-[state=active]:bg-no/20 data-[state=active]:text-no data-[state=active]:border data-[state=active]:border-no/30"
              >
                NO · {market.noPrice.toFixed(0)}¢
              </TabsTrigger>
            </TabsList>

            {(["yes", "no"] as const).map((o) => (
              <TabsContent key={o} value={o} className="mt-3 space-y-3">

                {/* Amount input */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {side === "buy" ? "Amount (USDC)" : `Amount (${o.toUpperCase()} tokens)`}
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      {side === "buy" ? "$" : "#"}
                    </span>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-7 text-right text-base font-semibold bg-card border-border/60 focus:border-stellar/50"
                      min="0"
                      step="1"
                    />
                  </div>
                </div>

                {/* Quick-fill buttons */}
                <div className="flex gap-2">
                  {side === "buy"
                    ? [10, 25, 50, 100].map((v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-7 border-border/50 hover:border-stellar/40 hover:bg-stellar/5"
                          onClick={() => setAmount(v.toString())}
                        >
                          ${v}
                        </Button>
                      ))
                    : tokenBalance > 0
                    ? [25, 50, 75, 100].map((pct) => (
                        <Button
                          key={pct}
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-7 border-border/50 hover:border-stellar/40 hover:bg-stellar/5"
                          onClick={() => setAmount((tokenBalance * pct / 100).toFixed(2))}
                        >
                          {pct}%
                        </Button>
                      ))
                    : null}
                </div>

              </TabsContent>
            ))}
          </Tabs>

          {/* ── Token balance row ─────────────────────────────────────────── */}
          {isConnected && (
            <div className="space-y-1.5">
              {/* USDC balance */}
              <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> USDC
                </span>
                <span className="tabular-nums font-medium text-foreground/80">
                  {balanceLoading ? "…" : balanceError ? "—" : `${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </span>
              </div>
              {/* YES / NO token balance — always visible so users see what they own */}
              <div className={cn("flex items-center justify-between text-xs px-1", tokenBalance > 0 ? outcomeColor : "text-muted-foreground")}>
                <span className="flex items-center gap-1.5">
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {outcome.toUpperCase()} tokens
                </span>
                <span className="tabular-nums font-medium">
                  {balanceLoading ? "…" : tokenBalance > 0 ? tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0"}
                </span>
              </div>
            </div>
          )}

          {/* ── Quote / estimate panel ────────────────────────────────────── */}
          <AnimatePresence>
            {parsedAmount > 0 && !!quote && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl bg-muted/20 border border-border/30 p-3 space-y-2 text-sm">
                  {side === "buy" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tokens out</span>
                        <span className={cn("font-semibold", outcomeColor)}>
                          {(quote.amountOut / 1e7).toFixed(4)} {outcome.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg price</span>
                        <span className="tabular-nums">
                          {((parsedAmount / (quote.amountOut / 1e7)) * 100).toFixed(2)}¢
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price impact</span>
                        <span className={cn(
                          "tabular-nums",
                          quote.priceImpactBps > 300 ? "text-destructive font-semibold"
                            : quote.priceImpactBps > 100 ? "text-yellow-400"
                            : "text-muted-foreground"
                        )}>
                          {(quote.priceImpactBps / 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee (0.3%)</span>
                        <span className="text-muted-foreground tabular-nums">
                          {feeHuman != null ? formatUsd(feeHuman) : "—"}
                        </span>
                      </div>
                      <Separator className="opacity-30" />
                      <div className="flex justify-between font-semibold">
                        <span>Min received</span>
                        <span className="tabular-nums">
                          {((quote.amountOut * (1 - slippage / 100)) / 1e7).toFixed(4)} {outcome.toUpperCase()}
                        </span>
                      </div>
                      {payout != null && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Potential payout</span>
                          <span className="text-yes tabular-nums font-medium">{formatUsd(payout)} USDC</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">You sell</span>
                        <span className={cn("font-semibold", outcomeColor)}>
                          {parsedAmount.toFixed(4)} {outcome.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">USDC received</span>
                        <span className="tabular-nums font-semibold">
                          {usdcOut != null ? formatUsd(usdcOut) : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg price per token</span>
                        <span className="tabular-nums">
                          {usdcOut != null && parsedAmount > 0
                            ? ((usdcOut / parsedAmount) * 100).toFixed(2)
                            : "—"}¢
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Price impact</span>
                        <span className={cn(
                          "tabular-nums",
                          quote.priceImpactBps > 300 ? "text-destructive font-semibold"
                            : quote.priceImpactBps > 100 ? "text-yellow-400"
                            : "text-muted-foreground"
                        )}>
                          {(quote.priceImpactBps / 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fee (0.3%)</span>
                        <span className="text-muted-foreground tabular-nums">
                          {feeHuman != null ? formatUsd(feeHuman) : "—"}
                        </span>
                      </div>
                      <Separator className="opacity-30" />
                      <div className="flex justify-between font-semibold">
                        <span>Min received</span>
                        <span className="tabular-nums">
                          {usdcOut != null
                            ? formatUsd(usdcOut * (1 - slippage / 100))
                            : "—"} USDC
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* High impact warning */}
          {quote && quote.priceImpactBps > 300 && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>High price impact ({(quote.priceImpactBps / 100).toFixed(1)}%). Consider a smaller trade.</span>
            </div>
          )}

          {/* ── Action button ─────────────────────────────────────────────── */}
          {!isConnected ? (
            <Button className="w-full" variant="outline" disabled>
              Connect Wallet to Trade
            </Button>
          ) : market.status !== "open" ? (
            <Button className="w-full" variant="outline" disabled>
              Market {market.status}
            </Button>
          ) : poolEmpty ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0 mt-0.5 text-stellar-light" />
                <span>This pool has no liquidity yet. Add USDC liquidity first so the AMM can price trades.</span>
              </div>
              <a
                href="/liquidity"
                className="flex items-center justify-center w-full rounded-md border border-stellar/40 bg-stellar/10 text-stellar-light text-sm font-medium py-2.5 hover:bg-stellar/20 transition-colors"
              >
                Go to Liquidity →
              </a>
            </div>
          ) : needsUsdc ? (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs text-yellow-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Need {parsedAmount.toLocaleString()} USDC — you have{" "}
                {usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC.
              </span>
            </div>
          ) : needsTokens ? (
            <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs text-yellow-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Need {parsedAmount.toLocaleString()} {outcome.toUpperCase()} — you have{" "}
                {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}.
              </span>
            </div>
          ) : (
            <Button
              className={cn(
                "w-full font-semibold py-5 text-base transition-all",
                side === "buy"
                  ? outcome === "yes" ? "bg-yes hover:bg-yes/85 text-white glow-yes" : "bg-no hover:bg-no/85 text-white glow-no"
                  : "bg-muted hover:bg-muted/80 text-foreground border border-border/60"
              )}
              onClick={handleTrade}
              disabled={isDisabled}
            >
              {isExecuting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Confirming…
                </span>
              ) : side === "buy" ? (
                `Buy ${outcome.toUpperCase()}${parsedAmount > 0 ? ` · $${parsedAmount} USDC` : ""}`
              ) : (
                `Sell ${outcome.toUpperCase()}${parsedAmount > 0 ? ` · ${parsedAmount} tokens` : ""}`
              )}
            </Button>
          )}

          {/* Faucet link when USDC is 0 */}
          {isConnected && !balanceLoading && !balanceError && usdcBalance === 0 && (
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full text-xs text-muted-foreground hover:text-stellar transition-colors py-1"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Get testnet USDC at faucet.circle.com
            </a>
          )}

          {/* Footer tooltip */}
          <p className="text-xs text-muted-foreground/70 text-center leading-relaxed">
            Winning tokens redeem 1:1 for USDC at settlement.{" "}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="underline decoration-dotted hover:text-muted-foreground transition-colors">
                  Learn more
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  After market expiry, the oracle resolves the outcome. Holders of the winning
                  outcome token can redeem 1 token for 1 USDC (minus 1% protocol fee).
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
        </CardContent>
      </Card>
    </>
  );
}
