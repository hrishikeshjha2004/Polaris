# StellarPM — System Architecture

**Version:** 1.0.0

---

## 1. High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Next.js Frontend (TypeScript + TailwindCSS + shadcn/ui)     │  │
│  │  Freighter Wallet  │  Stellar Wallet Kit  │  WalletConnect   │  │
│  └─────────────────────────────┬────────────────────────────────┘  │
└────────────────────────────────┼────────────────────────────────────┘
                                 │ HTTPS / WS
┌────────────────────────────────┼────────────────────────────────────┐
│                       BACKEND LAYER                                  │
│  ┌──────────────┐  ┌──────────▼──────────┐  ┌──────────────────┐  │
│  │   Indexer    │  │    REST/WS API      │  │  Oracle Worker   │  │
│  │  (Node.js)   │  │    (Node.js)        │  │  (Node.js)       │  │
│  └──────┬───────┘  └──────────┬──────────┘  └────────┬─────────┘  │
│         │                     │                       │             │
│  ┌──────▼─────────────────────▼───────────────────────▼──────────┐ │
│  │                     PostgreSQL Database                        │ │
│  │  (events, positions, analytics, market cache, oracle data)    │ │
│  └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ Soroban RPC + Horizon API
┌────────────────────────────────┼────────────────────────────────────┐
│                    STELLAR BLOCKCHAIN                                │
│                                │                                     │
│  ┌─────────────────────────────▼────────────────────────────────┐  │
│  │                   Smart Contract Layer                        │  │
│  │                                                               │  │
│  │  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐  │  │
│  │  │   Factory   │───▶│   Market     │───▶│  Outcome Tokens │  │  │
│  │  │  Contract   │    │  Contract    │    │  YES / NO       │  │  │
│  │  └─────────────┘    └──────┬───────┘    └─────────────────┘  │  │
│  │                            │                                   │  │
│  │  ┌─────────────┐    ┌──────▼───────┐    ┌─────────────────┐  │  │
│  │  │   Oracle    │───▶│   AMM / LP   │───▶│    Treasury     │  │  │
│  │  │  Contract   │    │  Contract    │    │    Contract     │  │  │
│  │  └─────────────┘    └──────┬───────┘    └─────────────────┘  │  │
│  │                            │                                   │  │
│  │                    ┌───────▼──────┐                           │  │
│  │                    │  Settlement  │                           │  │
│  │                    │  Contract    │                           │  │
│  │                    └─────────────┘                           │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Smart Contract Architecture

### 2.1 Contract Registry

| Contract | Address Variable | Role |
|----------|-----------------|------|
| `MarketFactory` | `FACTORY_CONTRACT_ID` | Deploys and registers markets |
| `Market` | Dynamic per market | Holds market state, routes to AMM/Settlement |
| `OutcomeToken` | Dynamic (YES + NO per market) | SEP-0041 token for each outcome |
| `AMM` | Per market | Constant product AMM logic |
| `LPShare` | Per market | LP share token for pool ownership |
| `Oracle` | `ORACLE_CONTRACT_ID` | Multi-signer resolution registry |
| `Settlement` | `SETTLEMENT_CONTRACT_ID` | Handles resolution + payout logic |
| `Treasury` | `TREASURY_CONTRACT_ID` | Accumulates protocol fees |

### 2.2 Contract Interaction Graph

```
User
 │
 ├──[create_market]──► MarketFactory
 │                         │
 │                         ├──deploys──► Market Contract
 │                         │                │
 │                         │                ├──deploys──► YES Token Contract
 │                         │                ├──deploys──► NO Token Contract
 │                         │                ├──deploys──► AMM Contract
 │                         │                └──deploys──► LPShare Contract
 │
 ├──[add_liquidity]──► AMM Contract
 │                         │
 │                         └──mints──► LPShare tokens
 │
 ├──[swap]──► AMM Contract
 │                │
 │                ├──transfers USDC──► pool
 │                ├──mints YES/NO tokens──► user
 │                └──accrues fees──► Treasury
 │
 ├──[submit_outcome]──► Oracle Contract
 │                           │
 │                           └──[threshold met]──► Settlement Contract
 │
 └──[claim_payout]──► Settlement Contract
                           │
                           ├──burns YES/NO tokens
                           └──transfers USDC──► user
```

