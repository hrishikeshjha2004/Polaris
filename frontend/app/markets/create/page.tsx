"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Info, Zap, AlertTriangle, Calendar } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWallet } from "@/hooks/use-wallet";
import { ASSETS } from "@stellarpm/shared";
import { buildCreateMarketTx, submit, contractsDeployed } from "@/lib/contracts/client";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";

const CATEGORIES = ["crypto", "macro", "politics", "sports", "tech", "other"];
const ORACLE_SOURCES = [
  "Binance BTC/USDT",
  "Binance ETH/USDT",
  "Binance SOL/USDT",
  "Binance XLM/USDT",
  "Binance XRP/USDT",
  "CoinGecko BTC/USD",
  "CoinGecko ETH/USD",
  "CoinMarketCap",
  "Custom",
];

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {hint && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

export default function CreateMarketPage() {
  const { isConnected, wallet, signTransaction } = useWallet();
  const { addNotification } = useAppStore();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("crypto");
  const [oracleSource, setOracleSource] = useState("Binance BTC/USDT");
  const [threshold, setThreshold] = useState("");
  const [operator, setOperator] = useState<"above" | "below">("above");
  const [expiryDate, setExpiryDate] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("100");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deployError, setDeployError] = useState<string | undefined>();

  const isValid = title.length > 10 && description.length > 20 && expiryDate && threshold && parseFloat(initialLiquidity) >= 50;

  const handleSubmit = async () => {
    if (!isValid || !isConnected || !wallet) return;
    setIsSubmitting(true);
    setDeployError(undefined);

    if (!contractsDeployed) {
      // Mock path for offline dev — just navigate away.
      await new Promise((r) => setTimeout(r, 1500));
      setIsSubmitting(false);
      router.push("/markets");
      return;
    }

    try {
      const expiryTs = Math.floor(new Date(expiryDate).getTime() / 1000);
      const thresholdRaw = BigInt(Math.round(parseFloat(threshold) * 1e7));
      const liquidityRaw = BigInt(Math.round(parseFloat(initialLiquidity) * 1e7));
      const thresholdOp = operator === "above" ? 1 : 0; // 1=LT(NO), 0=GT(YES)

      const xdr = await buildCreateMarketTx(wallet.address, {
        title,
        description,
        category,
        expiryTimestamp: expiryTs,
        oracleSource,
        thresholdValue: thresholdRaw,
        thresholdOperator: thresholdOp,
        initialLiquidity: liquidityRaw,
      });

      const signed = await signTransaction(xdr);
      const result = await submit(signed);

      if (result.status === "failed") throw new Error(result.errorMessage ?? "Deploy failed");
      if (result.status === "timeout") throw new Error("Transaction timed out");

      addNotification({
        type: "success",
        title: "Market Created",
        message: `"${title.slice(0, 40)}" deployed successfully`,
        txHash: result.hash,
      });
      router.push("/markets");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Deployment failed";
      setDeployError(msg);
      addNotification({ type: "error", title: "Deploy Failed", message: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Button variant="ghost" size="sm" className="mb-5 -ml-2 text-muted-foreground" asChild>
        <Link href="/markets">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Markets
        </Link>
      </Button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Create Prediction Market</h1>
          <p className="text-muted-foreground text-sm">
            Deploy a new market on Stellar. You must provide initial liquidity to activate trading.
          </p>
        </div>

        <div className="space-y-5">
          {/* Market question */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Market Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel
                  label="Market Title"
                  hint="Write a clear, unambiguous YES/NO question. The outcome must be verifiable."
                />
                <Input
                  placeholder="Will BTC exceed $100,000 before July 2026?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-card border-border/60"
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {title.length}/120
                </p>
              </div>

              <div className="space-y-1.5">
                <FieldLabel
                  label="Description / Resolution Criteria"
                  hint="Describe exactly how this market will be resolved. Be precise about the data source, timing, and conditions."
                />
                <textarea
                  placeholder="This market resolves YES if Bitcoin (BTC) closes above $100,000 on any major exchange before or on July 1, 2026. Resolution source: Binance BTC/USDT closing price."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={500}
                  className="w-full rounded-md border border-border/60 bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-stellar/50 text-foreground placeholder:text-muted-foreground"
                />
                <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <FieldLabel label="Category" />
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium capitalize transition-all",
                        category === cat
                          ? "bg-stellar text-white"
                          : "bg-accent/50 text-muted-foreground hover:bg-accent border border-border/50"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Oracle & Resolution */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Oracle & Resolution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel
                  label="Oracle Source"
                  hint="The data source used to verify the outcome. Must be a supported oracle feed."
                />
                <select
                  value={oracleSource}
                  onChange={(e) => setOracleSource(e.target.value)}
                  className="w-full rounded-md border border-border/60 bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stellar/50 text-foreground"
                >
                  {ORACLE_SOURCES.map((src) => (
                    <option key={src} value={src} className="bg-card">
                      {src}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <FieldLabel
                    label="Threshold Value"
                    hint="The numeric value to compare against at market expiry."
                  />
                  <Input
                    type="number"
                    placeholder="100000"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="bg-card border-border/60"
                    min="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel label="Condition" />
                  <div className="flex rounded-md border border-border/60 overflow-hidden h-9">
                    {(["above", "below"] as const).map((op) => (
                      <button
                        key={op}
                        onClick={() => setOperator(op)}
                        className={cn(
                          "flex-1 text-xs font-medium capitalize transition-colors",
                          operator === op
                            ? "bg-stellar text-white"
                            : "bg-card text-muted-foreground hover:bg-accent"
                        )}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <FieldLabel label="Expiry Date" hint="When this market expires and can be resolved." />
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    min={new Date(Date.now() + 86400000 * 3).toISOString().split("T")[0]}
                    className="pl-9 bg-card border-border/60"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Initial Liquidity */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Initial Liquidity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <FieldLabel
                  label="USDC Amount"
                  hint="Minimum 50 USDC. This seeds the AMM pool and enables trading to start."
                />
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input
                    type="number"
                    placeholder="100"
                    value={initialLiquidity}
                    onChange={(e) => setInitialLiquidity(e.target.value)}
                    className="pl-7 bg-card border-border/60"
                    min="50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Min 50 USDC · You receive LP shares proportional to your deposit</p>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          {isValid && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="rounded-xl border border-stellar/20 bg-stellar/5 p-4 space-y-2 text-sm"
            >
              <p className="font-medium text-stellar-light mb-3">Deployment Summary</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Market contracts deployed</span>
                <span>Market + AMM + 2 tokens + LP</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Initial liquidity</span>
                <span>${initialLiquidity} USDC</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Creator fee share</span>
                <span className="text-yes">0.05% of all trades</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Est. Stellar fees</span>
                <span>~0.01 XLM</span>
              </div>
            </motion.div>
          )}

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3 text-xs text-yellow-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Markets must resolve based on publicly verifiable data. Manipulated or unresolvable markets may be invalidated by the oracle committee.
            </p>
          </div>

          {/* Deploy error */}
          {deployError && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{deployError}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            className="w-full py-5 text-base font-semibold bg-stellar hover:bg-stellar-dark text-white glow-stellar disabled:opacity-40"
            disabled={!isValid || !isConnected || isSubmitting}
            onClick={handleSubmit}
          >
            {!isConnected ? (
              "Connect Wallet to Create"
            ) : isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Deploying contracts...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Deploy Market
              </span>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
