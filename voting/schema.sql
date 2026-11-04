-- Run once: wrangler d1 execute voting --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS voters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 of the emailed token (token itself is never stored)
  email_hash    TEXT NOT NULL UNIQUE,   -- HMAC-SHA256(email, EMAIL_PEPPER); used for optional email confirmation
  revoked_at    TEXT,
  last_vote_at  TEXT
);

-- One row per (voter, category). The primary key IS the "one vote per category"
-- guarantee, enforced by the database, so races and double-clicks cannot beat it.
CREATE TABLE IF NOT EXISTS votes (
  voter_id     INTEGER NOT NULL REFERENCES voters(id),
  token_hash   TEXT NOT NULL,
  category_id  TEXT NOT NULL,
  nominee_id   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (voter_id, category_id),
  UNIQUE (token_hash, category_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_votes_tally ON votes (category_id, nominee_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash     TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS vote_requests (
  token_hash   TEXT NOT NULL,
  request_key  TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (token_hash, request_key)
) WITHOUT ROWID;
