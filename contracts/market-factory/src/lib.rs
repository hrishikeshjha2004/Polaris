//! MarketFactory Contract — the entry point for creating prediction markets.
//!
//! Responsibilities:
//!   - Accept market creation fees
//!   - Deploy Market contract instances
//!   - Register markets in global registry
//!   - Provide market discovery (list, get)
//!
//! Factory stores child contract WASM hashes so it can deploy new instances.
//! This pattern follows Uniswap's Factory model adapted for Soroban.
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, IntoVal, String,
    Symbol, Vec,
};
use stellar_pm_shared::{MarketParams, SharedError};

// Default AMM fee configuration applied to every new market.
const SWAP_FEE_BPS: u32 = 30; // 0.30% total swap fee
const LP_FEE_SHARE_BPS: u32 = 8000; // 80% of fees to LPs, 20% to treasury
const TOKEN_DECIMALS: u32 = 7; // matches USDC + SCALE (1e7)

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    CreationFeeUsdc,
    UsdcToken,
    OracleContract,
    SettlementContract,
    TreasuryContract,
    /// WASM hashes for child contract deployment
    MarketWasm,
    TokenWasm,
    AmmWasm,
    /// Market registry: index → MarketId
    MarketByIndex(u64),
    /// Market registry: MarketId → Address
    MarketAddress(BytesN<32>),
    MarketCount,
    Paused,
}

// ─── Event Types ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketCreatedEvent {
    pub market_id: BytesN<32>,
    pub creator: Address,
    pub contract_address: Address,
    pub title: String,
    pub expiry: u64,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct MarketFactory;

