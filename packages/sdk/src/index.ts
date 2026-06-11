/**
 * Polaris SDK
 *
 * Provides typed clients for all on-chain contracts, transaction building,
 * ScVal encoding, and a high-level trading API.
 *
 * Usage:
 *   import { createSdk, SCALE } from "@stellarpm/sdk"
 *   const sdk = createSdk("testnet")
 *   const pool = await sdk.amm(ammContractId).getPoolState()
 */

// ─── Config ───────────────────────────────────────────────────────────────────
export {
  getNetworkConfig,
  isContractsDeployed,
  getExplorerTxUrl,
  getExplorerContractUrl,
  NETWORK_CONFIGS,
} from "./config";
export type { NetworkConfig, NetworkName, ContractAddresses } from "./config";

// ─── Transaction Utilities ────────────────────────────────────────────────────
export {
  getServer,
  simulateReadCall,
  buildAndSimulate,
  submitAndConfirm,
  xdrToBase64,
} from "./tx";
export type { SimulateResult, SubmitResult, BuildTxOptions } from "./tx";

// ─── ScVal Helpers ────────────────────────────────────────────────────────────
export {
  addressToScVal,
  i128ToScVal,
  u128ToScVal,
  u32ToScVal,
  u64ToScVal,
  boolToScVal,
  stringToScVal,
  bytesNToScVal,
  outcomeToScVal,
  marketParamsToScVal,
  scValToAddress,
  scValToI128,
  scValToU32,
  scValToU64,
  scValToString,
  scValToBytes,
  scValToOutcome,
  scValToMarketStatus,
  parseReturnValue,
  decodeSimulationError,
} from "./scval";

// ─── Contract Clients ─────────────────────────────────────────────────────────
export { AmmClient } from "./clients/amm";
export type {
  PoolState,
  QuoteResult,
  BuyTxParams,
  SellTxParams,
  AddLiquidityTxParams,
  RemoveLiquidityTxParams,
} from "./clients/amm";

export { MarketClient } from "./clients/market";
export type { OnChainMarketState } from "./clients/market";

export { FactoryClient } from "./clients/factory";
export type { CreateMarketParams } from "./clients/factory";

export { TokenClient } from "./clients/token";

// ─── Shared Types (re-export for convenience) ─────────────────────────────────
export * from "@stellarpm/shared";

// ─── SDK Factory ──────────────────────────────────────────────────────────────

import { getNetworkConfig } from "./config";
import { AmmClient } from "./clients/amm";
import { MarketClient } from "./clients/market";
import { FactoryClient } from "./clients/factory";
import { TokenClient } from "./clients/token";
import type { NetworkName, NetworkConfig } from "./config";

export interface PolarisSdk {
  config: NetworkConfig;
  /** Get AMM client for a specific AMM contract */
  amm: (contractId: string) => AmmClient;
  /** Get Market client for a specific Market contract */
  market: (contractId: string) => MarketClient;
  /** Get Factory client */
  factory: () => FactoryClient;
  /** Get Token client (for USDC, YES token, NO token, or LP token) */
  token: (contractId: string) => TokenClient;
}

export function createSdk(network?: NetworkName): PolarisSdk {
  const config = getNetworkConfig(network);

  return {
    config,
    amm: (contractId: string) => new AmmClient(config, contractId),
    market: (contractId: string) => new MarketClient(config, contractId),
    factory: () => new FactoryClient(config, config.contracts.factory),
    token: (contractId: string) => new TokenClient(config, contractId),
  };
}

// ─── Scale Constants (convenience) ───────────────────────────────────────────

export const SCALE = 10_000_000n;
export const SCALE_N = 10_000_000;
export const BPS = 10_000n;

/** Convert human-readable USDC amount to contract scale */
export function toContractAmount(usdc: number): bigint {
  return BigInt(Math.round(usdc * SCALE_N));
}

/** Convert contract-scaled amount to human-readable */
export function fromContractAmount(raw: bigint | number): number {
  return Number(raw) / SCALE_N;
}

/** BPS to percentage */
export function bpsToPct(bps: bigint | number): number {
  return Number(bps) / 100;
}

/** Unix timestamp in seconds, N days from now */
export function daysFromNow(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86400;
}
