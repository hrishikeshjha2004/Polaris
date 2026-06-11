//! AMM Contract — Fixed-Product Market Maker with USDC collateral.
//!
//! Economic model (Gnosis/Polymarket style):
//!   - USDC is the collateral. 1 USDC ⇄ 1 YES + 1 NO ("complete set").
//!   - The pool holds YES and NO reserves; their product is the invariant.
//!   - BUY YES with USDC `d`: mint `d` complete sets into the pool, then the
//!     constant-product curve hands the trader the YES that keeps `yes*no = k`.
//!   - SELL YES: the inverse — the trader's YES enters the pool, a matched
//!     complete set is redeemed for USDC, and the curve is preserved.
//!   - Every outcome token in circulation is backed by >= 1 USDC of collateral,
//!     so winners can always be paid at settlement.
//!
//! Invariants:
//!   1. yes_reserves * no_reserves is preserved across buy/sell (minus fees).
//!   2. usdc_reserves >= outstanding complete sets (solvency).
//!   3. Price(YES) + Price(NO) = 1 USDC.
#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, IntoVal, Symbol, Vec,
};
use stellar_pm_shared::{calc_fee, sqrt, SharedError, BPS, MIN_LP_SHARES};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Market,
    YesToken,
    NoToken,
    LpToken,
    Treasury,
    UsdcToken,
    YesReserves,
    NoReserves,
    UsdcReserves,
    LpTotalSupply,
    SwapFeeBps,
    LpFeeShareBps,
    CumulativeFees,
    Initialized,
}

