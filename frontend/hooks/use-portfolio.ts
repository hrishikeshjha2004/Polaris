"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchAllMarkets,
  getOutcomeTokenBalance,
  contractsDeployed,
} from "@/lib/contracts/client";
import type { Market, Position } from "@stellarpm/shared";

// ─── Real on-chain positions ──────────────────────────────────────────────────
// Reads the connected wallet's actual YES/NO token balances directly from chain
// for every market — proving the user truly owns outcome tokens after a buy. The
// chain is the source of truth for the balance; cost-basis (avgPrice) is filled
// from the indexer when available, otherwise left at 0 (PnL unknown).

async function buildChainPositions(
  address: string,
  costBasis: Map<string, number>
): Promise<Position[]> {
  const markets = await fetchAllMarkets(0, 100);

  const perMarket = await Promise.all(
    markets.map(async (m) => {
      const [yesHuman, noHuman] = await Promise.all([
        m.yesToken ? getOutcomeTokenBalance(m.yesToken, address).catch(() => 0) : 0,
        m.noToken ? getOutcomeTokenBalance(m.noToken, address).catch(() => 0) : 0,
      ]);
      const out: Position[] = [];
      if (yesHuman > 0) out.push(makePosition(m, "yes", yesHuman, costBasis));
      if (noHuman > 0) out.push(makePosition(m, "no", noHuman, costBasis));
      return out;
    })
  );

  return perMarket.flat();
}

function makePosition(
  market: Market,
  outcome: "yes" | "no",
  humanBalance: number,
  costBasis: Map<string, number>
): Position {
  // currentPrice as a 0-1 fraction (portfolio UI multiplies balance × price).
  const currentPrice = (outcome === "yes" ? market.yesPrice : market.noPrice) / 100;
  const avg = costBasis.get(`${market.id}_${outcome}`) ?? 0;
  const tokenBalance = Math.round(humanBalance * 1e7); // raw (7-dp), as UI expects
  const unrealizedPnl = avg > 0 ? +((currentPrice - avg) * humanBalance).toFixed(2) : 0;
  const claimable =
    market.status === "resolved" && market.resolution === outcome ? humanBalance : 0;

  return {
    id: `${market.id}_${outcome}`,
    marketId: market.id,
    market,
    userAddress: "",
    outcome,
    tokenBalance,
    averagePrice: avg,
    currentPrice,
    unrealizedPnl,
    claimable,
  };
}

export function useChainPositions(address?: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ["chain-positions", address],
    queryFn: () => buildChainPositions(address!, new Map()),
    enabled: contractsDeployed && !!address,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  return { positions: data ?? [], isLoading, isLive: contractsDeployed };
}
