# Polaris — Product Requirements Document

**Version:** 1.0.0  
**Date:** 2026-06-03  
**Status:** Draft → Active

---

## 1. Executive Summary

Polaris is a fully on-chain, decentralized prediction market protocol built on the Stellar network using Soroban smart contracts. It enables users to create, trade, and settle prediction markets for real-world crypto asset price events. The protocol is designed to be composable, upgradeable, and governed in a decentralized manner — comparable in ambition to Polymarket on EVM, but natively built for Stellar's low-fee, high-throughput environment.

---

## 2. Problem Statement

Existing prediction markets suffer from:

- **Centralized settlement** — most rely on a single oracle or admin key
- **High fees** — Ethereum-based markets (Polymarket) have gas cost barriers
- **Poor composability** — monolithic architectures that cannot be extended
- **No Stellar-native solution** — the Stellar ecosystem lacks a production-grade prediction market

Polaris solves all four problems.

---

## 3. Goals

| # | Goal | Priority |
|---|------|----------|
| G1 | Fully on-chain market lifecycle (create → trade → settle → claim) | P0 |
| G2 | Trustless AMM-based pricing for YES/NO outcome tokens | P0 |
| G3 | Decentralized oracle with multi-signer support | P0 |
| G4 | LP incentive system with fee distribution | P1 |
| G5 | Extensible governance architecture | P1 |
| G6 | Analytics indexer and rich UI | P2 |
| G7 | DAO governance (future phase) | P3 |

---

## 4. Non-Goals (v1)

- Full DAO governance (architecture prepared but not implemented)
- Cross-chain bridges
- Options / derivatives beyond binary YES/NO markets
- Mobile native apps (responsive web only)
- Fiat on-ramp

---

## 5. Target Users

### 5.1 Traders
Retail and institutional users who want to speculate on crypto asset price outcomes. They buy YES or NO tokens and redeem winning positions post-settlement.

### 5.2 Liquidity Providers (LPs)
Users who deposit capital into AMM pools to earn trading fees. They accept price risk in exchange for yield.

### 5.3 Market Creators
Protocol users or DAOs who create new prediction markets, set terms, and pay a market creation fee.

### 5.4 Oracle Operators
Trusted signers (initially) who submit settlement outcomes on-chain after market expiry.

---

## 6. Core User Stories

### Trader Flow
```
As a trader, I want to:
  - Connect my Freighter wallet
  - Browse open prediction markets
  - View current YES/NO prices and implied probabilities
  - Buy YES or NO tokens for a market
  - Sell/swap my position before settlement
  - After settlement, redeem winning tokens for USDC payout
```

### LP Flow
```
As an LP, I want to:
  - Provide liquidity to a market's AMM pool
  - Receive LP shares representing my pool ownership
  - Earn a portion of all trading fees
  - Withdraw my liquidity at any time (pre-settlement)
  - Understand my IL and fee APY
```

### Market Creator Flow
```
As a creator, I want to:
  - Define a prediction question and resolution criteria
  - Set expiry date, oracle source, and fee parameters
  - Bootstrap initial liquidity for the market
  - See my market listed on the platform
```

### Oracle Flow
```
As an oracle operator, I want to:
  - Monitor market expiry timestamps
  - Fetch price data from off-chain sources (CoinGecko, Binance)
  - Submit signed resolution (YES/NO + price proof) on-chain
  - Trigger settlement after quorum is reached
```

---

## 7. Functional Requirements

### 7.1 Wallet & Authentication
- FR-W1: Support Freighter wallet connection
- FR-W2: Support WalletConnect protocol
- FR-W3: Display connected address and XLM/USDC balance
- FR-W4: Network detection and switching (testnet/mainnet)
- FR-W5: Transaction signing flow with clear previews

### 7.2 Market Factory
- FR-MF1: Any user can create a market by paying a creation fee
- FR-MF2: Markets are registered in a factory registry contract
- FR-MF3: Market parameters stored fully on-chain
- FR-MF4: Markets have unique IDs derived from parameters + creator
- FR-MF5: Market status lifecycle: OPEN → EXPIRED → SETTLED → CLOSED

### 7.3 Outcome Tokens
- FR-OT1: Each market deploys YES and NO Soroban token contracts
- FR-OT2: Tokens implement the Soroban token interface (SEP-0041)
- FR-OT3: Tokens are transferable between wallets
- FR-OT4: Token supply expands/contracts with AMM liquidity
- FR-OT5: Post-settlement, only winning tokens are redeemable

### 7.4 AMM
- FR-AMM1: Constant product formula (x * y = k) for initial pricing
- FR-AMM2: Swap YES→NO and NO→YES within a pool
- FR-AMM3: Buy outcome tokens with USDC (base currency)
- FR-AMM4: Configurable swap fee (default 0.3%)
- FR-AMM5: Slippage protection with user-defined max slippage
- FR-AMM6: Price impact display pre-trade
- FR-AMM7: Invariant check post-swap to prevent manipulation

