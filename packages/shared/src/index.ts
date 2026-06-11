// ─── Types ────────────────────────────────────────────────────────────────────

export type Outcome = "yes" | "no";

export type MarketStatus = "open" | "expired" | "resolved" | "closed";

export interface WalletState {
  address: string;
  network: "TESTNET" | "PUBLIC";
  networkPassphrase: string;
  type: "freighter" | "walletconnect";
}

export interface Market {
  id: string;
  contractAddress: string;
  ammContract: string;
  yesToken: string;
  noToken: string;
  lpToken: string;
  title: string;
  description: string;
  category: string;
  creator: string;
  expiryTimestamp: number;
  status: MarketStatus;
  yesPrice: number;   // 0-100 (percent)
  noPrice: number;    // 0-100 (percent)
  volume: number;     // USDC
  tvl: number;        // USDC
  oracleSource: string;
  thresholdValue: number;
  thresholdOperator: number;
  resolution?: Outcome;
  createdAt: number;
}

export interface Position {
  id: string;
  marketId: string;
  market: Market;
  userAddress: string;
  outcome: Outcome;
  tokenBalance: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  claimable: number;
}

export interface LpPosition {
  id: string;
  marketId: string;
  market: Market;
  userAddress: string;
  lpShares: number;
  depositedValue: number;
  currentValue: number;
  feesEarned: number;
}

export interface QuoteResult {
  amountOut: number;
  fee: number;
  priceImpactBps: number;
  yesPriceBps: number;
  noPriceBps: number;
}

export interface TradeParams {
  outcome: Outcome;
  amount: number;
  minOut: number;
}

export interface PriceDataPoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
  volume?: number;
}

export interface MarketStats {
  totalVolume: number;
  tvl: number;
  yesPrice: number;
  noPrice: number;
  yesPriceChange24h: number;
  noPriceChange24h: number;
  volume24h: number;
  traders: number;
  lps: number;
}

export interface MarketFilters {
  search?: string;
  status?: MarketStatus | "all";
  category?: string;
  sortBy?: "volume" | "newest" | "expiry";
  limit?: number;
  offset?: number;
}

export interface Notification {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
  txHash?: string;
}

export interface OracleSubmission {
  signer: string;
  outcome: Outcome;
  priceAtExpiry: number;
  priceSource: string;
  submittedAt: number;
}

export interface Settlement {
  marketId: string;
  winningOutcome: Outcome;
  totalPool: number;
  protocolFee: number;
  payoutPool: number;
  payoutRate: number;
  settledAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const SCALE = 10_000_000; // 1e7

export const ASSETS = [
  { symbol: "BTC", name: "Bitcoin", oracleId: "BTC_USD" },
  { symbol: "ETH", name: "Ethereum", oracleId: "ETH_USD" },
  { symbol: "XLM", name: "Stellar Lumens", oracleId: "XLM_USD" },
  { symbol: "SOL", name: "Solana", oracleId: "SOL_USD" },
  { symbol: "XRP", name: "Ripple", oracleId: "XRP_USD" },
  { symbol: "USDC", name: "USD Coin", oracleId: "USDC_USD" },
  { symbol: "EURC", name: "Euro Coin", oracleId: "EURC_USD" },
] as const;

// ─── Utilities ────────────────────────────────────────────────────────────────

export function truncateAddress(address: string, chars = 6): string {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatUsd(amount: number, decimals = 0): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatTokenAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount / SCALE);
}

/** Scale a human-readable dollar amount to contract scale (1e7) */
export function toContractAmount(usdAmount: number): bigint {
  return BigInt(Math.round(usdAmount * SCALE));
}

/** Convert contract-scaled amount to human-readable */
export function fromContractAmount(raw: bigint | number): number {
  return Number(raw) / SCALE;
}

/** Calculate implied probability from basis points */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}
