//! OutcomeToken Contract — SEP-0041 compatible token for YES/NO market outcomes.
//!
//! Each market deploys two instances: one for YES, one for NO.
//! Minting is restricted to the AMM contract address set during initialization.
//! Burning is allowed by any token holder (for their own tokens).
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol};
use stellar_pm_shared::SharedError;

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Minter,
    Decimals,
    Name,
    Symbol,
    Balance(Address),
    Allowance(AllowanceKey),
    TotalSupply,
}

#[contracttype]
#[derive(Clone)]
struct AllowanceKey {
    from: Address,
    spender: Address,
}

#[contracttype]
#[derive(Clone)]
struct AllowanceValue {
    amount: i128,
    expiration_ledger: u32,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct OutcomeToken;

#[contractimpl]
impl OutcomeToken {
    /// Initialize the token (called by Factory/Market on deployment).
    pub fn initialize(
        env: Env,
        admin: Address,
        minter: Address,
        decimal: u32,
        name: String,
        symbol: String,
    ) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SharedError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Minter, &minter);
        env.storage().instance().set(&DataKey::Decimals, &decimal);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0_i128);
        Ok(())
    }

    // ─── SEP-0041 Standard Interface ──────────────────────────────────────────

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender: spender.clone(),
        });
        match env.storage().temporary().get::<_, AllowanceValue>(&key) {
            Some(allowance) => {
                if allowance.expiration_ledger < env.ledger().sequence() {
                    0
                } else {
                    allowance.amount
                }
            }
            None => 0,
        }
    }

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        expiration_ledger: u32,
    ) {
        from.require_auth();
        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender: spender.clone(),
        });
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount,
                expiration_ledger,
            },
        );
        env.storage()
            .temporary()
            .extend_ttl(&key, expiration_ledger, expiration_ledger);
        env.events().publish(
            (Symbol::new(&env, "approve"), from, spender),
            (amount, expiration_ledger),
        );
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::do_transfer(&env, &from, &to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            panic!("insufficient allowance");
        }
        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender,
        });
        let current = env
            .storage()
            .temporary()
            .get::<_, AllowanceValue>(&key)
            .unwrap();
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount: current.amount - amount,
                expiration_ledger: current.expiration_ledger,
            },
        );
        Self::do_transfer(&env, &from, &to, amount);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::do_burn(&env, &from, amount);
    }

    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            panic!("insufficient allowance");
        }
        let key = DataKey::Allowance(AllowanceKey {
            from: from.clone(),
            spender,
        });
        let current = env
            .storage()
            .temporary()
            .get::<_, AllowanceValue>(&key)
            .unwrap();
        env.storage().temporary().set(
            &key,
            &AllowanceValue {
                amount: current.amount - amount,
                expiration_ledger: current.expiration_ledger,
            },
        );
        Self::do_burn(&env, &from, amount);
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap()
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalSupply)
            .unwrap_or(0)
    }

    // ─── Extended Functions (minter-restricted) ───────────────────────────────

    /// Mint new tokens. Only callable by the authorized minter (AMM contract).
    pub fn mint(env: Env, to: Address, amount: i128) -> Result<(), SharedError> {
        let minter: Address = env.storage().instance().get(&DataKey::Minter).unwrap();
        minter.require_auth();
        if amount <= 0 {
            return Err(SharedError::InvalidParams);
        }
        let current = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(current + amount));
        let supply: i128 = Self::total_supply(env.clone());
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply + amount));
        env.events()
            .publish((Symbol::new(&env, "mint"), to), amount);
        Ok(())
    }

    /// Update the authorized minter (admin only).
    pub fn set_minter(env: Env, admin: Address, new_minter: Address) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Minter, &new_minter);
        Ok(())
    }

    pub fn get_minter(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Minter).unwrap()
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    fn do_transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to.clone()), &(to_balance + amount));
        env.events().publish(
            (Symbol::new(env, "transfer"), from.clone(), to.clone()),
            amount,
        );
    }

    fn do_burn(env: &Env, from: &Address, amount: i128) {
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic!("insufficient balance");
        }
        env.storage()
            .persistent()
            .set(&DataKey::Balance(from.clone()), &(from_balance - amount));
        let supply: i128 = Self::total_supply(env.clone());
        env.storage()
            .instance()
            .set(&DataKey::TotalSupply, &(supply - amount));
        env.events()
            .publish((Symbol::new(env, "burn"), from.clone()), amount);
    }

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

    fn setup() -> (Env, OutcomeTokenClient<'static>, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, OutcomeToken);
        let client = OutcomeTokenClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        let minter = Address::generate(&env);
        client.initialize(
            &admin,
            &minter,
            &7_u32,
            &String::from_str(&env, "BTC YES Token"),
            &String::from_str(&env, "BTC_YES"),
        );
        (env, client, admin, minter)
    }

    #[test]
    fn test_mint_and_balance() {
        let (env, client, _admin, _minter) = setup();
        let user = Address::generate(&env);
        client.mint(&user, &10_000_000_i128);
        assert_eq!(client.balance(&user), 10_000_000_i128);
        assert_eq!(client.total_supply(), 10_000_000_i128);
    }

    #[test]
    fn test_transfer() {
        let (env, client, _admin, _minter) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &1_000_i128);
        client.transfer(&alice, &bob, &400_i128);
        assert_eq!(client.balance(&alice), 600_i128);
        assert_eq!(client.balance(&bob), 400_i128);
    }

    #[test]
    fn test_burn() {
        let (env, client, _admin, _minter) = setup();
        let user = Address::generate(&env);
        client.mint(&user, &1_000_i128);
        client.burn(&user, &300_i128);
        assert_eq!(client.balance(&user), 700_i128);
        assert_eq!(client.total_supply(), 700_i128);
    }

    #[test]
    #[should_panic]
    fn test_transfer_insufficient_balance() {
        let (env, client, _admin, _minter) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &100_i128);
        client.transfer(&alice, &bob, &200_i128); // should panic
    }
}
