-- Run once against an existing database after deploying the hardened worker.
ALTER TABLE voters ADD COLUMN revoked_at TEXT;
ALTER TABLE votes ADD COLUMN token_hash TEXT;

UPDATE votes
SET token_hash = (SELECT token_hash FROM voters WHERE voters.id = votes.voter_id)
WHERE token_hash IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_token_category ON votes (token_hash, category_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash       TEXT PRIMARY KEY,
  window_start   INTEGER NOT NULL,
  request_count  INTEGER NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS vote_requests (
  token_hash    TEXT NOT NULL,
  request_key   TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (token_hash, request_key)
) WITHOUT ROWID;
