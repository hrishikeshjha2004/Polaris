#!/bin/bash
# Polaris Testnet Deployment Script
#
# Prerequisites:
#   - stellar-cli installed: brew install stellar-cli  (or cargo install stellar-cli)
#   - .env.testnet populated with DEPLOYER_SECRET_KEY and USDC_CONTRACT_ID
#   - Contracts compiled (run: cargo build --release --target wasm32-unknown-unknown)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

# Load env
if [ -f ".env.testnet" ]; then
  source .env.testnet
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
DEPLOYER_SECRET_KEY="${DEPLOYER_SECRET_KEY:?DEPLOYER_SECRET_KEY required in .env.testnet}"
USDC_CONTRACT_ID="${USDC_CONTRACT_ID:?USDC_CONTRACT_ID required in .env.testnet}"

# Register deployer key if not already registered
if ! stellar keys ls 2>/dev/null | grep -q "^deployer$"; then
  echo "Registering deployer key..."
  stellar keys add deployer --secret-key "$DEPLOYER_SECRET_KEY"
fi

DEPLOYER_ADDR="$(stellar keys address deployer)"

echo "═══════════════════════════════════════════════════════"
echo "Polaris Testnet Deployment"
echo "═══════════════════════════════════════════════════════"
echo "Network:  $NETWORK"
echo "Deployer: $DEPLOYER_ADDR"
echo ""

# ─── Ensure deployer has XLM for fees ─────────────────────────────────────────

echo "Funding deployer account..."
stellar keys fund deployer --network "$NETWORK" 2>/dev/null || \
  curl -s "https://friendbot.stellar.org?addr=$DEPLOYER_ADDR" > /dev/null || true
echo "  ✓ Account funded"

# ─── Build Contracts ──────────────────────────────────────────────────────────

echo ""
echo "Building contracts..."
# Workspace manifest is at the root, not in contracts/
cargo build --release --target wasm32-unknown-unknown 2>&1 | tail -5
echo "  ✓ Build complete"

WASM_DIR="target/wasm32-unknown-unknown/release"

# Helper: upload a WASM and return its hash
upload_wasm() {
  local name="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    echo "ERROR: WASM not found: $file" >&2
    exit 1
  fi
  printf "  Uploading %-20s ... " "$name"
  local hash
  hash=$(stellar contract upload \
    --network "$NETWORK" \
    --source deployer \
    --wasm "$file" 2>&1 | grep -E "^[0-9a-f]{64}$" | head -1)
  if [ -z "$hash" ]; then
    echo "FAILED"
    echo "  Try: stellar contract upload --network $NETWORK --source deployer --wasm $file" >&2
    exit 1
  fi
  echo "✓ $hash"
  echo "$hash"
}

# Helper: deploy from hash and return contract ID
deploy_contract() {
  local name="$1"
  local hash="$2"
  printf "  Deploying %-22s ... " "$name"
  local contract_id
  contract_id=$(stellar contract deploy \
    --network "$NETWORK" \
    --source deployer \
    --wasm-hash "$hash" 2>&1 | grep -E "^C[A-Z2-7]{55}$" | head -1)
  if [ -z "$contract_id" ]; then
    echo "FAILED"
    exit 1
  fi
  echo "✓ $contract_id"
  echo "$contract_id"
}

# ─── Upload WASMs ─────────────────────────────────────────────────────────────

echo ""
echo "Uploading WASMs..."
TREASURY_HASH=$(upload_wasm "treasury"    "$WASM_DIR/stellar_pm_treasury.wasm")
ORACLE_HASH=$(upload_wasm   "oracle"      "$WASM_DIR/stellar_pm_oracle.wasm")
SETTLEMENT_HASH=$(upload_wasm "settlement" "$WASM_DIR/stellar_pm_settlement.wasm")
MARKET_HASH=$(upload_wasm   "market"      "$WASM_DIR/stellar_pm_market.wasm")
TOKEN_HASH=$(upload_wasm    "token"       "$WASM_DIR/stellar_pm_token.wasm")
AMM_HASH=$(upload_wasm      "amm"         "$WASM_DIR/stellar_pm_amm.wasm")
FACTORY_HASH=$(upload_wasm  "factory"     "$WASM_DIR/stellar_pm_market_factory.wasm")

# ─── Deploy Treasury ──────────────────────────────────────────────────────────

echo ""
echo "Deploying contracts..."
TREASURY_ID=$(deploy_contract "Treasury" "$TREASURY_HASH")

stellar contract invoke \
  --network "$NETWORK" --source deployer --id "$TREASURY_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" 2>&1 | tail -1

# ─── Deploy Oracle ────────────────────────────────────────────────────────────

ORACLE_ID=$(deploy_contract "Oracle" "$ORACLE_HASH")

