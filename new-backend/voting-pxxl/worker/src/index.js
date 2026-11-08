import categories from "../../public/categories.json";
import nomineeImages from "../../public/nominee-images.json";

const COOKIE = "akoni_vid";
const FP_RE = /^[A-Za-z0-9_-]{16,128}$/;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function state(env) {
  const now = Date.now();
  const opens = env.VOTING_OPENS ? Date.parse(env.VOTING_OPENS) : null;
  const closes = env.VOTING_CLOSES ? Date.parse(env.VOTING_CLOSES) : null;
  if (opens && now < opens) return "not_open";
  if (closes && now > closes) return "closed";
  return "open";
}

function categoriesForClient() {
  return categories.map((category) => ({
    ...category,
    nominees: category.nominees.map((name, index) => ({
      id: `${category.id}-${index + 1}`,
      name,
      image: nomineeImages[name] || null,
    })),
  }));
}

async function digest(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signVoter(secret, id) {
  return `${id}.${(await digest(secret, `vid:${id}`)).slice(0, 32)}`;
}

async function cookieVoterId(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/.test(id) || value !== await signVoter(env.COOKIE_SECRET, id)) return null;
  const voter = await env.akoni_voting.prepare("SELECT id FROM voters WHERE id = ?").bind(id).first();
  return voter?.id || null;
}

function cookieHeader(value) {
  return `${COOKIE}=${value}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax; Secure`;
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function alreadyVoted(request, env, fp) {
  const voterId = await cookieVoterId(request, env);
  const fpHash = fp ? await digest(env.COOKIE_SECRET, `fp:${fp}`) : null;
  const queries = [];
  if (voterId) queries.push(env.akoni_voting.prepare("SELECT category_id FROM votes WHERE voter_id = ?").bind(voterId).all());
  if (fpHash) queries.push(env.akoni_voting.prepare("SELECT category_id FROM votes WHERE fp_hash = ?").bind(fpHash).all());
  const results = await Promise.all(queries);
  return {
    voterId,
    voted: [...new Set(results.flatMap((result) => result.results.map((row) => row.category_id)))],
    fpHash,
  };
}

function validBody(body) {
  return body && typeof body.votes === "object" && body.votes !== null && !Array.isArray(body.votes);
}

function validEntries(votes) {
  const entries = Object.entries(votes);
  if (entries.length === 0 || entries.length > categories.length) return null;
  const configured = categoriesForClient();
  for (const [categoryId, nomineeId] of entries) {
    const category = configured.find((item) => item.id === categoryId);
    if (!category || typeof nomineeId !== "string" || !category.nominees.some((nominee) => nominee.id === nomineeId)) return null;
  }
  return entries;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return (await response.json()).success === true;
}

async function handleSession(request, env) {
  const body = await request.json().catch(() => ({}));
  const fp = body.fp;
  if (fp !== undefined && (typeof fp !== "string" || !FP_RE.test(fp))) return json({ error: "bad_request" }, 400);
  const { voted } = await alreadyVoted(request, env, fp);
  const allVoted = voted.length === categories.length;
  return json({
    ok: true,
    step: allVoted ? "complete" : "vote",
    state: state(env),
    needsEmail: false,
    votedCategories: voted,
    allVoted,
    categories: allVoted ? [] : categoriesForClient(),
  });
}

async function handleVote(request, env) {
  const body = await request.json().catch(() => null);
  if (!validBody(body)) return json({ error: "bad_request" }, 400);
  if (state(env) !== "open") return json({ error: state(env) }, 403);
  if (typeof body.fp !== "string" || !FP_RE.test(body.fp)) return json({ error: "bad_fingerprint" }, 400);
  if (!(await verifyTurnstile(env, body.turnstile, clientIp(request)))) return json({ error: "captcha_failed" }, 403);
  const entries = validEntries(body.votes);
  if (!entries) return json({ error: "invalid_choice" }, 400);
  const current = await alreadyVoted(request, env, body.fp);
  if (current.voted.length === categories.length) return json({ error: "ballot_complete" }, 409);
  const duplicate = entries.map(([categoryId]) => categoryId).find((categoryId) => current.voted.includes(categoryId));
  if (duplicate) return json({ error: "already_voted", categories: [duplicate] }, 409);

  const voterId = current.voterId || crypto.randomUUID();
  const ipHash = await digest(env.COOKIE_SECRET, `ip:${clientIp(request)}`);
  if (!current.voterId && Number(env.IP_BALLOT_CAP || 0) > 0) {
    const ipTurnout = await env.akoni_voting.prepare("SELECT COUNT(DISTINCT voter_id) AS ballots FROM votes WHERE ip_hash = ?").bind(ipHash).first();
    if (Number(ipTurnout?.ballots || 0) >= Number(env.IP_BALLOT_CAP)) return json({ error: "ip_limit" }, 429);
  }
  const statements = [
    env.akoni_voting.prepare("INSERT OR IGNORE INTO voters (id) VALUES (?)").bind(voterId),
    ...entries.map(([categoryId, nomineeId]) => env.akoni_voting.prepare(
      "INSERT INTO votes (voter_id, category_id, nominee_id, fp_hash, ip_hash) VALUES (?, ?, ?, ?, ?)"
    ).bind(voterId, categoryId, nomineeId, current.fpHash, ipHash)),
    env.akoni_voting.prepare("UPDATE voters SET last_vote_at = datetime('now') WHERE id = ?").bind(voterId),
  ];
  try {
    await env.akoni_voting.batch(statements);
  } catch (error) {
    if (error?.message?.includes("UNIQUE")) return json({ error: "already_voted" }, 409);
    throw error;
  }
  const voted = [...current.voted, ...entries.map(([categoryId]) => categoryId)];
  const allVoted = voted.length === categories.length;
  return json({ ok: true, step: allVoted ? "complete" : "vote", votedCategories: voted, allVoted }, 200, {
    "set-cookie": cookieHeader(await signVoter(env.COOKIE_SECRET, voterId)),
  });
}

async function handleResults(request, env) {
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY) return json({ error: "forbidden" }, 403);
  const tally = await env.akoni_voting.prepare("SELECT category_id, nominee_id, COUNT(*) AS votes FROM votes GROUP BY category_id, nominee_id").all();
  const turnout = await env.akoni_voting.prepare("SELECT COUNT(DISTINCT voter_id) AS voted FROM votes").first();
  const configured = categoriesForClient();
  return json({
    turnout: { voted: Number(turnout?.voted || 0) },
    tally: configured.map((category) => ({
      ...category,
      nominees: category.nominees.map((nominee) => ({
        ...nominee,
        votes: Number(tally.results.find((row) => row.category_id === category.id && row.nominee_id === nominee.id)?.votes || 0),
      })).sort((a, b) => b.votes - a.votes),
    })),
  });
}

async function handleMedia(request, env) {
  if (!env.IMAGES) return new Response("R2 is not configured", { status: 503 });
  const key = decodeURIComponent(new URL(request.url).pathname.slice("/media/".length));
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const object = await env.IMAGES.get(`${env.R2_PREFIX || ""}${key}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "cache-control": "public, max-age=31536000, immutable", "content-type": object.httpMetadata?.contentType || "application/octet-stream" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") return new Response("ok", { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
    if (url.pathname.startsWith("/media/")) return handleMedia(request, env);
    if (url.pathname === "/api/session" && request.method === "POST") return handleSession(request, env);
    if (url.pathname === "/api/vote" && request.method === "POST") return handleVote(request, env);
    if (url.pathname === "/api/results" && request.method === "GET") return handleResults(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);
    return env.ASSETS.fetch(request);
  },
};
