# Polaris — Smart Contracts Reference

**Version:** 1.0.0

---

## Contract Addresses (Testnet)

> Populated after deployment. See `scripts/deploy/` for deployment scripts.

| Contract | Testnet Address |
|----------|----------------|
| MarketFactory | TBD |
| Oracle | TBD |
| Settlement | TBD |
| Treasury | TBD |

---

## 1. MarketFactory Contract

**Location:** `contracts/market-factory/src/lib.rs`

### Storage Keys

```rust
pub enum DataKey {
    Admin,
    CreationFee,
    Markets(u64),           // index → MarketId
    MarketAddress(Bytes32), // MarketId → Address
    MarketCount,
    Paused,
    SettlementContract,
    OracleContract,
    TreasuryContract,
}
```

### Public Interface

```rust
/// Initialize the factory (called once after deployment)
pub fn initialize(
    env: Env,
    admin: Address,
    creation_fee: i128,
    oracle: Address,
    settlement: Address,
    treasury: Address,
) -> Result<(), Error>

/// Create a new prediction market
pub fn create_market(
    env: Env,
    creator: Address,
    params: MarketParams,
) -> Result<BytesN<32>, Error>  // returns market_id

/// Get market contract address by ID
pub fn get_market(env: Env, market_id: BytesN<32>) -> Result<Address, Error>

/// List markets with pagination
pub fn list_markets(
    env: Env,
    offset: u32,
    limit: u32,
) -> Vec<(BytesN<32>, Address)>

/// Get total market count
pub fn market_count(env: Env) -> u64

/// Admin: update creation fee
pub fn set_creation_fee(env: Env, admin: Address, fee: i128)

/// Admin: pause/unpause market creation
pub fn set_paused(env: Env, admin: Address, paused: bool)

/// Admin: transfer admin role
pub fn transfer_admin(env: Env, admin: Address, new_admin: Address)
```

### MarketParams Struct

```rust
pub struct MarketParams {
    pub title: String,           // e.g. "Will BTC exceed $150k by Dec 31?"
    pub description: String,     // Full resolution criteria
    pub category: String,        // "crypto_price"
    pub expiry_timestamp: u64,   // Unix timestamp
    pub oracle_source: String,   // "BTC_USD_COINGECKO"
    pub threshold_value: i128,   // Price threshold (scaled by 1e7)
    pub threshold_operator: u8,  // 0=GT, 1=LT, 2=GTE, 3=LTE
    pub initial_liquidity: i128, // USDC to bootstrap pool
}
```

### Events Emitted

```rust
// symbol: "market_created"
pub struct MarketCreatedEvent {
    pub market_id: BytesN<32>,
    pub creator: Address,
    pub contract_address: Address,
    pub title: String,
    pub expiry: u64,
}
```

### Error Codes

```rust
pub enum Error {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidParams = 3,
    InsufficientFee = 4,
    Paused = 5,
    MarketNotFound = 6,
}
```

---

## 2. Market Contract

**Location:** `contracts/market/src/lib.rs`

### Market Status Enum

```rust
pub enum MarketStatus {
    Open = 0,
    Expired = 1,
    Resolved = 2,
    Closed = 3,
}
```

### Outcome Enum

```rust
pub enum Outcome {
    Yes = 0,
    No = 1,
}
```

### Public Interface

```rust
/// Initialize market (called by Factory)
pub fn initialize(
    env: Env,
    factory: Address,
    creator: Address,
    params: MarketParams,
    yes_token: Address,
    no_token: Address,
    lp_token: Address,
    amm: Address,
    oracle: Address,
    settlement: Address,
) -> Result<(), Error>

/// Buy outcome tokens with USDC
pub fn buy(
    env: Env,
    buyer: Address,
    outcome: Outcome,
    usdc_amount: i128,
    min_tokens_out: i128,  // slippage protection
) -> Result<i128, Error>   // returns tokens received

/// Sell outcome tokens for USDC
pub fn sell(
    env: Env,
    seller: Address,
    outcome: Outcome,
    token_amount: i128,
    min_usdc_out: i128,
) -> Result<i128, Error>

/// Add liquidity to AMM pool
pub fn add_liquidity(
    env: Env,
    provider: Address,
    yes_amount: i128,
    no_amount: i128,
    min_lp_out: i128,
) -> Result<i128, Error>  // returns LP shares minted

/// Remove liquidity from AMM pool
pub fn remove_liquidity(
    env: Env,
    provider: Address,
    lp_shares: i128,
    min_yes_out: i128,
    min_no_out: i128,
) -> Result<(i128, i128), Error>  // (yes_received, no_received)

/// Mark market as expired (callable by anyone after expiry)
pub fn expire(env: Env) -> Result<(), Error>

/// Get current market state
pub fn get_state(env: Env) -> MarketState

/// Get price quote for a trade
pub fn get_quote(
    env: Env,
    outcome: Outcome,
    usdc_amount: i128,
) -> Result<QuoteResult, Error>
```

