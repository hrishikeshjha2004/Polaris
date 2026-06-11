#!/bin/bash
# Redeploy Polaris with Circle testnet USDC (CBIELTK6...) as collateral.
#
# Requires: deployer key already registered in stellar-cli keystore.
# No USDC needed for deployer — creation_fee=0, initial_liquidity=0.
# Users add first liquidity from the frontend.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

NETWORK="testnet"
RPC="https://soroban-testnet.stellar.org"
PASS="Test SDF Network ; September 2015"

# Circle testnet USDC SAC
USDC_CONTRACT_ID="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"

WASM_DIR="target/wasm32v1-none/release"
DEPLOYER_ADDR="$(stellar keys address deployer)"

echo "═══════════════════════════════════════════════════════"
echo "Polaris Redeploy — Circle USDC"
echo "═══════════════════════════════════════════════════════"
echo "Network:  $NETWORK"
echo "Deployer: $DEPLOYER_ADDR"
echo "USDC:     $USDC_CONTRACT_ID (Circle testnet)"
echo ""

# ─── Check WASMs ─────────────────────────────────────────────────────────────

for w in stellar_pm_treasury stellar_pm_oracle stellar_pm_settlement \
          stellar_pm_market stellar_pm_token stellar_pm_amm stellar_pm_market_factory; do
  if [ ! -f "$WASM_DIR/${w}.wasm" ]; then
    echo "Missing WASM: $WASM_DIR/${w}.wasm — run: stellar contract build"
    exit 1
  fi
done
echo "✓ WASMs found in $WASM_DIR"

# ─── Upload WASMs ─────────────────────────────────────────────────────────────

upload_wasm() {
  local name="$1" file="$2"
  printf "  Uploading %-20s " "$name..." >&2
  local hash
  hash=$(stellar contract upload --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --wasm "$file" 2>&1 | grep -v "^ℹ\|^$" | tail -1 | tr -d '"')
  printf "✓ %s\n" "$hash" >&2
  echo "$hash"
}

deploy_contract() {
  local label="$1" hash="$2"
  printf "  Deploying %-20s " "$label..." >&2
  local cid
  cid=$(stellar contract deploy --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --wasm-hash "$hash" 2>&1 | grep -v "^ℹ\|^$" | tail -1 | tr -d '"')
  printf "✓ %s\n" "$cid" >&2
  echo "$cid"
}

echo ""
echo "Uploading WASMs..."
TREASURY_HASH=$(upload_wasm "treasury"    "$WASM_DIR/stellar_pm_treasury.wasm")
ORACLE_HASH=$(upload_wasm   "oracle"      "$WASM_DIR/stellar_pm_oracle.wasm")
SETTLEMENT_HASH=$(upload_wasm "settlement" "$WASM_DIR/stellar_pm_settlement.wasm")
MARKET_HASH=$(upload_wasm   "market"      "$WASM_DIR/stellar_pm_market.wasm")
TOKEN_HASH=$(upload_wasm    "token"       "$WASM_DIR/stellar_pm_token.wasm")
AMM_HASH=$(upload_wasm      "amm"         "$WASM_DIR/stellar_pm_amm.wasm")
FACTORY_HASH=$(upload_wasm  "factory"     "$WASM_DIR/stellar_pm_market_factory.wasm")

# ─── Deploy + Init Treasury ───────────────────────────────────────────────────

echo ""
echo "Deploying contracts..."
TREASURY_ID=$(deploy_contract "Treasury" "$TREASURY_HASH")
stellar contract invoke --network "$NETWORK" --source deployer \
  --rpc-url "$RPC" --network-passphrase "$PASS" --id "$TREASURY_ID" \
  -- initialize --admin "$DEPLOYER_ADDR" 2>&1 | grep -v "^ℹ\|^$" | tail -1 >/dev/null

# ─── Deploy + Init Oracle ─────────────────────────────────────────────────────

