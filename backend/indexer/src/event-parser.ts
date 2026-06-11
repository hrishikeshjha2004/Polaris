import { xdr, scValToNative, Address } from "@stellar/stellar-sdk";
import type { SorobanRpc } from "@stellar/stellar-sdk";
import type { Logger } from "pino";

export type EventType =
  | "market_created"
  | "add_liquidity"
  | "remove_liquidity"
  | "swap"
  | "buy"
  | "sell"
  | "oracle_submission"
  | "resolution_queued"
  | "resolution_finalized"
  | "market_settled"
  | "payout_claimed"
  | "market_expired"
  | "market_resolved";

export interface ParsedEvent {
  id: string;
  type: EventType;
  contractId: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  data: Record<string, unknown>;
}

const EVENT_MAP: Record<string, EventType> = {
  market_created: "market_created",
  add_liquidity: "add_liquidity",
  remove_liquidity: "remove_liquidity",
  // The AMM contract emits "buy"/"sell" (see contracts/amm/src/lib.rs); keep a
  // legacy "swap" alias for any older deployment.
  buy: "buy",
  sell: "sell",
  swap: "swap",
  oracle_submission: "oracle_submission",
  resolution_queued: "resolution_queued",
  resolution_finalized: "resolution_finalized",
  market_settled: "market_settled",
  payout_claimed: "payout_claimed",
  market_expired: "market_expired",
  market_resolved: "market_resolved",
};

export class EventParser {
  constructor(private logger: Logger) {}

  parseEvent(event: SorobanRpc.Api.EventResponse): ParsedEvent | null {
    try {
      // event.topic is an array of XDR base64 strings
      const rawTopics: string[] = event.topic as unknown as string[];
      const symbolStr = this.xdrToSymbol(rawTopics[0]);
      const eventType = EVENT_MAP[symbolStr];

      if (!eventType) return null;

      // In stellar-sdk v12 contractId is a Contract instance; normalise to the
      // C... address string. For AMM events (buy/sell/liquidity) this IS the
      // pool address — the only link back to a market, since those events carry
      // no market id in their topics.
      const contractId = event.contractId ? event.contractId.toString() : "";

      const data = this.parseEventData(
        eventType,
        rawTopics,
        event.value as unknown as string,
        contractId
      );

      return {
        id: event.id,
        type: eventType,
        contractId,
        ledger: event.ledger,
        timestamp: event.ledgerClosedAt
          ? Math.floor(new Date(event.ledgerClosedAt).getTime() / 1000)
          : 0,
        txHash: event.txHash,
        data,
      };
    } catch (err) {
      this.logger.warn({ err, eventId: event.id }, "Failed to parse event");
      return null;
    }
  }

  // ─── XDR Decoders ─────────────────────────────────────────────────────────

  private xdrToSymbol(xdrBase64: string): string {
    try {
      const val = xdr.ScVal.fromXDR(xdrBase64, "base64");
      switch (val.switch().name) {
        case "scvSymbol": return val.sym().toString();
        case "scvString": return val.str().toString();
        default: return String(scValToNative(val) ?? "");
      }
    } catch {
      return xdrBase64;
    }
  }

  private xdrToNative(xdrBase64: string): unknown {
    try {
      const val = xdr.ScVal.fromXDR(xdrBase64, "base64");
      return scValToNative(val);
    } catch {
      return null;
    }
  }

  private xdrToAddress(xdrBase64: string): string | null {
    try {
      const val = xdr.ScVal.fromXDR(xdrBase64, "base64");
      return Address.fromScVal(val).toString();
    } catch {
      return null;
    }
  }

  private xdrToHex(xdrBase64: string): string | null {
    try {
      const val = xdr.ScVal.fromXDR(xdrBase64, "base64");
      const bytes = val.bytes();
      return bytes ? Buffer.from(bytes).toString("hex") : null;
    } catch {
      return null;
    }
  }

