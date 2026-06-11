//! Treasury Contract — collects and holds protocol fees.
//!
//! Only the admin can withdraw. Deposits are permissionless (any authorized
//! contract can call `deposit`). Admin is expected to be a multi-sig account.
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};
use stellar_pm_shared::SharedError;

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    /// Authorized depositors (contracts that can call deposit)
    Depositor(Address),
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct Treasury;

#[contractimpl]
impl Treasury {
    /// Initialize the treasury with an admin address.
    pub fn initialize(env: Env, admin: Address) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SharedError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        Ok(())
    }

    /// Add an authorized depositor (admin only).
    pub fn add_depositor(env: Env, admin: Address, depositor: Address) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage()
            .instance()
            .set(&DataKey::Depositor(depositor), &true);
        Ok(())
    }

    /// Deposit tokens into the treasury.
    /// Caller must be an authorized depositor.
    pub fn deposit(
        env: Env,
        from: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), SharedError> {
        from.require_auth();
        if amount <= 0 {
            return Err(SharedError::InvalidParams);
        }
        let token_client = token::Client::new(&env, &token);
        let treasury_address = env.current_contract_address();
        token_client.transfer(&from, &treasury_address, &amount);
        env.events()
            .publish((Symbol::new(&env, "deposit"),), (from, token, amount));
        Ok(())
    }

    /// Withdraw tokens from the treasury (admin only).
    pub fn withdraw(
        env: Env,
        admin: Address,
        token: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        if amount <= 0 {
            return Err(SharedError::InvalidParams);
        }
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &to, &amount);
        env.events()
            .publish((Symbol::new(&env, "withdraw"),), (admin, token, to, amount));
        Ok(())
    }

    /// Get the treasury's balance of a specific token.
    pub fn balance(env: Env, token: Address) -> i128 {
        let token_client = token::Client::new(&env, &token);
        token_client.balance(&env.current_contract_address())
    }

    /// Transfer admin role to a new address.
    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        Ok(())
    }

    /// Get current admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) -> Result<(), SharedError> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if &admin != caller {
            return Err(SharedError::Unauthorized);
        }
        Ok(())
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
        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        client.initialize(&admin);
        assert_eq!(client.get_admin(), admin);
    }

    #[test]
    #[should_panic]
    fn test_double_initialize_fails() {
        let env = Env::default();
        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);

        client.initialize(&admin);
        client.initialize(&admin); // should panic
    }

    #[test]
    fn test_transfer_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, Treasury);
        let client = TreasuryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);

        client.initialize(&admin);
        client.transfer_admin(&admin, &new_admin);
        assert_eq!(client.get_admin(), new_admin);
    }
}
