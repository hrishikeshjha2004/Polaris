/**
 * AMM contract client.
 *
 * Economic model: USDC collateral + complete sets (see contracts/amm).
 * Trades are denominated in USDC. All view calls go through simulation;
 * state-mutating operations return unsigned transaction XDR.
 */

import { rpc, xdr } from "@stellar/stellar-sdk";
import { buildAndSimulate, getServer, simulateReadCall } from "../tx";
import {
  addressToScVal,
  i128ToScVal,
  u64ToScVal,
  boolToScVal,
  scValToI128,
  scValToU32,
} from "../scval";
import type { NetworkConfig } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PoolState {
  yesReserves: bigint;
  noReserves: bigint;
  usdcReserves: bigint;
  lpTotalSupply: bigint;
  yesPriceBps: bigint;
  noPriceBps: bigint;
  swapFeeBps: number;
}

export interface QuoteResult {
  amountOut: bigint;
  fee: bigint;
  priceImpactBps: number;
  yesPriceBps: bigint;
  noPriceBps: bigint;
}

export interface BuyTxParams {
  trader: string;
  buyYes: boolean;
  usdcIn: bigint;
  minTokensOut: bigint;
  deadline: bigint; // Unix timestamp
}

export interface SellTxParams {
  trader: string;
  sellYes: boolean;
  tokensIn: bigint;
  minUsdcOut: bigint;
  deadline: bigint;
}

export interface AddLiquidityTxParams {
  provider: string;
  usdcAmount: bigint;
  minLpOut: bigint;
}

export interface RemoveLiquidityTxParams {
  provider: string;
  lpShares: bigint;
  minUsdcOut: bigint;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class AmmClient {
  private server: rpc.Server;

  constructor(
    private config: NetworkConfig,
    private contractId: string
  ) {
    this.server = getServer(config);
  }

  /**
   * Quote selling YES/NO tokens for USDC.
   *
   * The AMM contract has no `get_sell_quote` view function, so this replicates
   * the quadratic formula from the on-chain `sell` function using the current
   * pool state (one `get_pool_state` simulation call).
   */
  async getSellQuote(sellYes: boolean, tokensIn: bigint): Promise<QuoteResult | null> {
    if (tokensIn <= 0n) return null;
    const pool = await this.getPoolState();
    if (!pool) return null;
    if (pool.yesReserves === 0n || pool.noReserves === 0n) return null;
    return computeSellQuote(sellYes, tokensIn, pool.yesReserves, pool.noReserves, pool.swapFeeBps);
  }

  /** Quote buying YES/NO with USDC (simulation, no signature). */
  async getBuyQuote(buyYes: boolean, usdcIn: bigint): Promise<QuoteResult | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_buy_quote",
      [boolToScVal(buyYes), i128ToScVal(usdcIn)]
    );
    if (!result.success || !result.returnValue) return null;
    return decodeQuoteResult(result.returnValue);
  }

  /** Get current pool reserves, collateral and prices. */
  async getPoolState(): Promise<PoolState | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_pool_state",
      []
    );
    if (!result.success || !result.returnValue) return null;
    return decodePoolState(result.returnValue);
  }

  async getReserves(): Promise<[bigint, bigint] | null> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_reserves",
      []
    );
    if (!result.success || !result.returnValue) return null;
    const vec = result.returnValue.vec();
    if (!vec || vec.length < 2) return null;
    return [scValToI128(vec[0]), scValToI128(vec[1])];
  }

  async getYesPriceBps(): Promise<bigint> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_yes_price_bps",
      []
    );
    if (!result.success || !result.returnValue) return 5000n;
    return scValToI128(result.returnValue);
  }

  async getCollateral(): Promise<bigint> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "get_collateral",
      []
    );
    if (!result.success || !result.returnValue) return 0n;
    return scValToI128(result.returnValue);
  }

  /** Build a buy transaction XDR — must be signed by trader. */
  async buildBuyTx(params: BuyTxParams): Promise<string> {
    const { tx } = await buildAndSimulate(
      this.server,
      params.trader,
      this.config.networkPassphrase,
      this.contractId,
      "buy",
      [
        addressToScVal(params.trader),
        boolToScVal(params.buyYes),
        i128ToScVal(params.usdcIn),
        i128ToScVal(params.minTokensOut),
        u64ToScVal(params.deadline),
      ]
    );
    return tx.toXDR();
  }

  /** Build a sell transaction XDR. */
  async buildSellTx(params: SellTxParams): Promise<string> {
    const { tx } = await buildAndSimulate(
      this.server,
      params.trader,
      this.config.networkPassphrase,
      this.contractId,
      "sell",
      [
        addressToScVal(params.trader),
        boolToScVal(params.sellYes),
        i128ToScVal(params.tokensIn),
        i128ToScVal(params.minUsdcOut),
        u64ToScVal(params.deadline),
      ]
    );
    return tx.toXDR();
  }

  /** Build add_liquidity_usdc tx XDR. */
  async buildAddLiquidityTx(params: AddLiquidityTxParams): Promise<string> {
    const { tx } = await buildAndSimulate(
      this.server,
      params.provider,
      this.config.networkPassphrase,
      this.contractId,
      "add_liquidity_usdc",
      [
        addressToScVal(params.provider),
        i128ToScVal(params.usdcAmount),
        i128ToScVal(params.minLpOut),
      ]
    );
    return tx.toXDR();
  }

  /** Build remove_liquidity_usdc tx XDR. */
  async buildRemoveLiquidityTx(params: RemoveLiquidityTxParams): Promise<string> {
    const { tx } = await buildAndSimulate(
      this.server,
      params.provider,
      this.config.networkPassphrase,
      this.contractId,
      "remove_liquidity_usdc",
      [
        addressToScVal(params.provider),
        i128ToScVal(params.lpShares),
        i128ToScVal(params.minUsdcOut),
      ]
    );
    return tx.toXDR();
  }
}

