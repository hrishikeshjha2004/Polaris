//! Settlement Contract — handles post-resolution payout distribution.
//!
//! Flow:
//!   1. Oracle calls `record_resolution()` after finalization.
//!   2. Contract calculates payout_per_token = (total_pool - protocol_fee) / winning_supply.
//!   3. Users call `claim()` to exchange winning tokens for USDC.
//!   4. Losing tokens are worthless (holders can burn them or just abandon).
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, Symbol};
use stellar_pm_shared::{Outcome, SharedError, BPS};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Oracle,
    Treasury,
    ProtocolFeeBps,
    /// MarketId → SettlementRecord
    Record(BytesN<32>),
    /// (MarketId, Address) → bool (has claimed)
    Claimed(BytesN<32>, Address),
    /// USDC token address
    UsdcToken,
}

// ─── Settlement Record ────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct SettlementRecord {
    pub market_id: BytesN<32>,
    pub winning_outcome: Outcome,
    pub winning_token: Address,
    pub losing_token: Address,
    /// USDC deposited into settlement contract for this market
    pub total_pool_usdc: i128,
    /// Protocol fee deducted
    pub protocol_fee: i128,
    /// Payout pool after fee
    pub payout_pool: i128,
    /// Total supply of winning tokens at settlement time
    pub winning_supply: i128,
    /// USDC per winning token (scaled by 1e7)
    pub payout_rate: i128,
    pub settled_at: u64,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct Settlement;