### 2.3 MarketFactory Contract

**Responsibilities:**
- Deploy new Market contract instances
- Register market IDs → contract addresses
- Enforce market creation fee
- Maintain global market list
- Admin: update fees, pause creation

**Key Storage:**
```
markets: Map<MarketId, Address>
market_count: u64
creation_fee: i128
admin: Address
paused: bool
```

**Key Functions:**
```rust
pub fn create_market(env, creator, params: MarketParams) -> MarketId
pub fn get_market(env, id: MarketId) -> Address
pub fn list_markets(env, offset: u32, limit: u32) -> Vec<MarketId>
pub fn set_creation_fee(env, admin, fee: i128)
pub fn pause(env, admin)
```

### 2.4 Market Contract

**Responsibilities:**
- Hold market metadata (title, description, expiry, oracle, status)
- Route buy/sell through AMM
- Track market status lifecycle
- Interface with Oracle and Settlement contracts

**Key Storage:**
```
title: String
description: String
creator: Address
expiry_timestamp: u64
oracle_address: Address
status: MarketStatus (OPEN|EXPIRED|RESOLVED|CLOSED)
yes_token: Address
no_token: Address
amm_address: Address
resolution: Option<Outcome>
```

**Key Functions:**
```rust
pub fn initialize(env, params: MarketParams)
pub fn buy_outcome(env, buyer, outcome: Outcome, amount_usdc: i128, max_slippage: u32)
pub fn sell_outcome(env, seller, outcome: Outcome, amount_tokens: i128)
pub fn add_liquidity(env, provider, amount_usdc: i128)
pub fn remove_liquidity(env, provider, lp_shares: i128)
pub fn expire(env)        // callable by anyone after expiry timestamp
pub fn get_state(env) -> MarketState
```

### 2.5 OutcomeToken Contract

Implements the Soroban Token Interface (SEP-0041):

```rust
// Standard token interface
pub fn allowance(env, from, spender) -> i128
pub fn approve(env, from, spender, amount, expiration_ledger)
pub fn balance(env, id) -> i128
pub fn transfer(env, from, to, amount)
pub fn transfer_from(env, spender, from, to, amount)
pub fn burn(env, from, amount)
pub fn burn_from(env, spender, from, amount)
pub fn decimals(env) -> u32
pub fn name(env) -> String
pub fn symbol(env) -> String
// Additional
pub fn mint(env, to, amount)  // restricted to AMM contract
```

### 2.6 AMM Contract

**Pricing Model: Constant Product AMM**

Initial formula: `yes_reserves * no_reserves = k`

For a binary market where total payout = 1 USDC:
- Price(YES) = no_reserves / (yes_reserves + no_reserves)
- Price(NO) = yes_reserves / (yes_reserves + no_reserves)
- Sum of prices = 1 (arbitrage-enforced)

**Swap calculation:**
```
Given: sell dx of token_in
Get:   dy of token_out

dy = (y * dx * (1 - fee)) / (x + dx * (1 - fee))

Where: fee = swap_fee_bps / 10000
```

**Key Storage:**
```
yes_reserves: i128
no_reserves: i128
lp_total_supply: i128
swap_fee_bps: u32     // basis points, e.g. 30 = 0.3%
lp_fee_share: u32     // % of fee to LPs, e.g. 8000 = 80%
cumulative_fees: i128
market_address: Address
```

**Key Functions:**
```rust
pub fn initialize(env, market, yes_token, no_token, lp_token, fee_bps)
pub fn add_liquidity(env, provider, yes_amount: i128, no_amount: i128) -> i128
pub fn remove_liquidity(env, provider, lp_shares: i128) -> (i128, i128)
pub fn swap(env, trader, token_in: Address, amount_in: i128, min_out: i128) -> i128
pub fn get_price(env, outcome: Outcome) -> i128   // returns price in basis points
pub fn get_reserves(env) -> (i128, i128)
pub fn get_quote(env, token_in, amount_in) -> i128
```

### 2.7 Oracle Contract

**Architecture: Multi-Signer with Threshold**

