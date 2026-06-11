import { Networks } from "@stellar/stellar-sdk";

export type NetworkName = "localhost" | "testnet" | "mainnet";

export interface ContractAddresses {
  factory: string;
  oracle: string;
  settlement: string;
  treasury: string;
  usdc: string;
}

export interface NetworkConfig {
  name: NetworkName;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  explorerUrl: string;
  contracts: ContractAddresses;
}

// ─── Contract Address Registry ────────────────────────────────────────────────
// Updated after each deployment by running scripts/deploy/deploy-testnet.sh

const TESTNET_CONTRACTS: ContractAddresses = {
  factory:
    (process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID as string) ||
    (process.env.FACTORY_CONTRACT_ID as string) ||
    "",
  oracle:
    (process.env.NEXT_PUBLIC_ORACLE_CONTRACT_ID as string) ||
    (process.env.ORACLE_CONTRACT_ID as string) ||
    "",
  settlement:
    (process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT_ID as string) ||
    (process.env.SETTLEMENT_CONTRACT_ID as string) ||
    "",
  treasury:
    (process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID as string) ||
    (process.env.TREASURY_CONTRACT_ID as string) ||
    "",
  // USDC the deployed markets/AMMs were initialized with. This MUST match the
  // collateral token every live AMM expects, otherwise approve/balance/trade
  // all operate on the wrong asset and every trade fails at the approve step.
  // Resolved from env (set by deploy-testnet.sh), falling back to the deployed
  // mintable testnet USDC so the live v2 deployment is usable out of the box.
  // To run against Circle's faucet USDC instead, deploy fresh markets with that
  // token and set NEXT_PUBLIC_USDC_CONTRACT_ID accordingly.
  usdc:
    (process.env.NEXT_PUBLIC_USDC_CONTRACT_ID as string) ||
    (process.env.USDC_CONTRACT_ID as string) ||
    "CCJWR4HYAMZMICEZFX3PUTUFZTR67RIEX54MRWUXTBE3C4X7RUZZWWWZ",
};

/** Circle testnet USDC — canonical, used by deploy + seed scripts. */
export const CIRCLE_TESTNET_USDC =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export const CIRCLE_TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const MAINNET_CONTRACTS: ContractAddresses = {
  factory: (process.env.MAINNET_FACTORY_CONTRACT_ID as string) || "",
  oracle: (process.env.MAINNET_ORACLE_CONTRACT_ID as string) || "",
  settlement: (process.env.MAINNET_SETTLEMENT_CONTRACT_ID as string) || "",
  treasury: (process.env.MAINNET_TREASURY_CONTRACT_ID as string) || "",
  usdc: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
};

const LOCALHOST_CONTRACTS: ContractAddresses = {
  factory: (process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID as string) || "",
  oracle: (process.env.NEXT_PUBLIC_ORACLE_CONTRACT_ID as string) || "",
  settlement: (process.env.NEXT_PUBLIC_SETTLEMENT_CONTRACT_ID as string) || "",
  treasury: (process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID as string) || "",
  usdc: (process.env.NEXT_PUBLIC_USDC_CONTRACT_ID as string) || "",
};

// ─── Network Configs ──────────────────────────────────────────────────────────

export const NETWORK_CONFIGS: Record<NetworkName, NetworkConfig> = {
  localhost: {
    name: "localhost",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    horizonUrl: "http://localhost:8000",
    networkPassphrase: Networks.STANDALONE,
    explorerUrl: "http://localhost:8000",
    contracts: LOCALHOST_CONTRACTS,
  },
  testnet: {
    name: "testnet",
    rpcUrl:
      (process.env.NEXT_PUBLIC_SOROBAN_RPC_URL as string) ||
      (process.env.SOROBAN_RPC_URL as string) ||
      "https://soroban-testnet.stellar.org",
    horizonUrl:
      (process.env.NEXT_PUBLIC_HORIZON_URL as string) ||
      (process.env.HORIZON_URL as string) ||
      "https://horizon-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    explorerUrl: "https://stellar.expert/explorer/testnet",
    contracts: TESTNET_CONTRACTS,
  },
  mainnet: {
    name: "mainnet",
    rpcUrl:
      (process.env.MAINNET_SOROBAN_RPC_URL as string) ||
      "https://soroban-mainnet.stellar.org",
    horizonUrl:
      (process.env.MAINNET_HORIZON_URL as string) ||
      "https://horizon.stellar.org",
    networkPassphrase: Networks.PUBLIC,
    explorerUrl: "https://stellar.expert/explorer/public",
    contracts: MAINNET_CONTRACTS,
  },
};

export function getNetworkConfig(network?: NetworkName): NetworkConfig {
  const name = (network ||
    process.env.NEXT_PUBLIC_STELLAR_NETWORK ||
    process.env.STELLAR_NETWORK ||
    "testnet") as NetworkName;
  return NETWORK_CONFIGS[name] ?? NETWORK_CONFIGS.testnet;
}

export function isContractsDeployed(config: NetworkConfig): boolean {
  return Boolean(
    config.contracts.factory &&
      config.contracts.oracle &&
      config.contracts.settlement &&
      config.contracts.usdc
  );
}

export function getExplorerTxUrl(config: NetworkConfig, txHash: string): string {
  return `${config.explorerUrl}/tx/${txHash}`;
}

export function getExplorerContractUrl(
  config: NetworkConfig,
  contractId: string
): string {
  return `${config.explorerUrl}/contract/${contractId}`;
}
