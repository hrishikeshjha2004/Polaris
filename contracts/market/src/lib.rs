//! Market Contract — per-market state and lifecycle management.
//!
//! Each market instance is deployed by the Factory for a specific prediction question.
//! It holds state, routes trades through the AMM, and manages the market lifecycle.
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, String, Symbol};
use stellar_pm_shared::{MarketParams, MarketStatus, Outcome, SharedError};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    MarketId,
    Factory,
    Creator,
    Title,
    Description,
    Category,
    ExpiryTimestamp,
    OracleSource,
    ThresholdValue,
    ThresholdOperator,
    Status,
    YesToken,
    NoToken,
    LpToken,
    AmmContract,
    OracleContract,
    SettlementContract,
    Resolution,
    TotalVolume,
    CreatedAt,
}

// ─── View Types ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketState {
    pub market_id: BytesN<32>,
    pub title: String,
    pub description: String,
    pub category: String,
    pub creator: Address,
    pub expiry_timestamp: u64,
    pub status: MarketStatus,
    pub yes_token: Address,
    pub no_token: Address,
    pub lp_token: Address,
    pub amm_contract: Address,
    pub oracle_source: String,
    pub threshold_value: i128,
    pub threshold_operator: u32,
    pub created_at: u64,
    pub total_volume: i128,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct Market;

