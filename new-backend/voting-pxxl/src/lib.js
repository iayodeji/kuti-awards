import crypto from "node:crypto";

export const sha256Hex = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const hmacHex = (key, msg) => crypto.createHmac("sha256", key).update(msg).digest("hex");

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// 32 random bytes in base64url = 43 chars
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const HEX64_RE = /^[0-9a-f]{64}$/;

export function parseWindow(env = process.env) {
  const parse = (name) => {
    const v = env[name];
    if (!v) return null;
    const t = Date.parse(v);
    if (Number.isNaN(t)) throw new Error(`${name} is not a valid ISO 8601 date: "${v}"`);
    return t;
  };
  return { opens: parse("VOTING_OPENS"), closes: parse("VOTING_CLOSES") };
}

export function votingState(win, now = Date.now()) {
  if (win.opens && now < win.opens) return "not_open";
  if (win.closes && now > win.closes) return "closed";
  return "open";
}

// Fixed-window counter. Returns true if the call is allowed.
export function makeLimiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (key) => {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) {
      e = { count: 0, reset: now + windowMs };
      hits.set(key, e);
    }
    e.count++;
    return e.count <= max;
  };
}

// ---- device mode: signed voter cookie "<voterId>.<sig>" ------------------------------
export const FP_RE = /^[A-Za-z0-9_-]{16,128}$/;

export const signVoterId = (secret, id) => `${id}.${hmacHex(secret, `vid:${id}`).slice(0, 32)}`;

export function readVoterId(secret, cookieHeader, name) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    const val = part.slice(i + 1).trim();
    const dot = val.indexOf(".");
    if (dot < 1) return null;
    const id = val.slice(0, dot);
    if (!/^[0-9]{1,18}$/.test(id)) return null;
    return safeEqual(val, signVoterId(secret, id)) ? id : null;
  }
  return null;
}
