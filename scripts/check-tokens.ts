/**
 * Verifies that YES/NO token addresses are populated in each market
 * and that balance reads work.
 */
import { createSdk, fromContractAmount } from "../packages/sdk/src/index";

async function main() {
  const sdk = createSdk("testnet");
  const ids = await sdk.factory().listMarkets(0, 10);

  for (const id of ids) {
    const addr = await sdk.factory().getMarket(id);
    const state = await sdk.market(addr!).getState();
    if (!state) { console.log("NO STATE for", addr); continue; }

    console.log("\n" + state.title.slice(0, 45));
    console.log("  Market contract:", addr);
    console.log("  AMM contract:   ", state.ammContract);
    console.log("  YES token:      ", state.yesToken);
    console.log("  NO  token:      ", state.noToken);
    console.log("  LP  token:      ", state.lpToken);

    // Verify balance reads work (AMM's own balance of YES tokens as a sanity check)
    const yesBal = await sdk.token(state.yesToken).balance(state.ammContract);
    const noBal  = await sdk.token(state.noToken).balance(state.ammContract);
    console.log("  AMM YES balance:", fromContractAmount(yesBal).toFixed(4), "(pool reserve check)");
    console.log("  AMM NO  balance:", fromContractAmount(noBal).toFixed(4));
  }
}
main().catch(console.error);