#[contractimpl]
impl Market {
    /// Initialize this market instance (called by Factory after deployment).
    pub fn initialize(
        env: Env,
        factory: Address,
        market_id: BytesN<32>,
        creator: Address,
        params: MarketParams,
        yes_token: Address,
        no_token: Address,
        lp_token: Address,
        amm_contract: Address,
        oracle_contract: Address,
        settlement_contract: Address,
    ) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::MarketId) {
            return Err(SharedError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::MarketId, &market_id);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::Creator, &creator);
        env.storage().instance().set(&DataKey::Title, &params.title);
        env.storage()
            .instance()
            .set(&DataKey::Description, &params.description);
        env.storage()
            .instance()
            .set(&DataKey::Category, &params.category);
        env.storage()
            .instance()
            .set(&DataKey::ExpiryTimestamp, &params.expiry_timestamp);
        env.storage()
            .instance()
            .set(&DataKey::OracleSource, &params.oracle_source);
        env.storage()
            .instance()
            .set(&DataKey::ThresholdValue, &params.threshold_value);
        env.storage()
            .instance()
            .set(&DataKey::ThresholdOperator, &params.threshold_operator);
        env.storage()
            .instance()
            .set(&DataKey::Status, &MarketStatus::Open);
        env.storage().instance().set(&DataKey::YesToken, &yes_token);
        env.storage().instance().set(&DataKey::NoToken, &no_token);
        env.storage().instance().set(&DataKey::LpToken, &lp_token);
        env.storage()
            .instance()
            .set(&DataKey::AmmContract, &amm_contract);
        env.storage()
            .instance()
            .set(&DataKey::OracleContract, &oracle_contract);
        env.storage()
            .instance()
            .set(&DataKey::SettlementContract, &settlement_contract);
        env.storage().instance().set(&DataKey::TotalVolume, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::CreatedAt, &env.ledger().timestamp());

        Ok(())
    }

    /// Expire the market. Callable by anyone once expiry timestamp is passed.
    pub fn expire(env: Env) -> Result<(), SharedError> {
        let status: MarketStatus = env.storage().instance().get(&DataKey::Status).unwrap();
        if !matches!(status, MarketStatus::Open) {
            return Err(SharedError::MarketNotOpen);
        }
        let expiry: u64 = env
            .storage()
            .instance()
            .get(&DataKey::ExpiryTimestamp)
            .unwrap();
        if env.ledger().timestamp() < expiry {
            return Err(SharedError::MarketNotExpired); // not yet expired
        }
        env.storage()
            .instance()
            .set(&DataKey::Status, &MarketStatus::Expired);

        let market_id: BytesN<32> = env.storage().instance().get(&DataKey::MarketId).unwrap();
        env.events()
            .publish((Symbol::new(&env, "market_expired"), market_id), ());
        Ok(())
    }

    /// Record resolution (called by Settlement contract after oracle finalizes).
    pub fn record_resolution(
        env: Env,
        settlement: Address,
        outcome: Outcome,
    ) -> Result<(), SharedError> {
        settlement.require_auth();
        let stored_settlement: Address = env
            .storage()
            .instance()
            .get(&DataKey::SettlementContract)
            .unwrap();
        if settlement != stored_settlement {
            return Err(SharedError::Unauthorized);
        }

        let status: MarketStatus = env.storage().instance().get(&DataKey::Status).unwrap();
        if !matches!(status, MarketStatus::Expired) {
            return Err(SharedError::MarketNotExpired);
        }

        env.storage()
            .instance()
            .set(&DataKey::Status, &MarketStatus::Resolved);
        env.storage().instance().set(&DataKey::Resolution, &outcome);

        let market_id: BytesN<32> = env.storage().instance().get(&DataKey::MarketId).unwrap();
        env.events()
            .publish((Symbol::new(&env, "market_resolved"), market_id), outcome);
        Ok(())
    }

    /// Close the market (all claims processed). Can be called by admin or auto after all claims.
    pub fn close(env: Env, factory: Address) -> Result<(), SharedError> {
        factory.require_auth();
        let stored_factory: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        if factory != stored_factory {
            return Err(SharedError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::Status, &MarketStatus::Closed);
        Ok(())
    }

    // ─── Volume Tracking ──────────────────────────────────────────────────────

    /// Record trade volume (called by AMM on swap).
    pub fn record_volume(env: Env, amm: Address, volume: i128) -> Result<(), SharedError> {
        amm.require_auth();
        let stored_amm: Address = env.storage().instance().get(&DataKey::AmmContract).unwrap();
        if amm != stored_amm {
            return Err(SharedError::Unauthorized);
        }
        let current: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalVolume)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalVolume, &(current + volume));
        Ok(())
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    pub fn get_state(env: Env) -> MarketState {
        MarketState {
            market_id: env.storage().instance().get(&DataKey::MarketId).unwrap(),
            title: env.storage().instance().get(&DataKey::Title).unwrap(),
            description: env.storage().instance().get(&DataKey::Description).unwrap(),
            category: env.storage().instance().get(&DataKey::Category).unwrap(),
            creator: env.storage().instance().get(&DataKey::Creator).unwrap(),
            expiry_timestamp: env
                .storage()
                .instance()
                .get(&DataKey::ExpiryTimestamp)
                .unwrap(),
            status: env.storage().instance().get(&DataKey::Status).unwrap(),
            yes_token: env.storage().instance().get(&DataKey::YesToken).unwrap(),
            no_token: env.storage().instance().get(&DataKey::NoToken).unwrap(),
            lp_token: env.storage().instance().get(&DataKey::LpToken).unwrap(),
            amm_contract: env.storage().instance().get(&DataKey::AmmContract).unwrap(),
            oracle_source: env
                .storage()
                .instance()
                .get(&DataKey::OracleSource)
                .unwrap(),
            threshold_value: env
                .storage()
                .instance()
                .get(&DataKey::ThresholdValue)
                .unwrap_or(0),
            threshold_operator: env
                .storage()
                .instance()
                .get(&DataKey::ThresholdOperator)
                .unwrap_or(0),
            created_at: env.storage().instance().get(&DataKey::CreatedAt).unwrap(),
            total_volume: env
                .storage()
                .instance()
                .get(&DataKey::TotalVolume)
                .unwrap_or(0),
        }
    }

    pub fn get_status(env: Env) -> MarketStatus {
        env.storage().instance().get(&DataKey::Status).unwrap()
    }

    pub fn get_resolution(env: Env) -> Option<Outcome> {
        env.storage().instance().get(&DataKey::Resolution)
    }

    pub fn get_yes_token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::YesToken).unwrap()
    }

    pub fn get_no_token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::NoToken).unwrap()
    }

    pub fn get_amm(env: Env) -> Address {
        env.storage().instance().get(&DataKey::AmmContract).unwrap()
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, BytesN, Env, String};
    use stellar_pm_shared::{MarketParams, MarketStatus};

    fn make_params(env: &Env, expiry: u64) -> MarketParams {
        MarketParams {
            title: String::from_str(env, "Will BTC exceed $150k by Dec 31 2026?"),
            description: String::from_str(env, "Resolves YES if BTC/USD closes above $150,000"),
            category: String::from_str(env, "crypto_price"),
            expiry_timestamp: expiry,
            oracle_source: String::from_str(env, "BTC_USD_COINGECKO"),
            threshold_value: 150_000 * 10_000_000,
            threshold_operator: 0,
            initial_liquidity: 0,
        }
    }

    #[test]
    fn test_initialize_and_state() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Market);
        let client = MarketClient::new(&env, &contract_id);

        let factory = Address::generate(&env);
        let creator = Address::generate(&env);
        let market_id = BytesN::from_array(&env, &[1u8; 32]);
        let params = make_params(&env, env.ledger().timestamp() + 86400);

        client.initialize(
            &factory,
            &market_id,
            &creator,
            &params,
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
        );

        let state = client.get_state();
        assert!(matches!(state.status, MarketStatus::Open));
        assert_eq!(state.creator, creator);
    }

    #[test]
    fn test_expire() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Market);
        let client = MarketClient::new(&env, &contract_id);

        let factory = Address::generate(&env);
        let creator = Address::generate(&env);
        let market_id = BytesN::from_array(&env, &[2u8; 32]);
        let expiry = env.ledger().timestamp() + 3600;
        let params = make_params(&env, expiry);

        client.initialize(
            &factory,
            &market_id,
            &creator,
            &params,
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
            &Address::generate(&env),
        );

        // Cannot expire before expiry
        assert!(client.try_expire().is_err());

        // Advance time
        env.ledger().with_mut(|l| l.timestamp = expiry + 1);

        client.expire();
        assert!(matches!(client.get_status(), MarketStatus::Expired));
    }
}
