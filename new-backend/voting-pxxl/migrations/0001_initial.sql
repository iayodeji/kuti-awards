CREATE TABLE IF NOT EXISTS voters (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_vote_at TEXT
);

CREATE TABLE IF NOT EXISTS votes (
  voter_id TEXT NOT NULL REFERENCES voters(id),
  category_id TEXT NOT NULL,
  nominee_id TEXT NOT NULL,
  fp_hash TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (voter_id, category_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_category_fp
  ON votes (category_id, fp_hash)
  WHERE fp_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_votes_tally
  ON votes (category_id, nominee_id);

CREATE INDEX IF NOT EXISTS idx_votes_ip
  ON votes (ip_hash)
  WHERE ip_hash IS NOT NULL;