  private xdrToTuple(xdrBase64: string): unknown[] {
    try {
      const val = xdr.ScVal.fromXDR(xdrBase64, "base64");
      const vec = val.vec();
      return vec ? vec.map((v) => scValToNative(v)) : [scValToNative(val)];
    } catch {
      return [];
    }
  }

  private xdrToStruct(xdrBase64: string): Record<string, unknown> {
    try {
      const val = xdr.ScVal.fromXDR(xdrBase64, "base64");
      const map = val.map();
      if (!map) return {};
      const result: Record<string, unknown> = {};
      for (const entry of map) {
        const key =
          entry.key().sym()?.toString() ??
          entry.key().str()?.toString() ??
          String(scValToNative(entry.key()));
        result[key] = scValToNative(entry.val());
      }
      return result;
    } catch {
      return {};
    }
  }

  // ─── Event-Specific Decoders ───────────────────────────────────────────────

  private parseEventData(
    type: EventType,
    rawTopics: string[],  // XDR base64 strings
    valueXdr: string,     // XDR base64 string
    ammContract: string   // emitting contract (the AMM pool for trade/LP events)
  ): Record<string, unknown> {
    switch (type) {
      case "market_created": {
        // topics: [sym("market_created"), creator_address]
        // value: MarketCreatedEvent { market_id, creator, contract_address, title, expiry }
        const struct = this.xdrToStruct(valueXdr);
        const marketIdRaw = struct["market_id"];
        return {
          creator: rawTopics[1] ? this.xdrToAddress(rawTopics[1]) : null,
          marketId: marketIdRaw
            ? Buffer.from(marketIdRaw as Uint8Array).toString("hex")
            : null,
          contractAddress: struct["contract_address"] ?? null,
          title: struct["title"] ?? null,
          expiry: struct["expiry"] ?? null,
        };
      }

      case "buy": {
        // topics: [sym("buy"), trader_address]
        // value: (buy_yes: bool, usdc_in: i128, tokens_out: i128, total_fee: i128)
        const tuple = this.xdrToTuple(valueXdr);
        const buyYes = tuple[0] === true || tuple[0] === 1;
        return {
          ammContract,
          trader: rawTopics[1] ? this.xdrToAddress(rawTopics[1]) : null,
          side: "buy",
          outcome: buyYes ? "yes" : "no",
          // USDC paid in / outcome tokens received.
          usdcAmount: tuple[1] != null ? String(tuple[1]) : "0",
          tokenAmount: tuple[2] != null ? String(tuple[2]) : "0",
          amountIn: tuple[1] != null ? String(tuple[1]) : "0",
          amountOut: tuple[2] != null ? String(tuple[2]) : "0",
          feesPaid: tuple[3] != null ? String(tuple[3]) : "0",
        };
      }

      case "sell": {
        // topics: [sym("sell"), trader_address]
        // value: (sell_yes: bool, tokens_in: i128, usdc_out: i128, total_fee: i128)
        const tuple = this.xdrToTuple(valueXdr);
        const sellYes = tuple[0] === true || tuple[0] === 1;
        return {
          ammContract,
          trader: rawTopics[1] ? this.xdrToAddress(rawTopics[1]) : null,
          side: "sell",
          outcome: sellYes ? "yes" : "no",
          // Outcome tokens sold / USDC received.
          tokenAmount: tuple[1] != null ? String(tuple[1]) : "0",
          usdcAmount: tuple[2] != null ? String(tuple[2]) : "0",
          amountIn: tuple[1] != null ? String(tuple[1]) : "0",
          amountOut: tuple[2] != null ? String(tuple[2]) : "0",
          feesPaid: tuple[3] != null ? String(tuple[3]) : "0",
        };
      }

      case "swap": {
        // Legacy alias: [sym("swap"), trader] / (token_in, amount_in, amount_out, fee)
        const tuple = this.xdrToTuple(valueXdr);
        return {
          ammContract,
          trader: rawTopics[1] ? this.xdrToAddress(rawTopics[1]) : null,
          side: "buy",
          tokenIn: tuple[0] ?? null,
          usdcAmount: tuple[1] != null ? String(tuple[1]) : "0",
          tokenAmount: tuple[2] != null ? String(tuple[2]) : "0",
          amountIn: tuple[1] != null ? String(tuple[1]) : "0",
          amountOut: tuple[2] != null ? String(tuple[2]) : "0",
          feesPaid: tuple[3] != null ? String(tuple[3]) : "0",
        };
      }

      case "add_liquidity": {
        // topics: [sym("add_liquidity"), provider_address]
        // value: (usdc_amount, usdc_amount, lp_minted)
        const tuple = this.xdrToTuple(valueXdr);
        return {
          ammContract,
          provider: rawTopics[1] ? this.xdrToAddress(rawTopics[1]) : null,
          yesAmount: tuple[0] ? String(tuple[0]) : null,
          noAmount: tuple[1] ? String(tuple[1]) : null,
          lpSharesMinted: tuple[2] ? String(tuple[2]) : null,
        };
      }

      case "remove_liquidity": {
        // topics: [sym("remove_liquidity"), provider_address]
        // value: (lp_shares, usdc_out, residual)
        const tuple = this.xdrToTuple(valueXdr);
        return {
          ammContract,
          provider: rawTopics[1] ? this.xdrToAddress(rawTopics[1]) : null,
          lpShares: tuple[0] ? String(tuple[0]) : null,
          yesOut: tuple[1] ? String(tuple[1]) : null,
          noOut: tuple[2] ? String(tuple[2]) : null,
        };
      }

      case "oracle_submission": {
        // topics: [sym("oracle_submission"), market_id_bytes]
        // value: (signer, outcome, price_at_expiry)
        const tuple = this.xdrToTuple(valueXdr);
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
          signer: tuple[0] ?? null,
          outcome: tuple[1] === 0 || tuple[1] === "Yes" ? "yes" : "no",
          price: tuple[2] ? String(tuple[2]) : null,
        };
      }

      case "resolution_queued": {
        // topics: [sym("resolution_queued"), market_id_bytes]
        // value: (outcome, dispute_window_end)
        const tuple = this.xdrToTuple(valueXdr);
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
          outcome: tuple[0] === 0 || tuple[0] === "Yes" ? "yes" : "no",
          disputeWindowEnd: tuple[1] ? String(tuple[1]) : null,
        };
      }

