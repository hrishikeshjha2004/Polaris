# Local Development Setup

Run StellarPM entirely locally with mock data (no contracts needed).

## Quick Start

```bash
# Install dependencies
npm install

# Start frontend only (uses mock data, no blockchain required)
npm run dev:web
```

Frontend at http://localhost:3000. All UI works with simulated data.

## Full Local Stack (with real contracts)

Requires Docker for the local Soroban sandbox.

```bash
# 1. Start local Stellar node
docker run --rm -p 8000:8000 \
  stellar/quickstart:testing \
  --standalone --enable-soroban-rpc

# 2. Configure for localhost
cat > apps/web/.env.local <<EOF
NEXT_PUBLIC_STELLAR_NETWORK=localhost
NEXT_PUBLIC_SOROBAN_RPC_URL=http://localhost:8000/soroban/rpc
NEXT_PUBLIC_HORIZON_URL=http://localhost:8000
EOF

# 3. Build + deploy contracts locally
cargo build --release --target wasm32-unknown-unknown

stellar keys generate deployer --network standalone
stellar keys fund deployer --network standalone

bash scripts/deploy/deploy-local.sh    # (same as deploy-testnet.sh with --network standalone)

# 4. Create test data
bash scripts/create-test-markets.sh
bash scripts/seed-liquidity.sh

# 5. Start all services
npm run dev
```

## Mock Data Mode (default)

When `NEXT_PUBLIC_FACTORY_CONTRACT_ID` is not set, the app uses mock data defined in `apps/web/lib/mock-data.ts`.

- All pages render with realistic simulated markets
- Trades show simulated confirmation with fake tx hash
- Prices update via simulated drift in `hooks/use-realtime.ts`
- No wallet or blockchain interaction required

## Database Setup (for Indexer)

```bash
# PostgreSQL via Docker
docker run --rm -p 5432:5432 \
  -e POSTGRES_USER=stellarpm \
  -e POSTGRES_PASSWORD=stellarpm \
  -e POSTGRES_DB=stellarpm \
  postgres:15

# Run migrations
psql postgresql://stellarpm:stellarpm@localhost:5432/stellarpm \
  -f backend/database/migrations/001_initial_schema.sql

# Configure indexer
cat > backend/indexer/.env <<EOF
DATABASE_URL=postgresql://stellarpm:stellarpm@localhost:5432/stellarpm
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
FACTORY_CONTRACT_ID=...
ORACLE_CONTRACT_ID=...
SETTLEMENT_CONTRACT_ID=...
WS_PORT=4001
POLL_INTERVAL_MS=5000
EOF

npm run dev:indexer
```

## Development Workflow

```
Code change → auto-reload (Next.js HMR)
Contract change → cargo build → redeploy
```

TypeScript check:
```bash
cd apps/web && npx tsc --noEmit
```

Contract tests:
```bash
cargo test
```
