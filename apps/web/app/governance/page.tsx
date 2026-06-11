"use client";

import { motion } from "framer-motion";
import {
  Vote, Shield, Settings, TrendingUp,
  Users, DollarSign, ArrowRight, Lock,
} from "lucide-react";
import { useProtocolStats } from "@/hooks/use-market";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PROTOCOL_PARAMS = [
  { label: "Trading Fee", value: "0.30%", description: "Distributed to LPs" },
  { label: "Protocol Fee", value: "0.10%", description: "Goes to treasury" },
  { label: "Min Liquidity", value: "50 USDC", description: "To create a market" },
  { label: "Oracle Threshold", value: "3 of 5", description: "Required signers" },
  { label: "Dispute Window", value: "24 hours", description: "Post oracle submission" },
  { label: "Settlement Delay", value: "1 hour", description: "Before payout opens" },
];

const ROADMAP = [
  {
    phase: "Phase 1",
    title: "Protocol Launch",
    status: "in-progress",
    items: ["Core AMM contracts", "Oracle multi-sig", "Freighter integration", "Markets & portfolio UI"],
  },
  {
    phase: "Phase 2",
    title: "Token Launch",
    status: "planned",
    items: ["SPM governance token", "Token distribution", "Staking mechanisms", "Fee capture"],
  },
  {
    phase: "Phase 3",
    title: "DAO Launch",
    status: "planned",
    items: ["On-chain proposal system", "Token-weighted voting", "Treasury management", "Parameter governance"],
  },
  {
    phase: "Phase 4",
    title: "Expansion",
    status: "planned",
    items: ["Cross-chain bridges", "Additional oracles", "Automated markets", "Mobile app"],
  },
];

export default function GovernancePage() {
  const { stats } = useProtocolStats();

  const TREASURY_STATS = [
    { label: "Total Volume",  value: stats ? `$${(stats.totalVolume / 1000).toFixed(1)}K`  : "…", icon: DollarSign },
    { label: "Total TVL",     value: stats ? `$${(stats.totalTVL    / 1000).toFixed(1)}K`  : "…", icon: TrendingUp },
    { label: "Active Markets",value: stats ? String(stats.openMarkets)                      : "…", icon: Settings   },
    { label: "Total Traders", value: stats ? stats.totalTraders.toLocaleString()            : "…", icon: Users      },
  ];

  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-3xl font-bold">Governance</h1>
          <Badge variant="outline" className="border-yellow-500/40 text-yellow-400 text-xs">Coming Soon</Badge>
        </div>
        <p className="text-muted-foreground max-w-xl">
          Polaris will transition to full community governance via the SPM token. Protocol parameters and treasury decisions will be made by token holders.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {TREASURY_STATS.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
            <Card className="border-border/50">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                    <p className="text-xl font-bold tabular-nums">{stat.value}</p>
                  </div>
                  <div className="rounded-lg bg-stellar/10 p-1.5">
                    <stat.icon className="h-4 w-4 text-stellar-light" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/50 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4 text-stellar-light" />
                Current Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {PROTOCOL_PARAMS.map((p, i) => (
                <div key={p.label}>
                  <div className="flex items-start justify-between py-0.5">
                    <div>
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-stellar-light shrink-0 ml-4">{p.value}</span>
                  </div>
                  {i < PROTOCOL_PARAMS.length - 1 && <Separator className="mt-3 opacity-30" />}
                </div>
              ))}
              <div className="mt-4 rounded-lg border border-border/40 bg-muted/20 p-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                Currently managed by founding multi-sig. Governance token enables community voting.
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          <Card className="border-border/50 h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-stellar-light" />
                Governance Roadmap
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ROADMAP.map((phase, i) => (
                <div key={phase.phase} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                      phase.status === "in-progress" ? "bg-stellar text-white ring-2 ring-stellar/30" : "bg-muted text-muted-foreground"
                    )}>
                      {i + 1}
                    </div>
                    {i < ROADMAP.length - 1 && <div className="w-px flex-1 bg-border/30 mt-1.5" />}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground">{phase.phase}</span>
                      <span className="font-semibold text-sm">{phase.title}</span>
                      {phase.status === "in-progress" && (
                        <Badge className="text-[10px] bg-stellar/20 text-stellar-light border-stellar/30 px-1.5 py-0">Active</Badge>
                      )}
                    </div>
                    <ul className="space-y-0.5">
                      {phase.items.map((item) => (
                        <li key={item} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-6">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Vote className="h-4 w-4 text-stellar-light" />
              Proposals
              <Badge variant="secondary" className="text-xs ml-1">Coming in Phase 3</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-border/50 p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-stellar/10 flex items-center justify-center mx-auto mb-4">
                <Vote className="h-6 w-6 text-stellar-light opacity-60" />
              </div>
              <p className="font-medium mb-1">On-chain proposals coming soon</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Once the SPM governance token launches, holders will submit and vote on protocol upgrades.
              </p>
              <Button variant="outline" size="sm" className="mt-5 border-stellar/30 text-stellar-light hover:bg-stellar/10" asChild>
                <Link href="/markets">
                  Explore Markets <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
