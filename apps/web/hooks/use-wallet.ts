import { useCallback } from "react";
import { useAppStore } from "@/store";
import type { WalletState } from "@stellarpm/shared";

const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet";

export function useWallet() {
  const { wallet, isConnecting, setWallet, setConnecting } = useAppStore();

  const connectFreighter = useCallback(async () => {
    setConnecting(true);
    try {
      // Dynamic import to avoid SSR issues with Freighter extension
      const { isConnected, getAddress, getNetwork, requestAccess } = await import(
        "@stellar/freighter-api"
      );

      const { isConnected: connected } = await isConnected();
      if (!connected) {
        // Request access from the user
        await requestAccess();
      }

      const { address: publicKey } = await getAddress();
      const { network, networkPassphrase } = await getNetwork();

      const expectedNetwork =
        STELLAR_NETWORK === "mainnet" ? "PUBLIC" : "TESTNET";
      if (network !== expectedNetwork) {
        throw new Error(
          `Please switch Freighter to ${expectedNetwork} network`
        );
      }

      const newWallet: WalletState = {
        address: publicKey,
        network: network as "TESTNET" | "PUBLIC",
        networkPassphrase,
        type: "freighter",
      };

      setWallet(newWallet);
      return newWallet;
    } catch (error) {
      console.error("Wallet connection failed:", error);
      throw error;
    } finally {
      setConnecting(false);
    }
  }, [setWallet, setConnecting]);

  const disconnect = useCallback(() => {
    setWallet(null);
  }, [setWallet]);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!wallet) throw new Error("Wallet not connected");

      const { signTransaction: freighterSign } = await import(
        "@stellar/freighter-api"
      );
      const result = await freighterSign(xdr, {
        networkPassphrase: wallet.networkPassphrase,
      });
      return result.signedTxXdr;
    },
    [wallet]
  );

  return {
    wallet,
    isConnected: wallet !== null,
    isConnecting,
    address: wallet?.address ?? null,
    network: wallet?.network ?? null,
    connectFreighter,
    disconnect,
    signTransaction,
  };
}
