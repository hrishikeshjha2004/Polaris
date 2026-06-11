# StellarPM — Security Model & Threat Analysis

**Version:** 1.0.0  
**Classification:** Public

---

## 1. Threat Model Overview

### Trust Assumptions

| Actor | Trust Level | Notes |
|-------|------------|-------|
| Smart contracts | Trustless | Immutable logic, audited |
| Oracle signers | Partially trusted | Multi-sig, threshold reduces risk |
| Admin/deployer | Privileged | Multi-sig required before mainnet |
| LPs | Trustless | Self-interested economic actors |
| Traders | Trustless | Self-interested economic actors |
| Frontend | Untrusted | UI can be censored; protocol works without it |

---

## 2. Attack Surface Analysis

### 2.1 Oracle Attacks

**Attack: Oracle Bribery / Collusion**
- *Description:* An attacker bribes N oracle signers to report the wrong outcome.
- *Mitigation:* Multi-signer threshold (e.g., 3-of-5). Attacker must bribe majority.
- *Residual Risk:* If >50% of oracle committee is compromised.
- *Future Mitigation:* Decentralize oracle committee; use economic bonding (signers stake collateral forfeited on wrong resolution).

**Attack: Oracle Delay Attack**
- *Description:* Oracle signers delay submission, causing markets to remain unresolved.
- *Mitigation:* Markets can be manually expired by anyone after expiry timestamp. Dispute system for delayed resolution.
- *Residual Risk:* Extended capital lock-up for traders if oracle is slow.

**Attack: Oracle Frontrunning**
- *Description:* Oracle signer sees a clear outcome and trades on it before submitting.
- *Mitigation:* Oracle signers are not permitted to hold positions in markets they resolve (policy enforcement). Future: use commit-reveal scheme.
- *Residual Risk:* Policy-only protection until commit-reveal is implemented.

**Attack: Price Feed Manipulation**
- *Description:* Attacker manipulates CoinGecko / Binance API to report wrong price.
- *Mitigation:* Use median of multiple sources. Single-source manipulation doesn't win.
- *Residual Risk:* Low — coordinated manipulation of 3+ major price feeds is extremely difficult.

---

### 2.2 AMM Attacks

**Attack: Sandwich Attack (MEV)**
- *Description:* Attacker front-runs a large swap and back-runs it to extract value.
- *Mitigation:* User sets `min_amount_out` (slippage tolerance). Transactions outside tolerance fail.
- *Stellar-specific:* Stellar's deterministic transaction ordering reduces but doesn't eliminate MEV.
- *Residual Risk:* Low slippage settings may cause failed transactions; user experience tradeoff.

**Attack: Invariant Violation via Integer Overflow**
- *Description:* Attacker crafts token amounts to overflow i128, breaking the k invariant.
- *Mitigation:* All math uses Rust's checked arithmetic (`checked_mul`, `checked_add`). Any overflow returns an error.
- *Testing:* Fuzz testing with extreme values.

**Attack: Flash Loan Price Manipulation**
- *Description:* Attacker manipulates pool price within a single transaction to exploit price-dependent logic.
- *Mitigation:* Soroban does not support flash loans natively. Each transaction is atomic. Price manipulation within a transaction is limited to the transaction's own actions.
- *Residual Risk:* Effectively mitigated by Soroban's execution model.

**Attack: Liquidity Drainage via Fee Manipulation**
- *Description:* Admin sets fee to 100%, draining all LP value via fee extraction.
- *Mitigation:* Fee is set per-market at creation. Market fees cannot be changed after creation (immutable).
- *Future Mitigation:* Governance timelock for any fee parameter changes.

**Attack: LP Token Inflation**
- *Description:* Attacker deposits dust amounts to manipulate LP share minting calculation.
- *Mitigation:* Minimum liquidity requirement. Initial deposit mints shares using `sqrt(x*y)`. Subsequent deposits use proportional math. Minimum LP shares burned to zero address on first deposit.

---

### 2.3 Settlement Attacks

**Attack: Double Claim**
- *Description:* User calls `claim()` multiple times to drain more than their allocation.
- *Mitigation:* Settlement contract tracks claimed amounts per (user, market_id). Re-claiming returns zero. Claiming burns the user's winning tokens.
- *Implementation:* `claimed: Map<(Address, MarketId), bool>`

**Attack: Settlement Before Oracle Finalization**
- *Description:* Attacker tries to trigger settlement before oracle quorum is met.
- *Mitigation:* Settlement `record_resolution()` can only be called by Oracle contract. Oracle enforces threshold.

**Attack: Incorrect Payout Calculation**
- *Description:* Off-by-one errors or rounding errors in payout math cause users to over- or under-claim.
- *Mitigation:* Use integer arithmetic with consistent scaling (1e7). Round down on user payouts (protocol absorbs rounding dust). Comprehensive unit tests for payout math.

---

### 2.4 Access Control Attacks

