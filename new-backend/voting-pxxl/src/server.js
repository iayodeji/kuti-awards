import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "./config.js";
import {
  pool, initSchema, ping, findVoter, votedCategories, insertVotes, tally, turnout, insertVoters,
  createDeviceVoter, deleteVoterIfEmpty, voterExists, votedByFingerprint, ballotsFromIp,
} from "./db.js";
import {
  sha256Hex, hmacHex, safeEqual, TOKEN_RE, HEX64_RE, FP_RE, signVoterId, readVoterId,
  parseWindow, votingState, verifyTurnstile, makeLimiter,
} from "./lib.js";

const env = process.env;
// VOTER_MODE=device (default): open voting, one ballot per device (cookie + fingerprint), no email.
// VOTER_MODE=link: emailed single-use links (strongest; needs a mailing list).
const deviceMode = (env.VOTER_MODE || "device") !== "link";
const requireEmail = !deviceMode && env.REQUIRE_EMAIL_CONFIRM !== "false";
const SECRET = env.COOKIE_SECRET;
const COOKIE = "akoni_vid";
const IP_BALLOT_CAP = Number(env.IP_BALLOT_CAP || 1000); // max distinct ballots from one IP (0 = off)

// ---- fail fast on bad configuration -------------------------------------------------
const missing = ["DATABASE_URL", "ADMIN_KEY"]
  .concat(deviceMode ? ["COOKIE_SECRET"] : requireEmail ? ["EMAIL_PEPPER"] : [])
  .filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
let win;
try {
  win = parseWindow(env);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const corsOrigins = (env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
const ipLimit = makeLimiter(Number(env.RATE_IP_PER_MIN || 6000), 60_000);
const tokenLimit = makeLimiter(Number(env.RATE_TOKEN_PER_MIN || 30), 60_000);

const app = express();
app.set("trust proxy", Number(env.TRUST_PROXY ?? 1));
app.disable("x-powered-by");

// ---- /api middleware: headers, CORS, per-IP rate limit ------------------------------
app.use("/api", (req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  const origin = req.get("origin");
  if (origin && corsOrigins.includes(origin)) {
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
      "Access-Control-Allow-Headers": "content-type,x-admin-key",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    });
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (!ipLimit(req.ip)) return res.status(429).json({ error: "rate_limited" });
  next();
});

// Accept any content-type as JSON so a plain fetch() with a string body works.
const smallJson = express.json({ limit: "4kb", type: () => true });
const bigJson = express.json({ limit: "1mb", type: () => true });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

async function authenticate(req, res, body) {
  const token = body && body.token;
  if (typeof token !== "string" || !TOKEN_RE.test(token)) {
    res.status(403).json({ error: "invalid_link" });
    return null;
  }
  if (!tokenLimit(token)) {
    res.status(429).json({ error: "rate_limited" });
    return null;
  }
  const voter = await findVoter(sha256Hex(token));
  if (!voter) {
    res.status(403).json({ error: "invalid_link" });
    return null;
  }
  return voter;
}

function emailMatches(voter, email) {
  if (!requireEmail) return true;
  if (typeof email !== "string" || email.length > 254) return false;
  return safeEqual(hmacHex(env.EMAIL_PEPPER, email.trim().toLowerCase()), voter.email_hash);
}

// ---- POST /api/session  { token, email? } -------------------------------------------
const linkSession = wrap(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") return res.status(400).json({ error: "bad_request" });
  const voter = await authenticate(req, res, body);
  if (!voter) return;

  const state = votingState(win);
  if (requireEmail && !body.email) return res.json({ ok: true, step: "email", state, needsEmail: true });
  if (!emailMatches(voter, body.email)) return res.status(403).json({ error: "email_mismatch" });

  const voted = await votedCategories(voter.id);
  res.json({
    ok: true,
    step: "vote",
    state, // "not_open" | "open" | "closed"
    needsEmail: requireEmail,
    votedCategories: voted,
    allVoted: voted.length === CATEGORIES.length,
    categories: CATEGORIES,
  });
});

