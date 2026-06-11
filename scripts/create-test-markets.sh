#!/bin/bash
# Create test markets on testnet for development/demo.
#
# Creating a market deploys + initializes a Market, AMM, and YES/NO/LP tokens.
# (Set creation_fee_usdc=0 at factory init to skip the USDC approval step.)
#
# Prerequisites: contracts deployed, .env.deployed loaded, deployer key registered.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

source .env.deployed 2>/dev/null || source .env.testnet

NETWORK="${STELLAR_NETWORK:-testnet}"
RPC="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
PASS="Test SDF Network ; September 2015"
FACTORY_ID="${FACTORY_CONTRACT_ID:?FACTORY_CONTRACT_ID required}"
DEPLOYER_ADDR="$(stellar keys address deployer)"
NOW=$(date +%s)

# create_market params: i128 fields are JSON strings, u64/u32 are integers.
create_market() {
  local title="$1" desc="$2" expiry="$3" src="$4" thr="$5"
  echo -n "  Creating: $title ... "
  local mid
  mid=$(stellar contract invoke --network "$NETWORK" --source deployer \
    --rpc-url "$RPC" --network-passphrase "$PASS" --id "$FACTORY_ID" \
    -- create_market --creator "$DEPLOYER_ADDR" \
    --params "{ \"category\": \"crypto\", \"description\": \"$desc\", \"expiry_timestamp\": $expiry, \"initial_liquidity\": \"0\", \"oracle_source\": \"$src\", \"threshold_operator\": 0, \"threshold_value\": \"$thr\", \"title\": \"$title\" }" \
    2>&1 | grep -v "^ℹ\|^$" | tail -1)
  echo "✓ $mid"
}

echo "Creating test markets on $NETWORK (factory $FACTORY_ID)..."
echo ""

create_market \
  "Will BTC exceed \$100,000 before Sep 2026?" \
  "Resolves YES if Bitcoin closes above \$100,000 on Binance BTC/USDT before September 1, 2026" \
  "$((NOW + 86400 * 90))" "BTC_USD_BINANCE" "1000000000000000"

create_market \
  "Will ETH hit \$5,000 by end of 2026?" \
  "Resolves YES if Ethereum closes above \$5,000 on CoinGecko before December 31, 2026" \
  "$((NOW + 86400 * 210))" "ETH_USD_COINGECKO" "50000000000000"

create_market \
  "Will XLM exceed \$1.00 in Q3 2026?" \
  "Resolves YES if Stellar Lumens closes above \$1.00 USD any time in Q3 2026" \
  "$((NOW + 86400 * 60))" "XLM_USD_COINGECKO" "10000000"

echo ""
echo "✓ Test markets created. Next: bash scripts/seed-liquidity.sh"
