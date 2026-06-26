import * as StellarSdk from "@stellar/stellar-sdk";
import { rpc, Networks } from "@stellar/stellar-sdk";

export const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";

export const networkPassphrase =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET;

export const server = new rpc.Server(RPC_URL, { allowHttp: false });

export { StellarSdk };
export default StellarSdk;
