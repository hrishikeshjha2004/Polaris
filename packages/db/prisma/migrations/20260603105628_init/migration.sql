-- CreateEnum
CREATE TYPE "market_status" AS ENUM ('open', 'expired', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "outcome" AS ENUM ('yes', 'no');

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "contract_address" TEXT NOT NULL,
    "amm_contract" TEXT,
    "yes_token" TEXT,
    "no_token" TEXT,
    "lp_token" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'crypto_price',
    "creator" TEXT NOT NULL,
    "expiry_timestamp" TIMESTAMP(3) NOT NULL,
    "status" "market_status" NOT NULL DEFAULT 'open',
    "yes_price" DECIMAL(6,2) NOT NULL DEFAULT 50,
    "no_price" DECIMAL(6,2) NOT NULL DEFAULT 50,
    "volume" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "tvl" DECIMAL(20,7) NOT NULL DEFAULT 0,
    "oracle_source" TEXT,
    "threshold_value" BIGINT,
    "threshold_operator" INTEGER NOT NULL DEFAULT 0,
    "resolution" "outcome",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "token_in" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'buy',
    "amount_in" BIGINT NOT NULL,
    "amount_out" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "price_impact_bps" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidity_events" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lp_shares" BIGINT NOT NULL,
    "yes_amount" BIGINT NOT NULL DEFAULT 0,
    "no_amount" BIGINT NOT NULL DEFAULT 0,
    "usdc_amount" BIGINT NOT NULL DEFAULT 0,
    "tx_hash" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "outcome" "outcome" NOT NULL,
    "token_balance" BIGINT NOT NULL DEFAULT 0,
    "avg_price" DECIMAL(10,7) NOT NULL DEFAULT 0,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lp_positions" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "lp_shares" BIGINT NOT NULL DEFAULT 0,
    "deposited_value" BIGINT NOT NULL DEFAULT 0,
    "fee_earned" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "lp_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oracle_submissions" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "signer" TEXT NOT NULL,
    "outcome" "outcome" NOT NULL,
    "price_at_expiry" BIGINT NOT NULL,
    "price_source" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tx_hash" TEXT,

    CONSTRAINT "oracle_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oracle_resolutions" (
    "market_id" TEXT NOT NULL,
    "outcome" "outcome" NOT NULL,
    "final_price" BIGINT NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL,
    "dispute_window_end" TIMESTAMP(3) NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "submission_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "oracle_resolutions_pkey" PRIMARY KEY ("market_id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "disputer" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "market_id" TEXT NOT NULL,
    "winning_outcome" "outcome" NOT NULL,
    "total_pool" BIGINT NOT NULL DEFAULT 0,
    "protocol_fee" BIGINT NOT NULL DEFAULT 0,
    "payout_pool" BIGINT NOT NULL DEFAULT 0,
    "payout_rate" BIGINT NOT NULL DEFAULT 0,
    "winning_supply" BIGINT NOT NULL DEFAULT 0,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("market_id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "claimant" TEXT NOT NULL,
    "tokens_burned" BIGINT NOT NULL,
    "usdc_received" BIGINT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "ledger" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "indexer_state" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "indexer_state_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "yes_price" DECIMAL(6,2) NOT NULL,
    "no_price" DECIMAL(6,2) NOT NULL,
    "yes_reserve" BIGINT NOT NULL DEFAULT 0,
    "no_reserve" BIGINT NOT NULL DEFAULT 0,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_events" (
    "seq" BIGSERIAL NOT NULL,
    "channel" TEXT NOT NULL,
    "market_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_events_pkey" PRIMARY KEY ("seq")
);

-- CreateIndex
CREATE UNIQUE INDEX "markets_contract_address_key" ON "markets"("contract_address");

-- CreateIndex
CREATE INDEX "markets_status_idx" ON "markets"("status");

-- CreateIndex
CREATE INDEX "markets_expiry_timestamp_idx" ON "markets"("expiry_timestamp");

-- CreateIndex
CREATE INDEX "markets_creator_idx" ON "markets"("creator");

-- CreateIndex
CREATE INDEX "markets_category_idx" ON "markets"("category");

-- CreateIndex
CREATE INDEX "markets_volume_idx" ON "markets"("volume" DESC);

-- CreateIndex
CREATE INDEX "trades_market_id_idx" ON "trades"("market_id");

-- CreateIndex
CREATE INDEX "trades_trader_idx" ON "trades"("trader");

-- CreateIndex
CREATE INDEX "trades_timestamp_idx" ON "trades"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "liquidity_events_market_id_idx" ON "liquidity_events"("market_id");

-- CreateIndex
CREATE INDEX "liquidity_events_provider_idx" ON "liquidity_events"("provider");

-- CreateIndex
CREATE INDEX "liquidity_events_timestamp_idx" ON "liquidity_events"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "positions_user_address_idx" ON "positions"("user_address");

-- CreateIndex
CREATE INDEX "positions_market_id_idx" ON "positions"("market_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_market_id_user_address_outcome_key" ON "positions"("market_id", "user_address", "outcome");

-- CreateIndex
CREATE INDEX "lp_positions_provider_idx" ON "lp_positions"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "lp_positions_market_id_provider_key" ON "lp_positions"("market_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "oracle_submissions_market_id_signer_key" ON "oracle_submissions"("market_id", "signer");

-- CreateIndex
CREATE UNIQUE INDEX "claims_market_id_claimant_key" ON "claims"("market_id", "claimant");

-- CreateIndex
CREATE INDEX "events_contract_id_idx" ON "events"("contract_id");

-- CreateIndex
CREATE INDEX "events_event_type_idx" ON "events"("event_type");

-- CreateIndex
CREATE INDEX "events_timestamp_idx" ON "events"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "price_history_market_id_timestamp_idx" ON "price_history"("market_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "broadcast_events_seq_idx" ON "broadcast_events"("seq");

-- CreateIndex
CREATE INDEX "broadcast_events_channel_idx" ON "broadcast_events"("channel");

-- CreateIndex
CREATE INDEX "broadcast_events_market_id_idx" ON "broadcast_events"("market_id");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidity_events" ADD CONSTRAINT "liquidity_events_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lp_positions" ADD CONSTRAINT "lp_positions_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