// ---- POST /api/vote  { token, email?, turnstile?, votes: { categoryId: nomineeId } } --
const linkVote = wrap(async (req, res) => {
  const body = req.body;
  if (!body || typeof body.votes !== "object" || body.votes === null || Array.isArray(body.votes)) {
    return res.status(400).json({ error: "bad_request" });
  }
  const state = votingState(win);
  if (state !== "open") return res.status(403).json({ error: state });

  const voter = await authenticate(req, res, body);
  if (!voter) return;
  if (!emailMatches(voter, body.email)) return res.status(403).json({ error: "email_mismatch" });
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstile, req.ip))) {
    return res.status(403).json({ error: "captcha_failed" });
  }

  // Validate every choice against the server-side config
  const entries = Object.entries(body.votes);
  if (entries.length === 0 || entries.length > CATEGORIES.length) return res.status(400).json({ error: "bad_request" });
  for (const [catId, nomId] of entries) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat || typeof nomId !== "string" || !cat.nominees.some((n) => n.id === nomId)) {
      return res.status(400).json({ error: "invalid_choice", category: catId });
    }
  }

  // Friendly pre-check (the primary key is the real guard against races)
  const already = await votedCategories(voter.id);
  const dupes = entries.map(([c]) => c).filter((c) => already.includes(c));
  if (dupes.length) return res.status(409).json({ error: "already_voted", categories: dupes });

  try {
    await insertVotes(voter.id, entries);
  } catch (e) {
    if (e && e.code === "23505") return res.status(409).json({ error: "already_voted" });
    throw e;
  }
  const voted = already.concat(entries.map(([c]) => c));
  res.json({ ok: true, votedCategories: voted, allVoted: voted.length === CATEGORIES.length });
});

// =========================== DEVICE MODE (no email) ===================================
const cookieHeaderFor = (id) => {
  const cross = corsOrigins.length > 0; // UI on another domain needs SameSite=None; Secure
  return [
    `${COOKIE}=${signVoterId(SECRET, id)}`,
    "Max-Age=31536000", "Path=/", "HttpOnly",
    cross ? "SameSite=None; Secure" : "SameSite=Lax",
  ].concat(!cross && env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production" ? ["Secure"] : []).join("; ");
};
const fpHashOf = (fp) => hmacHex(SECRET, `fp:${fp}`);
const ipHashOf = (ip) => hmacHex(SECRET, `ip:${ip}`);

async function cookieVoterId(req) {
  const id = readVoterId(SECRET, req.get("cookie"), COOKIE);
  return id && (await voterExists(id)) ? id : null;
}

// Union of what this cookie and this fingerprint have already voted on
async function alreadyVoted(req, fp) {
  const id = await cookieVoterId(req);
  const [a, b] = await Promise.all([id ? votedCategories(id) : [], fp ? votedByFingerprint(fpHashOf(fp)) : []]);
  return { voterId: id, voted: [...new Set([...a, ...b])] };
}

// POST /api/session  { fp }  -> what is open, and what this device has already voted on
const deviceSession = wrap(async (req, res) => {
  const fp = req.body && req.body.fp;
  if (fp !== undefined && !(typeof fp === "string" && FP_RE.test(fp))) return res.status(400).json({ error: "bad_request" });
  const { voted } = await alreadyVoted(req, fp);
  res.json({
    ok: true, step: "vote", state: votingState(win), needsEmail: false,
    votedCategories: voted, allVoted: voted.length === CATEGORIES.length, categories: CATEGORIES,
  });
});

// POST /api/vote  { fp, turnstile?, votes: { categoryId: nomineeId } }
const deviceVote = wrap(async (req, res) => {
  const body = req.body;
  if (!body || typeof body.votes !== "object" || body.votes === null || Array.isArray(body.votes)) {
    return res.status(400).json({ error: "bad_request" });
  }
  const state = votingState(win);
  if (state !== "open") return res.status(403).json({ error: state });
  if (typeof body.fp !== "string" || !FP_RE.test(body.fp)) return res.status(400).json({ error: "bad_fingerprint" });
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstile, req.ip))) {
    return res.status(403).json({ error: "captcha_failed" });
  }

  const entries = Object.entries(body.votes);
  if (entries.length === 0 || entries.length > CATEGORIES.length) return res.status(400).json({ error: "bad_request" });
  for (const [catId, nomId] of entries) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat || typeof nomId !== "string" || !cat.nominees.some((n) => n.id === nomId)) {
      return res.status(400).json({ error: "invalid_choice", category: catId });
    }
  }

  const { voterId, voted } = await alreadyVoted(req, body.fp);
  const dupes = entries.map(([c]) => c).filter((c) => voted.includes(c));
  if (dupes.length) return res.status(409).json({ error: "already_voted", categories: dupes });

  const ipHash = ipHashOf(req.ip);
  if (!voterId && IP_BALLOT_CAP > 0 && (await ballotsFromIp(ipHash)) >= IP_BALLOT_CAP) {
    return res.status(429).json({ error: "ip_limit" });
  }

  const voter = voterId ? { id: voterId } : await createDeviceVoter();
  try {
    await insertVotes(voter.id, entries, fpHashOf(body.fp), ipHash);
  } catch (e) {
    // (category, fingerprint) is unique, so a racing duplicate or a cleared-cookie retry lands here
    if (!voterId) await deleteVoterIfEmpty(voter.id).catch(() => {}); // don't leave an unused row behind
    if (e && e.code === "23505") return res.status(409).json({ error: "already_voted" });
    throw e;
  }
  res.set("Set-Cookie", cookieHeaderFor(voter.id));
  const all = voted.concat(entries.map(([c]) => c));
  res.json({ ok: true, votedCategories: all, allVoted: all.length === CATEGORIES.length });
});