      case "resolution_finalized": {
        // topics: [sym("resolution_finalized"), market_id_bytes]
        // value: (outcome, final_price)
        const tuple = this.xdrToTuple(valueXdr);
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
          outcome: tuple[0] === 0 || tuple[0] === "Yes" ? "yes" : "no",
          finalPrice: tuple[1] ? String(tuple[1]) : null,
        };
      }

      case "market_expired": {
        // topics: [sym("market_expired"), market_id_bytes]
        // value: ()
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
        };
      }

      case "market_resolved": {
        // topics: [sym("market_resolved"), market_id_bytes]
        // value: Outcome
        const outcome = this.xdrToNative(valueXdr);
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
          outcome: outcome === 0 || outcome === "Yes" ? "yes" : "no",
        };
      }

      case "market_settled": {
        const tuple = this.xdrToTuple(valueXdr);
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
          winningOutcome: tuple[0] === 0 ? "yes" : "no",
          payoutRate: tuple[1] ? String(tuple[1]) : null,
          winningSupply: tuple[2] ? String(tuple[2]) : null,
        };
      }

      case "payout_claimed": {
        const tuple = this.xdrToTuple(valueXdr);
        return {
          marketId: rawTopics[1] ? this.xdrToHex(rawTopics[1]) : null,
          claimant: tuple[0] ?? null,
          tokensBurned: tuple[1] ? String(tuple[1]) : null,
          usdcReceived: tuple[2] ? String(tuple[2]) : null,
        };
      }

      default:
        return {};
    }
  }
}
