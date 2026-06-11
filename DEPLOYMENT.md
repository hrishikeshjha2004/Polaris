# StellarPM — Deployment Guide

**Version:** 1.0.0

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.75+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| wasm32 target | latest | `rustup target add wasm32-unknown-unknown` |
| stellar-cli | 21+ | `cargo install stellar-cli --features opt` |
| Node.js | 20+ | `nvm install 20` |
| PostgreSQL | 15+ | `brew install postgresql@15` |
| Freighter | latest | Chrome extension from freighter.app |

---

## 1. Local Development Setup

```bash
# Clone and enter the repo
git clone <repo-url>
cd stellarPM

# Install Node dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your values

# Start PostgreSQL
createdb stellarpm

# Run database migrations
psql stellarpm < backend/database/migrations/001_initial_schema.sql

# Build smart contracts
cargo build --release --target wasm32-unknown-unknown

# Run contract tests
cargo test --all

# Start frontend + indexer
npm run dev
```

The frontend will be at http://localhost:3000  
The indexer WebSocket at ws://localhost:4001

---

## 2. Testnet Deployment

### 2.1 Fund your deployer account

```bash
# Generate a new keypair for deployment
stellar keys generate deployer --network testnet

# Get your address
stellar keys address deployer

# Fund via Stellar Friendbot
curl "https://friendbot.stellar.org?addr=$(stellar keys address deployer)"
```

### 2.2 Get testnet USDC

For testing, deploy a mock USDC token or use the official testnet USDC:
```
USDC Testnet Contract: CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

### 2.3 Configure environment

```bash
# Set your deployer secret key in .env.testnet
cp .env.example .env.testnet
# Edit .env.testnet: set DEPLOYER_SECRET_KEY, USDC_CONTRACT_ID
```

### 2.4 Run deployment

```bash
npm run deploy:testnet
# or
bash scripts/deploy/deploy-testnet.sh
```

After deployment, contract addresses are saved to `deployments/testnet.json`.

### 2.5 Update frontend config

Copy addresses from `deployments/testnet.json` to `.env.local`:
```
NEXT_PUBLIC_FACTORY_CONTRACT_ID=<from deployments/testnet.json>
NEXT_PUBLIC_ORACLE_CONTRACT_ID=<from deployments/testnet.json>
...
```

---

## 3. Create a Test Market

After deployment, create your first market via CLI:

```bash
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $FACTORY_CONTRACT_ID \
  -- create_market \
  --creator $(stellar keys address deployer) \
  --params '{
    "title": "Will BTC exceed $150k by Dec 31, 2026?",
    "description": "Resolves YES if BTC/USD closes above $150,000 on Dec 31, 2026",
    "category": "crypto_price",
    "expiry_timestamp": 1767225600,
    "oracle_source": "BTC_USD_COINGECKO",
    "threshold_value": 1500000000000000,
    "threshold_operator": 0,
    "initial_liquidity": 1000000000
  }'
```

---

## 4. Production Deployment (Mainnet)

> ⚠️ Never deploy to mainnet without completing a security audit.

### Mainnet Pre-Flight Checklist

- [ ] All contract tests pass
- [ ] External security audit completed
- [ ] Multi-sig admin setup (minimum 3-of-5)
- [ ] Oracle committee established (minimum 5 signers, threshold 3)
- [ ] Frontend domain with HTTPS
- [ ] Monitoring and alerting configured
- [ ] Incident response runbook prepared
- [ ] Treasury multi-sig configured
- [ ] Rate limiting on API
- [ ] CDN and DDoS protection

### Mainnet Deployment Steps

1. Update `scripts/deploy/deploy-testnet.sh` → `deploy-mainnet.sh` with:
   - `--network mainnet`
   - Production network passphrase
   - Higher fee limits
   - Multi-sig admin address

2. Run with mainnet deployer:
```bash
bash scripts/deploy/deploy-mainnet.sh
```

---

## 5. Oracle Worker Setup

The oracle worker is a cron-like service that submits resolutions.

```bash
# Install oracle worker dependencies
npm install --workspace=backend/workers/oracle

# Set oracle signer key in .env
ORACLE_SIGNER_SECRET_KEY=S...

# Start oracle worker
npm run dev --workspace=backend/workers/oracle
```

For production, run as a systemd service or Docker container with restart policy.

---

## 6. Environment Variables Reference

See `.env.example` for full documentation of all required environment variables.

---

## 7. Monitoring

### Health Checks
- Frontend: `GET /api/health` → `{ status: "ok", ledger: <latest> }`
- Indexer: monitor WebSocket connection count and last indexed ledger
- Oracle: monitor oracle submission latency per market

### Key Alerts
- Oracle submission delayed >30 minutes after expiry
- Indexer lag >100 ledgers
- Treasury balance unexpected change
- Failed transaction rate >1%

---

## 8. Contract Upgrades

Contract upgrades require:
1. Upload new WASM hash
2. Admin governance vote (post-governance launch)
3. Timelock period (48h minimum)
4. Execute upgrade via admin multisig

```bash
# Upload new WASM
stellar contract upload --network mainnet --source admin --wasm <new-wasm>

# Factory stores WASM hashes — update for future market deployments
stellar contract invoke --id $FACTORY_ID -- update_market_wasm \
  --admin $ADMIN_ADDR \
  --market_wasm <new-hash>
```