#[contractimpl]
impl Settlement {
    /// Initialize the settlement contract.
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        treasury: Address,
        usdc_token: Address,
        protocol_fee_bps: u32,
    ) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SharedError::AlreadyInitialized);
        }
        if protocol_fee_bps > 1000 {
            return Err(SharedError::InvalidParams); // max 10% protocol fee
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);
        env.storage()
            .instance()
            .set(&DataKey::ProtocolFeeBps, &protocol_fee_bps);
        Ok(())
    }

    /// Record a resolution. Called by the Oracle contract after finalization.
    ///
    /// The AMM contract must have transferred the pool's USDC to this contract
    /// before this call, or this function transfers it as part of settlement.
    pub fn record_resolution(
        env: Env,
        oracle: Address,
        market_id: BytesN<32>,
        winning_outcome: Outcome,
        winning_token: Address,
        losing_token: Address,
        // Caller provides winning_supply; standard token Client lacks total_supply.
        winning_supply: i128,
        total_pool_usdc: i128,
    ) -> Result<SettlementRecord, SharedError> {
        oracle.require_auth();

        let stored_oracle: Address = env.storage().instance().get(&DataKey::Oracle).unwrap();
        if oracle != stored_oracle {
            return Err(SharedError::Unauthorized);
        }

        // Ensure no duplicate settlement
        if env
            .storage()
            .persistent()
            .has(&DataKey::Record(market_id.clone()))
        {
            return Err(SharedError::AlreadyInitialized);
        }

        if total_pool_usdc <= 0 {
            return Err(SharedError::InvalidParams);
        }
        if winning_supply <= 0 {
            return Err(SharedError::DivisionByZero);
        }

        let fee_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ProtocolFeeBps)
            .unwrap();
        let protocol_fee = total_pool_usdc * fee_bps as i128 / BPS;
        let payout_pool = total_pool_usdc - protocol_fee;

        // payout_rate = payout_pool / winning_supply (scaled for precision)
        let payout_rate = payout_pool
            .checked_mul(10_000_000) // scale factor
            .ok_or(SharedError::Overflow)?
            .checked_div(winning_supply)
            .ok_or(SharedError::DivisionByZero)?;

        let record = SettlementRecord {
            market_id: market_id.clone(),
            winning_outcome,
            winning_token: winning_token.clone(),
            losing_token: losing_token.clone(),
            total_pool_usdc,
            protocol_fee,
            payout_pool,
            winning_supply,
            payout_rate,
            settled_at: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Record(market_id.clone()), &record);

        // Route protocol fee to treasury
        if protocol_fee > 0 {
            let usdc: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
            let usdc_client = token::Client::new(&env, &usdc);
            let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
            usdc_client.transfer(&env.current_contract_address(), &treasury, &protocol_fee);
        }

        env.events().publish(
            (Symbol::new(&env, "market_settled"), market_id),
            (winning_outcome, payout_rate, winning_supply),
        );

        Ok(record)
    }

    /// Claim payout for winning tokens.
    ///
    /// Burns the caller's winning tokens and transfers USDC proportionally.
    pub fn claim(env: Env, claimant: Address, market_id: BytesN<32>) -> Result<i128, SharedError> {
        claimant.require_auth();

        // Check not already claimed
        let claimed_key = DataKey::Claimed(market_id.clone(), claimant.clone());
        if env.storage().persistent().has(&claimed_key) {
            return Ok(0); // already claimed — idempotent
        }

        let record: SettlementRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Record(market_id.clone()))
            .ok_or(SharedError::MarketNotResolved)?;

        // Get claimant's winning token balance
        let winning_token_client = token::Client::new(&env, &record.winning_token);
        let user_balance = winning_token_client.balance(&claimant);

        if user_balance <= 0 {
            return Ok(0); // nothing to claim
        }

        // payout = user_balance * payout_rate / scale_factor
        let payout = user_balance
            .checked_mul(record.payout_rate)
            .ok_or(SharedError::Overflow)?
            .checked_div(10_000_000)
            .ok_or(SharedError::DivisionByZero)?;

        if payout <= 0 {
            return Ok(0);
        }

        // Mark as claimed before transfers (checks-effects-interactions)
        env.storage().persistent().set(&claimed_key, &true);

        // Burn winning tokens from claimant
        winning_token_client.burn(&claimant, &user_balance);

        // Transfer USDC to claimant
        let usdc: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
        let usdc_client = token::Client::new(&env, &usdc);
        usdc_client.transfer(&env.current_contract_address(), &claimant, &payout);

        env.events().publish(
            (
                Symbol::new(&env, "payout_claimed"),
                market_id,
                claimant.clone(),
            ),
            (user_balance, payout),
        );

        Ok(payout)
    }

    /// View: how much USDC can an address claim?
    pub fn claimable(env: Env, claimant: Address, market_id: BytesN<32>) -> i128 {
        let claimed_key = DataKey::Claimed(market_id.clone(), claimant.clone());
        if env.storage().persistent().has(&claimed_key) {
            return 0;
        }

        let record: Option<SettlementRecord> =
            env.storage().persistent().get(&DataKey::Record(market_id));
        let record = match record {
            Some(r) => r,
            None => return 0,
        };

        let winning_token_client = token::Client::new(&env, &record.winning_token);
        let user_balance = winning_token_client.balance(&claimant);

        if user_balance <= 0 {
            return 0;
        }

        user_balance
            .checked_mul(record.payout_rate)
            .unwrap_or(0)
            .checked_div(10_000_000)
            .unwrap_or(0)
    }

    /// View: get settlement record for a market.
    pub fn get_record(env: Env, market_id: BytesN<32>) -> Option<SettlementRecord> {
        env.storage().persistent().get(&DataKey::Record(market_id))
    }

    /// View: payout rate for a market (USDC per winning token, scaled 1e7).
    pub fn payout_rate(env: Env, market_id: BytesN<32>) -> i128 {
        env.storage()
            .persistent()
            .get::<_, SettlementRecord>(&DataKey::Record(market_id))
            .map(|r| r.payout_rate)
            .unwrap_or(0)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_initialize() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Settlement);
        let client = SettlementClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let treasury = Address::generate(&env);
        let usdc = Address::generate(&env);

        client.initialize(&admin, &oracle, &treasury, &usdc, &50_u32);
    }

    #[test]
    fn test_payout_math() {
        // Verify payout calculation
        // 10,000 USDC pool, 0.5% fee = 50 USDC fee, 9,950 USDC payout pool
        // 10,000 winning tokens → payout_rate = 9,950 / 10,000 * 1e7 = 9,950,000
        // Each token gets: 1 * 9,950,000 / 1e7 = 0.995 USDC
        let total_pool: i128 = 10_000 * 10_000_000; // 10,000 USDC scaled
        let fee_bps: i128 = 50; // 0.5%
        let protocol_fee = total_pool * fee_bps / 10_000;
        let payout_pool = total_pool - protocol_fee;
        let winning_supply: i128 = 10_000 * 10_000_000; // 10,000 tokens scaled
        let payout_rate = payout_pool * 10_000_000 / winning_supply;

        // Rate should be ~9_950_000 (99.5% of 1e7)
        assert_eq!(payout_rate, 9_950_000);

        // User with 100 tokens (scaled: 100 * 1e7) gets 99.5 USDC (scaled: 995_000_000)
        let user_tokens = 100 * 10_000_000_i128; // 100 tokens at 1e7 scale
        let user_payout = user_tokens * payout_rate / 10_000_000;
        // 100 tokens × 0.995 USDC/token = 99.5 USDC → scaled = 995_000_000
        assert_eq!(user_payout, 995_000_000);
    }
}