### 7.5 Liquidity Provider System
- FR-LP1: Deposit equal value of YES + NO tokens to receive LP shares
- FR-LP2: Withdraw proportional share of pool assets
- FR-LP3: Trading fees accrue to pool, increasing LP share value
- FR-LP4: LP share token is a standard Soroban token (transferable)
- FR-LP5: Fee APY calculation displayed in UI

### 7.6 Oracle System
- FR-OR1: Oracle contract holds registry of authorized signers
- FR-OR2: Multi-signer threshold (e.g., 3-of-5) for settlement
- FR-OR3: Oracle can be updated by admin/governance
- FR-OR4: Settlement data includes: outcome (YES/NO), price at expiry, timestamp, signatures
- FR-OR5: Dispute window of N hours post-settlement submission
- FR-OR6: Support price feeds for: BTC, ETH, XLM, SOL, XRP, USDC, EURC

### 7.7 Settlement System
- FR-SE1: Settlement triggered on-chain after oracle quorum
- FR-SE2: Winning token holders can redeem 1:1 for pro-rata payout
- FR-SE3: Losing tokens are burned (zero value)
- FR-SE4: Protocol fee deducted from total pool before payout
- FR-SE5: Settlement irreversible once finalized on-chain

### 7.8 Fee System
- FR-FE1: Swap fee: configurable per market (default 0.3%)
- FR-FE2: LP fee share: configurable (default 80% of swap fee)
- FR-FE3: Protocol fee: configurable (default 20% of swap fee)
- FR-FE4: Market creation fee: flat fee in XLM or USDC
- FR-FE5: All fees flow to treasury contract

---

## 8. Non-Functional Requirements

### 8.1 Performance
- NFR-P1: Frontend initial load < 2s on 4G
- NFR-P2: Transaction confirmation < 5s on Stellar testnet
- NFR-P3: Market list page renders < 100 markets without pagination degradation

### 8.2 Security
- NFR-S1: All contracts audited before mainnet
- NFR-S2: No single point of failure in oracle
- NFR-S3: Reentrancy protections on all state-modifying functions
- NFR-S4: Access control on admin functions
- NFR-S5: Upgrade mechanisms require timelock

### 8.3 Reliability
- NFR-R1: Indexer achieves 99.9% uptime
- NFR-R2: Frontend gracefully handles RPC failures
- NFR-R3: All protocol state recoverable from chain (no off-chain critical data)

### 8.4 Decentralization
- NFR-D1: No admin key required for normal user operations
- NFR-D2: Oracle committee, not single signer, resolves markets
- NFR-D3: Treasury governed by multi-sig initially, DAO later

---

## 9. Market Lifecycle State Machine

```
                    ┌─────────────┐
                    │   CREATED   │
                    └──────┬──────┘
                           │ bootstrap liquidity
                    ┌──────▼──────┐
                    │    OPEN     │◄──── trading, LP
                    └──────┬──────┘
                           │ expiry timestamp reached
                    ┌──────▼──────┐
                    │   EXPIRED   │◄──── oracle submits outcome
                    └──────┬──────┘
                           │ oracle quorum + dispute period passed
                    ┌──────▼──────┐
                    │  RESOLVED   │◄──── users can claim
                    └──────┬──────┘
                           │ all claims processed
                    ┌──────▼──────┐
                    │   CLOSED    │
                    └─────────────┘
```

---

## 10. Supported Assets

| Asset | Oracle Feed | Market Type Example |
|-------|------------|-------------------|
| BTC | CoinGecko + Binance | "BTC > $150k by Dec 31, 2026" |
| ETH | CoinGecko + Binance | "ETH > $10k by Q3 2026" |
| XLM | CoinGecko | "XLM > $1 by Jan 2027" |
| SOL | CoinGecko + Binance | "SOL > $500 by 2026" |
| XRP | CoinGecko | "XRP > $5 by 2026" |
| USDC | Static (pegged) | "USDC depegs below $0.98" |
| EURC | Static (pegged) | "EURC depegs below $0.97" |

---

## 11. Revenue Model

| Source | Rate | Destination |
|--------|------|-------------|
| Swap fees | 0.3% per trade | 80% LPs, 20% protocol treasury |
| Market creation fee | 10 USDC flat | Protocol treasury |
| Settlement fee | 0.5% of winning pool | Protocol treasury |

---

## 12. Success Metrics (v1)

| Metric | 3-Month Target |
|--------|---------------|
| Total Markets Created | 50+ |
| Total Volume | $100k+ |
| Unique Traders | 500+ |
| TVL | $50k+ |
| Settlement Accuracy | 100% |
