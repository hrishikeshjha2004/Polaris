/**
 * ScVal encoding/decoding helpers for Soroban contract calls.
 *
 * Soroban arguments must be encoded as XDR ScVal before being passed to
 * contract operations. This module provides ergonomic wrappers.
 */

import {
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";

// ─── Encoders ─────────────────────────────────────────────────────────────────

export function addressToScVal(address: string): xdr.ScVal {
  return new Address(address).toScVal();
}

export function i128ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

export function u128ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u128" });
}

export function u32ToScVal(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: "u32" });
}

export function u64ToScVal(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "u64" });
}

export function boolToScVal(value: boolean): xdr.ScVal {
  return xdr.ScVal.scvBool(value);
}

export function stringToScVal(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: "string" });
}

export function bytesNToScVal(hex: string): xdr.ScVal {
  const bytes = Buffer.from(hex, "hex");
  return xdr.ScVal.scvBytes(bytes);
}

/** Encode the Outcome enum: 0 = Yes, 1 = No */
export function outcomeToScVal(outcome: "yes" | "no"): xdr.ScVal {
  return xdr.ScVal.scvU32(outcome === "yes" ? 0 : 1);
}

/** Encode a struct/map as a ScMap for MarketParams */
export function marketParamsToScVal(params: {
  title: string;
  description: string;
  category: string;
  expiry_timestamp: bigint;
  oracle_source: string;
  threshold_value: bigint;
  threshold_operator: number;
  initial_liquidity: bigint;
}): xdr.ScVal {
  return nativeToScVal(
    {
      title: params.title,
      description: params.description,
      category: params.category,
      expiry_timestamp: params.expiry_timestamp,
      oracle_source: params.oracle_source,
      threshold_value: params.threshold_value,
      threshold_operator: params.threshold_operator,
      initial_liquidity: params.initial_liquidity,
    },
    {
      type: {
        title: { type: "string" },
        description: { type: "string" },
        category: { type: "string" },
        expiry_timestamp: { type: "u64" },
        oracle_source: { type: "string" },
        threshold_value: { type: "i128" },
        threshold_operator: { type: "u32" },
        initial_liquidity: { type: "i128" },
      },
    }
  );
}

// ─── Decoders ─────────────────────────────────────────────────────────────────

export function scValToAddress(val: xdr.ScVal): string {
  return Address.fromScVal(val).toString();
}

export function scValToI128(val: xdr.ScVal): bigint {
  return scValToNative(val) as bigint;
}

export function scValToU32(val: xdr.ScVal): number {
  return scValToNative(val) as number;
}

export function scValToU64(val: xdr.ScVal): bigint {
  return scValToNative(val) as bigint;
}

export function scValToString(val: xdr.ScVal): string {
  return scValToNative(val) as string;
}

export function scValToBytes(val: xdr.ScVal): string {
  const bytes = scValToNative(val) as Buffer | Uint8Array;
  return Buffer.from(bytes).toString("hex");
}

export function scValToOutcome(val: xdr.ScVal): "yes" | "no" {
  const n = scValToNative(val) as number;
  return n === 0 ? "yes" : "no";
}

export function scValToMarketStatus(
  val: xdr.ScVal
): "open" | "expired" | "resolved" | "closed" {
  const n = scValToNative(val) as number;
  return (["open", "expired", "resolved", "closed"][n] as
    | "open"
    | "expired"
    | "resolved"
    | "closed") ?? "open";
}

/** Parse a simulation result's return value from XDR base64 */
export function parseReturnValue<T>(
  xdrBase64: string,
  decoder: (val: xdr.ScVal) => T
): T {
  const scVal = xdr.ScVal.fromXDR(xdrBase64, "base64");
  return decoder(scVal);
}

/** Decode a simulation error string for display */
export function decodeSimulationError(error: string): string {
  try {
    const scVal = xdr.ScVal.fromXDR(error, "base64");
    return JSON.stringify(scValToNative(scVal));
  } catch {
    return error;
  }
}
