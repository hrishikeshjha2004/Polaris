/**
 * Market contract client.
 *
 * Each deployed market has its own contract address. This client wraps
 * all per-market calls: state reads, expiry, resolution recording, volume.
 */

import { rpc, xdr, Address } from "@stellar/stellar-sdk";
import { buildAndSimulate, getServer, simulateReadCall } from "../tx";
import {
  addressToScVal,
  scValToI128,
  scValToAddress,
  scValToString,
  scValToU32,
  scValToU64,
  scValToOutcome,
  scValToMarketStatus,
} from "../scval";
import type { NetworkConfig } from "../config";
import type { Market } from "@stellarpm/shared";

// ─── Raw On-Chain Market State ────────────────────────────────────────────────

export interface OnChainMarketState {
  marketId: string;
  title: string;
  description: string;
  category: string;
  creator: string;
  expiryTimestamp: bigint;
  status: "open" | "expired" | "resolved" | "closed";
  yesToken: string;
  noToken: string;
  lpToken: string;
  ammContract: string;
  oracleSource: string;
  thresholdValue: bigint;
  thresholdOperator: number;
  createdAt: bigint;
  totalVolume: bigint;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class MarketClient {
  private server: rpc.Server;

  constructor(
    private config: NetworkConfig,
    private contractId: string
  ) {
    this.server = getServer(config);
  }

  async getState(): Promise<OnChainMarketState | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_state",
      []
    );

    if (!result.success || !result.returnValue) return null;

    return decodeMarketState(result.returnValue);
  }

  async getStatus(): Promise<"open" | "expired" | "resolved" | "closed"> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_status",
      []
    );
    if (!result.success || !result.returnValue) return "open";
    return scValToMarketStatus(result.returnValue);
  }

  async getResolution(): Promise<"yes" | "no" | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_resolution",
      []
    );
    if (!result.success || !result.returnValue) return null;

    const val = result.returnValue;
    // Returns Option<Outcome> — ScvVec wrapper for Some, ScvVoid for None
    if (val.switch().name === "scvVoid") return null;
    const inner = val.vec()?.[0] ?? val;
    return scValToOutcome(inner);
  }

  async getYesToken(): Promise<string | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_yes_token",
      []
    );
    if (!result.success || !result.returnValue) return null;
    return scValToAddress(result.returnValue);
  }

  async getNoToken(): Promise<string | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_no_token",
      []
    );
    if (!result.success || !result.returnValue) return null;
    return scValToAddress(result.returnValue);
  }

  async getAmm(): Promise<string | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_amm",
      []
    );
    if (!result.success || !result.returnValue) return null;
    return scValToAddress(result.returnValue);
  }

  /** Build expire() tx — callable by anyone once expiry timestamp is passed */
  async buildExpireTx(caller: string): Promise<string> {
    const { tx } = await buildAndSimulate(
      this.server,
      caller,
      this.config.networkPassphrase,
      this.contractId,
      "expire",
      []
    );
    return tx.toXDR();
  }

  /**
   * Convert on-chain state + AMM prices into the shared Market type
   * that the frontend consumes.
   */
  static toMarket(
    state: OnChainMarketState,
    contractAddress: string,
    yesPriceBps: bigint,
    yesReserves: bigint,
    noReserves: bigint
  ): Market {
    const SCALE = 10_000_000n;
    const yesPct = Number(yesPriceBps) / 100;
    const noPct = 100 - yesPct;
    const tvl = Number(yesReserves + noReserves) / Number(SCALE);
    const volume = Number(state.totalVolume) / Number(SCALE);

    return {
      id: state.marketId,
      contractAddress,
      ammContract: state.ammContract,
      yesToken: state.yesToken,
      noToken: state.noToken,
      lpToken: state.lpToken,
      title: state.title,
      description: state.description,
      category: state.category,
      creator: state.creator,
      expiryTimestamp: Number(state.expiryTimestamp),
      status: state.status,
      yesPrice: yesPct,
      noPrice: noPct,
      volume,
      tvl,
      oracleSource: state.oracleSource,
      thresholdValue: Number(state.thresholdValue),
      thresholdOperator: state.thresholdOperator,
      resolution: undefined,
      createdAt: Number(state.createdAt),
    };
  }
}

// ─── Struct Decoder ───────────────────────────────────────────────────────────

function decodeMarketState(val: xdr.ScVal): OnChainMarketState {
  const map = val.map();
  if (!map) throw new Error("Expected ScMap for MarketState");

  const fields = new Map<string, xdr.ScVal>();
  for (const entry of map) {
    const key = entry.key().sym()?.toString() ?? entry.key().str()?.toString() ?? "";
    fields.set(key, entry.val());
  }

  return {
    marketId: toHex(fields.get("market_id")!),
    title: scValToString(fields.get("title")!),
    description: scValToString(fields.get("description")!),
    category: scValToString(fields.get("category")!),
    creator: scValToAddress(fields.get("creator")!),
    expiryTimestamp: scValToU64(fields.get("expiry_timestamp")!),
    status: scValToMarketStatus(fields.get("status")!),
    yesToken: scValToAddress(fields.get("yes_token")!),
    noToken: scValToAddress(fields.get("no_token")!),
    lpToken: scValToAddress(fields.get("lp_token")!),
    ammContract: scValToAddress(fields.get("amm_contract")!),
    oracleSource: scValToString(fields.get("oracle_source")!),
    thresholdValue: scValToI128(fields.get("threshold_value")!),
    thresholdOperator: scValToU32(fields.get("threshold_operator")!),
    createdAt: scValToU64(fields.get("created_at")!),
    totalVolume: scValToI128(fields.get("total_volume")!),
  };
}

function toHex(val: xdr.ScVal): string {
  const bytes = val.bytes();
  return bytes ? Buffer.from(bytes).toString("hex") : "";
}