// ─── Sell Quote Math (mirrors the on-chain `sell` function) ──────────────────

/** Integer square root (Newton's method) — mirrors stellar_pm_shared::sqrt */
function bigintSqrt(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

const BPS_BIGINT = 10_000n;

/**
 * Compute a sell quote using the AMM's quadratic formula.
 * Mirrors the `sell` function in contracts/amm/src/lib.rs exactly.
 */
function computeSellQuote(
  sellYes: boolean,
  tokensIn: bigint,
  yesReserves: bigint,
  noReserves: bigint,
  swapFeeBps: number
): QuoteResult | null {
  const target = sellYes ? yesReserves : noReserves;
  const other  = sellYes ? noReserves  : yesReserves;

  // Quadratic: d^2 - (target + q + other)*d + q*other = 0  →  smaller root
  const q = tokensIn;
  const b = target + q + other;
  const c = q * other;
  const disc = b * b - 4n * c;
  if (disc < 0n) return null;

  const d = (b - bigintSqrt(disc)) / 2n;   // gross USDC out
  if (d <= 0n) return null;

  const feeBps  = BigInt(swapFeeBps);
  const totalFee = (d * feeBps) / 10_000n;
  const usdcOut  = d - totalFee;
  if (usdcOut <= 0n) return null;

  // Post-sell reserves
  const newTarget = target + q - d;
  const newOther  = other - d;
  const [newYes, newNo] = sellYes
    ? [newTarget, newOther]
    : [newOther, newTarget];
  const totalAfter = newYes + newNo;
  const yesPriceAfter = totalAfter > 0n
    ? (newNo * BPS_BIGINT) / totalAfter
    : BPS_BIGINT / 2n;

  // Price impact vs current price
  const totalBefore = yesReserves + noReserves;
  const yesPriceBefore = totalBefore > 0n
    ? (noReserves * BPS_BIGINT) / totalBefore
    : BPS_BIGINT / 2n;
  const diff = yesPriceBefore > yesPriceAfter
    ? yesPriceBefore - yesPriceAfter
    : yesPriceAfter - yesPriceBefore;
  const priceImpactBps = yesPriceBefore > 0n
    ? Number((diff * BPS_BIGINT) / yesPriceBefore)
    : 0;

  return {
    amountOut:      usdcOut,
    fee:            totalFee,
    priceImpactBps,
    yesPriceBps:    yesPriceAfter,
    noPriceBps:     BPS_BIGINT - yesPriceAfter,
  };
}

// ─── Struct Decoders ──────────────────────────────────────────────────────────

function fieldMap(val: xdr.ScVal): Map<string, xdr.ScVal> {
  const map = val.map();
  if (!map) throw new Error("Expected ScMap");
  const fields = new Map<string, xdr.ScVal>();
  for (const entry of map) {
    const key =
      entry.key().sym()?.toString() ?? entry.key().str()?.toString() ?? "";
    fields.set(key, entry.val());
  }
  return fields;
}

function decodePoolState(val: xdr.ScVal): PoolState {
  const f = fieldMap(val);
  return {
    yesReserves: scValToI128(f.get("yes_reserves")!),
    noReserves: scValToI128(f.get("no_reserves")!),
    usdcReserves: scValToI128(f.get("usdc_reserves")!),
    lpTotalSupply: scValToI128(f.get("lp_total_supply")!),
    yesPriceBps: scValToI128(f.get("yes_price_bps")!),
    noPriceBps: scValToI128(f.get("no_price_bps")!),
    swapFeeBps: scValToU32(f.get("swap_fee_bps")!),
  };
}

function decodeQuoteResult(val: xdr.ScVal): QuoteResult {
  // get_buy_quote returns Result<QuoteResult,_>; success unwraps to the struct.
  const inner = val.switch().name === "scvVec" ? val.vec()?.[0] ?? val : val;
  const f = fieldMap(inner);
  return {
    amountOut: scValToI128(f.get("amount_out")!),
    fee: scValToI128(f.get("fee")!),
    priceImpactBps: scValToU32(f.get("price_impact_bps")!),
    yesPriceBps: scValToI128(f.get("yes_price_bps")!),
    noPriceBps: scValToI128(f.get("no_price_bps")!),
  };
}
