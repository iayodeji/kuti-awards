import { CATEGORIES } from "../../src/config.js";
import {
  json, readBody, findVoter, emailMatches, votingState, verifyTurnstile, votedCategories, rateLimit, requestKey, corsHeaders,
} from "../../src/lib.js";

// POST /api/vote   body: { token, email?, turnstile?, votes: { "<categoryId>": "<nomineeId>", ... } }
// You may vote in several categories at once, or come back later for the rest.
// Each category can only ever be voted once per voter (database primary key).
export async function onRequestPost({ request, env }) {
  const body = await readBody(request);
  if (!body || typeof body.votes !== "object" || body.votes === null || Array.isArray(body.votes)) {
    return json({ error: "bad_request" }, 400, request, env);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await rateLimit(env, `ip:${ip}`, 60))) return json({ error: "rate_limited" }, 429, request, env);
  const voter = await findVoter(env, body.token);
  if (!voter) return json({ error: "invalid_link" }, 403, request, env);
  if (!(await rateLimit(env, `token:${voter.token_hash}`, 30))) {
    return json({ error: "rate_limited" }, 429, request, env);
  }
  if (!(await emailMatches(env, voter, body.email))) return json({ error: "email_mismatch" }, 403, request, env);
  const state = votingState(env);
  if (state !== "open") return json({ error: state }, 403, request, env);

  if (!(await verifyTurnstile(env, body.turnstile, ip))) return json({ error: "captcha_failed" }, 403, request, env);

  // Validate every choice against the server-side config
  const entries = Object.entries(body.votes);
  if (entries.length === 0 || entries.length > CATEGORIES.length) return json({ error: "bad_request" }, 400, request, env);
  for (const [catId, nomId] of entries) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat || typeof nomId !== "string" || !cat.nominees.some((n) => n.id === nomId)) {
      return json({ error: "invalid_choice", category: catId }, 400, request, env);
    }
  }

  // Friendly pre-check (the primary key below is the real guard against races)
  const idempotencyKey = requestKey(request, body);
  if (!idempotencyKey) return json({ error: "idempotency_key_required" }, 400, request, env);
  const previous = await env.DB.prepare("SELECT response_json FROM vote_requests WHERE token_hash = ? AND request_key = ?")
    .bind(voter.token_hash, idempotencyKey).first();
  if (previous) return new Response(previous.response_json, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store", ...corsHeaders(request, env) } });

  const already = await votedCategories(env, voter.id);
  const dupes = entries.map(([c]) => c).filter((c) => already.includes(c));
  if (dupes.length) return json({ error: "already_voted", categories: dupes }, 409, request, env);

  const now = new Date().toISOString();
  const stmts = entries.map(([catId, nomId]) =>
    env.DB.prepare("INSERT INTO votes (voter_id, token_hash, category_id, nominee_id, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(voter.id, voter.token_hash, catId, nomId, now)
  );
  stmts.push(env.DB.prepare("UPDATE voters SET last_vote_at = ? WHERE id = ?").bind(now, voter.id));

  try {
    await env.DB.batch(stmts); // atomic: all inserts land or none do
  } catch (e) {
    if (String(e && e.message).includes("UNIQUE") || String(e && e.message).includes("constraint")) {
      return json({ error: "already_voted" }, 409, request, env);
    }
    console.error("vote batch failed", e);
    return json({ error: "server_error" }, 500, request, env);
  }

  const voted = await votedCategories(env, voter.id);
  const response = { ok: true, votedCategories: voted, allVoted: voted.length === CATEGORIES.length };
  await env.DB.prepare("INSERT INTO vote_requests (token_hash, request_key, response_json, created_at) VALUES (?, ?, ?, ?)")
    .bind(voter.token_hash, idempotencyKey, JSON.stringify(response), now).run();
  return json(response, 200, request, env);
}

export const onRequest = ({ request, env }) => json({ error: "method_not_allowed" }, 405, request, env);
export const onRequestOptions = ({ request, env }) => new Response(null, { status: 204, headers: corsHeaders(request, env) });
