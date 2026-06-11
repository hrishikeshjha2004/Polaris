import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "./use-wallet";
import { useAppStore } from "@/store";
import {
  buildAddLiquidityTx,
  buildRemoveLiquidityTx,
  getUsdcBalance,
  getOutcomeTokenBalance,
  submit,
  contractsDeployed,
} from "@/lib/contracts/client";
import { fromContractAmount } from "@stellarpm/sdk";
import type { QueryClient } from "@tanstack/react-query";
import type { Market } from "@stellarpm/shared";

// Refresh everything a liquidity change touches: pool reserves/price/TVL, the
// LP's balances + positions, the chart and stats.
function invalidateAfterLiquidity(qc: QueryClient, marketId: string) {
  qc.invalidateQueries({ queryKey: ["balances"] });
  qc.invalidateQueries({ queryKey: ["market", marketId] });
  qc.invalidateQueries({ queryKey: ["market-stats", marketId] });
  qc.invalidateQueries({ queryKey: ["market-price-history", marketId] });
  qc.invalidateQueries({ queryKey: ["markets"] });
  qc.invalidateQueries({ queryKey: ["lp-positions"] });
  qc.invalidateQueries({ queryKey: ["chain-positions"] });
}

export function useLiquidity(market: Market) {
  const { wallet, signTransaction } = useWallet();
  const { addNotification } = useAppStore();
  const queryClient = useQueryClient();

  const { data: usdcBalance = 0, isLoading: balanceLoading, isError: balanceError } = useQuery({
    queryKey: ["balances", "usdc", wallet?.address],
    queryFn: () => (wallet ? getUsdcBalance(wallet.address) : 0),
    enabled: contractsDeployed && !!wallet?.address,
    staleTime: 5_000,
    retry: 2,
  });

  const { data: lpBalance = 0, isLoading: lpBalanceLoading } = useQuery({
    queryKey: ["balances", "lp", market.lpToken, wallet?.address],
    queryFn: () =>
      wallet && market.lpToken
        ? getOutcomeTokenBalance(market.lpToken, wallet.address)
        : 0,
    enabled: contractsDeployed && !!wallet?.address && !!market.lpToken,
    staleTime: 5_000,
    retry: 2,
  });


  const addMutation = useMutation({
    mutationFn: async (usdcAmount: number) => {
      if (!wallet) throw new Error("Wallet not connected");
      if (!market.ammContract) throw new Error("Market has no AMM contract");
      if (usdcAmount <= 0) throw new Error("Enter a valid USDC amount");
      if (!contractsDeployed) {
        await new Promise((r) => setTimeout(r, 1000));
        return { hash: "TX_" + Math.random().toString(36).slice(2).toUpperCase() };
      }
      const usdcRaw = BigInt(Math.round(usdcAmount * 1e7));
      const xdr = await buildAddLiquidityTx(market.ammContract, {
        provider: wallet.address,
        usdcAmount: usdcRaw,
        minLpOut: 0n,
      });
      const signed = await signTransaction(xdr);
      const result = await submit(signed);
      if (result.status === "failed") throw new Error(result.errorMessage ?? "Add liquidity failed");
      if (result.status === "timeout") throw new Error("Transaction timed out");
      return { hash: result.hash };
    },
    onSuccess: (result, usdcAmount) => {
      addNotification({
        type: "success",
        title: "Liquidity Added",
        message: `Added ${usdcAmount} USDC to ${market.title}`,
        txHash: result.hash,
      });
      invalidateAfterLiquidity(queryClient, market.id);
    },
    onError: (error: Error) => {
      addNotification({ type: "error", title: "Add Liquidity Failed", message: error.message });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (lpShares: number) => {
      if (!wallet) throw new Error("Wallet not connected");
      if (!market.ammContract) throw new Error("Market has no AMM contract");
      if (lpShares <= 0) throw new Error("Enter LP shares to remove");
      if (!contractsDeployed) {
        await new Promise((r) => setTimeout(r, 1000));
        return { hash: "TX_" + Math.random().toString(36).slice(2).toUpperCase() };
      }
      const lpRaw = BigInt(Math.round(lpShares * 1e7));
      const xdr = await buildRemoveLiquidityTx(market.ammContract, {
        provider: wallet.address,
        lpShares: lpRaw,
        minUsdcOut: 0n,
      });
      const signed = await signTransaction(xdr);
      const result = await submit(signed);
      if (result.status === "failed") throw new Error(result.errorMessage ?? "Remove liquidity failed");
      if (result.status === "timeout") throw new Error("Transaction timed out");
      return { hash: result.hash };
    },
    onSuccess: (result, lpShares) => {
      addNotification({
        type: "success",
        title: "Liquidity Removed",
        message: `Removed ${lpShares} LP shares from ${market.title}`,
        txHash: result.hash,
      });
      invalidateAfterLiquidity(queryClient, market.id);
    },
    onError: (error: Error) => {
      addNotification({ type: "error", title: "Remove Liquidity Failed", message: error.message });
    },
  });

  const addLiquidity = useCallback(
    (usdcAmount: number) => addMutation.mutateAsync(usdcAmount),
    [addMutation]
  );

  const removeLiquidity = useCallback(
    (lpShares: number) => removeMutation.mutateAsync(lpShares),
    [removeMutation]
  );

  return {
    usdcBalance,
    lpBalance,
    balanceLoading,
    balanceError,
    lpBalanceLoading,
    addLiquidity,
    removeLiquidity,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
    addError: addMutation.error instanceof Error ? addMutation.error.message : undefined,
    removeError: removeMutation.error instanceof Error ? removeMutation.error.message : undefined,
    isLive: contractsDeployed,
    needsUsdc: !balanceLoading && !balanceError && usdcBalance === 0,
  };
}
