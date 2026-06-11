/**
 * Lightweight on-chain pool reader for the indexer.
 *
 * AMM trade/liquidity events tell us *that* a pool changed, but not its new
 * price or reserves. After each such event we simulate `get_pool_state` against
 * the AMM contract to get the authoritative post-trade numbers, then persist
 * them. This is the "event → reconcile read → store" pattern: events are the
 * trigger, the chain is the source of truth.
 *
 * Self-contained (uses only @stellar/stellar-sdk, already a dependency) so the
 * indexer's `tsc` build needs no cross-package TypeScript sources.
 */

import {
  Account,
  Contract,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
} from "@stellar/stellar-sdk";
import type { Logger } from "pino";

// Read-only account used purely to build simulation envelopes (never signed).
const DUMMY_ACCOUNT_ID = "GBJKCLZVXMIINNZLMWCHWM4HMFAZFRE7MI34RW7LB5GGDZM7L432JJG7";

export interface PoolSnapshot {
  yesReserves: bigint;
  noReserves: bigint;
  usdcReserves: bigint;
  lpTotalSupply: bigint;
  yesPriceBps: bigint;
  noPriceBps: bigint;
}

function asBig(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && v !== "") {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export class PoolReader {
  private passphrase: string;

  constructor(
    private server: SorobanRpc.Server,
    private logger: Logger,
    passphrase?: string
  ) {
    this.passphrase =
      passphrase ||
      process.env.STELLAR_NETWORK_PASSPHRASE ||
      Networks.TESTNET;
  }

  /**
   * Simulate `get_pool_state` on an AMM contract. Returns null on any failure
   * (caller should treat the market price as unchanged rather than crash the
   * poll loop).
   */
  async getPoolState(ammContract: string): Promise<PoolSnapshot | null> {
    try {
      const account = new Account(DUMMY_ACCOUNT_ID, "0");
      const contract = new Contract(ammContract);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.passphrase,
      })
        .addOperation(contract.call("get_pool_state"))
        .setTimeout(30)
        .build();

      const sim = await this.server.simulateTransaction(tx);
      if (SorobanRpc.Api.isSimulationError(sim)) {
        this.logger.warn({ ammContract, err: sim.error }, "Pool sim error");
        return null;
      }
      const ok = sim as SorobanRpc.Api.SimulateTransactionSuccessResponse;
      const retval = ok.result?.retval;
      if (!retval) return null;

      // PoolState is an ScMap; scValToNative gives a plain object with snake_case
      // keys and BigInt/number values.
      const native = scValToNative(retval) as Record<string, unknown>;
      return {
        yesReserves: asBig(native.yes_reserves),
        noReserves: asBig(native.no_reserves),
        usdcReserves: asBig(native.usdc_reserves),
        lpTotalSupply: asBig(native.lp_total_supply),
        yesPriceBps: asBig(native.yes_price_bps),
        noPriceBps: asBig(native.no_price_bps),
      };
    } catch (err) {
      this.logger.warn({ ammContract, err }, "Pool read failed");
      return null;
    }
  }
}
