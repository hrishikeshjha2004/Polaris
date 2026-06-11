-- StellarPM Database Schema
-- Migration 001: Initial schema

-- ─── Core Tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS markets (
  id                  TEXT PRIMARY KEY,
  contract_address    TEXT NOT NULL UNIQUE,
  amm_contract        TEXT,
  yes_token           TEXT,
  no_token            TEXT,
  lp_token            TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL DEFAULT 'crypto_price',
  creator             TEXT NOT NULL,
  expiry_timestamp    TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'expired', 'resolved', 'closed')),
  yes_price           NUMERIC(6, 2) NOT NULL DEFAULT 50,
  no_price            NUMERIC(6, 2) NOT NULL DEFAULT 50,
  volume              NUMERIC(20, 7) NOT NULL DEFAULT 0,
  tvl                 NUMERIC(20, 7) NOT NULL DEFAULT 0,
  oracle_source       TEXT,
  threshold_value     BIGINT,
  threshold_operator  INTEGER NOT NULL DEFAULT 0,
  resolution          TEXT CHECK (resolution IN ('yes', 'no')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trades (
  id          BIGSERIAL PRIMARY KEY,
  market_id   TEXT NOT NULL REFERENCES markets(id),
  trader      TEXT NOT NULL,
  token_in    TEXT NOT NULL,
  amount_in   BIGINT NOT NULL,
  amount_out  BIGINT NOT NULL,
  fee         BIGINT NOT NULL DEFAULT 0,
  tx_hash     TEXT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id            BIGSERIAL PRIMARY KEY,
  market_id     TEXT NOT NULL REFERENCES markets(id),
  user_address  TEXT NOT NULL,
  outcome       TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  token_balance BIGINT NOT NULL DEFAULT 0,
  avg_price     NUMERIC(10, 7) NOT NULL DEFAULT 0,
  UNIQUE (market_id, user_address, outcome)
);

CREATE TABLE IF NOT EXISTS lp_positions (
  id              BIGSERIAL PRIMARY KEY,
  market_id       TEXT NOT NULL REFERENCES markets(id),
  provider        TEXT NOT NULL,
  lp_shares       BIGINT NOT NULL DEFAULT 0,
  deposited_value BIGINT NOT NULL DEFAULT 0,
  fee_earned      BIGINT NOT NULL DEFAULT 0,
  UNIQUE (market_id, provider)
);

-- ─── Oracle Tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oracle_submissions (
  id              BIGSERIAL PRIMARY KEY,
  market_id       TEXT NOT NULL,
  signer          TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  price_at_expiry BIGINT NOT NULL,
  price_source    TEXT NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash         TEXT,
  UNIQUE (market_id, signer)
);

CREATE TABLE IF NOT EXISTS oracle_resolutions (
  market_id           TEXT PRIMARY KEY,
  outcome             TEXT NOT NULL CHECK (outcome IN ('yes', 'no')),
  final_price         BIGINT NOT NULL,
  resolved_at         TIMESTAMPTZ NOT NULL,
  dispute_window_end  TIMESTAMPTZ NOT NULL,
  finalized           BOOLEAN NOT NULL DEFAULT FALSE,
  submission_count    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS disputes (
  id          BIGSERIAL PRIMARY KEY,
  market_id   TEXT NOT NULL,
  disputer    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  raised_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Settlement Tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settlements (
  market_id         TEXT PRIMARY KEY,
  winning_outcome   TEXT NOT NULL CHECK (winning_outcome IN ('yes', 'no')),
  total_pool        BIGINT NOT NULL DEFAULT 0,
  protocol_fee      BIGINT NOT NULL DEFAULT 0,
  payout_pool       BIGINT NOT NULL DEFAULT 0,
  payout_rate       BIGINT NOT NULL DEFAULT 0,
  winning_supply    BIGINT NOT NULL DEFAULT 0,
  settled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id              BIGSERIAL PRIMARY KEY,
  market_id       TEXT NOT NULL,
  claimant        TEXT NOT NULL,
  tokens_burned   BIGINT NOT NULL,
  usdc_received   BIGINT NOT NULL,
  claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_id, claimant)
);

-- ─── Event Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  contract_id TEXT NOT NULL,
  ledger      BIGINT NOT NULL,
  timestamp   TIMESTAMPTZ NOT NULL,
  tx_hash     TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'
);

-- ─── Indexer State ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS indexer_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ─── Price History ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL PRIMARY KEY,
  market_id   TEXT NOT NULL REFERENCES markets(id),
  yes_price   NUMERIC(6, 2) NOT NULL,
  no_price    NUMERIC(6, 2) NOT NULL,
  yes_reserve BIGINT NOT NULL DEFAULT 0,
  no_reserve  BIGINT NOT NULL DEFAULT 0,
  volume      BIGINT NOT NULL DEFAULT 0,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_expiry ON markets(expiry_timestamp);
CREATE INDEX IF NOT EXISTS idx_markets_creator ON markets(creator);
CREATE INDEX IF NOT EXISTS idx_markets_category ON markets(category);
CREATE INDEX IF NOT EXISTS idx_markets_volume ON markets(volume DESC);

CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_positions_user ON positions(user_address);
CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_id);

CREATE INDEX IF NOT EXISTS idx_lp_positions_provider ON lp_positions(provider);

CREATE INDEX IF NOT EXISTS idx_events_contract ON events(contract_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_price_history_market ON price_history(market_id, timestamp DESC);
