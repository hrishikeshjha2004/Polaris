# Contract Addresses

## Testnet

> Populated after running `bash scripts/deploy/deploy-testnet.sh`
> Also stored in `deployments/testnet.json`

**v2 (current)** — USDC on-ramp + initialized child contracts. Fully functional buy/sell/liquidity.

| Contract | Address |
|---------|---------|
| Factory | `CDRETEVCFLUP2OHWANPTMJ5UUJ6265RQ7C5RBTC7ANW64MGCA7HU2XCC` |
| Oracle | `CBOIQXBUAJNQLFSMN5YPTRTNXX6BWEUR4BPQZ3443OOZRVTGQIYRYVTO` |
| Settlement | `CCJ7MARW7U3OE5UGI7VQJHEEP7TF2QK5F4EPWMH24USTKXKBQRYXPAFV` |
| Treasury | `CCYXEQNE63UN37N3PID2SE7DDBO2U6OPO5WJFR52GBMZRTR6EMTMU3ZX` |
| USDC (test, mintable) | `CCJWR4HYAMZMICEZFX3PUTUFZTR67RIEX54MRWUXTBE3C4X7RUZZWWWZ` |

**Deployed:** 2026-06-03 | **Deployer:** `GCKVK36XWVWUPWCBTA3S5L4ISVCV3RIRUNZRDPGO2CM6QL7LUPMNGBMN`

**Live Markets (3)** — each has 8k–10k USDC liquidity, tradeable on-chain:
| Market | Market contract | Hex ID |
|--------|-----------------|--------|
| BTC > $100k | `CBFJ3OTHAL3ACKVRHVCBRE3EL46WSTNWLXKGK6YWVGC6EJXLTO2IDXQT` | `af5570f5...e0e83dfc` |
| ETH > $5k | `CBDD6VQSZFIIQEN6RL7IY2EAJOYPAMKQUCUVTD2OOSFCMXMHIZE5QM6Z` | — |
| XLM > $1 | `CD264SCBTPO5YSMYVZIGPDVW7Q5UL4CNJVQNUISSCBYKCIMLNZQS4GYT` | — |

> **Verified on-chain:** create_market initializes all children; add_liquidity_usdc, buy (1000 USDC → 1903 YES, price 50%→54.7%), and sell (1000 YES → 533 USDC) all execute and settle.

**v1 (deprecated — child contracts never initialized, do not use):**
Factory `CB3SQS56ZYHYKJQTAJCEGQE5PIKMWDTV5DRYAEIB34TLIGV6VKGHOYGF`

**Token Registry (Testnet)**

| Token | Address |
|-------|---------|
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

> Market-specific contracts (Market, AMM, YES/NO/LP tokens) are deployed
> by the Factory when each market is created. Their addresses are stored
> in the Factory contract's registry and discoverable via `list_markets`.

## Mainnet

> Not yet deployed.

## Contract Descriptions

### Factory (`stellar_pm_market_factory`)
- Entry point for all market creation
- Deploys Market + AMM + 3 token contracts per market
- Stores global market registry
- Holds child contract WASM hashes for deployment

### Market (`stellar_pm_market`)
- Per-market state: title, description, status, expiry
- Routes to AMM for trades
- Tracks total volume
- Records resolution from Settlement contract

### AMM (`stellar_pm_amm`)
- Constant product market maker (x*y=k)
- YES/NO tokens as pool assets
- 30 bps swap fee (80% to LPs, 20% to treasury)
- LP shares minted/burned on liquidity operations

### Oracle (`stellar_pm_oracle`)
- Multi-signer resolution committee
- Threshold-based consensus (testnet: 1-of-1, production: 3-of-5)
- 1-hour dispute window before finalization
- Median price aggregation across signers

### Settlement (`stellar_pm_settlement`)
- Executed after Oracle finalizes resolution
- Calculates payout rates for winning outcome holders
- Enables USDC redemption for winning tokens

### Treasury (`stellar_pm_treasury`)
- Holds protocol fee revenue
- Admin-controlled withdrawals

### OutcomeToken (`stellar_pm_token`)
- SEP-41 compatible token for YES, NO, and LP shares
- Restricted minting (AMM is the designated minter)
- Three instances per market: YES, NO, LP

## WASM Hashes

> Stored in `deployments/testnet.json` after deployment.
> Use these to verify on-chain WASM integrity:

```bash
stellar contract info --network testnet --id $FACTORY_ID
```
