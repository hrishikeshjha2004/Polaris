/**
 * Oracle Worker — monitors market expiry and submits resolutions.
 *
 * Flow:
 *   1. Poll DB for expired markets with no oracle submission by this signer
 *   2. Fetch price from CoinGecko + Binance + CMC (median aggregation)
 *   3. Evaluate market condition against threshold
 *   4. Build + sign + submit to Oracle contract via Soroban RPC
 *   5. After dispute window: call finalize_resolution
 */

import * as dotenv from "dotenv";
import { Pool } from "pg";
import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  Contract,
  xdr,
  Address,
  nativeToScVal,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { createLogger } from "../../indexer/src/logger";
import { PriceFeedAggregator } from "./price-feeds";

dotenv.config();

const logger = createLogger("oracle-worker");

const ORACLE_CONTRACT_ID = process.env.ORACLE_CONTRACT_ID!;
const SIGNER_SECRET = process.env.ORACLE_SIGNER_SECRET_KEY!;
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.TESTNET;
const POLL_INTERVAL_MS = parseInt(process.env.ORACLE_POLL_INTERVAL_MS ?? "60000", 10);

type OutcomeVerdict = "yes" | "no";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  logger.info("Starting Oracle Worker...");

  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const signer = Keypair.fromSecret(SIGNER_SECRET);
  const server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: false });
  const priceFeeds = new PriceFeedAggregator(logger);

  logger.info(`Oracle signer: ${signer.publicKey()}`);

  async function tick() {
    try {
      await processExpiredMarkets(server, signer, priceFeeds, db);
      await finalizeReadyResolutions(server, signer, db);
    } catch (err) {
      logger.error({ err }, "Oracle worker tick error");
    }
  }

  setInterval(tick, POLL_INTERVAL_MS);
  await tick();

  process.on("SIGTERM", async () => {
    await db.end();
    process.exit(0);
  });
}

// ─── Process Expired Markets ─────────────────────────────────────────────────

async function processExpiredMarkets(
  server: SorobanRpc.Server,
  signer: Keypair,
  priceFeeds: PriceFeedAggregator,
  db: Pool
) {
  const result = await db.query<{
    id: string;
    oracle_source: string;
    threshold_value: string;
    threshold_operator: number;
  }>(
    `SELECT m.id, m.oracle_source, m.threshold_value, m.threshold_operator
     FROM markets m
     WHERE m.status IN ('open', 'expired')
       AND m.expiry_timestamp <= NOW()
       AND NOT EXISTS (
         SELECT 1 FROM oracle_submissions os
         WHERE os.market_id = m.id AND os.signer = $1
       )
     LIMIT 20`,
    [signer.publicKey()]
  );

  logger.info(`${result.rows.length} markets pending oracle submission`);

  for (const market of result.rows) {
    try {
      await submitResolution(server, signer, priceFeeds, db, market);
    } catch (err) {
      logger.error({ err, marketId: market.id }, "Submission failed");
    }
  }
}

