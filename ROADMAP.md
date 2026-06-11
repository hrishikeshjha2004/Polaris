# StellarPM — Implementation Roadmap

**Version:** 1.0.0

---

## Phase Overview

| Phase | Name | Duration | Status |
|-------|------|----------|--------|
| 0 | Foundation & Planning | Week 1 | ✅ Complete |
| 1 | Core Contracts + Wallet | Weeks 2-4 | 🔄 In Progress |
| 2 | AMM + Liquidity | Weeks 5-7 | ⏳ Planned |
| 3 | Oracle + Settlement | Weeks 8-10 | ⏳ Planned |
| 4 | Frontend + Indexer | Weeks 11-14 | ⏳ Planned |
| 5 | Security + Production | Weeks 15-18 | ⏳ Planned |

---

## Phase 0: Foundation & Planning ✅

- [x] PRD.md written
- [x] ARCHITECTURE.md written
- [x] CONTRACTS.md written
- [x] SECURITY.md written
- [x] ROADMAP.md written
- [x] Monorepo scaffolding
- [x] CI/CD skeleton
- [x] Development environment setup

---

## Phase 1: Core Contracts + Wallet

### Milestone 1.1 — Monorepo Setup (Day 1-3)
- [ ] Initialize Rust workspace with Cargo.toml
- [ ] Initialize Next.js app with TypeScript + TailwindCSS + shadcn/ui
- [ ] Initialize packages (sdk, stellar-client, ui, shared)
- [ ] Initialize backend (indexer, workers)
- [ ] Configure ESLint, Prettier, Husky pre-commit hooks
- [ ] Configure GitHub Actions CI

### Milestone 1.2 — Wallet Integration (Day 4-7)
- [ ] Integrate Stellar Wallet Kit
- [ ] Freighter wallet connect / disconnect
- [ ] Network detection (testnet vs mainnet)
- [ ] Balance display (XLM + USDC)
- [ ] Transaction signing flow
- [ ] Wallet state in Zustand

### Milestone 1.3 — Treasury Contract (Day 8-10)
- [ ] Treasury contract: deposit, withdraw, balance
- [ ] Admin access control
- [ ] Unit tests
- [ ] Deploy to testnet

### Milestone 1.4 — Outcome Token Contracts (Day 11-14)
- [ ] Implement SEP-0041 Soroban token interface
- [ ] YES token contract
- [ ] NO token contract
- [ ] LP share token contract
- [ ] Mint/burn restricted to authorized caller
- [ ] Unit tests
- [ ] Deploy to testnet

### Milestone 1.5 — Market Factory Contract (Day 15-21)
- [ ] MarketFactory contract skeleton
- [ ] Market registration storage
- [ ] Market creation fee enforcement
- [ ] Deploy child market contracts (WASM upload + instance deploy)
- [ ] List/get market functions
- [ ] Admin controls (pause, fee update)
- [ ] Integration tests
- [ ] Deploy to testnet

### Milestone 1.6 — Market Contract (Day 22-28)
- [ ] Market state storage (title, desc, expiry, status)
- [ ] Lifecycle state machine (OPEN → EXPIRED → RESOLVED → CLOSED)
- [ ] Route buy/sell to AMM
- [ ] Expire function (callable after expiry timestamp)
- [ ] Integration tests
- [ ] Connect to Factory

**Phase 1 Deliverable:** Factory creates markets with YES/NO tokens on testnet. Wallet connects. Basic market list shows on frontend.

---

## Phase 2: AMM + Liquidity

### Milestone 2.1 — AMM Core Logic (Day 29-35)
- [ ] Constant product AMM implementation
- [ ] Swap function with fee deduction
- [ ] Fee routing (LP share + protocol treasury)
- [ ] Price oracle (from reserves)
- [ ] Slippage protection
- [ ] Invariant checks

### Milestone 2.2 — Liquidity Provider System (Day 36-42)
- [ ] Add liquidity (deposit YES+NO → mint LP shares)
- [ ] Remove liquidity (burn LP shares → receive YES+NO)
- [ ] LP share accounting
- [ ] Fee accrual to pool
- [ ] LP APY calculation

### Milestone 2.3 — AMM Integration Tests (Day 43-45)
- [ ] Test: swap YES→NO, NO→YES
- [ ] Test: buy YES with USDC
- [ ] Test: add/remove liquidity
- [ ] Test: fee accumulation
- [ ] Test: edge cases (zero liquidity, max slippage breach)
- [ ] Test: price manipulation scenarios

### Milestone 2.4 — Trade UI (Day 46-52)
- [ ] Trade panel component (buy/sell YES/NO)
- [ ] Price display and probability bar
- [ ] Price impact warning
- [ ] Slippage settings
- [ ] Swap confirmation modal
- [ ] Transaction status toasts