```
Oracle Contract
    │
    ├── signer_registry: Map<Address, bool>
    ├── required_threshold: u32       // e.g. 3 of 5
    ├── submissions: Map<MarketId, Vec<OracleSubmission>>
    └── resolutions: Map<MarketId, Resolution>

OracleSubmission {
    signer: Address,
    outcome: Outcome,      // YES | NO
    price_at_expiry: i128,
    price_feed_source: String,
    submitted_at: u64,
}
```

**Resolution Logic:**
1. Oracle operator calls `submit_resolution(market_id, outcome, price)`
2. Contract validates signer is authorized
3. Collects submissions until threshold reached
4. If threshold met AND submissions agree on outcome → triggers settlement
5. Dispute window: 2 hours after threshold met
6. After dispute window → settlement is finalized

**Key Functions:**
```rust
pub fn initialize(env, admin, signers: Vec<Address>, threshold: u32)
pub fn submit_resolution(env, signer, market_id, outcome: Outcome, price: i128)
pub fn finalize_resolution(env, market_id)  // callable after dispute window
pub fn dispute(env, disputer, market_id, evidence: String)
pub fn add_signer(env, admin, signer: Address)
pub fn remove_signer(env, admin, signer: Address)
pub fn get_resolution(env, market_id) -> Option<Resolution>
```

### 2.8 Settlement Contract

**Responsibilities:**
- Receive finalized resolution from Oracle
- Calculate winning payout per token
- Handle redemption requests
- Deduct protocol fee and route to Treasury

**Payout Calculation:**
```
total_pool = yes_reserve_value + no_reserve_value
protocol_fee = total_pool * protocol_fee_bps / 10000
payout_pool = total_pool - protocol_fee
payout_per_winning_token = payout_pool / winning_token_supply
```

**Key Functions:**
```rust
pub fn record_resolution(env, oracle, market_id, outcome: Outcome)
pub fn claim_payout(env, claimant, market_id) -> i128
pub fn get_payout_rate(env, market_id) -> i128
pub fn get_claimable(env, claimant, market_id) -> i128
```

### 2.9 Treasury Contract

**Responsibilities:**
- Collect protocol fees from swaps and settlements
- Hold accumulated fees
- Distribute to governance (future)
- Admin withdrawal

**Key Functions:**
```rust
pub fn deposit(env, from, amount: i128, token: Address)
pub fn withdraw(env, admin, to: Address, amount: i128, token: Address)
pub fn get_balance(env, token: Address) -> i128
pub fn set_admin(env, current_admin, new_admin: Address)
```

---

## 3. Frontend Architecture

### 3.1 Next.js App Router Structure

```
apps/web/
├── app/
│   ├── layout.tsx              # Root layout, wallet provider
│   ├── page.tsx                # Landing page
│   ├── markets/
│   │   ├── page.tsx            # Market list
│   │   └── [id]/
│   │       ├── page.tsx        # Market detail + trade
│   │       └── liquidity/
│   │           └── page.tsx    # LP interface
│   ├── portfolio/
│   │   └── page.tsx            # User positions
│   ├── governance/
│   │   └── page.tsx            # Governance placeholder
│   └── api/
│       └── [...]/              # Next.js API routes (indexer proxy)
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── wallet/                 # Wallet connection components
│   ├── markets/                # Market list, card, filter
│   ├── trade/                  # Trade panel, price chart
│   ├── liquidity/              # LP interface
│   └── layout/                 # Nav, footer, sidebar
├── hooks/
│   ├── useWallet.ts
│   ├── useMarket.ts
│   ├── useTrade.ts
│   └── useLiquidity.ts
├── lib/
│   ├── stellar/                # Stellar SDK utils
│   ├── contracts/              # Contract invocation helpers
│   └── api/                    # Backend API client
└── store/
    └── index.ts                # Zustand store
```

### 3.2 State Management

Using **Zustand** for global state:

```typescript
interface AppStore {
  // Wallet
  wallet: WalletState | null
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  
  // Markets
  markets: Market[]
  selectedMarket: Market | null
  fetchMarkets: () => Promise<void>
  
  // Positions
  positions: Position[]
  fetchPositions: (address: string) => Promise<void>
}
```

---

## 4. Backend / Indexer Architecture

### 4.1 Event Indexer

The indexer listens to Soroban events from all contracts and maintains a queryable database.

