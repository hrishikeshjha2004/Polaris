/**
 * Transaction builder helpers and submission utilities.
 *
 * Wraps Soroban RPC's prepareTransaction + sendTransaction + polling loop
 * into a clean promise-based API with retry and status tracking.
 */

import {
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
  Contract,
  BASE_FEE,
  Account,
} from "@stellar/stellar-sdk";
import type { NetworkConfig } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimulateResult {
  success: boolean;
  returnValue?: xdr.ScVal;
  error?: string;
  /** Estimated fee in stroops */
  feeEstimate?: number;
}

export interface SubmitResult {
  hash: string;
  status: "success" | "failed" | "timeout";
  errorMessage?: string;
  returnValue?: xdr.ScVal;
}

export interface BuildTxOptions {
  /** Fee in stroops. Defaults to BASE_FEE with a safety margin. */
  fee?: string;
  /** Timeout in seconds */
  timeoutSeconds?: number;
}

// ─── RPC Server ───────────────────────────────────────────────────────────────

const servers = new Map<string, SorobanRpc.Server>();

export function getServer(config: NetworkConfig): SorobanRpc.Server {
  if (!servers.has(config.rpcUrl)) {
    servers.set(
      config.rpcUrl,
      new SorobanRpc.Server(config.rpcUrl, {
        allowHttp: config.rpcUrl.startsWith("http://"),
      })
    );
  }
  return servers.get(config.rpcUrl)!;
}

// ─── Build + Simulate ────────────────────────────────────────────────────────

export async function buildAndSimulate(
  server: SorobanRpc.Server,
  sourceAddress: string,
  networkPassphrase: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  options: BuildTxOptions = {}
): Promise<{ tx: Transaction; simResult: SorobanRpc.Api.SimulateTransactionSuccessResponse }> {
  const sourceAccount = await server.getAccount(sourceAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: options.fee ?? String(Number(BASE_FEE) * 10),
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(options.timeoutSeconds ?? 30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }
  if (SorobanRpc.Api.isSimulationRestore(simResult)) {
    throw new Error("Transaction needs footprint restore — run stellar-cli contract restore");
  }

  const successSim = simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse;
  const preparedTx = SorobanRpc.assembleTransaction(tx, successSim).build();

  return { tx: preparedTx, simResult: successSim };
}

/** Simulate-only (read call): no signing needed */
export async function simulateReadCall(
  server: SorobanRpc.Server,
  networkPassphrase: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<SimulateResult> {
  // Construct a local dummy account — no network call needed for simulation.
  // Any valid 56-char G-address works; sequence starts at 0.
  // Well-known Stellar testnet read-only account (no private key needed for simulation)
  const DUMMY_ACCOUNT = new Account(
    "GBJKCLZVXMIINNZLMWCHWM4HMFAZFRE7MI34RW7LB5GGDZM7L432JJG7",
    "0"
  );

  try {
    const sourceAccount = DUMMY_ACCOUNT;
    const contract = new Contract(contractId);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simResult = await server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      return { success: false, error: simResult.error };
    }

    const success = simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse;
    return {
      success: true,
      returnValue: success.result?.retval,
      feeEstimate: parseInt(success.minResourceFee ?? "0", 10),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Submit ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1_000;
const MAX_POLLS = 30;

export async function submitAndConfirm(
  server: SorobanRpc.Server,
  signedXdr: string,
  networkPassphrase: string
): Promise<SubmitResult> {
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
  const sendResult = await server.sendTransaction(tx);

  if (sendResult.status === "ERROR") {
    const errResult = sendResult.errorResult;
    return {
      hash: sendResult.hash,
      status: "failed",
      errorMessage: errResult
        ? JSON.stringify(errResult.toXDR("base64"))
        : "Unknown send error",
    };
  }

  const hash = sendResult.hash;

  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_INTERVAL_MS);

    let result: Awaited<ReturnType<typeof server.getTransaction>>;
    try {
      result = await server.getTransaction(hash);
    } catch (err) {
      // The SDK's XDR parser throws TypeError("Bad union switch: N") or
      // TypeError("fieldName not set") when the RPC node runs a newer Stellar
      // protocol than the SDK's bundled XDR definitions know about.  This only
      // happens for SUCCESS transactions (NOT_FOUND / still-pending responses
      // have no resultMetaXdr to parse), so it is safe to treat as success.
      const isXdrParse =
        err instanceof TypeError &&
        (/bad union switch/i.test(err.message) || / not set$/i.test(err.message));
      if (isXdrParse) {
        return { hash, status: "success" };
      }
      throw err;
    }

    if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      const success = result as SorobanRpc.Api.GetSuccessfulTransactionResponse;
      return {
        hash,
        status: "success",
        returnValue: success.returnValue,
      };
    }

    if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      return { hash, status: "failed", errorMessage: "Transaction failed on-chain" };
    }
  }

  return { hash, status: "timeout" };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── XDR Helper ──────────────────────────────────────────────────────────────

export function xdrToBase64(tx: Transaction): string {
  return tx.toXDR();
}