app.post("/api/session", smallJson, deviceMode ? deviceSession : linkSession);
app.post("/api/vote", smallJson, deviceMode ? deviceVote : linkVote);

// ---- admin ---------------------------------------------------------------------------
const adminOnly = (req, res, next) => {
  if (!safeEqual(req.get("x-admin-key") || "", env.ADMIN_KEY)) return res.status(403).json({ error: "forbidden" });
  next();
};

// GET /api/results   header: x-admin-key
app.get("/api/results", adminOnly, wrap(async (req, res) => {
  const rows = await tally();
  const t = await turnout();
  res.json({
    turnout: deviceMode ? { voted: t.voted } : t,
    tally: CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      nominees: c.nominees
        .map((n) => ({
          id: n.id,
          name: n.name,
          votes: rows.find((r) => r.category_id === c.id && r.nominee_id === n.id)?.votes ?? 0,
        }))
        .sort((a, b) => b.votes - a.votes),
    })),
  });
}));

// POST /api/admin/voters  { voters: [{ token_hash, email_hash }, ...] }  (max 1000 per call)
app.post("/api/admin/voters", adminOnly, bigJson, wrap(async (req, res) => {
  const list = req.body && req.body.voters;
  if (!Array.isArray(list) || list.length === 0 || list.length > 1000) return res.status(400).json({ error: "bad_request" });
  const t = [];
  const e = [];
  for (const v of list) {
    if (!v || !HEX64_RE.test(v.token_hash) || !HEX64_RE.test(v.email_hash)) return res.status(400).json({ error: "bad_hash" });
    t.push(v.token_hash);
    e.push(v.email_hash);
  }
  res.json({ ok: true, received: list.length, inserted: await insertVoters(t, e) });
}));

app.get("/healthz", wrap(async (req, res) => {
  await ping();
  res.type("text").send("ok");
}));

app.use("/api", (req, res) => res.status(404).json({ error: "not_found" }));

// ---- optional: serve the UI from the same app (drop your build into /public) --------
const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, "..", "public");
if (fs.existsSync(pub)) app.use(express.static(pub, { maxAge: "1h" }));

// ---- errors ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "bad_request" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "too_large" });
  console.error("unhandled error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "server_error" });
});

// ---- boot -----------------------------------------------------------------------------
const port = Number(env.PORT || 3000);
await initSchema();
if (deviceMode && !env.TURNSTILE_SECRET) {
  console.warn("WARNING: device mode without TURNSTILE_SECRET. Anyone can script votes. Set it before launch.");
}
console.log(`mode: ${deviceMode ? "device (no email)" : "link"}`);
const server = app.listen(port, "0.0.0.0", () => console.log(`voting backend listening on :${port}`));
server.keepAliveTimeout = 65_000; // longer than typical proxy idle timeouts

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`${sig} received, shutting down`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
