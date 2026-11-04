import { CATEGORIES } from "./config.js";

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(str) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(str)));
}

export async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function json(data, status = 200, request, env) {
  const headers = {
    "content-type": "application/json",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  };
  Object.assign(headers, corsHeaders(request, env));
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
}

export function corsHeaders(request, env) {
  const origin = request && env && env.PUBLIC_ORIGIN;
  if (!origin || request.headers.get("Origin") !== origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, idempotency-key",
    vary: "Origin",
  };
}

export async function readBody(request) {
  try {
    const text = await request.text();
    if (text.length > 4096) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 32 random bytes in base64url = 43 chars
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function votingState(env, now = Date.now()) {
  const opens = env.VOTING_OPENS ? Date.parse(env.VOTING_OPENS) : null;
  const closes = env.VOTING_CLOSES ? Date.parse(env.VOTING_CLOSES) : null;
  if (opens && now < opens) return "not_open";
  if (closes && now > closes) return "closed";
  return "open";
}

// Returns the voter row, or null if the token is malformed/unknown.
export async function findVoter(env, token) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  return await env.DB.prepare("SELECT id, token_hash, email_hash FROM voters WHERE token_hash = ? AND revoked_at IS NULL").bind(tokenHash).first();
}

export async function rateLimit(env, key, limit, windowMs = 60000) {
  const keyHash = await sha256Hex(key);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO rate_limits (key_hash, window_start, request_count) VALUES (?, ?, 1)
    ON CONFLICT(key_hash) DO UPDATE SET
      request_count = CASE WHEN ? - window_start >= ? THEN 1 ELSE request_count + 1 END,
      window_start = CASE WHEN ? - window_start >= ? THEN ? ELSE window_start END
  `).bind(keyHash, now, now, windowMs, now, windowMs, now).run();
  const row = await env.DB.prepare("SELECT request_count FROM rate_limits WHERE key_hash = ?").bind(keyHash).first();
  return row.request_count <= limit;
}

export function requestKey(request, body) {
  const supplied = request.headers.get("Idempotency-Key") || body.idempotencyKey;
  return typeof supplied === "string" && /^[A-Za-z0-9._-]{16,100}$/.test(supplied) ? supplied : null;
}

export async function emailMatches(env, voter, email) {
  if (env.REQUIRE_EMAIL_CONFIRM !== "true") return true;
  if (typeof email !== "string" || email.length > 254) return false;
  const h = await hmacHex(env.EMAIL_PEPPER, email.trim().toLowerCase());
  return safeEqual(h, voter.email_hash);
}

export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured -> skipped
  if (typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

export async function votedCategories(env, voterId) {
  const { results } = await env.DB.prepare("SELECT category_id FROM votes WHERE voter_id = ?").bind(voterId).all();
  return results.map((r) => r.category_id);
}

export function publicCategories() {
  return CATEGORIES;
}
