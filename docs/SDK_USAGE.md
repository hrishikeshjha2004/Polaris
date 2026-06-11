# SDK Usage Guide

`@stellarpm/sdk` provides typed clients for all on-chain contracts.

## Installation

Already included in the monorepo. Import from `@stellarpm/sdk`.

## Quick Start

```typescript
import { createSdk, toContractAmount, fromContractAmount } from "@stellarpm/sdk";

const sdk = createSdk("testnet");  // "testnet" | "mainnet" | "localhost"
```

## Reading Pool State

```typescript
const ammClient = sdk.amm("CAMM...CONTRACT_ID");
const pool = await ammClient.getPoolState();

console.log({
  yesPricePct: Number(pool.yesPriceBps) / 100,    // e.g. 67.5%
  noPricePct: Number(pool.noPriceBps) / 100,       // e.g. 32.5%
  yesReserves: fromContractAmount(pool.yesReserves), // in USDC
  noReserves: fromContractAmount(pool.noReserves),
});
```

## Getting a Swap Quote

```typescript
const quote = await ammClient.getSwapQuote(
  yesTokenContractId,
  toContractAmount(100)  // 100 USDC
);

if (quote) {
  console.log(`You get ${fromContractAmount(quote.amountOut)} YES tokens`);
  console.log(`Price impact: ${quote.priceImpactBps / 100}%`);
}
```

## Executing a Trade (Frontend)

```typescript
import { buildSwapTx, submit } from "@/lib/contracts/client";
import { useWallet } from "@/hooks/use-wallet";

const { signTransaction } = useWallet();

// 1. Build unsigned tx
const xdr = await buildSwapTx({
  trader: walletAddress,
  tokenIn: yesTokenId,
  amountIn: toContractAmount(100),
  minAmountOut: toContractAmount(95),   // 5% slippage tolerance
  deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
});

// 2. Sign with Freighter
const signedXdr = await signTransaction(xdr);

// 3. Submit + wait for confirmation
const result = await submit(signedXdr);
console.log(`Tx: ${result.hash}`);
```

## Creating a Market

```typescript
import { buildCreateMarketTx, buildApproveUsdcTx, submit } from "@/lib/contracts/client";
import { daysFromNow, toContractAmount } from "@stellarpm/sdk";

// 1. Approve creation fee (10 USDC)
const approveXdr = await buildApproveUsdcTx(
  walletAddress,
  factoryContractId,
  10,             // 10 USDC
  999999999       // expiration ledger
);
await submit(await signTransaction(approveXdr));

// 2. Create market
const createXdr = await buildCreateMarketTx(walletAddress, {
  title: "Will BTC exceed $150k by Dec 31 2026?",
  description: "Resolves YES if BTC/USD closes above $150,000",
  category: "crypto",
  expiryTimestamp: daysFromNow(180),
  oracleSource: "BTC_USD_BINANCE",
  thresholdValue: toContractAmount(150000),
  thresholdOperator: 0,   // 0 = GT (greater than)
  initialLiquidity: 0n,
});
const result = await submit(await signTransaction(createXdr));
```

## Adding Liquidity

```typescript
import { buildAddLiquidityTx } from "@/lib/contracts/client";

const lpXdr = await buildAddLiquidityTx(ammContractId, {
  provider: walletAddress,
  yesAmount: toContractAmount(500),
  noAmount: toContractAmount(500),
  minLpOut: 0n,
});
await submit(await signTransaction(lpXdr));
```

## Reading Token Balances

```typescript
import { getUsdcBalance, getOutcomeTokenBalance } from "@/lib/contracts/client";

const usdc = await getUsdcBalance(walletAddress);            // human-readable
const yes = await getOutcomeTokenBalance(yesTokenId, walletAddress);
const no = await getOutcomeTokenBalance(noTokenId, walletAddress);
```

## Network Config

```typescript
import { getNetworkConfig, isContractsDeployed } from "@stellarpm/sdk";

const config = getNetworkConfig("testnet");
console.log(config.rpcUrl, config.contracts.factory);

// Check if contracts are deployed before making on-chain calls
if (isContractsDeployed(config)) {
  // safe to call on-chain
}
```

## ScVal Utilities

For advanced use cases (custom contract calls):

```typescript
import {
  addressToScVal,
  i128ToScVal,
  u32ToScVal,
  buildAndSimulate,
  submitAndConfirm,
  getServer,
} from "@stellarpm/sdk";

const server = getServer(config);
const { tx } = await buildAndSimulate(
  server,
  senderAddress,
  config.networkPassphrase,
  contractId,
  "my_function",
  [addressToScVal(arg1), i128ToScVal(arg2)]
);
const signedXdr = await signTransaction(tx.toXDR());
const result = await submitAndConfirm(server, signedXdr, config.networkPassphrase);
```
