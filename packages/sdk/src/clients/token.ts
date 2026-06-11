/**
 * Token contract client — works for USDC (standard SEP-41) and
 * our custom OutcomeToken (YES/NO/LP) which extends the SEP-41 interface.
 */

import { SorobanRpc, xdr } from "@stellar/stellar-sdk";
import { simulateReadCall } from "../tx";
import {
  addressToScVal,
  i128ToScVal,
  scValToI128,
  u32ToScVal,
} from "../scval";
import type { NetworkConfig } from "../config";
import { getServer } from "../tx";

export class TokenClient {
  private server: SorobanRpc.Server;

  constructor(
    private config: NetworkConfig,
    private contractId: string
  ) {
    this.server = getServer(config);
  }

  async balance(address: string): Promise<bigint> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "balance",
      [addressToScVal(address)]
    );
    if (!result.success) {
      throw new Error(`balance() simulation failed: ${result.error ?? "unknown"}`);
    }
    if (!result.returnValue) return 0n;
    return scValToI128(result.returnValue);
  }

  async allowance(from: string, spender: string): Promise<bigint> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "allowance",
      [addressToScVal(from), addressToScVal(spender)]
    );
    if (!result.success || !result.returnValue) return 0n;
    return scValToI128(result.returnValue);
  }

  async totalSupply(): Promise<bigint> {
    const result = await simulateReadCall(
      this.server,
      this.config.networkPassphrase,
      this.contractId,
      "total_supply",
      []
    );
    if (!result.success || !result.returnValue) return 0n;
    return scValToI128(result.returnValue);
  }

  /**
   * Build approve transaction XDR.
   * User must sign + submit via submitAndConfirm.
   */
  async buildApproveTx(
    from: string,
    spender: string,
    amount: bigint,
    expirationLedger: number
  ): Promise<string> {
    const { buildAndSimulate } = await import("../tx");
    const { tx } = await buildAndSimulate(
      this.server,
      from,
      this.config.networkPassphrase,
      this.contractId,
      "approve",
      [
        addressToScVal(from),
        addressToScVal(spender),
        i128ToScVal(amount),
        u32ToScVal(expirationLedger),
      ]
    );
    return tx.toXDR();
  }
}