### MarketState Struct

```rust
pub struct MarketState {
    pub market_id: BytesN<32>,
    pub title: String,
    pub description: String,
    pub creator: Address,
    pub expiry_timestamp: u64,
    pub status: MarketStatus,
    pub yes_price: i128,        // price in basis points (0-10000)
    pub no_price: i128,
    pub yes_reserve: i128,
    pub no_reserve: i128,
    pub total_volume: i128,
    pub total_liquidity: i128,
    pub resolution: Option<Outcome>,
}
```

---

## 3. Outcome Token Contract

**Location:** `contracts/token/src/lib.rs`

Implements Soroban Token Interface (SEP-0041).

### Additional Functions (beyond SEP-0041)

```rust
/// Mint tokens (restricted to AMM contract)
pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), Error>

/// Get authorized minter
pub fn minter(env: Env) -> Address

/// Set minter (admin only, called during market initialization)
pub fn set_minter(env: Env, admin: Address, minter: Address)
```

### Token Metadata

Tokens are named using a deterministic scheme:
- `BTC150K_YES` / `BTC150K_NO`
- Symbol encodes market ID prefix + outcome

---

## 4. AMM Contract

**Location:** `contracts/amm/src/lib.rs`

### AMM Math Reference

**Constant Product Formula:**
```
x * y = k

Where:
  x = YES token reserves
  y = NO token reserves
  k = invariant (constant)
```

**Swap Output Calculation:**
```
Given input amount dx of token_in:

  dx_with_fee = dx * (10000 - fee_bps) / 10000
  dy = (y * dx_with_fee) / (x + dx_with_fee)
```

**Price Calculation:**
```
price_yes_bps = (no_reserves * 10000) / (yes_reserves + no_reserves)
price_no_bps  = (yes_reserves * 10000) / (yes_reserves + no_reserves)
```

**Add Liquidity:**
```
lp_minted = min(
    (yes_in * lp_supply) / yes_reserves,
    (no_in * lp_supply) / no_reserves
)
// Initial liquidity: lp_minted = sqrt(yes_in * no_in)
```

### Public Interface

```rust
pub fn initialize(
    env: Env,
    market: Address,
    yes_token: Address,
    no_token: Address,
    lp_token: Address,
    treasury: Address,
    swap_fee_bps: u32,      // default: 30 (0.3%)
    lp_fee_share_bps: u32,  // default: 8000 (80%)
) -> Result<(), Error>

pub fn swap(
    env: Env,
    trader: Address,
    token_in: Address,
    amount_in: i128,
    min_amount_out: i128,
    deadline: u64,  // transaction expiry
) -> Result<SwapResult, Error>

pub fn add_liquidity(
    env: Env,
    provider: Address,
    yes_amount: i128,
    no_amount: i128,
    min_lp_out: i128,
) -> Result<i128, Error>

pub fn remove_liquidity(
    env: Env,
    provider: Address,
    lp_shares: i128,
    min_yes_out: i128,
    min_no_out: i128,
) -> Result<(i128, i128), Error>

pub fn get_reserves(env: Env) -> (i128, i128)

pub fn get_price(env: Env, outcome: u8) -> i128  // bps

pub fn get_swap_quote(
    env: Env,
    token_in: Address,
    amount_in: i128,
) -> Result<QuoteResult, Error>
```

### SwapResult Struct

```rust
pub struct SwapResult {
    pub amount_in: i128,
    pub amount_out: i128,
    pub fee_paid: i128,
    pub price_impact_bps: u32,  // price impact in basis points
    pub new_yes_price: i128,
    pub new_no_price: i128,
}
```

---

## 5. Oracle Contract

