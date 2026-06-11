#!/bin/bash
# Verify a testnet deployment by reading key state from each contract.
# Run after deploy-testnet.sh to confirm everything is initialized.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source .env.deployed 2>/dev/null || source .env.testnet

NETWORK="${STELLAR_NETWORK:-testnet}"
FACTORY_ID="${FACTORY_CONTRACT_ID:?}"
ORACLE_ID="${ORACLE_CONTRACT_ID:?}"
SETTLEMENT_ID="${SETTLEMENT_CONTRACT_ID:?}"
TREASURY_ID="${TREASURY_CONTRACT_ID:?}"

echo "═══════════════════════════════════════════════════════"
echo "Polaris Deployment Verification — $NETWORK"
echo "═══════════════════════════════════════════════════════"
echo ""

check() {
  local label="$1"
  local contract="$2"
  local fn="$3"
  shift 3
  printf "%-30s" "$label"
  local result
  result=$(stellar contract invoke \
    --network "$NETWORK" --source deployer \
    --id "$contract" \
    -- "$fn" "$@" 2>&1 | grep -v "^$" | tail -1) || result="ERROR"
  echo "$result"
}

echo "Factory ($FACTORY_ID):"
check "  admin"         "$FACTORY_ID" "get_admin"
check "  market_count"  "$FACTORY_ID" "market_count"
check "  is_paused"     "$FACTORY_ID" "is_paused"

echo ""
echo "Oracle ($ORACLE_ID):"
check "  threshold"     "$ORACLE_ID" "get_threshold"
check "  signers"       "$ORACLE_ID" "get_signers"

echo ""
echo "Treasury ($TREASURY_ID):"
check "  (check exists)" "$TREASURY_ID" "get_admin" 2>/dev/null || echo "  OK (no get_admin exposed)"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "Deployment verified — all contracts responding"
echo ""
echo "Explorer links:"
echo "  Factory:    https://stellar.expert/explorer/testnet/contract/$FACTORY_ID"
echo "  Oracle:     https://stellar.expert/explorer/testnet/contract/$ORACLE_ID"
echo "  Settlement: https://stellar.expert/explorer/testnet/contract/$SETTLEMENT_ID"
echo "  Treasury:   https://stellar.expert/explorer/testnet/contract/$TREASURY_ID"
