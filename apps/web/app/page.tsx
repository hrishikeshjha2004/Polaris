"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight, TrendingUp, Shield, Zap, BarChart3,
  Activity, Users, DollarSign, Globe, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketTicker } from "@/components/ui/market-ticker";
import { MOCK_MARKETS, PROTOCOL_STATS } from "@/lib/mock-data";
import { formatUsd } from "@stellarpm/shared";
import { useAnimatedNumber, useRealtimeActivity } from "@/hooks/use-realtime";
import { useMarkets } from "@/hooks/use-market";
import { useProtocolStats } from "@/hooks/use-market";
import { cn } from "@/lib/utils";
import type { Market } from "@stellarpm/shared";

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimatedStat({ value, prefix = "", suffix = "", decimals = 0 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const animated = useAnimatedNumber(inView ? value : 0, 1800);
  const display = animated >= 1_000_000
    ? `${(animated / 1_000_000).toFixed(1)}M`
    : animated >= 1_000
    ? `${(animated / 1_000).toFixed(1)}K`
    : animated.toFixed(decimals);
  return <span ref={ref}>{prefix}{display}{suffix}</span>;
}

// ─── Mini sparkline ───────────────────────────────────────────────────────────

function MiniProbabilityChart({ yes }: { yes: number }) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const noise = (Math.sin(i * 1.3) * 8) + (Math.cos(i * 0.7) * 5);
    return Math.max(5, Math.min(95, yes - 10 + noise + (i / 11) * 10));
  });
  const svgPoints = points.map((p, i) => `${(i / (points.length - 1)) * 100},${100 - p}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      <polyline
        points={svgPoints}
        fill="none"
        stroke={yes >= 50 ? "#22c55e" : "#ef4444"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate attributeName="stroke-dashoffset" from="200" to="0" dur="1.2s" fill="freeze" begin="0.3s" />
      </polyline>
    </svg>
  );
}

// ─── Featured market card ─────────────────────────────────────────────────────

function FeaturedMarketCard({ market, index }: { market: Market; index: number }) {
  const yesColor = market.yesPrice >= 50 ? "text-yes" : "text-no";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
    >
      <Link href={`/markets/${market.id}`}>
        <div className="rounded-2xl border border-border/50 bg-card hover:border-stellar/30 hover:bg-card/80 transition-all duration-300 p-5 group h-full cursor-pointer">
          <div className="flex items-start justify-between mb-3">
            <Badge variant="secondary" className="text-xs capitalize">
              {market.category.replace(/_/g, " ")}
            </Badge>
            <span className={cn("text-2xl font-bold tabular-nums", yesColor)}>
              {market.yesPrice.toFixed(0)}¢
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-snug mb-3 group-hover:text-stellar-light transition-colors line-clamp-2 min-h-[2.5rem]">
            {market.title}
          </h3>
          <div className="h-10 mb-3 opacity-60">
            <MiniProbabilityChart yes={market.yesPrice} />
          </div>
          <div
            className="h-1.5 rounded-full mb-2 probability-bar"
            style={{ "--yes-pct": `${market.yesPrice}%` } as React.CSSProperties}
          />
          <div className="flex justify-between text-xs font-medium">
            <span className="text-yes">YES {market.yesPrice.toFixed(0)}%</span>
            <span className="text-no">NO {market.noPrice.toFixed(0)}%</span>
          </div>
          <div className="mt-3 pt-3 border-t border-border/30 flex justify-between text-xs text-muted-foreground">
            <span>Vol: {formatUsd(market.volume)}</span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {formatUsd(market.tvl)} TVL
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ─── Live activity feed (real WebSocket trades) ───────────────────────────────

function LiveActivityFeed() {
  const allTrades = useRealtimeActivity();
  // Show the 5 most recent trades across all markets.
  const displayed = allTrades.slice(0, 5);

  if (displayed.length === 0) {
    // Skeleton rows while no trades have arrived yet.
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {displayed.map((trade, i) => (
        <motion.div
          key={trade.id}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
            i === 0 ? "bg-accent/60 border border-border/50" : "bg-muted/20"
          )}
        >
          <span className={cn(
            "font-bold shrink-0 px-1.5 py-0.5 rounded text-[10px]",
            trade.outcome === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"
          )}>
            {trade.side === "sell" ? "SELL " : ""}{trade.outcome.toUpperCase()}
          </span>
          <span className="flex-1 truncate text-muted-foreground">
            {trade.marketTitle.length > 38 ? trade.marketTitle.slice(0, 38) + "…" : trade.marketTitle}
          </span>
          <span className="font-semibold shrink-0">${trade.amount.toFixed(0)}</span>
          <span className="text-muted-foreground/60 shrink-0">{trade.address}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  // Real markets from API/chain with fallback to mocks.
  const { markets: liveMarkets, isLoading: marketsLoading } = useMarkets({ limit: 6 });
  const { stats: protoStats } = useProtocolStats();

  const featuredMarkets = liveMarkets.length > 0
    ? liveMarkets.slice(0, 6)
    : MOCK_MARKETS.slice(0, 6);

  const tickerMarkets = liveMarkets.length > 0 ? liveMarkets : MOCK_MARKETS;

  // Protocol stats: prefer real API data, fall back to summing real markets, then mocks.
  const liveVol  = liveMarkets.reduce((s, m) => s + m.volume, 0);
  const liveTVL  = liveMarkets.reduce((s, m) => s + m.tvl, 0);
  const totalVolume  = protoStats?.totalVolume  ?? (liveVol  > 0 ? liveVol  : PROTOCOL_STATS.totalVolume);
  const totalTVL     = protoStats?.totalTVL     ?? (liveTVL  > 0 ? liveTVL  : PROTOCOL_STATS.totalTVL);
  const openMarkets  = protoStats?.openMarkets  ?? liveMarkets.filter((m) => m.status === "open").length;
  const totalTraders = protoStats?.totalTraders ?? PROTOCOL_STATS.totalTraders;

  return (
    <div className="flex flex-col overflow-hidden">
      {/* Live Ticker — real market prices */}
      <MarketTicker markets={tickerMarkets} />

      {/* Hero */}
      <section className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 py-20 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle, hsl(263 70% 63%) 0%, transparent 70%)" }} />
          <div className="absolute bottom-0 left-1/4 w-[600px] h-[400px] rounded-full opacity-[0.05]"
            style={{ background: "radial-gradient(circle, hsl(142 71% 45%) 0%, transparent 70%)" }} />
        </div>
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          {["top-1/4 left-1/6 bg-stellar/40", "top-1/3 right-1/5 bg-yes/50", "bottom-1/3 left-1/3 bg-no/40"].map((cls, i) => (
            <motion.div key={i}
              animate={{ y: [0, -16 + i * 4, 0], x: [0, 8 - i * 3, 0] }}
              transition={{ duration: 7 + i, repeat: Infinity, ease: "easeInOut", delay: i }}
              className={`absolute ${cls} w-2 h-2 rounded-full blur-sm`}
            />
          ))}
        </div>

        <div className="container mx-auto text-center max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-stellar/30 bg-stellar/10 px-4 py-1.5 text-sm text-stellar-light mb-8">
              <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
              Live on Stellar Testnet · {openMarkets} active markets
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-[1.05]">
            Predict Markets.
            <br />
            <span className="bg-gradient-to-r from-stellar-light via-purple-400 to-stellar-light bg-clip-text text-transparent">
              Trade On-Chain.
            </span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
            className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Buy and sell YES/NO outcome tokens on crypto price predictions.
            Fully on-chain AMM liquidity, powered by Stellar&apos;s Soroban runtime.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button size="lg" className="bg-stellar hover:bg-stellar-dark text-white font-semibold px-8 py-6 text-base glow-stellar" asChild>
              <Link href="/markets">Explore Markets <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="px-8 py-6 text-base border-border/60 hover:border-stellar/40 hover:bg-stellar/5" asChild>
              <Link href="/markets/create">Create Market</Link>
            </Button>
          </motion.div>

          {/* Real live activity feed */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
            className="max-w-2xl mx-auto">
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-yes pulse-dot" />
                <span className="text-xs text-muted-foreground font-medium">Live Trades</span>
              </div>
              <LiveActivityFeed />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Protocol Stats — real numbers */}
      <section className="border-y border-border/40 bg-card/40 backdrop-blur-sm py-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: DollarSign, label: "Total Volume",  value: totalVolume,  prefix: "$", color: "text-stellar-light" },
              { icon: BarChart3,  label: "Total TVL",     value: totalTVL,     prefix: "$", color: "text-yes" },
              { icon: Globe,      label: "Open Markets",  value: openMarkets,  prefix: "",  color: "text-stellar-light" },
              { icon: Users,      label: "Total Traders", value: totalTraders, prefix: "",  color: "text-yes" },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="text-center">
                <div className="flex justify-center mb-2">
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className={cn("text-3xl font-bold tabular-nums", stat.color)}>
                  <AnimatedStat value={stat.value} prefix={stat.prefix} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Markets — real on-chain markets */}
      <section className="py-24 px-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-10">
            <div>
              <motion.h2 initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
                className="text-3xl font-bold">Featured Markets</motion.h2>
              <p className="text-muted-foreground mt-1">Most traded prediction markets right now</p>
            </div>
            <Button variant="ghost" asChild className="hover:bg-accent/50">
              <Link href="/markets">View All <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
          {marketsLoading && featuredMarkets.length === 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-56 rounded-2xl bg-card/50 border border-border/30 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredMarkets.map((market, i) => (
                <FeaturedMarketCard key={market.id} market={market} index={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 bg-card/30 border-y border-border/30">
        <div className="container mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">Prediction markets made simple. Trade on outcomes, earn from being right.</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: "01", icon: Zap,        title: "Connect Wallet",   description: "Connect your Freighter wallet to Stellar testnet. No registration required.",                                          color: "text-stellar-light", bg: "bg-stellar/10" },
              { step: "02", icon: TrendingUp,  title: "Pick Your Position", description: "Browse open markets and buy YES or NO outcome tokens at market price via the AMM.",                                color: "text-yes",           bg: "bg-yes/10" },
              { step: "03", icon: DollarSign,  title: "Earn at Settlement", description: "If your prediction is correct, redeem winning tokens 1:1 for USDC after market resolution.", color: "text-stellar-light", bg: "bg-stellar/10" },
            ].map((item, i) => (
              <motion.div key={item.step} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} className="relative">
                <div className="rounded-2xl border border-border/40 bg-card p-6 h-full hover:border-stellar/20 transition-colors">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={cn("rounded-xl w-10 h-10 flex items-center justify-center shrink-0", item.bg)}>
                      <item.icon className={cn("h-5 w-5", item.color)} />
                    </div>
                    <span className="text-4xl font-bold text-muted-foreground/20 tabular-nums mt-1">{item.step}</span>
                  </div>
                  <h3 className="font-semibold text-base mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
                {i < 2 && <div className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 text-border/60"><ChevronRight className="h-6 w-6" /></div>}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-4">
        <div className="container mx-auto">
          <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-3xl font-bold text-center mb-16">
            Protocol Features
          </motion.h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                whileHover={{ y: -3 }} className="rounded-2xl border border-border/40 bg-card p-5 hover:border-stellar/20 transition-all duration-300 cursor-default">
                <div className={cn("rounded-xl w-10 h-10 flex items-center justify-center mb-4", f.bg)}>
                  <f.icon className={cn("h-5 w-5", f.color)} />
                </div>
                <h3 className="font-semibold mb-1.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-[0.06]"
          style={{ background: "radial-gradient(ellipse at 50% 100%, hsl(263 70% 63%) 0%, transparent 60%)" }} />
        <div className="container mx-auto text-center max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to trade?</h2>
            <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
              Connect your Freighter wallet and start trading prediction markets in seconds. Fully on-chain. Fully decentralized.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-stellar hover:bg-stellar-dark text-white font-semibold px-10 py-6 text-base glow-stellar" asChild>
                <Link href="/markets">Launch App <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button size="lg" variant="outline" className="px-10 py-6 text-base border-border/60 hover:border-stellar/40" asChild>
                <Link href="/liquidity">Provide Liquidity</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10 px-4">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-stellar p-1"><Zap className="h-4 w-4 text-white" /></div>
              <span className="font-bold text-lg">StellarPM</span>
              <Badge variant="secondary" className="ml-2 text-xs">Testnet</Badge>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              {[["Markets","/markets"],["Portfolio","/portfolio"],["Liquidity","/liquidity"],["Governance","/governance"]].map(([l,h]) => (
                <Link key={h} href={h} className="hover:text-foreground transition-colors">{l}</Link>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Built on Stellar Soroban · {new Date().getFullYear()}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: TrendingUp, title: "AMM-Powered Trading",    description: "Constant product AMM ensures always-available liquidity for YES/NO outcome tokens.",          color: "text-stellar-light", bg: "bg-stellar/10" },
  { icon: Shield,     title: "Decentralized Oracle",   description: "Multi-signer oracle with 3-of-5 threshold protects against manipulation.",                   color: "text-yes",           bg: "bg-yes/10"     },
  { icon: BarChart3,  title: "LP Yield",               description: "Provide liquidity to any market and earn 0.3% of all trading volume as fees.",               color: "text-stellar-light", bg: "bg-stellar/10" },
  { icon: Zap,        title: "On-Chain Settlement",    description: "Winning tokens are redeemable 1:1 for USDC. No trusted intermediary.",                       color: "text-yes",           bg: "bg-yes/10"     },
  { icon: Activity,   title: "Real-Time Prices",       description: "Live probability updates via WebSocket. Watch market sentiment shift in real time.",          color: "text-stellar-light", bg: "bg-stellar/10" },
  { icon: Users,      title: "Permissionless",         description: "Anyone can create a market on any verifiable crypto price event.",                            color: "text-yes",           bg: "bg-yes/10"     },
  { icon: Globe,      title: "Stellar Native",         description: "Built on Stellar for sub-cent fees and 5-second finality. Trade without gas anxiety.",        color: "text-stellar-light", bg: "bg-stellar/10" },
  { icon: DollarSign, title: "USDC Denominated",       description: "All positions denominated in USDC for stable, predictable P&L tracking.",                    color: "text-yes",           bg: "bg-yes/10"     },
];
