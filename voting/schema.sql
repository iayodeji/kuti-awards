-- Run once: wrangler d1 execute voting --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS voters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash    TEXT NOT NULL UNIQUE,   -- SHA-256 of the emailed token (token itself is never stored)
  email_hash    TEXT NOT NULL UNIQUE,   -- HMAC-SHA256(email, EMAIL_PEPPER); used for optional email confirmation
  last_vote_at  TEXT
);

-- One row per (voter, category). The primary key IS the "one vote per category"
-- guarantee, enforced by the database, so races and double-clicks cannot beat it.
CREATE TABLE IF NOT EXISTS votes (
  voter_id     INTEGER NOT NULL REFERENCES voters(id),
  category_id  TEXT NOT NULL,
  nominee_id   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (voter_id, category_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_votes_tally ON votes (category_id, nominee_id);
