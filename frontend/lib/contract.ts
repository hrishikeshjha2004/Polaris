import * as StellarSdk from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";
import { server, networkPassphrase } from "./stellar-sdk";

const { Keypair, TransactionBuilder, BASE_FEE, Operation } = StellarSdk;

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID ||
  process.env.NEXT_PUBLIC_CONTRACT_ID ||
  "";

/**
 * Build, simulate, sign, and submit a Soroban contract invocation.
 *
 * Steps:
 *  1. Load the source account from the RPC server.
 *  2. Build a transaction with Operation.invokeContractFunction.
 *  3. Simulate via server.simulateTransaction() and assemble the footprint.
 *  4. Sign with the provided secret key.
 *  5. Submit via server.sendTransaction() and return the response.
 */
export async function callContractFunction(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[],
  signerSecret: string
): Promise<rpc.Api.GetTransactionResponse> {
  const keypair = Keypair.fromSecret(signerSecret);
  const account = await server.getAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
      })
    )
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const assembledTx = rpc.assembleTransaction(tx, simResult).build();
  assembledTx.sign(keypair);

  const sendResult = await server.sendTransaction(assembledTx);

  // Poll until the transaction is confirmed or failed.
  const startTime = Date.now();
  while (Date.now() - startTime < 30_000) {
    const status = await server.getTransaction(sendResult.hash);
    if (
      status.status === rpc.Api.GetTransactionStatus.SUCCESS ||
      status.status === rpc.Api.GetTransactionStatus.FAILED
    ) {
      return status;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("Transaction polling timed out");
}

/**
 * Simulate a read-only contract call and return the raw ScVal result.
 * Requires a funded caller public key for the transaction builder.
 */
export async function readContractValue(
  contractId: string,
  method: string,
  args: StellarSdk.xdr.ScVal[] = [],
  callerPublicKey: string
): Promise<StellarSdk.xdr.ScVal | null> {
  const account = await server.getAccount(callerPublicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args,
      })
    )
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResult)) return null;
  if (!("result" in simResult) || !simResult.result) return null;
  return simResult.result.retval;
}
