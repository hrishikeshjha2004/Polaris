import { createSdk, toContractAmount } from "../packages/sdk/src/index";
(async () => {
  const sdk = createSdk("testnet");
  const AMM = "CD35VOFQMK3TOJDO47SG6GHV424OVOWSXFSXOX7P65HPOMPZBK3YUQ7U";
  const trader = "GDQQTTQAVBX7TUGJOZRNPP4PMQAHL6YYT7LKWAPGV2IMFOUEGDCXZLIL"; // fe_tester (funded)
  const bal = await sdk.token("CCJWR4HYAMZMICEZFX3PUTUFZTR67RIEX54MRWUXTBE3C4X7RUZZWWWZ").balance(trader);
  console.log("USDC balance (raw):", bal.toString());
  const q = await sdk.amm(AMM).getBuyQuote(true, toContractAmount(10));
  console.log("quote tokens_out (raw):", q?.amountOut?.toString(), "priceImpactBps:", q?.priceImpactBps);
  const xdr = await sdk.amm(AMM).buildBuyTx({
    trader, buyYes: true,
    usdcIn: toContractAmount(10),
    minTokensOut: 0n,
    deadline: BigInt(Math.floor(Date.now()/1000)+300),
  });
  console.log("buildBuyTx OK — XDR len:", xdr.length, "(simulation passed; single tx, no approve needed)");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
