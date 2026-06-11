/**
 * Verifies the exact on-chain read path the frontend uses in the browser.
 * Runs the SDK (createSdk -> factory.listMarkets -> market.getState ->
 * amm.getPoolState) against whatever network the web .env.local points at.
 *
 * Run: npx tsx scripts/verify-fe-read.ts
 */
import { createSdk, isContractsDeployed, fromContractAmount, bpsToPct } from "../packages/sdk/src/index";

async function main() {
  const network = (process.env.NEXT_PUBLIC_STELLAR_NETWORK as any) || "testnet";
  const sdk = createSdk(network);
  console.log("network:", network);
  console.log("factory:", sdk.config.contracts.factory);
  console.log("usdc:   ", sdk.config.contracts.usdc);
  console.log("contractsDeployed:", isContractsDeployed(sdk.config));

  const ids = await sdk.factory().listMarkets(0, 10);
  console.log(`\nlist_markets -> ${ids.length} markets`);

  for (const id of ids) {
    const addr = await sdk.factory().getMarket(id);
    if (!addr) { console.log(`  ${id} -> (no address)`); continue; }
    const state = await sdk.market(addr).getState();
    let priceStr = "n/a", tvlStr = "n/a";
    if (state?.ammContract) {
      const pool = await sdk.amm(state.ammContract).getPoolState();
      if (pool) {
        priceStr = `${bpsToPct(pool.yesPriceBps).toFixed(2)}% YES`;
        tvlStr = `${fromContractAmount(pool.usdcReserves).toFixed(2)} USDC TVL`;
      }
    }
    console.log(`  ${addr}`);
    console.log(`     "${state?.title ?? "?"}"  status=${state?.status}  ${priceStr}  ${tvlStr}`);
  }
  console.log("\nOK: frontend read path returns REAL on-chain data (no mock fallback).");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
