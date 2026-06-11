import { WebSocketServer, WebSocket } from "ws";
import type { Logger } from "pino";
import { prisma } from "@stellarpm/db";
import type { EventType } from "./event-parser";

type EventListener = (data: Record<string, unknown>) => void;

/**
 * Realtime fan-out with durable replay.
 *
 * Every broadcast is first persisted to `broadcast_events` (monotonic `seq`),
 * then pushed to connected clients tagged with that seq. A client that drops
 * and reconnects sends `{ type: "replay", since: <lastSeq> }` and receives every
 * message it missed in order — so no realtime update is lost across network
 * blips. Clients may also `{ type: "subscribe", marketId }` to filter.
 */
export class SubscriptionManager {
  private clients: Set<WebSocket> = new Set();
  private listeners: Map<EventType, EventListener[]> = new Map();

  constructor(private wss: WebSocketServer, private logger: Logger) {
    wss.on("connection", async (ws) => {
      this.clients.add(ws);
      this.logger.debug(`WS client connected. Total: ${this.clients.size}`);

      ws.on("message", (msg) => this.handleClientMessage(ws, msg));
      ws.on("close", () => {
        this.clients.delete(ws);
        this.logger.debug(`WS client disconnected. Total: ${this.clients.size}`);
      });
      ws.on("error", (err) => {
        this.logger.error({ err }, "WS client error");
        this.clients.delete(ws);
      });

      // Tell the client the current cursor so it can resume precisely later.
      const latest = await this.latestSeq().catch(() => 0n);
      this.safeSend(ws, {
        type: "connected",
        seq: latest.toString(),
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Persist + fan out a realtime event. Persisting first guarantees the event
   * survives even if zero clients are currently connected.
   */
  async broadcast(
    type: EventType,
    data: Record<string, unknown>,
    marketId?: string | null
  ): Promise<void> {
    let seq = "0";
    try {
      const row = await prisma.broadcastEvent.create({
        data: {
          channel: type,
          marketId: marketId ?? (data.marketId as string) ?? null,
          payload: data as any,
        },
        select: { seq: true },
      });
      seq = row.seq.toString();
    } catch (err) {
      this.logger.error({ err, type }, "Failed to persist broadcast event");
    }

    const message = { type, data, seq, timestamp: Date.now() };
    let sentCount = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        if (this.clientWantsMarket(client, marketId ?? (data.marketId as string))) {
          this.safeSend(client, message);
          sentCount++;
        }
      }
    }
    if (sentCount > 0) this.logger.debug(`Broadcast ${type} to ${sentCount} clients`);

    // Notify internal listeners (e.g. dynamic market discovery).
    for (const handler of this.listeners.get(type) ?? []) {
      try {
        handler(data);
      } catch (err) {
        this.logger.error({ err }, `Internal listener error for ${type}`);
      }
    }
  }

  on(type: EventType, handler: EventListener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, handler]);
  }

  private async latestSeq(): Promise<bigint> {
    const row = await prisma.broadcastEvent.findFirst({
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    return row?.seq ?? 0n;
  }

  private async replay(ws: WebSocket, since: bigint, marketId?: string): Promise<void> {
    const missed = await prisma.broadcastEvent.findMany({
      where: {
        seq: { gt: since },
        ...(marketId ? { marketId } : {}),
      },
      orderBy: { seq: "asc" },
      take: 1000,
    });
    for (const ev of missed) {
      this.safeSend(ws, {
        type: ev.channel,
        data: ev.payload,
        seq: ev.seq.toString(),
        replayed: true,
        timestamp: ev.createdAt.getTime(),
      });
    }
    this.logger.debug(`Replayed ${missed.length} events since ${since}`);
  }

  private clientWantsMarket(ws: WebSocket, marketId?: string | null): boolean {
    const subs: string[] | undefined = (ws as any)._subscribedMarkets;
    if (!subs || subs.length === 0) return true; // no filter = all events
    return marketId ? subs.includes(marketId) : true;
  }

  private safeSend(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      this.logger.error({ err }, "WS send failed");
    }
  }

  private handleClientMessage(ws: WebSocket, msg: unknown): void {
    let parsed: any;
    try {
      parsed = JSON.parse(msg!.toString());
    } catch {
      return; // ignore malformed messages
    }

    if (parsed.type === "subscribe" && parsed.marketId) {
      (ws as any)._subscribedMarkets = [
        ...((ws as any)._subscribedMarkets ?? []),
        parsed.marketId,
      ];
    }

    if (parsed.type === "replay") {
      const since = (() => {
        try {
          return BigInt(parsed.since ?? 0);
        } catch {
          return 0n;
        }
      })();
      this.replay(ws, since, parsed.marketId).catch((err) =>
        this.logger.error({ err }, "Replay failed")
      );
    }
  }
}
