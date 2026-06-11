import type { Logger } from "pino";
import { prisma, type Prisma, type PrismaClient } from "@stellarpm/db";
import type { ParsedEvent } from "./event-parser";
import type { PoolSnapshot } from "./pool-reader";

type Tx = Prisma.TransactionClient;

/**
 * Extra context resolved *outside* the DB transaction (network reads must not
 * hold a pooled connection): the market this event belongs to and a fresh pool
 * snapshot used to reconcile authoritative price/reserves/TVL.
 */
export interface EventContext {
  marketId?: string | null;
  pool?: PoolSnapshot | null;
}

const BPS = 10000;

/** Coerce a possibly-string/number event field to BigInt (0 on null). */
function big(v: unknown): bigint {
  if (v === null || v === undefined || v === "") return 0n;
  try {
    return BigInt(typeof v === "number" ? Math.trunc(v) : String(v));
  } catch {
    return 0n;
  }
}

function outcome(v: unknown): "yes" | "no" {
  return v === "yes" || v === 0 || v === "Yes" ? "yes" : "no";
}

/**
 * Persists parsed chain events into Postgres via Prisma. Each event is written
 * inside a single interactive transaction: the raw event log row plus all
 * derived rows (trades, positions, settlements, …) commit atomically, so a
 * crash mid-event never leaves partial state. Re-processing the same event is
 * idempotent (events.event_id is the dedup key).
 */
export class DatabaseWriter {
  private db: PrismaClient = prisma;

  constructor(private logger: Logger) {}

