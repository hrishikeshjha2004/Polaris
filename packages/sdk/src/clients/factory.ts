/**
 * MarketFactory contract client.
 *
 * The factory is the entry point for market creation and discovery.
 * All other contracts are deployed by the factory per market.
 */

import { SorobanRpc, xdr, Address } from "@stellar/stellar-sdk";
import { buildAndSimulate, getServer, simulateReadCall } from "../tx";
import {
  addressToScVal,
  i128ToScVal,
  u32ToScVal,
  scValToAddress,
  scValToU64,
  marketParamsToScVal,
} from "../scval";
import type { NetworkConfig } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateMarketParams {
  title: string;
  description: string;
  category: string;
  /** Unix timestamp in seconds */
  expiryTimestamp: number;
  oracleSource: string;
  /** Price threshold scaled by 1e7 */
  thresholdValue: bigint;
  /** 0=GT, 1=LT, 2=GTE, 3=LTE */
  thresholdOperator: number;
  /** Initial liquidity in USDC scaled by 1e7 */
  initialLiquidity: bigint;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class FactoryClient {
  private server: SorobanRpc.Server;

  constructor(
    private config: NetworkConfig,
    private contractId: string
  ) {
    this.server = getServer(config);
  }

  async getMarketCount(): Promise<bigint> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "market_count",
      []
    );
    if (!result.success || !result.returnValue) return 0n;
    return BigInt(result.returnValue.u64()?.toString() ?? "0");
  }

  async isPaused(): Promise<boolean> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "is_paused",
      []
    );
    if (!result.success || !result.returnValue) return false;
    return result.returnValue.b() ?? false;
  }

  async getAdmin(): Promise<string | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_admin",
      []
    );
    if (!result.success || !result.returnValue) return null;
    return scValToAddress(result.returnValue);
  }

  /**
   * Get a market's contract address by its market ID (hex string).
   * Returns null if not found.
   */
  async getMarket(marketIdHex: string): Promise<string | null> {
    const idBytes = Buffer.from(marketIdHex, "hex");
    const bytesVal = xdr.ScVal.scvBytes(idBytes);

    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_market",
      [bytesVal]
    );
    if (!result.success || !result.returnValue) return null;

    // Returns Result<Address, SharedError>. Soroban returns the Ok value
    // directly, so returnValue is an scvAddress (not a vec wrapper). Calling
    // .vec() on a non-vec ScVal throws, so we must NOT blindly unwrap.
    try {
      const rv = result.returnValue;
      const inner =
        rv.switch().name === "scvVec" ? rv.vec()?.[0] ?? rv : rv;
      return scValToAddress(inner);
    } catch {
      return null;
    }
  }

  /**
   * List market IDs with pagination.
   * Returns hex-encoded market IDs.
   */
  async listMarkets(offset: number, limit: number): Promise<string[]> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "list_markets",
      [u32ToScVal(offset), u32ToScVal(limit)]
    );
    if (!result.success || !result.returnValue) return [];

    const vec = result.returnValue.vec() ?? [];
    return vec.map((v) => {
      const bytes = v.bytes();
      return bytes ? Buffer.from(bytes).toString("hex") : "";
    });
  }

  /**
   * Build a create_market transaction XDR.
   *
   * Before calling, the creator must approve the factory to spend the
   * creation fee in USDC. This tx must be signed by the creator.
   */
  async buildCreateMarketTx(
    creator: string,
    params: CreateMarketParams
  ): Promise<string> {
    const paramsScVal = marketParamsToScVal({
      title: params.title,
      description: params.description,
      category: params.category,
      expiry_timestamp: BigInt(params.expiryTimestamp),
      oracle_source: params.oracleSource,
      threshold_value: params.thresholdValue,
      threshold_operator: params.thresholdOperator,
      initial_liquidity: params.initialLiquidity,
    });

    const { tx } = await buildAndSimulate(
      this.server,
      creator,
      this.config.networkPassphrase,
      this.contractId,
      "create_market",
      [addressToScVal(creator), paramsScVal]
    );

    return tx.toXDR();
  }
}
