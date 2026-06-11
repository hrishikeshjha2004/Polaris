# Oracle Setup Guide

StellarPM uses a multi-signer oracle committee for market resolution.

## Architecture

```
Price Feeds (CoinGecko, Binance, CMC)
         ↓ median aggregation
Oracle Worker (backend/workers/oracle)
         ↓ signed submission
Oracle Contract (on-chain)
         ↓ threshold check (e.g. 3-of-5)
Resolution Queued → Dispute Window (1h)
         ↓ finalize_resolution()
Settlement Contract → payouts enabled
```

## Testnet Setup (Single Signer)

For testnet, the deployer is the sole oracle signer. In production, use a multi-sig committee.

```bash
# The deployer key is registered as oracle signer during deployment.
# To submit a resolution manually:

stellar contract invoke \
  --network testnet --source deployer \
  --id $ORACLE_CONTRACT_ID \
  -- submit_resolution \
  --signer "$(stellar keys address deployer)" \
  --market_id "MARKET_ID_HEX" \
  --outcome "{ \"Yes\": {} }" \
  --price_at_expiry 1500000000000000 \
  --price_source "BINANCE"

# After dispute window (1h), finalize:
stellar contract invoke \
  --network testnet --source deployer \
  --id $ORACLE_CONTRACT_ID \
  -- finalize_resolution \
  --market_id "MARKET_ID_HEX"
```

## Oracle Worker (Automated)

Start the oracle worker to auto-submit resolutions for expired markets:

```bash
# Configure
cat > backend/workers/oracle/.env <<EOF
ORACLE_CONTRACT_ID=...
SETTLEMENT_CONTRACT_ID=...
FACTORY_CONTRACT_ID=...
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK=testnet
ORACLE_SIGNER_SECRET=S...   # oracle signer key
COINGECKO_API_KEY=          # optional, public API is fine for testnet
BINANCE_BASE_URL=https://api.binance.com
CMC_API_KEY=                # optional
POLL_INTERVAL_MS=60000
EOF

npm run dev --workspace=backend/workers/oracle
```

The oracle worker:
1. Polls all markets every 60 seconds
2. For expired markets: fetches price from CoinGecko + Binance + CMC
3. Takes median of available sources
4. Submits resolution to Oracle contract
5. Calls `finalize_resolution` after dispute window

## Price Sources

| Asset | CoinGecko ID | Binance Pair |
|-------|-------------|--------------|
| BTC   | bitcoin     | BTCUSDT      |
| ETH   | ethereum    | ETHUSDT      |
| XLM   | stellar     | XLMUSDT      |
| SOL   | solana      | SOLUSDT      |
| XRP   | ripple      | XRPUSDT      |

## Adding Oracle Signers (Production)

```bash
# Add a new signer (requires admin auth)
stellar contract invoke \
  --network testnet --source deployer \
  --id $ORACLE_CONTRACT_ID \
  -- add_signer \
  --admin "$(stellar keys address deployer)" \
  --signer "NEW_SIGNER_ADDRESS"

# Update threshold (requires admin auth)
stellar contract invoke \
  --network testnet --source deployer \
  --id $ORACLE_CONTRACT_ID \
  -- set_threshold \
  --admin "$(stellar keys address deployer)" \
  --threshold 3
```

## Dispute Flow

During the 1-hour dispute window, anyone can raise a dispute:

```typescript
// On-chain dispute (via stellar CLI or SDK)
stellar contract invoke \
  --network testnet --source user \
  --id $ORACLE_CONTRACT_ID \
  -- dispute \
  --disputer "USER_ADDRESS" \
  --market_id "MARKET_ID_HEX" \
  --reason "Price data from wrong exchange"
```

In v1, disputes are advisory — they log but don't block auto-finalization. Admin must manually override disputed resolutions.

## Security Model

- Only authorized signers can submit resolutions
- Threshold requirement (e.g. 3-of-5) prevents single point of failure
- Dispute window allows community review before finalization
- Prices are median-aggregated from multiple feeds to prevent manipulation
- All submissions are immutable on-chain
