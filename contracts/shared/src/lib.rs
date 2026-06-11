#![no_std]
//! Shared types, errors, and utilities for all StellarPM contracts.

use soroban_sdk::{contracterror, contracttype, String};

// ─── Outcome ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    Yes = 0,
    No = 1,
}

// ─── Market Status ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Open = 0,
    Expired = 1,
    Resolved = 2,
    Closed = 3,
}

// ─── Market Params (passed to Factory) ───────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketParams {
    pub title: String,
    pub description: String,
    pub category: String,
    pub expiry_timestamp: u64,
    pub oracle_source: String,
    /// Price threshold scaled by 1e7, e.g. $150,000 = 150_000_0000000
    pub threshold_value: i128,
    /// 0=GT, 1=LT, 2=GTE, 3=LTE
    pub threshold_operator: u32,
    /// Initial USDC to bootstrap the pool (scaled by 1e7)
    pub initial_liquidity: i128,
}

// ─── Resolution ───────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct Resolution {
    pub outcome: Outcome,
    pub final_price: i128,
    pub resolved_at: u64,
    pub dispute_window_end: u64,
    pub finalized: bool,
}

// ─── Shared Errors ────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SharedError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidParams = 3,
    NotFound = 4,
    Overflow = 5,
    DivisionByZero = 6,
    SlippageExceeded = 7,
    MarketNotOpen = 8,
    MarketNotExpired = 9,
    MarketNotResolved = 10,
    Paused = 11,
    InsufficientBalance = 12,
    DeadlineExpired = 13,
    InsufficientLiquidity = 14,
    InvalidOutcome = 15,
}

// ─── Scaling Constants ────────────────────────────────────────────────────────

/// All prices and amounts are scaled by SCALE = 1e7
pub const SCALE: i128 = 10_000_000;

/// Basis points denominator
pub const BPS: i128 = 10_000;

/// Minimum LP shares to prevent dust attacks (burned to zero address)
pub const MIN_LP_SHARES: i128 = 1_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Integer square root (Babylonian method) — used for initial LP share minting
pub fn sqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Apply fee: amount * (BPS - fee_bps) / BPS
pub fn apply_fee(amount: i128, fee_bps: i128) -> Option<i128> {
    amount
        .checked_mul(BPS - fee_bps)
        .and_then(|v| v.checked_div(BPS))
}

/// Calculate fee portion: amount * fee_bps / BPS
pub fn calc_fee(amount: i128, fee_bps: i128) -> Option<i128> {
    amount.checked_mul(fee_bps).and_then(|v| v.checked_div(BPS))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqrt() {
        assert_eq!(sqrt(0), 0);
        assert_eq!(sqrt(1), 1);
        assert_eq!(sqrt(4), 2);
        assert_eq!(sqrt(9), 3);
        assert_eq!(sqrt(100), 10);
        assert_eq!(sqrt(10_000_000_000_000_000), 100_000_000); // 1e16 → 1e8
    }

    #[test]
    fn test_apply_fee() {
        // 0.3% fee on 1000
        assert_eq!(apply_fee(1000, 30), Some(997));
        // 1% fee on 10000
        assert_eq!(apply_fee(10_000, 100), Some(9_900));
    }

    #[test]
    fn test_calc_fee() {
        // 0.3% fee on 1000 = 3
        assert_eq!(calc_fee(1000, 30), Some(3));
    }
}