ORACLE_ID=$(deploy_contract "Oracle" "$ORACLE_HASH")
stellar contract invoke --network "$NETWORK" --source deployer \
  --rpc-url "$RPC" --network-passphrase "$PASS" --id "$ORACLE_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --signers "[\"$DEPLOYER_ADDR\"]" \
  --threshold 1 \
  --dispute_window_secs 3600 \
  --settlement "$TREASURY_ID" 2>&1 | grep -v "^ℹ\|^$" | tail -1 >/dev/null

# ─── Deploy + Init Settlement ────────────────────────────────────────────────

SETTLEMENT_ID=$(deploy_contract "Settlement" "$SETTLEMENT_HASH")
stellar contract invoke --network "$NETWORK" --source deployer \
  --rpc-url "$RPC" --network-passphrase "$PASS" --id "$SETTLEMENT_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --oracle "$ORACLE_ID" \
  --treasury "$TREASURY_ID" \
  --usdc_token "$USDC_CONTRACT_ID" \
  --protocol_fee_bps 50 2>&1 | grep -v "^ℹ\|^$" | tail -1 >/dev/null

# Wire oracle → settlement
stellar contract invoke --network "$NETWORK" --source deployer \
  --rpc-url "$RPC" --network-passphrase "$PASS" --id "$ORACLE_ID" \
  -- update_settlement --admin "$DEPLOYER_ADDR" \
  --settlement "$SETTLEMENT_ID" 2>&1 | grep -v "^ℹ\|^$" | tail -1 >/dev/null || true

# ─── Deploy + Init Factory ────────────────────────────────────────────────────

FACTORY_ID=$(deploy_contract "Factory" "$FACTORY_HASH")
# creation_fee_usdc = 0 so deployer needs no Circle USDC to create markets
stellar contract invoke --network "$NETWORK" --source deployer \
  --rpc-url "$RPC" --network-passphrase "$PASS" --id "$FACTORY_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --creation_fee_usdc 0 \
  --usdc_token "$USDC_CONTRACT_ID" \
  --oracle "$ORACLE_ID" \
  --settlement "$SETTLEMENT_ID" \
  --treasury "$TREASURY_ID" \
  --market_wasm_hash "$MARKET_HASH" \
  --token_wasm_hash "$TOKEN_HASH" \
  --amm_wasm_hash "$AMM_HASH" 2>&1 | grep -v "^ℹ\|^$" | tail -1 >/dev/null

# ─── Create Markets ───────────────────────────────────────────────────────────

echo ""
echo "Creating markets (initial_liquidity=0 — users seed from frontend)..."
NOW=$(date +%s)

create_market() {
  local title="$1" desc="$2" expiry="$3" src="$4" thr="$5"
  printf "  Creating: %s ... " "$title" >&2
  stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" --id "$FACTORY_ID" \
    -- create_market --creator "$DEPLOYER_ADDR" \
    --params "{ \"category\": \"crypto\", \"description\": \"$desc\", \"expiry_timestamp\": $expiry, \"initial_liquidity\": \"0\", \"oracle_source\": \"$src\", \"threshold_operator\": 0, \"threshold_value\": \"$thr\", \"title\": \"$title\" }" \
    2>&1 | grep -v "^ℹ\|^$" | tail -1 >&2
  printf "✓\n" >&2
}

create_market \
  "Will BTC exceed \$100,000 before Sep 2026?" \
  "Resolves YES if Bitcoin closes above \$100k on Binance BTC/USDT before Sep 1 2026" \
  "$((NOW + 86400 * 90))" "BTC_USD_BINANCE" "1000000000000000"

create_market \
  "Will ETH hit \$5,000 by end of 2026?" \
  "Resolves YES if Ethereum closes above \$5,000 on CoinGecko before Dec 31 2026" \
  "$((NOW + 86400 * 210))" "ETH_USD_COINGECKO" "50000000000000"

create_market \
  "Will XLM exceed \$1.00 in Q3 2026?" \
  "Resolves YES if XLM closes above \$1.00 USD any time in Q3 2026" \
  "$((NOW + 86400 * 60))" "XLM_USD_COINGECKO" "10000000"

# ─── Write Env Files ──────────────────────────────────────────────────────────

ENV_CONTENT="# Polaris — Circle USDC deployment — $(date -u +%Y-%m-%dT%H:%M:%SZ)
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_FACTORY_CONTRACT_ID=$FACTORY_ID
NEXT_PUBLIC_ORACLE_CONTRACT_ID=$ORACLE_ID
NEXT_PUBLIC_SETTLEMENT_CONTRACT_ID=$SETTLEMENT_ID
NEXT_PUBLIC_TREASURY_CONTRACT_ID=$TREASURY_ID
NEXT_PUBLIC_USDC_CONTRACT_ID=$USDC_CONTRACT_ID
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_WS_URL=ws://localhost:4001

FACTORY_CONTRACT_ID=$FACTORY_ID
ORACLE_CONTRACT_ID=$ORACLE_ID
SETTLEMENT_CONTRACT_ID=$SETTLEMENT_ID
TREASURY_CONTRACT_ID=$TREASURY_ID
USDC_CONTRACT_ID=$USDC_CONTRACT_ID
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK=testnet
"

echo "$ENV_CONTENT" > ".env.deployed"
echo "$ENV_CONTENT" > "apps/web/.env.local"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ Deployment complete!"
echo "═══════════════════════════════════════════════════════"
echo "Factory:    $FACTORY_ID"
echo "Oracle:     $ORACLE_ID"
echo "Settlement: $SETTLEMENT_ID"
echo "Treasury:   $TREASURY_ID"
echo "USDC:       $USDC_CONTRACT_ID (Circle testnet)"
echo ""
echo "Next steps:"
echo "  1. Get Circle testnet USDC: https://faucet.circle.com"
echo "  2. Connect Freighter on testnet"
echo "  3. Add liquidity at /liquidity to seed the pools"
echo "  4. Trade at /markets"
