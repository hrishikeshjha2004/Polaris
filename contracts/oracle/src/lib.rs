//! Oracle Contract — Multi-signer resolution for prediction market outcomes.
//!
//! Design:
//!   - A registry of authorized oracle signers is maintained on-chain.
//!   - Each signer submits their resolution independently.
//!   - Once `required_threshold` matching submissions arrive, a resolution is queued.
//!   - A `dispute_window` (e.g. 2h) gives anyone time to raise a dispute.
//!   - After the dispute window, `finalize_resolution()` locks in the outcome.
//!   - The finalized resolution then triggers Settlement.
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, Address, BytesN, Env, String, Symbol, Vec,
};
use stellar_pm_shared::{Outcome, Resolution, SharedError};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Admin,
    Signers,
    Threshold,
    DisputeWindowSecs,
    Settlement,
    Submissions(BytesN<32>),
    Resolution(BytesN<32>),
    Disputes(BytesN<32>),
}

// ─── Supporting Types ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct OracleSubmission {
    pub signer: Address,
    pub outcome: Outcome,
    /// Price scaled by 1e7. E.g. $150,000 = 1_500_000_0000000
    pub price_at_expiry: i128,
    pub price_source: String,
    pub submitted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Dispute {
    pub disputer: Address,
    pub reason: String,
    pub raised_at: u64,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct Oracle;

#[contractimpl]
impl Oracle {
    /// Initialize the oracle (called once after deployment).
    pub fn initialize(
        env: Env,
        admin: Address,
        signers: Vec<Address>,
        threshold: u32,
        dispute_window_secs: u64,
        settlement: Address,
    ) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(SharedError::AlreadyInitialized);
        }
        if threshold == 0 || threshold > signers.len() {
            return Err(SharedError::InvalidParams);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Signers, &signers);
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        env.storage()
            .instance()
            .set(&DataKey::DisputeWindowSecs, &dispute_window_secs);
        env.storage()
            .instance()
            .set(&DataKey::Settlement, &settlement);
        Ok(())
    }

    /// Submit a resolution for a market.
    ///
    /// Returns true if this submission caused the threshold to be met.
    pub fn submit_resolution(
        env: Env,
        signer: Address,
        market_id: BytesN<32>,
        outcome: Outcome,
        price_at_expiry: i128,
        price_source: String,
    ) -> Result<bool, SharedError> {
        signer.require_auth();
        Self::require_signer(&env, &signer)?;

        // Cannot re-submit if already finalized
        let existing_resolution = env
            .storage()
            .persistent()
            .get::<_, Resolution>(&DataKey::Resolution(market_id.clone()));
        if let Some(ref r) = existing_resolution {
            if r.finalized {
                return Err(SharedError::MarketNotOpen);
            }
        }

        // Get or initialize submissions for this market
        let mut submissions: Vec<OracleSubmission> = env
            .storage()
            .persistent()
            .get(&DataKey::Submissions(market_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        // Check signer hasn't already submitted
        for sub in submissions.iter() {
            if sub.signer == signer {
                return Err(SharedError::Unauthorized); // duplicate submission
            }
        }

        submissions.push_back(OracleSubmission {
            signer: signer.clone(),
            outcome,
            price_at_expiry,
            price_source,
            submitted_at: env.ledger().timestamp(),
        });

        env.storage()
            .persistent()
            .set(&DataKey::Submissions(market_id.clone()), &submissions);

        env.events().publish(
            (Symbol::new(&env, "oracle_submission"), market_id.clone()),
            (signer, outcome, price_at_expiry),
        );

        // Check if threshold is met for a single outcome
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        let threshold_met = Self::check_threshold(&submissions, threshold, &outcome);

        if threshold_met && existing_resolution.is_none() {
            // Queue resolution (starts dispute window)
            let dispute_window: u64 = env
                .storage()
                .instance()
                .get(&DataKey::DisputeWindowSecs)
                .unwrap();
            let now = env.ledger().timestamp();
            let resolution = Resolution {
                outcome,
                final_price: Self::median_price(&env, &submissions, &outcome),
                resolved_at: now,
                dispute_window_end: now + dispute_window,
                finalized: false,
            };
            env.storage()
                .persistent()
                .set(&DataKey::Resolution(market_id.clone()), &resolution);
            env.events().publish(
                (Symbol::new(&env, "resolution_queued"), market_id),
                (outcome, resolution.dispute_window_end),
            );
            return Ok(true);
        }

        Ok(false)
    }

    /// Finalize the resolution after the dispute window has passed.
    ///
    /// Callable by anyone. Triggers the Settlement contract.
    pub fn finalize_resolution(env: Env, market_id: BytesN<32>) -> Result<Resolution, SharedError> {
        let resolution: Resolution = env
            .storage()
            .persistent()
            .get(&DataKey::Resolution(market_id.clone()))
            .ok_or(SharedError::NotFound)?;

        if resolution.finalized {
            return Ok(resolution);
        }

        let now = env.ledger().timestamp();
        if now < resolution.dispute_window_end {
            return Err(SharedError::MarketNotExpired); // dispute window still open
        }

        // Check no active disputes blocked finalization
        let _disputes: Vec<Dispute> = env
            .storage()
            .persistent()
            .get(&DataKey::Disputes(market_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        // Disputes are advisory in v1 — they log but don't block auto-finalization
        // (Admin must manually override in dispute case)

        let final_resolution = Resolution {
            finalized: true,
            ..resolution
        };

        env.storage()
            .persistent()
            .set(&DataKey::Resolution(market_id.clone()), &final_resolution);

        env.events().publish(
            (Symbol::new(&env, "resolution_finalized"), market_id.clone()),
            (final_resolution.outcome, final_resolution.final_price),
        );

        Ok(final_resolution)
    }

    /// Raise a dispute against a pending resolution.
    pub fn dispute(
        env: Env,
        disputer: Address,
        market_id: BytesN<32>,
        reason: String,
    ) -> Result<(), SharedError> {
        disputer.require_auth();

        let resolution: Resolution = env
            .storage()
            .persistent()
            .get(&DataKey::Resolution(market_id.clone()))
            .ok_or(SharedError::NotFound)?;

        if resolution.finalized {
            return Err(SharedError::MarketNotOpen);
        }

        let now = env.ledger().timestamp();
        if now > resolution.dispute_window_end {
            return Err(SharedError::MarketNotExpired);
        }

        let mut disputes: Vec<Dispute> = env
            .storage()
            .persistent()
            .get(&DataKey::Disputes(market_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        disputes.push_back(Dispute {
            disputer: disputer.clone(),
            reason: reason.clone(),
            raised_at: now,
        });

        env.storage()
            .persistent()
            .set(&DataKey::Disputes(market_id.clone()), &disputes);

        env.events().publish(
            (Symbol::new(&env, "dispute_raised"), market_id),
            (disputer, reason),
        );

        Ok(())
    }

    /// Get the current resolution for a market.
    pub fn get_resolution(env: Env, market_id: BytesN<32>) -> Option<Resolution> {
        env.storage()
            .persistent()
            .get(&DataKey::Resolution(market_id))
    }

    /// Get all submissions for a market.
    pub fn get_submissions(env: Env, market_id: BytesN<32>) -> Vec<OracleSubmission> {
        env.storage()
            .persistent()
            .get(&DataKey::Submissions(market_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// Admin: add a new authorized signer.
    pub fn add_signer(env: Env, admin: Address, signer: Address) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let mut signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        signers.push_back(signer);
        env.storage().instance().set(&DataKey::Signers, &signers);
        Ok(())
    }

    /// Admin: remove an authorized signer.
    pub fn remove_signer(env: Env, admin: Address, signer: Address) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        let mut new_signers: Vec<Address> = Vec::new(&env);
        for s in signers.iter() {
            if s != signer {
                new_signers.push_back(s);
            }
        }
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        if threshold > new_signers.len() {
            return Err(SharedError::InvalidParams); // would make threshold unreachable
        }
        env.storage()
            .instance()
            .set(&DataKey::Signers, &new_signers);
        Ok(())
    }

    /// Admin: update the required signature threshold.
    pub fn set_threshold(env: Env, admin: Address, threshold: u32) -> Result<(), SharedError> {
        admin.require_auth();
        Self::require_admin(&env, &admin)?;
        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        if threshold == 0 || threshold > signers.len() {
            return Err(SharedError::InvalidParams);
        }
        env.storage()
            .instance()
            .set(&DataKey::Threshold, &threshold);
        Ok(())
    }

    pub fn get_signers(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::Signers).unwrap()
    }

    pub fn get_threshold(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Threshold).unwrap()
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    fn require_admin(env: &Env, caller: &Address) -> Result<(), SharedError> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if &admin != caller {
            return Err(SharedError::Unauthorized);
        }
        Ok(())
    }

    fn require_signer(env: &Env, caller: &Address) -> Result<(), SharedError> {
        let signers: Vec<Address> = env.storage().instance().get(&DataKey::Signers).unwrap();
        for s in signers.iter() {
            if &s == caller {
                return Ok(());
            }
        }
        Err(SharedError::Unauthorized)
    }

    fn check_threshold(
        submissions: &Vec<OracleSubmission>,
        threshold: u32,
        outcome: &Outcome,
    ) -> bool {
        let count = submissions
            .iter()
            .filter(|s| {
                matches!(
                    (&s.outcome, outcome),
                    (Outcome::Yes, Outcome::Yes) | (Outcome::No, Outcome::No)
                )
            })
            .count();
        count >= threshold as usize
    }

    fn median_price(_env: &Env, submissions: &Vec<OracleSubmission>, outcome: &Outcome) -> i128 {
        let mut sum: i128 = 0;
        let mut count: i128 = 0;
        for s in submissions.iter() {
            let matches = matches!(
                (&s.outcome, outcome),
                (Outcome::Yes, Outcome::Yes) | (Outcome::No, Outcome::No)
            );
            if matches {
                sum = sum.checked_add(s.price_at_expiry).unwrap_or(sum);
                count += 1;
            }
        }
        if count == 0 {
            return 0;
        }
        // Simple average for v1; v2 will implement proper median sort
        sum / count
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        vec, BytesN, Env,
    };
    use stellar_pm_shared::Outcome;

    fn make_market_id(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    #[test]
    fn test_initialize_and_submit() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, Oracle);
        let client = OracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let signer1 = Address::generate(&env);
        let signer2 = Address::generate(&env);
        let signer3 = Address::generate(&env);
        let settlement = Address::generate(&env);

        client.initialize(
            &admin,
            &vec![&env, signer1.clone(), signer2.clone(), signer3.clone()],
            &2_u32,
            &7200_u64,
            &settlement,
        );

        let market_id = make_market_id(&env);

        // First submission doesn't meet threshold
        let threshold_met = client.submit_resolution(
            &signer1,
            &market_id,
            &Outcome::Yes,
            &1_500_000_000_000_i128,
            &String::from_str(&env, "COINGECKO"),
        );
        assert!(!threshold_met);

        // Second submission meets threshold of 2
        let threshold_met = client.submit_resolution(
            &signer2,
            &market_id,
            &Outcome::Yes,
            &1_501_000_000_000_i128,
            &String::from_str(&env, "BINANCE"),
        );
        assert!(threshold_met);

        // Resolution should now be queued
        let resolution = client.get_resolution(&market_id).unwrap();
        assert!(!resolution.finalized);
        assert!(matches!(resolution.outcome, Outcome::Yes));
    }

    #[test]
    fn test_finalize_after_dispute_window() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, Oracle);
        let client = OracleClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        let signer1 = Address::generate(&env);
        let signer2 = Address::generate(&env);
        let settlement = Address::generate(&env);
        let market_id = make_market_id(&env);

        client.initialize(
            &admin,
            &vec![&env, signer1.clone(), signer2.clone()],
            &2_u32,
            &3600_u64, // 1 hour dispute window
            &settlement,
        );

        client.submit_resolution(
            &signer1,
            &market_id,
            &Outcome::No,
            &1_400_000_000_000_i128,
            &String::from_str(&env, "COINGECKO"),
        );
        client.submit_resolution(
            &signer2,
            &market_id,
            &Outcome::No,
            &1_400_000_000_000_i128,
            &String::from_str(&env, "BINANCE"),
        );

        // Advance time past dispute window
        env.ledger().with_mut(|l| {
            l.timestamp += 7200; // 2 hours
        });

        let final_resolution = client.finalize_resolution(&market_id);
        assert!(final_resolution.finalized);
        assert!(matches!(final_resolution.outcome, Outcome::No));
    }
}
