# Polaris Prediction Market — Smart Contracts

Soroban smart contracts powering the Polaris on-chain prediction market protocol on Stellar.

## What the contracts do

Polaris is a fully on-chain prediction market where users trade YES/NO outcome tokens against
an automated market maker (AMM). Each contract plays a distinct role:

| Contract | Purpose |
|---|---|
| **market-factory** | Deploys and registers individual market instances; acts as protocol registry |
| **market** | Per-market lifecycle: initialization, expiry, resolution recording, volume tracking |
| **amm** | Constant-product AMM for YES/NO token swaps; provides buy/sell quotes and liquidity |
| **oracle** | Price feed aggregation; submits and finalizes price data with a dispute window |
| **settlement** | Claims resolution from the oracle, records outcome on the market, enables redemptions |
| **token** | SEP-41-compatible fungible token for YES, NO, and LP shares |
| **treasury** | Holds protocol fees; admin-controlled transfers |
| **shared** | Common types (`MarketStatus`, `Outcome`, `MarketParams`), errors, and math helpers |

## Folder structure

```
contracts/
├── amm/            AMM swap and liquidity contract
├── market/         Per-market state & lifecycle
├── market-factory/ Factory + registry contract
├── oracle/         Price oracle with dispute window
├── settlement/     Claim resolution + payout routing
├── shared/         Shared types, errors, constants
├── token/          SEP-41 outcome token
├── treasury/       Protocol fee treasury
└── Makefile        Build / test / deploy shortcuts
```

The Cargo workspace root is one level up (`../Cargo.toml`), so all `cargo` commands build
all contracts together and write WASM artifacts to `../target/wasm32-unknown-unknown/release/`.

## Prerequisites

- Rust stable with the `wasm32-unknown-unknown` target:
  ```bash
  rustup target add wasm32-unknown-unknown
  ```
- Stellar CLI (≥ 21):
  ```bash
  cargo install --locked stellar-cli --features opt
  ```

## Build

```bash
# From this directory
make build

# Or directly from the repo root
cargo build --target wasm32-unknown-unknown --release
```

WASM artifacts land in `../target/wasm32-unknown-unknown/release/`.

## Test

```bash
make test
# or
cargo test
```

All contracts ship with inline `#[cfg(test)]` unit tests using `soroban_sdk::testutils`.

## Format & Lint

```bash
make fmt   # cargo fmt --all
make lint  # cargo clippy -- -D warnings
```

## Deploy

```bash
export STELLAR_SECRET_KEY=S...your_secret_key...

make deploy   # deploys to Stellar Testnet
```

To deploy a specific contract manually:

```bash
stellar contract deploy \
  --wasm ../target/wasm32-unknown-unknown/release/polaris_market.wasm \
  --source $STELLAR_SECRET_KEY \
  --network testnet
```

For the full multi-contract deploy sequence (factory → tokens → AMM → market), use
the script at `../scripts/deploy/deploy-testnet.sh`.

## Required environment variables

| Variable | Description |
|---|---|
| `STELLAR_SECRET_KEY` | Stellar secret key (`S...`) for the deployer account |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (default: `https://soroban-testnet.stellar.org`) |
| `USDC_CONTRACT_ID` | USDC token contract ID on the target network |

## Network details

- **Testnet RPC:** `https://soroban-testnet.stellar.org`
- **Testnet passphrase:** `Test SDF Network ; September 2015`
- **Mainnet RPC:** `https://soroban.stellar.org`
- **Mainnet passphrase:** `Public Global Stellar Network ; September 2015`

## Frontend integration (uses `@stellar/stellar-sdk`)

These contracts are invoked from the TypeScript frontend through the typed SDK, which builds,
simulates, signs and submits Soroban transactions with **`@stellar/stellar-sdk`**:

| Integration file | Role |
|---|---|
| `../packages/sdk/src/clients/amm.ts` | `AmmClient` — `import { rpc, xdr } from "@stellar/stellar-sdk"` |
| `../packages/sdk/src/clients/factory.ts` / `market.ts` / `token.ts` | factory / market / token clients |
| `../packages/sdk/src/tx.ts`, `scval.ts` | tx build/simulate/submit + ScVal codecs (`@stellar/stellar-sdk`) |
| `../frontend/lib/stellar-sdk.ts` | `new rpc.Server(RPC_URL)` (`@stellar/stellar-sdk`) |
| `../frontend/lib/contract.ts` | `callContractFunction()` / `readContractValue()` |
| `../frontend/hooks/use-trade.ts` | trade UI → `buildBuyTx` / `buildSellTx` |

### Cross-check — `amm/src/lib.rs` ↔ frontend

| `amm/src/lib.rs` `pub fn` | on-chain method | frontend / SDK caller |
|---|---|---|
| `buy` | `"buy"` | `AmmClient.buildBuyTx` → `use-trade.ts` |
| `sell` | `"sell"` | `AmmClient.buildSellTx` → `use-trade.ts` |
| `add_liquidity_usdc` | `"add_liquidity_usdc"` | `AmmClient.buildAddLiquidityTx` |
| `remove_liquidity_usdc` | `"remove_liquidity_usdc"` | `AmmClient.buildRemoveLiquidityTx` |
| `get_buy_quote` | `"get_buy_quote"` | `AmmClient.getBuyQuote` |
| `get_pool_state` | `"get_pool_state"` | `AmmClient.getPoolState` |
| `get_reserves` | `"get_reserves"` | `AmmClient.getReserves` |

## CI/CD (`.github/workflows`)

- **`ci.yml` — Smart-contract CI:** `cargo test` + `cargo build --target wasm32-unknown-unknown --release`.
- **`ci.yml` — Frontend CI:** `npm ci` → `npm run lint` → `npm run build` → `npm run test` (`--workspace=frontend`).
- **`deploy.yml` — CD:** `deploy-contract` (`stellar contract deploy`) then `deploy-frontend` (`npm run build` → `vercel --prod`).
- **`vercel.json` — CD:** Vercel Git integration auto-deploys the frontend on every push to `main`.