**Location:** `contracts/oracle/src/lib.rs`

### Storage Layout

```rust
pub enum OracleKey {
    Admin,
    Signers,                          // Vec<Address>
    RequiredThreshold,                // u32
    Submissions(BytesN<32>),          // market_id → Vec<OracleSubmission>
    Resolution(BytesN<32>),           // market_id → FinalResolution
    DisputeWindow,                    // u64 (seconds)
    Disputes(BytesN<32>),             // market_id → Vec<Dispute>
}
```

### OracleSubmission Struct

```rust
pub struct OracleSubmission {
    pub signer: Address,
    pub outcome: Outcome,
    pub price_at_expiry: i128,   // scaled by 1e7
    pub price_source: String,    // e.g. "COINGECKO_BINANCE_MEDIAN"
    pub submitted_at: u64,       // ledger timestamp
}
```

### FinalResolution Struct

```rust
pub struct FinalResolution {
    pub outcome: Outcome,
    pub final_price: i128,
    pub resolved_at: u64,
    pub dispute_window_end: u64,
    pub finalized: bool,
    pub submission_count: u32,
}
```

### Public Interface

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    signers: Vec<Address>,
    threshold: u32,
    dispute_window_seconds: u64,  // default: 7200 (2 hours)
) -> Result<(), Error>

pub fn submit_resolution(
    env: Env,
    signer: Address,
    market_id: BytesN<32>,
    outcome: Outcome,
    price_at_expiry: i128,
    price_source: String,
) -> Result<bool, Error>  // true if threshold reached

pub fn finalize_resolution(
    env: Env,
    market_id: BytesN<32>,
) -> Result<FinalResolution, Error>

pub fn dispute(
    env: Env,
    disputer: Address,
    market_id: BytesN<32>,
    reason: String,
) -> Result<(), Error>

pub fn get_resolution(
    env: Env,
    market_id: BytesN<32>,
) -> Option<FinalResolution>

pub fn add_signer(env: Env, admin: Address, signer: Address)
pub fn remove_signer(env: Env, admin: Address, signer: Address)
pub fn set_threshold(env: Env, admin: Address, threshold: u32)
pub fn get_signers(env: Env) -> Vec<Address>
```

---

## 6. Settlement Contract

**Location:** `contracts/settlement/src/lib.rs`

### Public Interface

```rust
pub fn initialize(
    env: Env,
    admin: Address,
    oracle: Address,
    treasury: Address,
    protocol_fee_bps: u32,  // default: 50 (0.5%)
) -> Result<(), Error>

/// Called by Oracle after finalization
pub fn record_resolution(
    env: Env,
    oracle: Address,
    market_id: BytesN<32>,
    outcome: Outcome,
    yes_token: Address,
    no_token: Address,
    pool_value: i128,
) -> Result<(), Error>

/// Called by user to claim payout
pub fn claim(
    env: Env,
    claimant: Address,
    market_id: BytesN<32>,
) -> Result<i128, Error>  // returns USDC claimed

/// View: how much can address claim?
pub fn claimable(
    env: Env,
    claimant: Address,
    market_id: BytesN<32>,
) -> i128

/// View: payout rate for market (USDC per winning token, scaled 1e7)
pub fn payout_rate(env: Env, market_id: BytesN<32>) -> i128
```

---

## 7. Treasury Contract

**Location:** `contracts/treasury/src/lib.rs`

### Public Interface

```rust
pub fn initialize(env: Env, admin: Address) -> Result<(), Error>

pub fn deposit(
    env: Env,
    from: Address,
    token: Address,
    amount: i128,
) -> Result<(), Error>

pub fn withdraw(
    env: Env,
    admin: Address,
    token: Address,
    to: Address,
    amount: i128,
) -> Result<(), Error>

pub fn balance(env: Env, token: Address) -> i128

pub fn transfer_admin(env: Env, admin: Address, new_admin: Address)
```

---

## Contract Deployment Order

1. Deploy `Treasury`
2. Deploy `Oracle`
3. Deploy `Settlement` (needs Treasury + Oracle addresses)
4. Upload WASM for `Market`, `OutcomeToken`, `AMM`, `LPShare`
5. Deploy `MarketFactory` (needs Oracle + Settlement + Treasury addresses + child WASMs)
6. Verify all cross-contract addresses are correctly set
