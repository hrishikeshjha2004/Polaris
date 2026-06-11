/**
 * Seed the database from REAL on-chain state.
 *
 * Discovers every market via the factory, reads each market's state and AMM
 * pool, and upserts the live metadata + a baseline price-history point. No mock
 * data — if the chain is unreachable the seed simply inserts nothing.
 *
 * Run: npm run seed --workspace=packages/db
 */
import {
  createSdk,
  bpsToPct,
  fromContractAmount,
  type NetworkName,
} from "../../sdk/src/index";
import { prisma, connectWithRetry } from "../src/client";

async function main() {
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ||
    process.env.STELLAR_NETWORK ||
    "testnet") as NetworkName;
  const sdk = createSdk(network);

  await connectWithRetry();
  console.log(`Seeding from ${network}; factory=${sdk.config.contracts.factory}`);

  if (!sdk.config.contracts.factory) {
    throw new Error("No factory contract configured — set FACTORY_CONTRACT_ID");
  }

  const ids = await sdk.factory().listMarkets(0, 100);
  console.log(`Discovered ${ids.length} markets on-chain`);

  let seeded = 0;
  for (const idHex of ids) {
    const addr = await sdk.factory().getMarket(idHex);
    if (!addr) continue;
    const state = await sdk.market(addr).getState();
    if (!state) continue;

    let yesPrice = 50,
      noPrice = 50,
      tvl = 0,
      yesReserve = 0n,
      noReserve = 0n;
    if (state.ammContract) {
      const pool = await sdk.amm(state.ammContract).getPoolState();
      if (pool) {
        yesPrice = Number(bpsToPct(pool.yesPriceBps).toFixed(2));
        noPrice = Number((100 - yesPrice).toFixed(2));
        tvl = fromContractAmount(pool.usdcReserves);
        yesReserve = pool.yesReserves;
        noReserve = pool.noReserves;
      }
    }

    const data = {
      contractAddress: addr,
      ammContract: state.ammContract || null,
      yesToken: state.yesToken || null,
      noToken: state.noToken || null,
      lpToken: state.lpToken || null,
      title: state.title,
      description: state.description || null,
      category: state.category || "crypto_price",
      creator: state.creator,
      expiryTimestamp: new Date(Number(state.expiryTimestamp) * 1000),
      status: state.status,
      yesPrice,
      noPrice,
      volume: fromContractAmount(state.totalVolume),
      tvl,
      oracleSource: state.oracleSource || null,
      thresholdValue: state.thresholdValue,
      thresholdOperator: state.thresholdOperator,
      createdAt: new Date(Number(state.createdAt) * 1000),
    };

    await prisma.market.upsert({
      where: { id: idHex },
      create: { id: idHex, ...data },
      update: data,
    });

    await prisma.priceHistory.create({
      data: {
        marketId: idHex,
        yesPrice,
        noPrice,
        yesReserve,
        noReserve,
        volume: 0n,
      },
    });

    seeded++;
    console.log(`  ✓ ${state.title}  (${yesPrice}% YES, ${tvl.toFixed(2)} USDC TVL)`);
  }

  console.log(`Seed complete: ${seeded} markets.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