async function submitResolution(
  server: SorobanRpc.Server,
  signer: Keypair,
  priceFeeds: PriceFeedAggregator,
  db: Pool,
  market: {
    id: string;
    oracle_source: string;
    threshold_value: string;
    threshold_operator: number;
  }
) {
  const asset = market.oracle_source.split("_")[0];
  const priceData = await priceFeeds.getPrice(asset);
  const threshold = parseFloat(market.threshold_value) / 1e7;
  const verdict = evaluateCondition(priceData.medianPrice, threshold, market.threshold_operator);

  logger.info({ marketId: market.id, asset, price: priceData.medianPrice, threshold, verdict });

  // Convert market ID from hex UUID to 32-byte ScVal
  const marketIdHex = market.id.replace(/-/g, "");
  const marketIdBytes = Buffer.from(marketIdHex.padEnd(64, "0").slice(0, 64), "hex");
  const marketIdScVal = xdr.ScVal.scvBytes(marketIdBytes);

  // Encode outcome as contract enum: { Yes: {} } or { No: {} }
  const outcomeScVal = xdr.ScVal.scvU32(verdict === "yes" ? 0 : 1);

  // Price scaled by 1e7
  const priceScaled = BigInt(Math.round(priceData.medianPrice * 1e7));
  const priceScVal = nativeToScVal(priceScaled, { type: "i128" });

  const priceSourceScVal = xdr.ScVal.scvString(priceData.sources.join(","));
  const signerScVal = new Address(signer.publicKey()).toScVal();

  const oracle = new Contract(ORACLE_CONTRACT_ID);
  const sourceAccount = await server.getAccount(signer.publicKey());

  const tx = new TransactionBuilder(sourceAccount, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      oracle.call(
        "submit_resolution",
        signerScVal,
        marketIdScVal,
        outcomeScVal,
        priceScVal,
        priceSourceScVal
      )
    )
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(
    tx,
    simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse
  ).build();
  assembled.sign(signer);

  const sendResult = await server.sendTransaction(assembled);
  logger.info({ marketId: market.id, txHash: sendResult.hash, verdict }, "Submission sent");

  // Record in DB
  await db.query(
    `INSERT INTO oracle_submissions
       (market_id, signer, outcome, price_at_expiry, price_source, tx_hash, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT DO NOTHING`,
    [
      market.id,
      signer.publicKey(),
      verdict,
      Math.round(priceData.medianPrice * 1e7),
      priceData.sources.join(","),
      sendResult.hash,
    ]
  );
}

// ─── Finalize Resolutions ─────────────────────────────────────────────────────

async function finalizeReadyResolutions(
  server: SorobanRpc.Server,
  signer: Keypair,
  db: Pool
) {
  // Markets where oracle threshold was met and dispute window has passed
  const result = await db.query<{ id: string }>(
    `SELECT m.id FROM markets m
     JOIN oracle_resolutions r ON r.market_id = m.id
     WHERE r.finalized = false
       AND r.dispute_window_end <= NOW()
     LIMIT 10`
  );

  for (const row of result.rows) {
    try {
      await callFinalizeResolution(server, signer, row.id);
      await db.query(
        `UPDATE oracle_resolutions SET finalized = true WHERE market_id = $1`,
        [row.id]
      );
      logger.info({ marketId: row.id }, "Resolution finalized");
    } catch (err) {
      logger.error({ err, marketId: row.id }, "Finalization failed");
    }
  }
}

async function callFinalizeResolution(
  server: SorobanRpc.Server,
  signer: Keypair,
  marketId: string
) {
  const marketIdHex = marketId.replace(/-/g, "");
  const marketIdBytes = Buffer.from(marketIdHex.padEnd(64, "0").slice(0, 64), "hex");
  const marketIdScVal = xdr.ScVal.scvBytes(marketIdBytes);

  const oracle = new Contract(ORACLE_CONTRACT_ID);
  const sourceAccount = await server.getAccount(signer.publicKey());

  const tx = new TransactionBuilder(sourceAccount, {
    fee: String(Number(BASE_FEE) * 100),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(oracle.call("finalize_resolution", marketIdScVal))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw new Error(`Finalization simulation failed: ${simResult.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(
    tx,
    simResult as SorobanRpc.Api.SimulateTransactionSuccessResponse
  ).build();
  assembled.sign(signer);
  await server.sendTransaction(assembled);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evaluateCondition(
  price: number,
  threshold: number,
  operator: number
): OutcomeVerdict {
  switch (operator) {
    case 0: return price > threshold ? "yes" : "no";
    case 1: return price < threshold ? "yes" : "no";
    case 2: return price >= threshold ? "yes" : "no";
    case 3: return price <= threshold ? "yes" : "no";
    default: return "no";
  }
}

main().catch((err) => {
  logger.error({ err }, "Oracle worker fatal error");
  process.exit(1);
});