#[contractimpl]
impl MarketFactory {
    /// Initialize the factory (called once after deployment).
    pub fn initialize(
        env: Env,
        admin: Address,
        creation_fee_usdc: i128,
        usdc_token: Address,
        oracle: Address,
        settlement: Address,
        treasury: Address,
        market_wasm_hash: BytesN<32>,
        token_wasm_hash: BytesN<32>,
        amm_wasm_hash: BytesN<32>,
    ) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SharedError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CreationFeeUsdc, &creation_fee_usdc);
        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);
        env.storage()
            .instance()
            .set(&DataKey::OracleContract, &oracle);
        env.storage()
            .instance()
            .set(&DataKey::SettlementContract, &settlement);
        env.storage()
            .instance()
            .set(&DataKey::TreasuryContract, &treasury);
        env.storage()
            .instance()
            .set(&DataKey::MarketWasm, &market_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::TokenWasm, &token_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::AmmWasm, &amm_wasm_hash);
        env.storage().instance().set(&DataKey::MarketCount, &0_u64);
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    /// Create a new prediction market.
    ///
    /// Creator must approve `creation_fee` USDC before calling.
    /// Factory deploys Market + YES Token + NO Token + LP Token + AMM contracts.
    ///
    /// Returns the unique market ID (deterministic hash of params + creator + nonce).
    pub fn create_market(
        env: Env,
        creator: Address,
        params: MarketParams,
    ) -> Result<BytesN<32>, SharedError> {
        creator.require_auth();

        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            return Err(SharedError::Paused);
        }

        // Validate params
        if params.title.is_empty() || params.expiry_timestamp == 0 {
            return Err(SharedError::InvalidParams);
        }
        if params.expiry_timestamp <= env.ledger().timestamp() {
            return Err(SharedError::InvalidParams); // expiry must be in the future
        }

        // Collect creation fee
        let fee: i128 = env
            .storage()
            .instance()
            .get(&DataKey::CreationFeeUsdc)
            .unwrap();
        if fee > 0 {
            let usdc: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
            let treasury: Address = env
                .storage()
                .instance()
                .get(&DataKey::TreasuryContract)
                .unwrap();
            let usdc_client = token::Client::new(&env, &usdc);
            usdc_client.transfer_from(&env.current_contract_address(), &creator, &treasury, &fee);
        }

        // Generate deterministic market ID
        let market_count: u64 = env.storage().instance().get(&DataKey::MarketCount).unwrap();
        let market_id = Self::derive_market_id(&env, &creator, &params.title, market_count);

        // Deploy YES, NO, LP token contracts
        let token_wasm: BytesN<32> = env.storage().instance().get(&DataKey::TokenWasm).unwrap();
        let yes_token = Self::deploy_token(
            &env,
            &token_wasm,
            &market_id,
            0,
            &creator,
            &params.title,
            "YES",
        );
        let no_token = Self::deploy_token(
            &env,
            &token_wasm,
            &market_id,
            1,
            &creator,
            &params.title,
            "NO",
        );
        let lp_token = Self::deploy_token(
            &env,
            &token_wasm,
            &market_id,
            2,
            &creator,
            &params.title,
            "LP",
        );

        // Deploy AMM contract
        let amm_wasm: BytesN<32> = env.storage().instance().get(&DataKey::AmmWasm).unwrap();
        let amm_address = Self::deploy_amm(
            &env, &amm_wasm, &market_id, &yes_token, &no_token, &lp_token,
        );

        // Deploy Market contract
        let market_wasm: BytesN<32> = env.storage().instance().get(&DataKey::MarketWasm).unwrap();
        let market_address = Self::deploy_market(
            &env,
            &market_wasm,
            &market_id,
            &creator,
            &params,
            &yes_token,
            &no_token,
            &lp_token,
            &amm_address,
        );

        // ── Initialize all child contracts (addresses are now all known) ──────
        let usdc: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
        let treasury: Address = env
            .storage()
            .instance()
            .get(&DataKey::TreasuryContract)
            .unwrap();
        let oracle: Address = env
            .storage()
            .instance()
            .get(&DataKey::OracleContract)
            .unwrap();
        let settlement: Address = env
            .storage()
            .instance()
            .get(&DataKey::SettlementContract)
            .unwrap();
        let factory_addr = env.current_contract_address();

        // YES / NO / LP tokens — minter is the AMM so it can mint complete sets.
        Self::init_token(&env, &yes_token, &factory_addr, &amm_address, "YES", "YES");
        Self::init_token(&env, &no_token, &factory_addr, &amm_address, "NO", "NO");
        Self::init_token(
            &env,
            &lp_token,
            &factory_addr,
            &amm_address,
            "StellarPM LP",
            "SPMLP",
        );

        // AMM — holds USDC collateral and the YES/NO reserves.
        Self::init_amm(
            &env,
            &amm_address,
            &market_address,
            &yes_token,
            &no_token,
            &lp_token,
            &treasury,
            &usdc,
        );

        // Market — the per-market coordinator.
        Self::init_market(
            &env,
            &market_address,
            &factory_addr,
            &market_id,
            &creator,
            &params,
            &yes_token,
            &no_token,
            &lp_token,
            &amm_address,
            &oracle,
            &settlement,
        );

        // Register in storage
        env.storage()
            .instance()
            .set(&DataKey::MarketByIndex(market_count), &market_id);
        env.storage()
            .persistent()
            .set(&DataKey::MarketAddress(market_id.clone()), &market_address);
        env.storage()
            .instance()
            .set(&DataKey::MarketCount, &(market_count + 1));

        env.events().publish(
            (Symbol::new(&env, "market_created"), creator.clone()),
            MarketCreatedEvent {
                market_id: market_id.clone(),
                creator,
                contract_address: market_address,
                title: params.title,
                expiry: params.expiry_timestamp,
            },
        );

        Ok(market_id)
    }

    /// Get market contract address by market ID.
    pub fn get_market(env: Env, market_id: BytesN<32>) -> Result<Address, SharedError> {
        env.storage()
            .persistent()
            .get(&DataKey::MarketAddress(market_id))
            .ok_or(SharedError::NotFound)
    }

    /// List markets with pagination (returns market IDs).
    pub fn list_markets(env: Env, offset: u32, limit: u32) -> Vec<BytesN<32>> {
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::MarketCount)
            .unwrap_or(0);
        let mut result = Vec::new(&env);
        let start = offset as u64;
        let end = (start + limit as u64).min(count);
        for i in start..end {
            if let Some(id) = env
                .storage()
                .instance()
                .get::<_, BytesN<32>>(&DataKey::MarketByIndex(i))
            {
                result.push_back(id);
            }
        }
        result
    }

    pub fn market_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::MarketCount)
            .unwrap_or(0)
    }

    /// Admin: update creation fee.
    pub fn set_creation_fee(env: Env, admin: Address, fee: i128) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::CreationFeeUsdc, &fee);
        Ok(())
    }

    /// Admin: pause/unpause market creation.
    pub fn set_paused(env: Env, admin: Address, paused: bool) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Paused, &paused);
        Ok(())
    }

    /// Admin: update WASM hashes for future deployments.
    pub fn update_market_wasm(
        env: Env,
        admin: Address,
        market_wasm: BytesN<32>,
    ) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::MarketWasm, &market_wasm);
        Ok(())
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // ─── Internal: Contract Deployment ────────────────────────────────────────

    fn derive_market_id(env: &Env, _creator: &Address, _title: &String, nonce: u64) -> BytesN<32> {
        let mut input = Bytes::new(env);
        input.extend_from_array(&nonce.to_be_bytes());
        env.crypto().sha256(&input).into()
    }

    fn deploy_token(
        env: &Env,
        wasm_hash: &BytesN<32>,
        market_id: &BytesN<32>,
        token_type: u8,
        _admin: &Address,
        _market_title: &String,
        _suffix: &str,
    ) -> Address {
        let mut salt = Bytes::new(env);
        salt.extend_from_array(&market_id.to_array());
        salt.push_back(token_type);
        let salt_hash: BytesN<32> = env.crypto().sha256(&salt).into();
        env.deployer()
            .with_current_contract(salt_hash)
            .deploy(wasm_hash.clone())
    }

    fn deploy_amm(
        env: &Env,
        wasm_hash: &BytesN<32>,
        market_id: &BytesN<32>,
        _yes_token: &Address,
        _no_token: &Address,
        _lp_token: &Address,
    ) -> Address {
        let mut salt = Bytes::new(env);
        salt.extend_from_array(&market_id.to_array());
        salt.push_back(10u8);
        let salt_hash: BytesN<32> = env.crypto().sha256(&salt).into();
        env.deployer()
            .with_current_contract(salt_hash)
            .deploy(wasm_hash.clone())
    }

    fn deploy_market(
        env: &Env,
        wasm_hash: &BytesN<32>,
        market_id: &BytesN<32>,
        _creator: &Address,
        _params: &MarketParams,
        _yes_token: &Address,
        _no_token: &Address,
        _lp_token: &Address,
        _amm: &Address,
    ) -> Address {
        let mut salt = Bytes::new(env);
        salt.extend_from_array(&market_id.to_array());
        salt.push_back(20u8);
        let salt_hash: BytesN<32> = env.crypto().sha256(&salt).into();
        env.deployer()
            .with_current_contract(salt_hash)
            .deploy(wasm_hash.clone())
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), SharedError> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if &admin != caller {
            return Err(SharedError::Unauthorized);
        }
        Ok(())
    }

    // ─── Internal: Child Initialization ───────────────────────────────────────

    /// Initialize an OutcomeToken: initialize(admin, minter, decimal, name, symbol)
    fn init_token(
        env: &Env,
        token_addr: &Address,
        admin: &Address,
        minter: &Address,
        name: &str,
        symbol: &str,
    ) {
        let mut args = Vec::new(env);
        args.push_back(admin.into_val(env));
        args.push_back(minter.into_val(env));
        args.push_back(TOKEN_DECIMALS.into_val(env));
        args.push_back(String::from_str(env, name).into_val(env));
        args.push_back(String::from_str(env, symbol).into_val(env));
        env.invoke_contract::<()>(token_addr, &Symbol::new(env, "initialize"), args);
    }

    /// Initialize the AMM:
    /// initialize(market, yes, no, lp, treasury, usdc, swap_fee_bps, lp_fee_share_bps)
    fn init_amm(
        env: &Env,
        amm: &Address,
        market: &Address,
        yes_token: &Address,
        no_token: &Address,
        lp_token: &Address,
        treasury: &Address,
        usdc: &Address,
    ) {
        let mut args = Vec::new(env);
        args.push_back(market.into_val(env));
        args.push_back(yes_token.into_val(env));
        args.push_back(no_token.into_val(env));
        args.push_back(lp_token.into_val(env));
        args.push_back(treasury.into_val(env));
        args.push_back(usdc.into_val(env));
        args.push_back(SWAP_FEE_BPS.into_val(env));
        args.push_back(LP_FEE_SHARE_BPS.into_val(env));
        env.invoke_contract::<()>(amm, &Symbol::new(env, "initialize"), args);
    }

    /// Initialize the Market:
    /// initialize(factory, market_id, creator, params, yes, no, lp, amm, oracle, settlement)
    fn init_market(
        env: &Env,
        market: &Address,
        factory: &Address,
        market_id: &BytesN<32>,
        creator: &Address,
        params: &MarketParams,
        yes_token: &Address,
        no_token: &Address,
        lp_token: &Address,
        amm: &Address,
        oracle: &Address,
        settlement: &Address,
    ) {
        let mut args = Vec::new(env);
        args.push_back(factory.into_val(env));
        args.push_back(market_id.into_val(env));
        args.push_back(creator.into_val(env));
        args.push_back(params.into_val(env));
        args.push_back(yes_token.into_val(env));
        args.push_back(no_token.into_val(env));
        args.push_back(lp_token.into_val(env));
        args.push_back(amm.into_val(env));
        args.push_back(oracle.into_val(env));
        args.push_back(settlement.into_val(env));
        env.invoke_contract::<()>(market, &Symbol::new(env, "initialize"), args);
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
        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let oracle = Address::generate(&env);
        let settlement = Address::generate(&env);
        let treasury = Address::generate(&env);
        let usdc = Address::generate(&env);
        let wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

        client.initialize(
            &admin,
            &0_i128,
            &usdc,
            &oracle,
            &settlement,
            &treasury,
            &wasm_hash,
            &wasm_hash,
            &wasm_hash,
        );

        assert_eq!(client.market_count(), 0);
        assert!(!client.is_paused());
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    fn test_pause() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, MarketFactory);
        let client = MarketFactoryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let usdc = Address::generate(&env);
        let oracle = Address::generate(&env);
        let settlement = Address::generate(&env);
        let treasury = Address::generate(&env);
        let wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

        client.initialize(
            &admin,
            &0_i128,
            &usdc,
            &oracle,
            &settlement,
            &treasury,
            &wasm_hash,
            &wasm_hash,
            &wasm_hash,
        );

        client.set_paused(&admin, &true);
        assert!(client.is_paused());

        client.set_paused(&admin, &false);
        assert!(!client.is_paused());
    }
}
