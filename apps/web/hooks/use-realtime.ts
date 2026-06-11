"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import type { Market } from "@stellarpm/shared";

// ─── Realtime market updates ─────────────────────────────────────────────────
// Connects to the indexer WebSocket (NEXT_PUBLIC_WS_URL). The server persists
// every event and assigns a monotonic `seq`; we track the last seq we saw and,
// on every (re)connect, ask the server to replay anything we missed — so a
// dropped connection never loses a trade. If no WS_URL is configured we fall
// back to a local simulation for offline UI development.
//
// Events carry the AMM-reconciled price (yesPriceBps) so we can update prices
// instantly, and a marketId/ammContract so consumers can match the event to a
// market. The chain remains the source of truth: consumers also invalidate
// their queries so the authoritative values are re-read right after.

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || null;

export interface TradeActivity {
  id: string;
  marketId: string;
  marketTitle: string;
  outcome: "yes" | "no";
  side: "buy" | "sell";
  amount: number; // USDC value
  price: number; // ¢ (0-100)
  address: string;
  timestamp: number;
  optimistic?: boolean;
}

export interface LivePricePoint {
  timestamp: number; // seconds
  yesPrice: number; // 0-100
  noPrice: number; // 0-100
  volume: number; // USDC
}

// ─── Global activity feed shared across hook instances ───────────────────────

let activityFeed: TradeActivity[] = [];
const activityListeners = new Set<(trades: TradeActivity[]) => void>();

export function pushActivity(trade: TradeActivity) {
  // De-dupe: an optimistic entry is replaced by the real one (same market+tx).
  activityFeed = [trade, ...activityFeed.filter((t) => t.id !== trade.id)].slice(0, 80);
  activityListeners.forEach((fn) => fn([...activityFeed]));
}

// ─── Global live-price bus (per market) — powers the live chart ───────────────

const priceListeners = new Map<string, Set<(p: LivePricePoint) => void>>();

export function pushLivePrice(marketId: string, point: LivePricePoint) {
  priceListeners.get(marketId)?.forEach((fn) => fn(point));
}

