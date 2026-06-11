/**
 * Price Feed Aggregator — fetches prices from multiple sources and computes median.
 *
 * Sources: CoinGecko (free tier), Binance, CoinMarketCap
 * Strategy: Fetch all, take median, require at least 2 matching sources.
 */

import type { Logger } from "pino";

export interface PriceData {
  medianPrice: number;
  prices: { source: string; price: number }[];
  sources: string[];
  fetchedAt: number;
}

export interface PriceFeed {
  getName(): string;
  getPrice(asset: string): Promise<number>;
}

// ─── CoinGecko Feed ───────────────────────────────────────────────────────────

class CoinGeckoFeed implements PriceFeed {
  private readonly assetIdMap: Record<string, string> = {
    BTC: "bitcoin",
    ETH: "ethereum",
    XLM: "stellar",
    SOL: "solana",
    XRP: "ripple",
    USDC: "usd-coin",
    EURC: "euro-coin",
  };

  getName() { return "CoinGecko"; }

  async getPrice(asset: string): Promise<number> {
    const id = this.assetIdMap[asset.toUpperCase()];
    if (!id) throw new Error(`Unknown asset: ${asset}`);

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

    const data = await res.json() as Record<string, { usd: number }>;
    const price = data[id]?.usd;
    if (!price) throw new Error(`No price for ${asset} from CoinGecko`);
    return price;
  }
}

// ─── Binance Feed ─────────────────────────────────────────────────────────────

class BinanceFeed implements PriceFeed {
  getName() { return "Binance"; }

  async getPrice(asset: string): Promise<number> {
    const symbol = `${asset.toUpperCase()}USDT`;
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    );
    if (!res.ok) {
      throw new Error(`Binance API error: ${res.status}`);
    }
    const data = await res.json() as { price: string };
    return parseFloat(data.price);
  }
}

// ─── CoinMarketCap Feed ───────────────────────────────────────────────────────

class CoinMarketCapFeed implements PriceFeed {
  private readonly assetSlugMap: Record<string, string> = {
    BTC: "1",
    ETH: "1027",
    XLM: "512",
    SOL: "5426",
    XRP: "52",
    USDC: "3408",
    EURC: "20641",
  };

  getName() { return "CoinMarketCap"; }

  async getPrice(asset: string): Promise<number> {
    const id = this.assetSlugMap[asset.toUpperCase()];
    if (!id) throw new Error(`Unknown asset: ${asset}`);

    const apiKey = process.env.CMC_API_KEY;
    if (!apiKey) throw new Error("CMC_API_KEY not set");

    const res = await fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?id=${id}&convert=USD`,
      { headers: { "X-CMC_PRO_API_KEY": apiKey } }
    );
    if (!res.ok) throw new Error(`CMC API error: ${res.status}`);

    const data = await res.json() as any;
    return data.data[id].quote.USD.price;
  }
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

export class PriceFeedAggregator {
  private feeds: PriceFeed[];

  constructor(private logger: Logger) {
    this.feeds = [
      new CoinGeckoFeed(),
      new BinanceFeed(),
      ...(process.env.CMC_API_KEY ? [new CoinMarketCapFeed()] : []),
    ];
  }

  async getPrice(asset: string): Promise<PriceData> {
    const results: { source: string; price: number }[] = [];
    const errors: string[] = [];

    await Promise.allSettled(
      this.feeds.map(async (feed) => {
        try {
          const price = await feed.getPrice(asset);
          results.push({ source: feed.getName(), price });
          this.logger.debug({ asset, source: feed.getName(), price }, "Price fetched");
        } catch (err) {
          errors.push(`${feed.getName()}: ${(err as Error).message}`);
          this.logger.warn({ asset, source: feed.getName(), err }, "Price feed error");
        }
      })
    );

    if (results.length < 1) {
      throw new Error(
        `All price feeds failed for ${asset}. Errors: ${errors.join(", ")}`
      );
    }

    const prices = results.map((r) => r.price).sort((a, b) => a - b);
    const medianPrice = median(prices);

    // Sanity check: if prices diverge by >5%, something is suspicious
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    if (maxPrice / minPrice > 1.05) {
      this.logger.warn(
        { asset, prices, spread: `${((maxPrice / minPrice - 1) * 100).toFixed(1)}%` },
        "Price sources diverge by >5% — investigate before submitting"
      );
    }

    return {
      medianPrice,
      prices: results,
      sources: results.map((r) => r.source),
      fetchedAt: Math.floor(Date.now() / 1000),
    };
  }
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