```
Indexer Process:
  1. Poll Soroban RPC for new ledgers
  2. Filter events by known contract IDs
  3. Parse event data using contract ABI
  4. Write to PostgreSQL
  5. Emit WebSocket updates to connected clients
```

**Indexed Events:**
```
market_created(market_id, creator, title, expiry)
liquidity_added(market_id, provider, amount, lp_shares)
liquidity_removed(market_id, provider, amount, lp_shares)
swap(market_id, trader, token_in, amount_in, token_out, amount_out, price_impact)
oracle_submission(market_id, signer, outcome, price)
market_resolved(market_id, outcome, settlement_rate)
payout_claimed(market_id, claimant, amount)
```

### 4.2 PostgreSQL Schema

```sql
-- Core tables
markets (id, contract_address, title, creator, expiry, status, yes_price, no_price, volume, tvl)
trades (id, market_id, trader, outcome, amount_in, amount_out, fee, price_after, tx_hash, timestamp)
positions (id, market_id, user_address, outcome, token_balance, avg_price, unrealized_pnl)
lp_positions (id, market_id, provider, lp_shares, deposited_value, fee_earned)
oracle_submissions (id, market_id, signer, outcome, price, submitted_at, tx_hash)
settlements (id, market_id, outcome, payout_rate, settled_at, tx_hash)
```

---

## 5. Oracle Worker Architecture

```
Oracle Worker Process:
  1. Monitor markets approaching expiry
  2. On expiry: fetch price from multiple sources (CoinGecko, Binance, CMC)
  3. Aggregate prices (median)
  4. Evaluate market condition (e.g., BTC > $150k?)
  5. Sign outcome with operator private key
  6. Submit to Oracle contract on-chain
  7. Monitor for quorum
```

**Price Feed Abstraction:**
```typescript
interface PriceFeed {
  getPrice(asset: Asset): Promise<PriceData>
}

class CoinGeckoPriceFeed implements PriceFeed { ... }
class BinancePriceFeed implements PriceFeed { ... }
class AggregatePriceFeed implements PriceFeed {
  // median of all feeds
}
```

---

## 6. Security Architecture

### 6.1 Contract Security Model

| Layer | Mechanism |
|-------|----------|
| Access control | Role-based (admin, oracle, factory) using Address checks |
| Reentrancy | Soroban's single-threaded execution model prevents classical reentrancy; use checks-effects-interactions anyway |
| Oracle manipulation | Multi-signer threshold + dispute window |
| AMM manipulation | Slippage protection + invariant checks |
| Settlement finality | Immutable after dispute window |
| Upgrade safety | Factory tracks versions; upgrades via migration contracts with timelock |

### 6.2 Threat Model Summary

See `SECURITY.md` for full threat model.

---

## 7. Key Protocol Decisions

### Decision 1: Constant Product AMM over LMSR
**Rationale:** LMSR (Logarithmic Market Scoring Rule) requires logarithm computation which is expensive on-chain. Constant product (x*y=k) is battle-tested (Uniswap v2), simpler to audit, and provides unlimited liquidity. LMSR can be added as an optional pool type in v2.

### Decision 2: USDC as Base Currency
**Rationale:** USDC is the most liquid stable on Stellar. Using XLM as base introduces volatility risk for LPs and makes P&L accounting complex. USDC (Stellar SEP-0041) is the correct base currency for a prediction market.

### Decision 3: Per-Market Contract Deployment
**Rationale:** Each market deploys its own AMM, YES token, NO token, and LP token contracts. This increases deployment cost but provides complete isolation — a bug in one market cannot drain another market's liquidity. Composability and safety > gas efficiency on Stellar's low-fee environment.

### Decision 4: Multi-Signer Oracle (not on-chain price oracle)
**Rationale:** Stellar does not have a mature on-chain oracle network (like Chainlink on EVM). We use a committee of trusted signers initially, with a clear upgrade path to decentralized oracle networks as they mature on Stellar.

### Decision 5: Event-Based Indexer over On-Chain Pagination
**Rationale:** On-chain storage is expensive and Soroban has limits on storage. We store minimal on-chain state (contract IDs, balances, statuses) and use the event indexer for analytics and UI data.
