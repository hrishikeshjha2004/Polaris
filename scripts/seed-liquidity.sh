#!/bin/bash
# Seed initial USDC liquidity into all markets.
#
# With the USDC-collateral AMM, an LP just deposits USDC and the AMM mints the
# matched YES+NO complete set into the pool. No pre-held outcome tokens needed.
#
# Prerequisites:
#   - Contracts deployed and markets created
#   - Deployer holds USDC (NEXT_PUBLIC_USDC_CONTRACT_ID)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source .env.deployed 2>/dev/null || source .env.testnet

NETWORK="${STELLAR_NETWORK:-testnet}"
RPC="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
PASS="Test SDF Network ; September 2015"
FACTORY_ID="${FACTORY_CONTRACT_ID:?FACTORY_CONTRACT_ID required}"
USDC_ID="${USDC_CONTRACT_ID:?USDC_CONTRACT_ID required}"
DEPLOYER_ADDR="$(stellar keys address deployer)"

# USDC per market (scaled 1e7). Default 8,000 USDC.
SEED_USDC="${SEED_USDC:-80000000000}"

echo "Seeding USDC liquidity on $NETWORK..."

MARKET_COUNT=$(stellar contract invoke --network "$NETWORK" --source deployer \
  --rpc-url "$RPC" --network-passphrase "$PASS" \
  --id "$FACTORY_ID" -- market_count 2>&1 | grep -E "^[0-9]+$" | head -1)
echo "Found $MARKET_COUNT market(s)"

for i in $(seq 0 $((MARKET_COUNT - 1))); do
  echo ""
  echo "Seeding market index $i..."

  MARKET_ID=$(stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --id "$FACTORY_ID" -- list_markets --offset "$i" --limit 1 2>&1 | grep -v "^ℹ\|^$" | tail -1 | tr -d '[]" ')

  MARKET_ADDR=$(stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --id "$FACTORY_ID" -- get_market --market_id "$MARKET_ID" 2>&1 | grep -E "C[A-Z2-7]{55}" -o | head -1)

  AMM_ADDR=$(stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --id "$MARKET_ADDR" -- get_amm 2>&1 | grep -E "C[A-Z2-7]{55}" -o | head -1)

  echo "  Market: $MARKET_ADDR  AMM: $AMM_ADDR"

  # Approve AMM to pull USDC
  stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --id "$USDC_ID" -- approve \
    --from "$DEPLOYER_ADDR" --spender "$AMM_ADDR" \
    --amount "$SEED_USDC" --expiration_ledger 3000000 2>&1 | tail -1 >/dev/null

  # Add USDC liquidity (AMM mints the matched YES+NO set)
  stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" \
    --id "$AMM_ADDR" -- add_liquidity_usdc \
    --provider "$DEPLOYER_ADDR" --usdc_amount "$SEED_USDC" --min_lp_out 0 2>&1 | grep -v "^ℹ\|^$" | tail -1

  echo "  ✓ Seeded $((SEED_USDC / 10000000)) USDC"
done

echo ""
echo "✓ Liquidity seeding complete!"