### Milestone 2.5 — LP Dashboard UI (Day 53-56)
- [ ] LP deposit/withdraw interface
- [ ] Pool stats (TVL, volume, fees earned)
- [ ] LP position display
- [ ] Fee APY estimate

**Phase 2 Deliverable:** Full AMM trading operational on testnet. Users can buy/sell YES/NO tokens with USDC. LPs can provide/withdraw liquidity.

---

## Phase 3: Oracle + Settlement

### Milestone 3.1 — Oracle Contract (Day 57-63)
- [ ] Oracle contract with signer registry
- [ ] Multi-signer submission logic
- [ ] Threshold consensus mechanism
- [ ] Dispute window logic
- [ ] Finalization function
- [ ] Admin: add/remove signers, update threshold

### Milestone 3.2 — Oracle Worker Service (Day 64-70)
- [ ] Price feed abstraction (CoinGecko, Binance, CMC)
- [ ] Multi-source aggregation (median)
- [ ] Market expiry monitor
- [ ] Auto-submission on expiry
- [ ] Retry logic and error handling
- [ ] Alerting on failure

### Milestone 3.3 — Settlement Contract (Day 71-77)
- [ ] Accept resolution from Oracle
- [ ] Calculate payout rate
- [ ] Claim payout function
- [ ] Protocol fee deduction
- [ ] Burn losing tokens
- [ ] Idempotent claim (prevent double claims)

### Milestone 3.4 — Settlement UI (Day 78-82)
- [ ] Market resolved banner
- [ ] Claimable amount display
- [ ] One-click claim button
- [ ] Claim history in portfolio
- [ ] Settlement history table

**Phase 3 Deliverable:** Full lifecycle works end-to-end. Markets resolve, winners claim USDC.

---

## Phase 4: Frontend + Indexer

### Milestone 4.1 — Event Indexer (Day 83-91)
- [ ] Node.js indexer service
- [ ] Soroban RPC event polling
- [ ] Event parsing for all contracts
- [ ] PostgreSQL write layer
- [ ] Missed block recovery
- [ ] WebSocket push to frontend

### Milestone 4.2 — REST/WS API (Day 92-98)
- [ ] Markets list API with filtering/pagination
- [ ] Market detail API (stats, price history)
- [ ] User positions API
- [ ] Trade history API
- [ ] LP positions API
- [ ] WebSocket endpoint for live prices

### Milestone 4.3 — Advanced Frontend (Day 99-112)
- [ ] Landing page with stats
- [ ] Market list with search/filter/sort
- [ ] Price chart (TradingView lightweight charts)
- [ ] Probability history chart
- [ ] Volume and liquidity stats
- [ ] Portfolio page with PnL
- [ ] Responsive mobile layout

### Milestone 4.4 — Market Creation UI (Day 113-117)
- [ ] Create market form
- [ ] Oracle/expiry configuration
- [ ] Fee preview
- [ ] Market preview before creation
- [ ] Created market redirect

**Phase 4 Deliverable:** Production-quality UI with real data from indexer. Charts, analytics, full portfolio view.

---

## Phase 5: Security + Production

### Milestone 5.1 — Security Hardening (Day 118-124)
- [ ] Contract fuzz testing
- [ ] Edge case audit (overflow, underflow, zero-value)
- [ ] Access control review
- [ ] Oracle attack simulation
- [ ] AMM manipulation test
- [ ] Pen test of frontend (XSS, CSRF)

### Milestone 5.2 — Contract Audit Prep (Day 125-131)
- [ ] Code freeze for audit
- [ ] Document all state transitions
- [ ] Write invariant specifications
- [ ] Prepare audit brief
- [ ] Internal code review

### Milestone 5.3 — Governance Architecture (Day 132-138)
- [ ] Multi-sig admin structure
- [ ] Timelock for parameter changes
- [ ] DAO placeholder contracts
- [ ] Governance documentation

### Milestone 5.4 — Production Deployment (Day 139-147)
- [ ] Mainnet deployment scripts
- [ ] Contract verification
- [ ] Frontend production build
- [ ] DNS + CDN setup
- [ ] Monitoring (Datadog/Sentry)
- [ ] Incident runbook

**Phase 5 Deliverable:** Mainnet launch ready. Audited contracts. Production infrastructure.

---

## Technical Debt Backlog (Post-v1)

- LMSR AMM pool type (alternative to constant product)
- Cross-market liquidity routing
- Full DAO governance (Snapshot-style voting)
- Mobile app
- More oracle networks (Redstone, Band Protocol on Stellar)
- Prediction market categories beyond price
- Liquid staking of LP shares