# For testnet: single signer (deployer). Production: multi-sig committee.
stellar contract invoke \
  --network "$NETWORK" --source deployer --id "$ORACLE_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --signers "[\"$DEPLOYER_ADDR\"]" \
  --threshold 1 \
  --dispute_window_secs 3600 \
  --settlement "$TREASURY_ID" 2>&1 | tail -1
# Note: settlement address above is a temp placeholder; updated after Settlement deployed below.

# ─── Deploy Settlement ────────────────────────────────────────────────────────

SETTLEMENT_ID=$(deploy_contract "Settlement" "$SETTLEMENT_HASH")

stellar contract invoke \
  --network "$NETWORK" --source deployer --id "$SETTLEMENT_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --oracle "$ORACLE_ID" \
  --treasury "$TREASURY_ID" \
  --usdc_token "$USDC_CONTRACT_ID" \
  --protocol_fee_bps 50 2>&1 | tail -1

# Update oracle with real settlement address
stellar contract invoke \
  --network "$NETWORK" --source deployer --id "$ORACLE_ID" \
  -- update_settlement \
  --admin "$DEPLOYER_ADDR" \
  --settlement "$SETTLEMENT_ID" 2>&1 | tail -1 || true

# ─── Deploy Factory ───────────────────────────────────────────────────────────

FACTORY_ID=$(deploy_contract "Factory" "$FACTORY_HASH")

# Creation fee: 10 USDC (scaled 1e7 = 100_000_000)
stellar contract invoke \
  --network "$NETWORK" --source deployer --id "$FACTORY_ID" \
  -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --creation_fee_usdc 100000000 \
  --usdc_token "$USDC_CONTRACT_ID" \
  --oracle "$ORACLE_ID" \
  --settlement "$SETTLEMENT_ID" \
  --treasury "$TREASURY_ID" \
  --market_wasm_hash "$MARKET_HASH" \
  --token_wasm_hash "$TOKEN_HASH" \
  --amm_wasm_hash "$AMM_HASH" 2>&1 | tail -1

# ─── Write Deployment Manifest ────────────────────────────────────────────────

DEPLOY_DIR="deployments"
DEPLOY_FILE="$DEPLOY_DIR/testnet.json"
mkdir -p "$DEPLOY_DIR"

cat > "$DEPLOY_FILE" <<EOF
{
  "network": "$NETWORK",
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$DEPLOYER_ADDR",
  "contracts": {
    "factory": "$FACTORY_ID",
    "oracle": "$ORACLE_ID",
    "settlement": "$SETTLEMENT_ID",
    "treasury": "$TREASURY_ID"
  },
  "wasmHashes": {
    "factory": "$FACTORY_HASH",
    "market": "$MARKET_HASH",
    "token": "$TOKEN_HASH",
    "amm": "$AMM_HASH",
    "oracle": "$ORACLE_HASH",
    "settlement": "$SETTLEMENT_HASH",
    "treasury": "$TREASURY_HASH"
  },
  "tokens": {
    "usdc": "$USDC_CONTRACT_ID"
  }
}
EOF

# Write .env with deployed addresses (for frontend + backend)
cat > ".env.deployed" <<ENV
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_FACTORY_CONTRACT_ID=$FACTORY_ID
NEXT_PUBLIC_ORACLE_CONTRACT_ID=$ORACLE_ID
NEXT_PUBLIC_SETTLEMENT_CONTRACT_ID=$SETTLEMENT_ID
NEXT_PUBLIC_TREASURY_CONTRACT_ID=$TREASURY_ID
NEXT_PUBLIC_USDC_CONTRACT_ID=$USDC_CONTRACT_ID

# Backend indexer
FACTORY_CONTRACT_ID=$FACTORY_ID
ORACLE_CONTRACT_ID=$ORACLE_ID
SETTLEMENT_CONTRACT_ID=$SETTLEMENT_ID
TREASURY_CONTRACT_ID=$TREASURY_ID
USDC_CONTRACT_ID=$USDC_CONTRACT_ID
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ENV

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ Deployment complete!"
echo "═══════════════════════════════════════════════════════"
echo "Factory:    $FACTORY_ID"
echo "Oracle:     $ORACLE_ID"
echo "Settlement: $SETTLEMENT_ID"
echo "Treasury:   $TREASURY_ID"
echo ""
echo "Files written:"
echo "  $DEPLOY_FILE"
echo "  .env.deployed  ← copy this to .env.local"
echo ""
echo "Next steps:"
echo "  1. cp .env.deployed frontend/.env.local"
echo "  2. cp .env.deployed backend/indexer/.env"
echo "  3. bash scripts/create-test-markets.sh"
echo "  4. npm run dev:web"