// ─── Return Types ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct BuyResult {
    pub usdc_in: i128,
    pub tokens_out: i128,
    pub fee_paid: i128,
    pub price_impact_bps: u32,
    pub new_yes_price_bps: i128,
    pub new_no_price_bps: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct SellResult {
    pub tokens_in: i128,
    pub usdc_out: i128,
    pub fee_paid: i128,
    pub price_impact_bps: u32,
    pub new_yes_price_bps: i128,
    pub new_no_price_bps: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct QuoteResult {
    pub amount_out: i128,
    pub fee: i128,
    pub price_impact_bps: u32,
    pub yes_price_bps: i128,
    pub no_price_bps: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolState {
    pub yes_reserves: i128,
    pub no_reserves: i128,
    pub usdc_reserves: i128,
    pub lp_total_supply: i128,
    pub yes_price_bps: i128,
    pub no_price_bps: i128,
    pub swap_fee_bps: u32,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct Amm;

#[contractimpl]
impl Amm {
    /// Initialize the AMM pool. Called once by the Factory after deployment.
    pub fn initialize(
        env: Env,
        market: Address,
        yes_token: Address,
        no_token: Address,
        lp_token: Address,
        treasury: Address,
        usdc_token: Address,
        swap_fee_bps: u32,
        lp_fee_share_bps: u32,
    ) -> Result<(), SharedError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(SharedError::AlreadyInitialized);
        }
        if swap_fee_bps > 1000 {
            return Err(SharedError::InvalidParams); // max 10% fee
        }
        if lp_fee_share_bps > 10000 {
            return Err(SharedError::InvalidParams);
        }

        env.storage().instance().set(&DataKey::Market, &market);
        env.storage().instance().set(&DataKey::YesToken, &yes_token);
        env.storage().instance().set(&DataKey::NoToken, &no_token);
        env.storage().instance().set(&DataKey::LpToken, &lp_token);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage()
            .instance()
            .set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::YesReserves, &0_i128);
        env.storage().instance().set(&DataKey::NoReserves, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::UsdcReserves, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::LpTotalSupply, &0_i128);
        env.storage()
            .instance()
            .set(&DataKey::SwapFeeBps, &swap_fee_bps);
        env.storage()
            .instance()
            .set(&DataKey::LpFeeShareBps, &lp_fee_share_bps);
        env.storage()
            .instance()
            .set(&DataKey::CumulativeFees, &0_i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
        Ok(())
    }

    // ─── Liquidity (USDC denominated) ──────────────────────────────────────────

    /// Add liquidity by depositing USDC.
    ///
    /// The AMM mints `usdc_amount` complete sets (equal YES + NO) into the pool,
    /// so a fresh pool always starts perfectly balanced at 50/50. LPs never need
    /// to pre-hold outcome tokens.
    ///
    /// Returns: number of LP shares minted.
    pub fn add_liquidity_usdc(
        env: Env,
        provider: Address,
        usdc_amount: i128,
        min_lp_out: i128,
    ) -> Result<i128, SharedError> {
        provider.require_auth();
        if usdc_amount <= 0 {
            return Err(SharedError::InvalidParams);
        }

        let yes_reserves = Self::get_yes_reserves(&env);
        let no_reserves = Self::get_no_reserves(&env);
        let lp_supply = Self::get_lp_supply(&env);

        // LP shares: first deposit = usdc_amount - MIN; later = proportional.
        let lp_minted = if lp_supply == 0 {
            usdc_amount
                .checked_sub(MIN_LP_SHARES)
                .ok_or(SharedError::InsufficientLiquidity)?
        } else {
            // Pool is balanced in USDC terms; both sides grew equally so either
            // ratio works. Use YES side.
            usdc_amount
                .checked_mul(lp_supply)
                .ok_or(SharedError::Overflow)?
                .checked_div(yes_reserves)
                .ok_or(SharedError::DivisionByZero)?
        };

        if lp_minted < min_lp_out {
            return Err(SharedError::SlippageExceeded);
        }

        let amm = env.current_contract_address();

        // Pull USDC collateral from provider.
        let usdc = Self::get_usdc_token(&env);
        token::Client::new(&env, &usdc).transfer(&provider, &amm, &usdc_amount);

        // Mint a complete set into the pool (AMM custody).
        Self::mint_token(&env, &Self::get_yes_token(&env), &amm, usdc_amount);
        Self::mint_token(&env, &Self::get_no_token(&env), &amm, usdc_amount);

        // Update reserves.
        env.storage()
            .instance()
            .set(&DataKey::YesReserves, &(yes_reserves + usdc_amount));
        env.storage()
            .instance()
            .set(&DataKey::NoReserves, &(no_reserves + usdc_amount));
        Self::add_usdc_reserves(&env, usdc_amount);

        let total_minted = if lp_supply == 0 {
            lp_minted + MIN_LP_SHARES
        } else {
            lp_minted
        };
        env.storage()
            .instance()
            .set(&DataKey::LpTotalSupply, &(lp_supply + total_minted));

        Self::mint_token(&env, &Self::get_lp_token(&env), &provider, lp_minted);

        env.events().publish(
            (Symbol::new(&env, "add_liquidity"), provider.clone()),
            (usdc_amount, usdc_amount, lp_minted),
        );

        Ok(lp_minted)
    }

    /// Remove liquidity, returning USDC (and any residual outcome tokens if the
    /// pool is imbalanced).
    ///
    /// Returns: (usdc_out, residual_yes, residual_no).
    pub fn remove_liquidity_usdc(
        env: Env,
        provider: Address,
        lp_shares: i128,
        min_usdc_out: i128,
    ) -> Result<(i128, i128, i128), SharedError> {
        provider.require_auth();
        if lp_shares <= 0 {
            return Err(SharedError::InvalidParams);
        }

        let yes_reserves = Self::get_yes_reserves(&env);
        let no_reserves = Self::get_no_reserves(&env);
        let lp_supply = Self::get_lp_supply(&env);
        if lp_supply == 0 {
            return Err(SharedError::InsufficientLiquidity);
        }

        let yes_out = yes_reserves
            .checked_mul(lp_shares)
            .ok_or(SharedError::Overflow)?
            .checked_div(lp_supply)
            .ok_or(SharedError::DivisionByZero)?;
        let no_out = no_reserves
            .checked_mul(lp_shares)
            .ok_or(SharedError::Overflow)?
            .checked_div(lp_supply)
            .ok_or(SharedError::DivisionByZero)?;

        // Redeem the matched portion as USDC; the rest comes back as tokens.
        let redeem = yes_out.min(no_out);
        if redeem < min_usdc_out {
            return Err(SharedError::SlippageExceeded);
        }

        let amm = env.current_contract_address();
        Self::burn_token(&env, &Self::get_lp_token(&env), &provider, lp_shares);

        env.storage()
            .instance()
            .set(&DataKey::YesReserves, &(yes_reserves - yes_out));
        env.storage()
            .instance()
            .set(&DataKey::NoReserves, &(no_reserves - no_out));
        env.storage()
            .instance()
            .set(&DataKey::LpTotalSupply, &(lp_supply - lp_shares));

        // Burn the matched complete set and return its USDC.
        if redeem > 0 {
            Self::burn_token(&env, &Self::get_yes_token(&env), &amm, redeem);
            Self::burn_token(&env, &Self::get_no_token(&env), &amm, redeem);
            Self::sub_usdc_reserves(&env, redeem);
            token::Client::new(&env, &Self::get_usdc_token(&env))
                .transfer(&amm, &provider, &redeem);
        }

        // Hand back any residual (imbalanced) outcome tokens.
        let residual_yes = yes_out - redeem;
        let residual_no = no_out - redeem;
        if residual_yes > 0 {
            token::Client::new(&env, &Self::get_yes_token(&env)).transfer(
                &amm,
                &provider,
                &residual_yes,
            );
        }
        if residual_no > 0 {
            token::Client::new(&env, &Self::get_no_token(&env)).transfer(
                &amm,
                &provider,
                &residual_no,
            );
        }

        env.events().publish(
            (Symbol::new(&env, "remove_liquidity"), provider.clone()),
            (lp_shares, redeem, residual_yes + residual_no),
        );

        Ok((redeem, residual_yes, residual_no))
    }

    // ─── Trading (USDC denominated) ────────────────────────────────────────────

    /// Buy outcome tokens with USDC.
    ///
    /// `buy_yes`: true to buy YES, false to buy NO.
    /// Returns the number of outcome tokens delivered to the trader.
    pub fn buy(
        env: Env,
        trader: Address,
        buy_yes: bool,
        usdc_in: i128,
        min_tokens_out: i128,
        deadline: u64,
    ) -> Result<BuyResult, SharedError> {
        trader.require_auth();
        if usdc_in <= 0 {
            return Err(SharedError::InvalidParams);
        }
        if env.ledger().timestamp() > deadline {
            return Err(SharedError::DeadlineExpired);
        }

        let yes_reserves = Self::get_yes_reserves(&env);
        let no_reserves = Self::get_no_reserves(&env);
        if yes_reserves == 0 || no_reserves == 0 {
            return Err(SharedError::InsufficientLiquidity);
        }

        let price_before = Self::calc_price(yes_reserves, no_reserves);

        // Fee split (taken in USDC).
        let fee_bps = Self::get_fee_bps(&env) as i128;
        let lp_fee_share_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LpFeeShareBps)
            .unwrap();
        let total_fee = calc_fee(usdc_in, fee_bps).ok_or(SharedError::Overflow)?;
        let lp_fee = calc_fee(total_fee, lp_fee_share_bps as i128).ok_or(SharedError::Overflow)?;
        let protocol_fee = total_fee - lp_fee;
        let d_eff = usdc_in - total_fee;

        // Mint d_eff complete sets into the pool, then run the constant-product
        // curve. tokens_out keeps yes*no = k.
        let (reserve_target, reserve_other) = if buy_yes {
            (yes_reserves, no_reserves)
        } else {
            (no_reserves, yes_reserves)
        };
        let k = reserve_target
            .checked_mul(reserve_other)
            .ok_or(SharedError::Overflow)?;
        let other_after = reserve_other
            .checked_add(d_eff)
            .ok_or(SharedError::Overflow)?;
        let target_full = reserve_target
            .checked_add(d_eff)
            .ok_or(SharedError::Overflow)?;
        let target_remaining = k
            .checked_div(other_after)
            .ok_or(SharedError::DivisionByZero)?;
        let tokens_out = target_full
            .checked_sub(target_remaining)
            .ok_or(SharedError::Overflow)?;

        if tokens_out < min_tokens_out {
            return Err(SharedError::SlippageExceeded);
        }
        if tokens_out <= 0 {
            return Err(SharedError::InsufficientLiquidity);
        }

        let amm = env.current_contract_address();

        // Pull full USDC from trader.
        let usdc = Self::get_usdc_token(&env);
        let usdc_client = token::Client::new(&env, &usdc);
        usdc_client.transfer(&trader, &amm, &usdc_in);

        // Mint the complete set into the pool.
        Self::mint_token(&env, &Self::get_yes_token(&env), &amm, d_eff);
        Self::mint_token(&env, &Self::get_no_token(&env), &amm, d_eff);

        // New reserves: target side = k / other_after, other side = other_after.
        let (new_yes, new_no) = if buy_yes {
            (target_remaining, other_after)
        } else {
            (other_after, target_remaining)
        };
        env.storage()
            .instance()
            .set(&DataKey::YesReserves, &new_yes);
        env.storage().instance().set(&DataKey::NoReserves, &new_no);

        // Collateral: d_eff backs the minted set; lp_fee stays as LP yield.
        Self::add_usdc_reserves(&env, d_eff + lp_fee);
        if protocol_fee > 0 {
            let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
            usdc_client.transfer(&amm, &treasury, &protocol_fee);
        }
        let cum: i128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeFees)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::CumulativeFees, &(cum + lp_fee));

        // Deliver outcome tokens to trader.
        let out_token = if buy_yes {
            Self::get_yes_token(&env)
        } else {
            Self::get_no_token(&env)
        };
        token::Client::new(&env, &out_token).transfer(&amm, &trader, &tokens_out);

        // Record volume on the Market contract.
        Self::record_volume(&env, usdc_in);

        let price_after = Self::calc_price(new_yes, new_no);
        let impact = Self::price_impact(price_before, price_after);

        env.events().publish(
            (Symbol::new(&env, "buy"), trader.clone()),
            (buy_yes, usdc_in, tokens_out, total_fee),
        );

        Ok(BuyResult {
            usdc_in,
            tokens_out,
            fee_paid: total_fee,
            price_impact_bps: impact,
            new_yes_price_bps: Self::calc_price(new_yes, new_no),
            new_no_price_bps: BPS - Self::calc_price(new_yes, new_no),
        })
    }

    /// Sell outcome tokens back to the pool for USDC.
    ///
    /// `sell_yes`: true if selling YES, false if selling NO.
    pub fn sell(
        env: Env,
        trader: Address,
        sell_yes: bool,
        tokens_in: i128,
        min_usdc_out: i128,
        deadline: u64,
    ) -> Result<SellResult, SharedError> {
        trader.require_auth();
        if tokens_in <= 0 {
            return Err(SharedError::InvalidParams);
        }
        if env.ledger().timestamp() > deadline {
            return Err(SharedError::DeadlineExpired);
        }

        let yes_reserves = Self::get_yes_reserves(&env);
        let no_reserves = Self::get_no_reserves(&env);
        if yes_reserves == 0 || no_reserves == 0 {
            return Err(SharedError::InsufficientLiquidity);
        }
        let price_before = Self::calc_price(yes_reserves, no_reserves);

        // Trader adds `q` of the sold side; we redeem `d` complete sets for USDC
        // such that the product is preserved:
        //   d^2 - (target + q + other) d + q*other = 0
        // where target = sold-side reserve, other = opposite reserve.
        let (target, other) = if sell_yes {
            (yes_reserves, no_reserves)
        } else {
            (no_reserves, yes_reserves)
        };
        let q = tokens_in;
        let b = target
            .checked_add(q)
            .ok_or(SharedError::Overflow)?
            .checked_add(other)
            .ok_or(SharedError::Overflow)?;
        let c = q.checked_mul(other).ok_or(SharedError::Overflow)?;
        let disc = b
            .checked_mul(b)
            .ok_or(SharedError::Overflow)?
            .checked_sub(c.checked_mul(4).ok_or(SharedError::Overflow)?)
            .ok_or(SharedError::Overflow)?;
        let d = (b - sqrt(disc)) / 2; // gross USDC out (smaller root)
        if d <= 0 {
            return Err(SharedError::InsufficientLiquidity);
        }

        // Fee on the USDC out.
        let fee_bps = Self::get_fee_bps(&env) as i128;
        let lp_fee_share_bps: u32 = env
            .storage()
            .instance()
            .get(&DataKey::LpFeeShareBps)
            .unwrap();
        let total_fee = calc_fee(d, fee_bps).ok_or(SharedError::Overflow)?;
        let lp_fee = calc_fee(total_fee, lp_fee_share_bps as i128).ok_or(SharedError::Overflow)?;
        let protocol_fee = total_fee - lp_fee;
        let usdc_out = d - total_fee;

        if usdc_out < min_usdc_out {
            return Err(SharedError::SlippageExceeded);
        }

        let usdc_reserves = Self::get_usdc_reserves(&env);
        if d > usdc_reserves {
            return Err(SharedError::InsufficientLiquidity);
        }

        let amm = env.current_contract_address();

        // Pull the sold tokens into the pool.
        let in_token = if sell_yes {
            Self::get_yes_token(&env)
        } else {
            Self::get_no_token(&env)
        };
        token::Client::new(&env, &in_token).transfer(&trader, &amm, &q);

        // New reserves after redeeming `d` complete sets.
        let new_target = target + q - d;
        let new_other = other - d;
        let (new_yes, new_no) = if sell_yes {
            (new_target, new_other)
        } else {
            (new_other, new_target)
        };
        env.storage()
            .instance()
            .set(&DataKey::YesReserves, &new_yes);
        env.storage().instance().set(&DataKey::NoReserves, &new_no);

        // Burn the redeemed complete set.
        Self::burn_token(&env, &Self::get_yes_token(&env), &amm, d);
        Self::burn_token(&env, &Self::get_no_token(&env), &amm, d);

        // Collateral: release `d`, keep lp_fee as LP yield, route protocol fee.
        Self::sub_usdc_reserves(&env, d - lp_fee);
        let usdc = Self::get_usdc_token(&env);
        let usdc_client = token::Client::new(&env, &usdc);
        usdc_client.transfer(&amm, &trader, &usdc_out);
        if protocol_fee > 0 {
            let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
            usdc_client.transfer(&amm, &treasury, &protocol_fee);
        }
        let cum: i128 = env
            .storage()
            .instance()
            .get(&DataKey::CumulativeFees)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::CumulativeFees, &(cum + lp_fee));

        Self::record_volume(&env, d);

        let price_after = Self::calc_price(new_yes, new_no);
        let impact = Self::price_impact(price_before, price_after);

        env.events().publish(
            (Symbol::new(&env, "sell"), trader.clone()),
            (sell_yes, tokens_in, usdc_out, total_fee),
        );

        Ok(SellResult {
            tokens_in,
            usdc_out,
            fee_paid: total_fee,
            price_impact_bps: impact,
            new_yes_price_bps: Self::calc_price(new_yes, new_no),
            new_no_price_bps: BPS - Self::calc_price(new_yes, new_no),
        })
    }

    // ─── Quotes ────────────────────────────────────────────────────────────────

    /// Quote a buy without executing.
    pub fn get_buy_quote(
        env: Env,
        buy_yes: bool,
        usdc_in: i128,
    ) -> Result<QuoteResult, SharedError> {
        if usdc_in <= 0 {
            return Err(SharedError::InvalidParams);
        }
        let yes_reserves = Self::get_yes_reserves(&env);
        let no_reserves = Self::get_no_reserves(&env);
        if yes_reserves == 0 || no_reserves == 0 {
            return Err(SharedError::InsufficientLiquidity);
        }

        let fee_bps = Self::get_fee_bps(&env) as i128;
        let total_fee = calc_fee(usdc_in, fee_bps).ok_or(SharedError::Overflow)?;
        let d_eff = usdc_in - total_fee;

        let (reserve_target, reserve_other) = if buy_yes {
            (yes_reserves, no_reserves)
        } else {
            (no_reserves, yes_reserves)
        };
        let k = reserve_target
            .checked_mul(reserve_other)
            .ok_or(SharedError::Overflow)?;
        let other_after = reserve_other + d_eff;
        let target_full = reserve_target + d_eff;
        let target_remaining = k
            .checked_div(other_after)
            .ok_or(SharedError::DivisionByZero)?;
        let tokens_out = target_full - target_remaining;

        let price_before = Self::calc_price(yes_reserves, no_reserves);
        let (new_yes, new_no) = if buy_yes {
            (target_remaining, other_after)
        } else {
            (other_after, target_remaining)
        };
        let price_after = Self::calc_price(new_yes, new_no);

        Ok(QuoteResult {
            amount_out: tokens_out,
            fee: total_fee,
            price_impact_bps: Self::price_impact(price_before, price_after),
            yes_price_bps: Self::calc_price(new_yes, new_no),
            no_price_bps: BPS - Self::calc_price(new_yes, new_no),
        })
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    pub fn get_pool_state(env: Env) -> PoolState {
        let yes_reserves = Self::get_yes_reserves(&env);
        let no_reserves = Self::get_no_reserves(&env);
        PoolState {
            yes_reserves,
            no_reserves,
            usdc_reserves: Self::get_usdc_reserves(&env),
            lp_total_supply: Self::get_lp_supply(&env),
            yes_price_bps: Self::calc_price(yes_reserves, no_reserves),
            no_price_bps: BPS - Self::calc_price(yes_reserves, no_reserves),
            swap_fee_bps: Self::get_fee_bps(&env),
        }
    }

    pub fn get_reserves(env: Env) -> (i128, i128) {
        (Self::get_yes_reserves(&env), Self::get_no_reserves(&env))
    }

    pub fn get_collateral(env: Env) -> i128 {
        Self::get_usdc_reserves(&env)
    }

    pub fn get_yes_price_bps(env: Env) -> i128 {
        Self::calc_price(Self::get_yes_reserves(&env), Self::get_no_reserves(&env))
    }

    pub fn get_no_price_bps(env: Env) -> i128 {
        BPS - Self::get_yes_price_bps(env)
    }

    pub fn get_cumulative_fees(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::CumulativeFees)
            .unwrap_or(0)
    }

    /// Push pool collateral to the settlement contract (resolution flow).
    /// Only callable by the Market contract this AMM belongs to.
    pub fn transfer_collateral(
        env: Env,
        caller: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), SharedError> {
        caller.require_auth();
        let market: Address = env.storage().instance().get(&DataKey::Market).unwrap();
        if caller != market {
            return Err(SharedError::Unauthorized);
        }
        let reserves = Self::get_usdc_reserves(&env);
        if amount > reserves {
            return Err(SharedError::InsufficientLiquidity);
        }
        Self::sub_usdc_reserves(&env, amount);
        token::Client::new(&env, &Self::get_usdc_token(&env)).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        Ok(())
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    /// price_bps(YES) = no_reserves * BPS / (yes_reserves + no_reserves)
    fn calc_price(yes_reserves: i128, no_reserves: i128) -> i128 {
        let total = yes_reserves + no_reserves;
        if total == 0 {
            return BPS / 2;
        }
        no_reserves * BPS / total
    }

    fn price_impact(price_before: i128, price_after: i128) -> u32 {
        if price_before <= 0 {
            return 0;
        }
        ((price_before - price_after).abs() * BPS / price_before) as u32
    }

    fn get_yes_reserves(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::YesReserves)
            .unwrap_or(0)
    }
    fn get_no_reserves(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::NoReserves)
            .unwrap_or(0)
    }
    fn get_usdc_reserves(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::UsdcReserves)
            .unwrap_or(0)
    }
    fn add_usdc_reserves(env: &Env, delta: i128) {
        let cur = Self::get_usdc_reserves(env);
        env.storage()
            .instance()
            .set(&DataKey::UsdcReserves, &(cur + delta));
    }
    fn sub_usdc_reserves(env: &Env, delta: i128) {
        let cur = Self::get_usdc_reserves(env);
        env.storage()
            .instance()
            .set(&DataKey::UsdcReserves, &(cur - delta));
    }
    fn get_lp_supply(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::LpTotalSupply)
            .unwrap_or(0)
    }
    fn get_fee_bps(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SwapFeeBps)
            .unwrap_or(30)
    }
    fn get_yes_token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::YesToken).unwrap()
    }
    fn get_no_token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::NoToken).unwrap()
    }
    fn get_lp_token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::LpToken).unwrap()
    }
    fn get_usdc_token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::UsdcToken).unwrap()
    }

    /// Cross-contract mint on an OutcomeToken (AMM is the authorized minter).
    fn mint_token(env: &Env, token_addr: &Address, to: &Address, amount: i128) {
        let mut args = Vec::new(env);
        args.push_back(to.to_val());
        args.push_back(amount.into_val(env));
        env.invoke_contract::<()>(token_addr, &Symbol::new(env, "mint"), args);
    }

    /// Standard SEP-41 burn.
    fn burn_token(env: &Env, token_addr: &Address, from: &Address, amount: i128) {
        token::Client::new(env, token_addr).burn(from, &amount);
    }

    /// Record trade volume on the Market contract (best-effort).
    fn record_volume(env: &Env, volume: i128) {
        let market: Address = env.storage().instance().get(&DataKey::Market).unwrap();
        let mut args = Vec::new(env);
        args.push_back(env.current_contract_address().to_val());
        args.push_back(volume.into_val(env));
        // Market.record_volume(amm, volume) — ignore failures so trades never block.
        let _ = env.try_invoke_contract::<(), SharedError>(
            &market,
            &Symbol::new(env, "record_volume"),
            args,
        );
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use stellar_pm_shared::BPS;

    #[test]
    fn test_calc_price_equal_reserves() {
        assert_eq!(Amm::calc_price(100, 100), BPS / 2);
    }

    #[test]
    fn test_calc_price_unequal_reserves() {
        // 75 YES, 25 NO → YES price = no/(yes+no) = 25% (more YES supply = cheaper)
        assert_eq!(Amm::calc_price(75, 25), 2500);
        assert_eq!(Amm::calc_price(25, 75), 7500);
    }

    #[test]
    fn test_buy_curve_preserves_product() {
        // yes=no=1000, buy YES with d_eff=100 (ignoring fee)
        let (yes, no) = (1000_i128, 1000_i128);
        let k = yes * no;
        let no_after = no + 100;
        let yes_full = yes + 100;
        let target_remaining = k / no_after;
        let out = yes_full - target_remaining;
        // New product == k (within integer rounding)
        let new_product = target_remaining * no_after;
        assert!((new_product - k).abs() <= no_after);
        // Buying YES should yield more than the USDC put in (price < 1)
        assert!(out > 100);
    }

    #[test]
    fn test_sell_quadratic_solvable() {
        // yes=no=1000, sell 100 YES
        let (yes, no, q) = (1000_i128, 1000_i128, 100_i128);
        let b = yes + q + no;
        let c = q * no;
        let disc = b * b - 4 * c;
        let d = (b - sqrt(disc)) / 2;
        // d should be positive and less than q (you get less than 1:1 due to impact)
        assert!(d > 0 && d < q);
    }

    #[test]
    fn test_sqrt_helper() {
        assert_eq!(sqrt(10_000 * 10_000), 10_000);
        assert_eq!(sqrt(100 * 400), 200);
    }
}