  async writeEvent(event: ParsedEvent, ctx: EventContext = {}): Promise<void> {
    await this.db.$transaction(async (tx) => {
      // Idempotency guard: if we've already recorded this event, stop.
      const inserted = await tx.event.createMany({
        data: [
          {
            eventId: event.id,
            eventType: event.type,
            contractId: event.contractId,
            ledger: BigInt(event.ledger),
            timestamp: new Date(event.timestamp * 1000),
            txHash: event.txHash,
            data: event.data as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return; // already processed

      await this.routeEvent(tx, event, ctx);
    });
  }

  private async routeEvent(tx: Tx, event: ParsedEvent, ctx: EventContext): Promise<void> {
    switch (event.type) {
      case "market_created":
        return this.handleMarketCreated(tx, event);
      case "buy":
      case "sell":
      case "swap":
        return this.handleSwap(tx, event, ctx);
      case "add_liquidity":
        return this.handleAddLiquidity(tx, event, ctx);
      case "remove_liquidity":
        return this.handleRemoveLiquidity(tx, event, ctx);
      case "market_settled":
        return this.handleMarketSettled(tx, event);
      case "payout_claimed":
        return this.handlePayoutClaimed(tx, event);
      default:
        return;
    }
  }

  private async handleMarketCreated(tx: Tx, event: ParsedEvent): Promise<void> {
    const d = event.data;
    if (!d.marketId || !d.contractAddress) return;
    await tx.market.upsert({
      where: { id: d.marketId as string },
      create: {
        id: d.marketId as string,
        contractAddress: d.contractAddress as string,
        title: (d.title as string) ?? "Untitled market",
        creator: (d.creator as string) ?? "unknown",
        expiryTimestamp: new Date(Number(d.expiry ?? 0) * 1000),
        createdAt: new Date(event.timestamp * 1000),
      },
      update: {}, // market already known — leave indexed state intact
    });
  }

  private async handleSwap(tx: Tx, event: ParsedEvent, ctx: EventContext): Promise<void> {
    const d = event.data;
    const marketId = (ctx.marketId ?? (d.marketId as string)) || null;
    if (!marketId) return;

    const side = (d.side as string) ?? "buy";
    const out = outcome(d.outcome);
    // USDC value moved (in on buy, out on sell) and outcome tokens moved.
    const usdc = big(d.usdcAmount);
    const tokens = big(d.tokenAmount);
    const trader = (d.trader as string) ?? "unknown";

    await tx.trade.create({
      data: {
        marketId,
        trader,
        tokenIn: (d.tokenIn as string) ?? (side === "buy" ? "usdc" : out),
        side,
        amountIn: big(d.amountIn),
        amountOut: big(d.amountOut),
        fee: big(d.feesPaid),
        txHash: event.txHash,
        timestamp: new Date(event.timestamp * 1000),
      },
    });

    // Reconcile authoritative price/reserves/TVL + append a chart point.
    await this.reconcileMarket(tx, marketId, ctx.pool, Number(usdc) / 1e7, event.timestamp);

    // ─── Position accounting ────────────────────────────────────────────────
    // Buy: tokens flow to the trader. Sell: tokens leave. Price per token in USDC.
    const pricePerToken = tokens > 0n ? Number(usdc) / Number(tokens) : 0;
    const existing = await tx.position.findUnique({
      where: {
        marketId_userAddress_outcome: { marketId, userAddress: trader, outcome: out },
      },
    });

    if (side === "sell") {
      if (existing) {
        const newBal = existing.tokenBalance - tokens;
        await tx.position.update({
          where: { id: existing.id },
          data: { tokenBalance: newBal > 0n ? newBal : 0n },
        });
      }
      return;
    }

    // Buy: volume-weighted average cost.
    if (existing) {
      const newBal = existing.tokenBalance + tokens;
      const blended =
        newBal > 0n
          ? (Number(existing.avgPrice) * Number(existing.tokenBalance) +
              pricePerToken * Number(tokens)) /
            Number(newBal)
          : 0;
      await tx.position.update({
        where: { id: existing.id },
        data: { tokenBalance: newBal, avgPrice: blended },
      });
    } else {
      await tx.position.create({
        data: { marketId, userAddress: trader, outcome: out, tokenBalance: tokens, avgPrice: pricePerToken },
      });
    }
  }

  /**
   * Update a market's authoritative price/TVL from a fresh pool snapshot and
   * append a price-history point (powers the live chart + 24h change). Volume is
   * incremented by `volumeDelta` USDC. Safe to call with a null snapshot (volume
   * still accrues; price left unchanged).
   */
  private async reconcileMarket(
    tx: Tx,
    marketId: string,
    pool: PoolSnapshot | null | undefined,
    volumeDelta: number,
    ts: number
  ): Promise<void> {
    const data: Prisma.MarketUpdateManyMutationInput = {};
    if (volumeDelta > 0) data.volume = { increment: volumeDelta.toFixed(7) };

    let yesPct: number | null = null;
    let noPct: number | null = null;
    if (pool) {
      yesPct = +((Number(pool.yesPriceBps) / BPS) * 100).toFixed(2);
      noPct = +(100 - yesPct).toFixed(2);
      data.yesPrice = yesPct;
      data.noPrice = noPct;
      data.tvl = (Number(pool.usdcReserves) / 1e7).toFixed(7);
    }

    if (Object.keys(data).length > 0) {
      await tx.market.updateMany({ where: { id: marketId }, data });
    }

    if (pool && yesPct !== null && noPct !== null) {
      await tx.priceHistory.create({
        data: {
          marketId,
          yesPrice: yesPct,
          noPrice: noPct,
          yesReserve: pool.yesReserves,
          noReserve: pool.noReserves,
          volume: BigInt(Math.max(0, Math.round(volumeDelta * 1e7))),
          timestamp: new Date(ts * 1000),
        },
      });
    }
  }

  private async handleAddLiquidity(tx: Tx, event: ParsedEvent, ctx: EventContext): Promise<void> {
    const d = event.data;
    const marketId = (ctx.marketId ?? (d.marketId as string)) || null;
    if (!marketId || !d.provider) return;
    const lp = big(d.lpSharesMinted);
    const yes = big(d.yesAmount);
    const no = big(d.noAmount);

    await tx.liquidityEvent.create({
      data: {
        marketId,
        provider: d.provider as string,
        kind: "add",
        lpShares: lp,
        yesAmount: yes,
        noAmount: no,
        txHash: event.txHash,
        timestamp: new Date(event.timestamp * 1000),
      },
    });

    await tx.lpPosition.upsert({
      where: {
        marketId_provider: { marketId, provider: d.provider as string },
      },
      create: {
        marketId,
        provider: d.provider as string,
        lpShares: lp,
        depositedValue: yes + no,
      },
      update: {
        lpShares: { increment: lp },
        depositedValue: { increment: yes + no },
      },
    });

    // TVL/price moved — reconcile from chain (no trade volume on an LP deposit).
    await this.reconcileMarket(tx, marketId, ctx.pool, 0, event.timestamp);
  }

  private async handleRemoveLiquidity(tx: Tx, event: ParsedEvent, ctx: EventContext): Promise<void> {
    const d = event.data;
    const marketId = (ctx.marketId ?? (d.marketId as string)) || null;
    if (!marketId || !d.provider) return;
    const lp = big(d.lpShares);

    await tx.liquidityEvent.create({
      data: {
        marketId,
        provider: d.provider as string,
        kind: "remove",
        lpShares: lp,
        yesAmount: big(d.yesOut),
        noAmount: big(d.noOut),
        txHash: event.txHash,
        timestamp: new Date(event.timestamp * 1000),
      },
    });

    await tx.lpPosition.updateMany({
      where: { marketId, provider: d.provider as string },
      data: { lpShares: { decrement: lp } },
    });

    await this.reconcileMarket(tx, marketId, ctx.pool, 0, event.timestamp);
  }

  private async handleMarketSettled(tx: Tx, event: ParsedEvent): Promise<void> {
    const d = event.data;
    if (!d.marketId) return;
    const winning = outcome(d.winningOutcome);

    await tx.market.updateMany({
      where: { id: d.marketId as string },
      data: { status: "resolved", resolution: winning },
    });

    await tx.settlement.upsert({
      where: { marketId: d.marketId as string },
      create: {
        marketId: d.marketId as string,
        winningOutcome: winning,
        payoutRate: big(d.payoutRate),
        winningSupply: big(d.winningSupply),
        settledAt: new Date(event.timestamp * 1000),
      },
      update: {
        winningOutcome: winning,
        payoutRate: big(d.payoutRate),
        winningSupply: big(d.winningSupply),
      },
    });
  }

  private async handlePayoutClaimed(tx: Tx, event: ParsedEvent): Promise<void> {
    const d = event.data;
    if (!d.marketId || !d.claimant) return;
    await tx.claim.upsert({
      where: {
        marketId_claimant: {
          marketId: d.marketId as string,
          claimant: d.claimant as string,
        },
      },
      create: {
        marketId: d.marketId as string,
        claimant: d.claimant as string,
        tokensBurned: big(d.tokensBurned),
        usdcReceived: big(d.usdcReceived),
        claimedAt: new Date(event.timestamp * 1000),
      },
      update: {},
    });
  }
}
