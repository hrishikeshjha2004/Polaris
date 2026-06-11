import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { WalletState, Market, Position, Notification } from "@stellarpm/shared";

// ─── Wallet Slice ─────────────────────────────────────────────────────────────

interface WalletSlice {
  wallet: WalletState | null;
  isConnecting: boolean;
  setWallet: (wallet: WalletState | null) => void;
  setConnecting: (v: boolean) => void;
}

// ─── Markets Slice ────────────────────────────────────────────────────────────

interface MarketsSlice {
  markets: Market[];
  selectedMarketId: string | null;
  marketsLoading: boolean;
  setMarkets: (markets: Market[]) => void;
  setSelectedMarket: (id: string | null) => void;
  setMarketsLoading: (v: boolean) => void;
  updateMarket: (id: string, patch: Partial<Market>) => void;
}

// ─── Positions Slice ──────────────────────────────────────────────────────────

interface PositionsSlice {
  positions: Position[];
  positionsLoading: boolean;
  setPositions: (positions: Position[]) => void;
  setPositionsLoading: (v: boolean) => void;
}

// ─── UI Slice ─────────────────────────────────────────────────────────────────

interface UISlice {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  walletModalOpen: boolean;
  setWalletModalOpen: (v: boolean) => void;
}

// ─── Combined Store ───────────────────────────────────────────────────────────

type AppStore = WalletSlice & MarketsSlice & PositionsSlice & UISlice;

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      // Wallet
      wallet: null,
      isConnecting: false,
      setWallet: (wallet) => set({ wallet }, false, "setWallet"),
      setConnecting: (isConnecting) => set({ isConnecting }, false, "setConnecting"),

      // Markets
      markets: [],
      selectedMarketId: null,
      marketsLoading: false,
      setMarkets: (markets) => set({ markets }, false, "setMarkets"),
      setSelectedMarket: (selectedMarketId) =>
        set({ selectedMarketId }, false, "setSelectedMarket"),
      setMarketsLoading: (marketsLoading) =>
        set({ marketsLoading }, false, "setMarketsLoading"),
      updateMarket: (id, patch) =>
        set(
          (state) => ({
            markets: state.markets.map((m) =>
              m.id === id ? { ...m, ...patch } : m
            ),
          }),
          false,
          "updateMarket"
        ),

      // Positions
      positions: [],
      positionsLoading: false,
      setPositions: (positions) => set({ positions }, false, "setPositions"),
      setPositionsLoading: (positionsLoading) =>
        set({ positionsLoading }, false, "setPositionsLoading"),

      // UI
      notifications: [],
      addNotification: (n) =>
        set(
          (state) => ({
            notifications: [
              ...state.notifications,
              { ...n, id: Math.random().toString(36).slice(2) },
            ],
          }),
          false,
          "addNotification"
        ),
      removeNotification: (id) =>
        set(
          (state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          }),
          false,
          "removeNotification"
        ),
      walletModalOpen: false,
      setWalletModalOpen: (walletModalOpen) =>
        set({ walletModalOpen }, false, "setWalletModalOpen"),
    }),
    { name: "Polaris" }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectWallet = (s: AppStore) => s.wallet;
export const selectIsConnected = (s: AppStore) => s.wallet !== null;
export const selectMarkets = (s: AppStore) => s.markets;
export const selectPositions = (s: AppStore) => s.positions;
