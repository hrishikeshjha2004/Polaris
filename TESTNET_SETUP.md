# Testnet Setup Guide

Deploy Polaris to Stellar testnet from scratch.

## Prerequisites

```bash
# Rust + wasm32 target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI
brew install stellar-cli    # macOS
# or: cargo install stellar-cli

# Node.js 20+
brew install node
```

## 1. Configure Environment

```bash
cp .env.example .env.testnet
```

Edit `.env.testnet`:
- `DEPLOYER_SECRET_KEY` — your Stellar secret key (`S...`). Generate one:
  ```bash
  stellar keys generate deployer --network testnet
  stellar keys show deployer   # shows the secret key
  ```
- `USDC_CONTRACT_ID` — leave as default (Circle testnet USDC)

## 2. Deploy Contracts

```bash
bash scripts/deploy/deploy-testnet.sh
```

This will:
1. Fund the deployer account via Friendbot
2. Compile all 8 Soroban contracts
3. Upload WASMs to testnet
4. Deploy Treasury → Oracle → Settlement → Factory
5. Initialize each contract
6. Write addresses to `deployments/testnet.json` and `.env.deployed`

## 3. Configure Frontend

```bash
cp .env.deployed apps/web/.env.local
cp .env.deployed backend/indexer/.env
```

## 4. Create Test Markets + Seed Liquidity

```bash
bash scripts/create-test-markets.sh
bash scripts/seed-liquidity.sh
```

Or run all at once:
```bash
bash scripts/bootstrap-testnet.sh
```

## 5. Start the App

```bash
# Terminal 1: Frontend
npm run dev:web

# Terminal 2: Indexer (optional — app uses mock data without it)
npm run dev:indexer

# Terminal 3: Backend API (optional)
npm run dev:api
```

Frontend is at: http://localhost:3000

## 6. Test with Freighter

1. Install [Freighter Wallet](https://www.freighter.app/) browser extension
2. Switch Freighter to **Testnet**
3. Import/create a testnet account
4. Fund it at [Friendbot](https://friendbot.stellar.org/?addr=YOUR_ADDRESS)
5. Connect wallet on the app and trade

## Verify Deployment

```bash
bash scripts/verify-deployment.sh
```

## Contract Addresses

After deployment, addresses are in `deployments/testnet.json`.

View on Stellar Expert: https://stellar.expert/explorer/testnet

## Troubleshooting

**"Simulation failed"** — Make sure the contract has enough ledger budget. Try increasing the fee in `packages/sdk/src/tx.ts`.

**"NOT_FOUND" on getAccount** — The source account doesn't exist on testnet. Fund it via Friendbot.

**WASM not found** — Run `cargo build --release --target wasm32-unknown-unknown` first.

**Duplicate initialization** — Contract was already initialized. Deploy a fresh instance.
