/**
 * Frontend contract client — thin wrapper over the SDK for Next.js.
 *
 * Trades are USDC-denominated (buy/sell). All state-mutating operations return
 * unsigned XDR; the caller signs via Freighter then submits via `submit`.
 */

import {
  createSdk,
  isContractsDeployed,
  submitAndConfirm,
  getServer,
  toContractAmount,
  fromContractAmount,
  getExplorerTxUrl as sdkGetExplorerTxUrl,
  MarketClient,
} from "@stellarpm/sdk";
import type {
  NetworkName,
  QuoteResult,
  BuyTxParams,
  SellTxParams,
  AddLiquidityTxParams,
  RemoveLiquidityTxParams,
  CreateMarketParams,
  SubmitResult,
  PoolState,
} from "@stellarpm/sdk";
import type { Market } from "@stellarpm/shared";

// ─── SDK Instance ─────────────────────────────────────────────────────────────

const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK as NetworkName) || "testnet";
const sdk = createSdk(NETWORK);

export { sdk };
export const networkConfig = sdk.config;
export const contractsDeployed = isContractsDeployed(sdk.config);

// ─── AMM: Quotes ──────────────────────────────────────────────────────────────

/** Quote buying YES/NO with USDC. Returns human-readable token amount out. */
export async function getBuyQuote(
  ammContractId: string,
  buyYes: boolean,
  usdcAmount: number
): Promise<QuoteResult | null> {
  if (!ammContractId || usdcAmount <= 0) return null;
  return sdk.amm(ammContractId).getBuyQuote(buyYes, toContractAmount(usdcAmount));
}

export async function getPoolState(ammContractId: string): Promise<PoolState | null> {
  if (!ammContractId) return null;
  return sdk.amm(ammContractId).getPoolState();
}

// ─── AMM: Trade Transactions ─────────────────────────────────────────────────

/** Quote selling YES/NO tokens for USDC using the AMM's quadratic formula. */
export async function getSellQuote(
  ammContractId: string,
  sellYes: boolean,
  tokensAmount: number
): Promise<QuoteResult | null> {
  if (!ammContractId || tokensAmount <= 0) return null;
  return sdk.amm(ammContractId).getSellQuote(sellYes, toContractAmount(tokensAmount));
}

/** Build a buy (YES/NO with USDC) tx — returns unsigned XDR. */
export async function buildBuyTx(
  ammContractId: string,
  params: BuyTxParams
): Promise<string> {
  return sdk.amm(ammContractId).buildBuyTx(params);
}

/** Build a sell (YES/NO for USDC) tx. */
export async function buildSellTx(
  ammContractId: string,
  params: SellTxParams
): Promise<string> {
  return sdk.amm(ammContractId).buildSellTx(params);
}

/** Build add liquidity (USDC) tx. */
export async function buildAddLiquidityTx(
  ammContractId: string,
  params: AddLiquidityTxParams
): Promise<string> {
  return sdk.amm(ammContractId).buildAddLiquidityTx(params);
}

/** Build remove liquidity tx. */
export async function buildRemoveLiquidityTx(
  ammContractId: string,
  params: RemoveLiquidityTxParams
): Promise<string> {
  return sdk.amm(ammContractId).buildRemoveLiquidityTx(params);
}

// ─── Market Reads ─────────────────────────────────────────────────────────────

/** Fetch on-chain market state by its Market contract address. */
export async function fetchMarket(marketContractId: string): Promise<Market | null> {
  if (!marketContractId) return null;

  const client = sdk.market(marketContractId);
  const state = await client.getState();
  if (!state) return null;

  let yesPriceBps = 5000n;
  let yesReserves = 0n;
  let noReserves = 0n;
  let usdcReserves = 0n;

  if (state.ammContract) {
    const pool = await sdk.amm(state.ammContract).getPoolState();
    if (pool) {
      yesPriceBps = pool.yesPriceBps;
      yesReserves = pool.yesReserves;
      noReserves = pool.noReserves;
      usdcReserves = pool.usdcReserves;
    }
  }

  const market = MarketClient.toMarket(
    state,
    marketContractId,
    yesPriceBps,
    yesReserves,
    noReserves
  );
  // TVL = USDC collateral locked in the pool.
  market.tvl = fromContractAmount(usdcReserves);
  return market;
}

/** Resolve a hex market ID via the factory registry, then fetch its state. */
export async function fetchMarketById(marketIdHex: string): Promise<Market | null> {
  if (!sdk.config.contracts.factory) return null;
  const address = await sdk.factory().getMarket(marketIdHex);
  if (!address) return null;
  return fetchMarket(address);
}

/** List all market IDs (hex) from the factory. */
export async function listMarketIds(offset = 0, limit = 50): Promise<string[]> {
  if (!sdk.config.contracts.factory) return [];
  return sdk.factory().listMarkets(offset, limit);
}

/** Fetch all on-chain markets (resolves IDs → addresses → state). */
export async function fetchAllMarkets(offset = 0, limit = 50): Promise<Market[]> {
  const ids = await listMarketIds(offset, limit);
  const settled = await Promise.allSettled(ids.map((id) => fetchMarketById(id)));
  return settled
    .filter((r): r is PromiseFulfilledResult<Market | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((m): m is Market => m !== null);
}

// ─── Factory: Create Market ──────────────────────────────────────────────────

export async function buildCreateMarketTx(
  creator: string,
  params: CreateMarketParams
): Promise<string> {
  return sdk.factory().buildCreateMarketTx(creator, params);
}

// ─── Token Reads + Approvals ─────────────────────────────────────────────────

export async function getUsdcBalance(address: string): Promise<number> {
  if (!sdk.config.contracts.usdc) return 0;
  const raw = await sdk.token(sdk.config.contracts.usdc).balance(address);
  return fromContractAmount(raw);
}

export async function getOutcomeTokenBalance(
  tokenContractId: string,
  address: string
): Promise<number> {
  const raw = await sdk.token(tokenContractId).balance(address);
  return fromContractAmount(raw);
}

export async function getUsdcAllowance(
  owner: string,
  spender: string
): Promise<number> {
  if (!sdk.config.contracts.usdc) return 0;
  const raw = await sdk.token(sdk.config.contracts.usdc).allowance(owner, spender);
  return fromContractAmount(raw);
}

/** Build a USDC approve tx (lets the AMM/Factory pull USDC). */
export async function buildApproveUsdcTx(
  from: string,
  spender: string,
  amount: number,
  expirationLedger: number
): Promise<string> {
  return sdk
    .token(sdk.config.contracts.usdc)
    .buildApproveTx(from, spender, toContractAmount(amount), expirationLedger);
}

/** Build an approve tx for an outcome token (needed to sell). */
export async function buildApproveTokenTx(
  tokenContractId: string,
  from: string,
  spender: string,
  amount: number,
  expirationLedger: number
): Promise<string> {
  return sdk
    .token(tokenContractId)
    .buildApproveTx(from, spender, toContractAmount(amount), expirationLedger);
}

// ─── Submit + Explorer ───────────────────────────────────────────────────────

export async function submit(signedXdr: string): Promise<SubmitResult> {
  const server = getServer(sdk.config);
  return submitAndConfirm(server, signedXdr, sdk.config.networkPassphrase);
}

export function getExplorerTxUrl(txHash: string): string {
  return sdkGetExplorerTxUrl(sdk.config, txHash);
}

/** Current ledger sequence — used to set approve expiration. */
export async function getLatestLedger(): Promise<number> {
  const server = getServer(sdk.config);
  const ledger = await server.getLatestLedger();
  return ledger.sequence;
}