**Attack: Admin Key Compromise**
- *Description:* Attacker gains access to admin private key and drains treasury or reconfigures oracle.
- *Mitigation:* Admin must be a multi-sig account (Stellar multi-sig or dedicated multi-sig contract). Admin key rotation procedure documented.

**Attack: Factory WASM Upload Poisoning**
- *Description:* Attacker uploads malicious WASM as a replacement for Market/AMM contracts.
- *Mitigation:* Only admin can upload new WASMs. WASM hashes are stored on-chain and must match expected values.

**Attack: Contract Upgrade Malice**
- *Description:* Admin upgrades a contract to steal funds.
- *Mitigation:* Upgrades require timelock (minimum 48-hour delay). Governance oversight for mainnet.

---

### 2.5 Frontend / Integration Attacks

**Attack: Cross-Site Scripting (XSS)**
- *Description:* Malicious script injected into UI to steal wallet credentials.
- *Mitigation:* Next.js CSP headers. React's default XSS escaping. No `dangerouslySetInnerHTML`.

**Attack: Malicious Market Data**
- *Description:* Database-stored market title/description contains script injection.
- *Mitigation:* Sanitize all user-provided text with DOMPurify before rendering. Backend validates input length and character set.

**Attack: DNS Hijacking / Frontend Replacement**
- *Description:* Attacker serves a fake frontend to trick users into signing malicious transactions.
- *Mitigation:* All contract calls go through typed transaction builders; frontend doesn't construct raw XDR. Users can verify contract addresses independently. IPFS-hosted frontend as fallback.

**Attack: API Replay Attack**
- *Description:* Replaying signed API requests to execute duplicate trades.
- *Mitigation:* All state-modifying actions are on-chain Soroban transactions (not API calls). API is read-only.

---

## 3. Reentrancy Analysis

Soroban uses a single-threaded execution model. Cross-contract calls are synchronous and Soroban prevents the same contract from being re-entered during a cross-contract call (enforced at the host level).

**Additional Precaution:** All state-modifying functions follow the checks-effects-interactions pattern:
1. Validate inputs
2. Update internal state
3. Make external token transfers

This ensures state is correct even if external calls behave unexpectedly.

---

## 4. Integer Overflow Safety

All arithmetic in contracts uses Rust's checked operations:

```rust
// Example safe math pattern
let new_reserves = yes_reserves
    .checked_add(amount_in)
    .ok_or(Error::Overflow)?;

let amount_out = (no_reserves
    .checked_mul(amount_in_with_fee)
    .ok_or(Error::Overflow)?)
    .checked_div(yes_reserves.checked_add(amount_in_with_fee).ok_or(Error::Overflow)?)
    .ok_or(Error::DivisionByZero)?;
```

---

## 5. Economic Security

### Minimum Viable Attack Cost Analysis

| Attack | Cost Estimate | Feasibility |
|--------|--------------|-------------|
| Oracle bribery (3-of-5) | Bribe 3 signers + economic reputation loss | Moderate |
| AMM sandwich (sandwich profitable) | Requires MEV infrastructure | Low on Stellar |
| LP drain via admin key | Compromise multi-sig | Very Low |
| Smart contract exploit | Requires 0-day in audited code | Very Low post-audit |

---

## 6. Incident Response

### Severity Levels

| Level | Definition | Response Time |
|-------|-----------|--------------|
| P0 | Funds at risk, active exploit | <1 hour |
| P1 | Protocol malfunction, no immediate fund risk | <4 hours |
| P2 | Data integrity issue or degraded functionality | <24 hours |
| P3 | Non-critical bug or UX issue | Next sprint |

### Emergency Actions

1. **Pause Factory:** Admin calls `factory.set_paused(true)` — stops new market creation
2. **Freeze Oracle:** Admin removes all signers — stops new resolutions
3. **Treasury Protection:** Admin withdraws treasury to cold wallet
4. **Front-end Redirect:** Update DNS to maintenance page

### Post-Incident

- Root cause analysis document
- Contract patch development
- Governance vote for contract upgrade (if needed)
- User compensation plan (if funds lost)

---

## 7. Audit Checklist

Before mainnet launch, each contract must pass:

- [ ] Static analysis (cargo clippy with no warnings)
- [ ] Unit tests: 100% coverage on core math functions
- [ ] Integration tests: all user flows
- [ ] Fuzz testing: swap amounts, liquidity amounts, edge values
- [ ] Manual audit by 2+ independent auditors
- [ ] Economic security review
- [ ] Gas optimization review
- [ ] Access control review: every privileged function
- [ ] Event emission verification: every state change emits event

---

## 8. Known Limitations (v1)

1. Oracle is semi-centralized (trusted signers). This is a known tradeoff for v1 — full decentralization planned for v2.
2. No formal verification of contract math. Post-audit milestone.
3. Dispute mechanism is advisory (disputes logged, require manual admin resolution). Automated dispute resolution is a future upgrade.
4. No insurance fund for oracle failure or contract bugs. Future governance vote.