function shortAddr(a?: string | null): string {
  if (!a) return "unknown";
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

// ─── Hook: useRealtimeActivity ────────────────────────────────────────────────

export function useRealtimeActivity() {
  const [trades, setTrades] = useState<TradeActivity[]>(activityFeed);
  useEffect(() => {
    activityListeners.add(setTrades);
    return () => {
      activityListeners.delete(setTrades);
    };
  }, []);
  return trades;
}

// ─── Hook: useLivePricePoints ─────────────────────────────────────────────────
// Accumulates live chart points for a market as trades stream in.

export function useLivePricePoints(marketId: string) {
  const [points, setPoints] = useState<LivePricePoint[]>([]);
  useEffect(() => {
    if (!marketId) return;
    const set = priceListeners.get(marketId) ?? new Set();
    const onPoint = (p: LivePricePoint) =>
      setPoints((prev) => [...prev, p].slice(-240));
    set.add(onPoint);
    priceListeners.set(marketId, set);
    return () => {
      set.delete(onPoint);
      if (set.size === 0) priceListeners.delete(marketId);
    };
  }, [marketId]);
  return points;
}

// ─── Hook: useMarketRealtime ──────────────────────────────────────────────────

interface RealtimeOptions {
  /** Called for every real chain event, e.g. to invalidate/refetch queries. */
  onEvent?: (type: string, data: Record<string, unknown>) => void;
}

const TRADE_EVENTS = new Set(["buy", "sell", "swap"]);
const num = (v: unknown) => (v == null ? 0 : Number(v));

export function useMarketRealtime(markets: Market[], opts: RealtimeOptions = {}) {
  const { updateMarket } = useAppStore();
  const [connected, setConnected] = useState(false);

  // Stable refs so the socket handlers always see current data without
  // re-opening the connection on every render.
  const marketsRef = useRef(markets);
  marketsRef.current = markets;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const lastSeqRef = useRef<string>("0");

  useEffect(() => {
    if (!WS_URL) {
      // ── Offline fallback: local simulation (no backend running) ──
      if (markets.length === 0) return;
      setConnected(true);
      const priceInterval = setInterval(() => {
        const m = marketsRef.current[Math.floor(Math.random() * marketsRef.current.length)];
        if (!m) return;
        const drift = (Math.random() - 0.49) * 1.5;
        const newYes = Math.max(5, Math.min(95, m.yesPrice + drift));
        const yesPrice = parseFloat(newYes.toFixed(1));
        const noPrice = parseFloat((100 - newYes).toFixed(1));
        updateMarket(m.id, { yesPrice, noPrice });
        pushLivePrice(m.id, {
          timestamp: Math.floor(Date.now() / 1000),
          yesPrice,
          noPrice,
          volume: 0,
        });
      }, 4000);
      return () => {
        clearInterval(priceInterval);
        setConnected(false);
      };
    }

    // ── Real WebSocket with auto-reconnect + replay ──
    let ws: WebSocket | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setConnected(true);
        reconnectAttempts = 0;
        // Resume from the last event we processed (server replays the gap).
        ws?.send(JSON.stringify({ type: "replay", since: lastSeqRef.current }));
      };

      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        // Exponential backoff, capped at 15s, with jitter.
        const delay = Math.min(15000, 500 * 2 ** reconnectAttempts) + Math.random() * 250;
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();

      ws.onmessage = (event) => {
        let msg: { type: string; data?: Record<string, unknown>; seq?: string };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.seq) lastSeqRef.current = msg.seq;
        if (msg.type === "connected") return;

        const data = msg.data ?? {};
        handleEvent(msg.type, data);
        onEventRef.current?.(msg.type, data);
      };
    };

    const matchMarket = (data: Record<string, unknown>) => {
      const marketId = data.marketId as string | undefined;
      const amm = data.ammContract as string | undefined;
      return marketsRef.current.find(
        (m) =>
          (marketId && (m.id === marketId || m.contractAddress === marketId)) ||
          (amm && m.ammContract === amm)
      );
    };

    const handleEvent = (type: string, data: Record<string, unknown>) => {
      const market = matchMarket(data);
      const marketId = market?.id ?? (data.marketId as string | undefined);

      // Reconciled price from the indexer's pool read (bps → percent).
      const yesBps = num(data.yesPriceBps);
      const hasPrice = yesBps > 0;
      const yesPrice = hasPrice ? parseFloat(((yesBps / 10000) * 100).toFixed(1)) : undefined;
      const noPrice = yesPrice != null ? parseFloat((100 - yesPrice).toFixed(1)) : undefined;

      if (market && yesPrice != null && noPrice != null) {
        const patch: Partial<Market> = { yesPrice, noPrice };
        if (data.usdcReserves != null) patch.tvl = num(data.usdcReserves) / 1e7;
        updateMarket(market.id, patch);
      }

      if (TRADE_EVENTS.has(type)) {
        const outcome: "yes" | "no" = (data.outcome as "yes" | "no") ?? "yes";
        const side: "buy" | "sell" = (data.side as "buy" | "sell") ?? "buy";
        const usdc = num(data.usdcAmount) / 1e7;
        pushActivity({
          id: (data.txHash as string) || `${marketId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          marketId: marketId ?? "",
          marketTitle: market?.title ?? "Market",
          outcome,
          side,
          amount: usdc,
          price:
            yesPrice != null
              ? outcome === "yes" ? yesPrice : 100 - yesPrice
              : market
              ? outcome === "yes" ? market.yesPrice : market.noPrice
              : 0,
          address: shortAddr(data.trader as string),
          timestamp: Date.now(),
        });
        if (marketId && yesPrice != null && noPrice != null) {
          pushLivePrice(marketId, {
            timestamp: Math.floor(Date.now() / 1000),
            yesPrice,
            noPrice,
            volume: usdc,
          });
        }
      } else if ((type === "market_settled" || type === "market_resolved") && market) {
        updateMarket(market.id, {
          status: "resolved",
          resolution: (data.winningOutcome as "yes" | "no") ?? (data.outcome as "yes" | "no"),
        });
      } else if (marketId && yesPrice != null && noPrice != null) {
        // Liquidity event with a price move — append a chart point too.
        pushLivePrice(marketId, {
          timestamp: Math.floor(Date.now() / 1000),
          yesPrice,
          noPrice,
          volume: 0,
        });
      }
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      ws = null;
    };
    // Re-open only when the WS endpoint changes (markets read via ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connected };
}

// ─── Hook: useAnimatedNumber ──────────────────────────────────────────────────

export function useAnimatedNumber(target: number, duration = 1200) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = current;
    startRef.current = null;

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(fromRef.current + (target - fromRef.current) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return current;
}
