import { useState, useCallback, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./use-wallet";
import { useAppStore } from "@/store";
import { pushActivity, pushLivePrice } from "./use-realtime";
import {
  getBuyQuote,
  getSellQuote,
  buildBuyTx,
  buildSellTx,
  getUsdcBalance,
  getOutcomeTokenBalance,
  submit,
  contractsDeployed,
  networkConfig,
} from "@/lib/contracts/client";
import type { Market, Outcome, QuoteResult } from "@stellarpm/shared";

export type TradeSide = "buy" | "sell";

// ─── Mock fallback quote (used only when contracts aren't deployed) ───────────
// NOTE: amountOut and fee are in raw 7-decimal units (matching on-chain scale)
// so the display code's `/1e7` is always correct regardless of path.

function mockQuote(market: Market, outcome: Outcome, amountIn: number): QuoteResult {
  const price = outcome === "yes" ? market.yesPrice / 100 : market.noPrice / 100;
  const amountOut = (amountIn / Math.max(price, 0.01)) * 0.997; // raw
  const priceImpactBps = Math.min(
    Math.floor((amountIn / ((market.tvl || 10000) * 1e7)) * 10000),
    5000
  );
  return {
    amountOut,
    fee: amountIn * 0.003, // raw
    priceImpactBps,
    yesPriceBps: market.yesPrice * 100,
    noPriceBps: market.noPrice * 100,
  };
}

// Mock sell quote: uses same quadratic approximation with inferred reserves.
function mockSellQuote(market: Market, outcome: Outcome, tokensInRaw: number): QuoteResult {
  // Infer pool reserves from price and TVL (1 USDC collateral = 1 YES + 1 NO minted).
  // tvl ≈ usdcReserves; reserves proportional to price: yes ∝ noPrice, no ∝ yesPrice.
  const tvlRaw = (market.tvl || 10_000) * 1e7;
  const yesPct = market.yesPrice / 100;
  const noPct  = market.noPrice  / 100;
  const yesR = Math.round(tvlRaw * noPct);   // YES reserve ∝ NO price
  const noR  = Math.round(tvlRaw * yesPct);  // NO reserve ∝ YES price
  const feeBps = 30; // 0.3%

  const target = outcome === "yes" ? yesR : noR;
  const other  = outcome === "yes" ? noR  : yesR;
  const q = tokensInRaw;
  const b = target + q + other;
  const c = q * other;
  const disc = b * b - 4 * c;
  if (disc < 0) {
    return { amountOut: 0, fee: 0, priceImpactBps: 0, yesPriceBps: market.yesPrice * 100, noPriceBps: market.noPrice * 100 };
  }
  const d = (b - Math.sqrt(disc)) / 2;
  const fee = Math.floor(d * feeBps / 10_000);
  const usdcOut = d - fee;

  const priceImpactBps = Math.min(
    Math.floor((tokensInRaw / (tvlRaw || 1)) * 10_000),
    5000
  );
  return {
    amountOut: usdcOut,
    fee,
    priceImpactBps,
    yesPriceBps: market.yesPrice * 100,
    noPriceBps: market.noPrice * 100,
  };
}

// Turn a raw Soroban host error into something a human can act on.
function humanizeTradeError(err: unknown, side: TradeSide): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Contract, #14|InsufficientLiquidity/i.test(msg))
    return "This pool has no liquidity yet. Go to the Liquidity page to add some before trading.";
  if (/Insufficient USDC balance/i.test(msg)) return msg;
  if (/Insufficient.*token|#10|#11/i.test(msg) && side === "sell")
    return "You don't have enough outcome tokens to sell that amount.";
  if (/User declined|rejected|denied|cancel/i.test(msg))
    return "Transaction cancelled in wallet.";
  if (/SlippageExceeded|#15/i.test(msg))
    return "Price moved too much — increase slippage tolerance and try again.";
  if (/Expired|#16/i.test(msg)) return "Transaction expired — please try again.";
  if (/timed out/i.test(msg))
    return "The network took too long to confirm. Check the explorer before retrying.";
  if (/bad union switch|not set$/i.test(msg))
    return "Transaction completed — the network confirmed it but result decoding failed. Check your balance.";
  if (/Simulation failed/i.test(msg))
    return `Transaction simulation failed: ${msg.replace(/^Simulation failed:\s*/i, "").slice(0, 200)}`;
  return msg;
}

export function useTrade(market: Market) {
  const { wallet, signTransaction } = useWallet();
  const { addNotification } = useAppStore();
  const queryClient = useQueryClient();

  const [side, setSide] = useState<TradeSide>("buy");
  const [outcome, setOutcome] = useState<Outcome>("yes");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);

  const parsedAmount = parseFloat(amount || "0");
  const buyYes = outcome === "yes";

  // ─── Wallet balances ─────────────────────────────────────────────────────────

  const { data: usdcBalance = 0, isLoading: balanceLoading, isError: balanceError } = useQuery({
    queryKey: ["balances", "usdc", wallet?.address],
    queryFn: () => (wallet ? getUsdcBalance(wallet.address) : 0),
    enabled: contractsDeployed && !!wallet?.address,
    staleTime: 5_000,
    refetchInterval: 15_000,
    retry: 2,
  });

  const tokenId = buyYes ? market.yesToken : market.noToken;
  const { data: tokenBalance = 0 } = useQuery({
    queryKey: ["balances", "token", tokenId, wallet?.address],
    queryFn: () =>
      wallet && tokenId ? getOutcomeTokenBalance(tokenId, wallet.address) : 0,
    enabled: contractsDeployed && !!wallet?.address && !!tokenId,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  // ─── On-chain quotes ──────────────────────────────────────────────────────────
  // IMPORTANT: amountOut and fee are kept in raw 7-decimal units (NOT converted
  // via fromContractAmount). The display code always divides by 1e7 — this keeps
  // mock and real quotes on the same scale so there's no double-conversion.

  const { data: onChainBuyQuote, isLoading: buyQuoteLoading } = useQuery({
    queryKey: ["quote", "buy", market.ammContract, outcome, parsedAmount],
    queryFn: async () => {
      if (!contractsDeployed || !market.ammContract || !parsedAmount) return null;
      const raw = await getBuyQuote(market.ammContract, buyYes, parsedAmount);
      if (!raw) return null;
      return {
        amountOut: Number(raw.amountOut),
        fee: Number(raw.fee),
        priceImpactBps: raw.priceImpactBps,
        yesPriceBps: Number(raw.yesPriceBps),
        noPriceBps: Number(raw.noPriceBps),
      } satisfies QuoteResult;
    },
    enabled: contractsDeployed && !!market.ammContract && parsedAmount > 0 && side === "buy",
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  // Sell quote uses the AMM quadratic formula client-side (no `get_sell_quote`
  // contract view function exists; we fetch pool state and compute locally).
  const { data: onChainSellQuote, isLoading: sellQuoteLoading } = useQuery({
    queryKey: ["quote", "sell", market.ammContract, outcome, parsedAmount],
    queryFn: async () => {
      if (!contractsDeployed || !market.ammContract || !parsedAmount) return null;
      const raw = await getSellQuote(market.ammContract, buyYes, parsedAmount);
      if (!raw) return null;
      return {
        amountOut: Number(raw.amountOut),
        fee: Number(raw.fee),
        priceImpactBps: raw.priceImpactBps,
        yesPriceBps: Number(raw.yesPriceBps),
        noPriceBps: Number(raw.noPriceBps),
      } satisfies QuoteResult;
    },
    enabled: contractsDeployed && !!market.ammContract && parsedAmount > 0 && side === "sell",
    staleTime: 5_000,
    refetchInterval: 10_000,
  });

  const mockQ = useMemo<QuoteResult | undefined>(() => {
    if (!parsedAmount || parsedAmount <= 0) return undefined;
    return side === "buy"
      ? mockQuote(market, outcome, parsedAmount * 1e7)
      : mockSellQuote(market, outcome, parsedAmount * 1e7);
  }, [market.id, market.yesPrice, market.noPrice, market.tvl, outcome, parsedAmount, side]);

  const quoteLoading = side === "buy" ? buyQuoteLoading : sellQuoteLoading;
  const onChainQuote = side === "buy" ? onChainBuyQuote : onChainSellQuote;
  const quote = contractsDeployed ? onChainQuote ?? undefined : mockQ;

  const poolEmpty =
    contractsDeployed &&
    !!market.ammContract &&
    side === "buy" &&
    parsedAmount > 0 &&
    !quoteLoading &&
    onChainQuote === null;

  const needsUsdc =
    contractsDeployed &&
    !!wallet &&
    side === "buy" &&
    parsedAmount > 0 &&
    !balanceLoading &&
    !balanceError &&
    parsedAmount > usdcBalance;

  const needsTokens =
    contractsDeployed &&
    !!wallet &&
    side === "sell" &&
    parsedAmount > 0 &&
    parsedAmount > tokenBalance;

  // ─── Stable refs for values needed in onSuccess ───────────────────────────────
  // useMutation's onSuccess closure is captured once at mount, so any reactive
  // value (quote, outcome, side, wallet) must be passed through the mutation
  // result rather than read from the outer closure.

  const tradeMutation = useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Wallet not connected");
      if (!parsedAmount || parsedAmount <= 0) throw new Error("Enter an amount");

      // Snapshot everything needed for optimistic updates BEFORE any async work.
      const snap = { quote, outcome, side, address: wallet.address };

      if (!contractsDeployed) {
        await new Promise((r) => setTimeout(r, 1200));
        return { hash: "TX_" + Math.random().toString(36).slice(2).toUpperCase(), snap };
      }

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

      try {
        if (side === "buy") {
          if (!balanceError && !balanceLoading && parsedAmount > usdcBalance) {
            throw new Error(
              `Insufficient USDC balance — you need ${parsedAmount} USDC but hold ${usdcBalance.toFixed(2)}.`
            );
          }
          const minOut = snap.quote ? toRawWithSlippage(snap.quote.amountOut / 1e7, slippage) : 0n;
          const buyXdr = await buildBuyTx(market.ammContract, {
            trader: wallet.address,
            buyYes,
            usdcIn: toRaw(parsedAmount),
            minTokensOut: minOut,
            deadline,
          });
          const signed = await signTransaction(buyXdr);
          const result = await submit(signed);
          if (result.status === "failed") throw new Error(result.errorMessage ?? "Buy failed");
          if (result.status === "timeout") throw new Error("Transaction timed out");
          return { hash: result.hash, snap };
        } else {
          if (parsedAmount > tokenBalance) {
            throw new Error("Not enough outcome tokens to sell that amount.");
          }
          const sellXdr = await buildSellTx(market.ammContract, {
            trader: wallet.address,
            sellYes: buyYes,
            tokensIn: toRaw(parsedAmount),
            minUsdcOut: 0n,
            deadline,
          });
          const signed = await signTransaction(sellXdr);
          const result = await submit(signed);
          if (result.status === "failed") throw new Error(result.errorMessage ?? "Sell failed");
          if (result.status === "timeout") throw new Error("Transaction timed out");
          return { hash: result.hash, snap };
        }
      } catch (err) {
        throw new Error(humanizeTradeError(err, side));
      }
    },

    onSuccess: ({ hash, snap }) => {
      addNotification({
        type: "success",
        title: snap.side === "buy" ? "Buy Executed" : "Sell Executed",
        message:
          snap.side === "buy"
            ? `Bought ${snap.outcome.toUpperCase()} for ${parsedAmount} USDC`
            : `Sold ${parsedAmount} ${snap.outcome.toUpperCase()} tokens`,
        txHash: hash,
      });

      // ── Optimistic UI: push instantly before the indexer round-trips ──
      // Use the snapshotted quote so the closure isn't stale.
      const yesBps = snap.quote?.yesPriceBps;
      const yesPct = yesBps ? yesBps / 100 : undefined;

      pushActivity({
        id: hash,
        marketId: market.id,
        marketTitle: market.title,
        outcome: snap.outcome,
        side: snap.side,
        amount:
          snap.side === "buy"
            ? parsedAmount
            : parsedAmount * ((snap.outcome === "yes" ? market.yesPrice : market.noPrice) / 100),
        price:
          yesPct != null
            ? snap.outcome === "yes" ? yesPct : 100 - yesPct
            : snap.outcome === "yes" ? market.yesPrice : market.noPrice,
        address: snap.address,
        timestamp: Date.now(),
        optimistic: true,
      });

      if (yesPct != null) {
        const yesPrice = parseFloat(yesPct.toFixed(1));
        pushLivePrice(market.id, {
          timestamp: Math.floor(Date.now() / 1000),
          yesPrice,
          noPrice: parseFloat((100 - yesPrice).toFixed(1)),
          volume: snap.side === "buy" ? parsedAmount : 0,
        });
      }

      // Invalidate everything that changes after a trade.
      queryClient.invalidateQueries({ queryKey: ["market", market.id] });
      queryClient.invalidateQueries({ queryKey: ["market-stats", market.id] });
      queryClient.invalidateQueries({ queryKey: ["market-price-history", market.id] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["chain-positions"] });
      queryClient.invalidateQueries({ queryKey: ["quote"] });
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      setAmount("");
    },

    onError: (error: Error) => {
      addNotification({ type: "error", title: "Trade Failed", message: error.message });
      // Refresh balances even on error — the transaction may have gone through
      // on-chain before the client-side error (e.g. XDR parse failure).
      queryClient.invalidateQueries({ queryKey: ["balances"] });
      queryClient.invalidateQueries({ queryKey: ["market", market.id] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });

  const executeTrade = useCallback(async (): Promise<string | undefined> => {
    if (!wallet || !parsedAmount) return undefined;
    const res = await tradeMutation.mutateAsync();
    return res.hash;
  }, [wallet, parsedAmount, tradeMutation]);

  return {
    side,
    setSide,
    outcome,
    setOutcome,
    amount,
    setAmount,
    slippage,
    setSlippage,
    quote,
    quoteLoading: contractsDeployed ? quoteLoading : false,
    executeTrade,
    isExecuting: tradeMutation.isPending,
    tradeError: tradeMutation.error instanceof Error ? tradeMutation.error.message : undefined,
    isLive: contractsDeployed,
    explorerBase: networkConfig.explorerUrl,
    usdcBalance,
    tokenBalance,
    balanceLoading,
    balanceError,
    needsUsdc,
    needsTokens,
    poolEmpty,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toRaw(human: number): bigint {
  return BigInt(Math.round(human * 1e7));
}

function toRawWithSlippage(humanOut: number, slippagePct: number): bigint {
  const min = humanOut * (1 - slippagePct / 100);
  return BigInt(Math.max(0, Math.floor(min * 1e7)));
}
