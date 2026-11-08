import pg from "pg";

const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  ssl,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
pool.on("error", (e) => console.error("pg pool error:", e.message));

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS voters (
      id           BIGSERIAL PRIMARY KEY,
      token_hash   TEXT UNIQUE,            -- link mode: SHA-256 of the emailed token (never the token)
      email_hash   TEXT UNIQUE,            -- link mode: HMAC-SHA256(email, EMAIL_PEPPER)
      last_vote_at TIMESTAMPTZ
    );
    -- One row per (voter, category). The primary key IS the "one vote per category"
    -- guarantee, enforced by the database, so races and double-clicks cannot beat it.
    CREATE TABLE IF NOT EXISTS votes (
      voter_id    BIGINT NOT NULL REFERENCES voters(id),
      category_id TEXT NOT NULL,
      nominee_id  TEXT NOT NULL,
      fp_hash     TEXT,                    -- device mode: HMAC of the browser fingerprint
      ip_hash     TEXT,                    -- device mode: HMAC of the IP (soft cap only)
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (voter_id, category_id)
    );
    CREATE INDEX IF NOT EXISTS idx_votes_tally ON votes (category_id, nominee_id);
    -- Upgrade path for databases created by the link-only version
    ALTER TABLE voters ALTER COLUMN token_hash DROP NOT NULL;
    ALTER TABLE voters ALTER COLUMN email_hash DROP NOT NULL;
    ALTER TABLE votes ADD COLUMN IF NOT EXISTS fp_hash TEXT;
    ALTER TABLE votes ADD COLUMN IF NOT EXISTS ip_hash TEXT;
    -- One ballot per (category, fingerprint): the database stops a cleared cookie from voting again
    CREATE UNIQUE INDEX IF NOT EXISTS uq_votes_cat_fp ON votes (category_id, fp_hash) WHERE fp_hash IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_votes_ip ON votes (ip_hash) WHERE ip_hash IS NOT NULL;
  `);
}

export async function ping() {
  await pool.query("SELECT 1");
}

export async function findVoter(tokenHash) {
  const { rows } = await pool.query("SELECT id, email_hash FROM voters WHERE token_hash = $1", [tokenHash]);
  return rows[0] || null;
}

export async function votedCategories(voterId) {
  const { rows } = await pool.query("SELECT category_id FROM votes WHERE voter_id = $1", [voterId]);
  return rows.map((r) => r.category_id);
}

// All inserts land or none do (a single statement is atomic). A repeat category
// raises a unique violation (code 23505), which the caller turns into a 409.
export async function insertVotes(voterId, entries, fpHash = null, ipHash = null) {
  const params = [voterId, fpHash, ipHash];
  const values = entries.map(([cat, nom], i) => {
    params.push(cat, nom);
    return `($1, $${4 + i * 2}, $${5 + i * 2}, $2, $3)`;
  });
  const sql = `WITH ins AS (
      INSERT INTO votes (voter_id, category_id, nominee_id, fp_hash, ip_hash) VALUES ${values.join(", ")} RETURNING 1
    )
    UPDATE voters SET last_vote_at = now() WHERE id = $1`;
  await pool.query(sql, params);
}

export async function tally() {
  const { rows } = await pool.query(
    "SELECT category_id, nominee_id, COUNT(*)::int AS votes FROM votes GROUP BY category_id, nominee_id"
  );
  return rows;
}

export async function turnout() {
  const { rows } = await pool.query(
    "SELECT (SELECT COUNT(*) FROM voters)::int AS eligible, (SELECT COUNT(DISTINCT voter_id) FROM votes)::int AS voted"
  );
  return rows[0];
}

// Idempotent: existing hashes are skipped. Returns how many rows were new.
export async function insertVoters(tokenHashes, emailHashes) {
  const res = await pool.query(
    `INSERT INTO voters (token_hash, email_hash)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT DO NOTHING`,
    [tokenHashes, emailHashes]
  );
  return res.rowCount;
}

// ---- device mode ---------------------------------------------------------------------
export async function createDeviceVoter() {
  const { rows } = await pool.query("INSERT INTO voters DEFAULT VALUES RETURNING id");
  return { id: String(rows[0].id) };
}

export async function voterExists(id) {
  const { rows } = await pool.query("SELECT id FROM voters WHERE id = $1", [id]);
  return rows.length > 0;
}

// Categories already voted from this fingerprint (survives cleared cookies)
export async function votedByFingerprint(fpHash) {
  const { rows } = await pool.query("SELECT category_id FROM votes WHERE fp_hash = $1", [fpHash]);
  return rows.map((r) => r.category_id);
}

export async function ballotsFromIp(ipHash) {
  const { rows } = await pool.query("SELECT COUNT(DISTINCT voter_id)::int AS n FROM votes WHERE ip_hash = $1", [ipHash]);
  return rows[0].n;
}

export async function deleteVoterIfEmpty(id) {
  await pool.query("DELETE FROM voters WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM votes WHERE voter_id = $1)", [id]);
}
