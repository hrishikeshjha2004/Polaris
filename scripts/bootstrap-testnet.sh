#!/bin/bash
# Complete testnet bootstrap: build → deploy → create markets → seed liquidity
#
# This is the single entry point for standing up the protocol from scratch.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "█████████████████████████████████████████████████████"
echo "         StellarPM — Testnet Bootstrap"
echo "█████████████████████████████████████████████████████"
echo ""

# Prerequisites check
command -v stellar >/dev/null || { echo "ERROR: stellar-cli not installed. Run: brew install stellar-cli"; exit 1; }
command -v cargo >/dev/null || { echo "ERROR: cargo not installed. See: https://rustup.rs"; exit 1; }
command -v node >/dev/null || { echo "ERROR: node not installed"; exit 1; }

if [ ! -f ".env.testnet" ]; then
  echo "ERROR: .env.testnet not found. Copy .env.example to .env.testnet and fill in:"
  echo "  DEPLOYER_SECRET_KEY=S..."
  echo "  USDC_CONTRACT_ID=C..."
  exit 1
fi

echo "Step 1/4: Deploy contracts..."
bash scripts/deploy/deploy-testnet.sh

echo ""
echo "Step 2/4: Install frontend dependencies..."
npm install --workspace=apps/web 2>&1 | tail -5

echo ""
echo "Step 3/4: Create test markets..."
bash scripts/create-test-markets.sh

echo ""
echo "Step 4/4: Seed initial liquidity..."
bash scripts/seed-liquidity.sh

echo ""
echo "█████████████████████████████████████████████████████"
echo "  ✓ Testnet bootstrap complete!"
echo "█████████████████████████████████████████████████████"
echo ""
echo "Copy env to frontend:"
echo "  cp .env.deployed apps/web/.env.local"
echo ""
echo "Start the app:"
echo "  npm run dev:web"
echo ""
echo "Start the indexer:"
echo "  cp .env.deployed backend/indexer/.env"
echo "  npm run dev:indexer"
echo ""
echo "Stellar Expert (testnet):"
echo "  https://stellar.expert/explorer/testnet"
