import { CATEGORIES } from "../../src/config.js";
import {
  json, readBody, findVoter, emailMatches, votingState, verifyTurnstile, votedCategories,
} from "../../src/lib.js";

// POST /api/vote   body: { token, email?, turnstile?, votes: { "<categoryId>": "<nomineeId>", ... } }
// You may vote in several categories at once, or come back later for the rest.
// Each category can only ever be voted once per voter (database primary key).
export async function onRequestPost({ request, env }) {
  const body = await readBody(request);
  if (!body || typeof body.votes !== "object" || body.votes === null || Array.isArray(body.votes)) {
    return json({ error: "bad_request" }, 400);
  }

  const state = votingState(env);
  if (state !== "open") return json({ error: state }, 403);

  const voter = await findVoter(env, body.token);
  if (!voter) return json({ error: "invalid_link" }, 403);
  if (!(await emailMatches(env, voter, body.email))) return json({ error: "email_mismatch" }, 403);

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await verifyTurnstile(env, body.turnstile, ip))) return json({ error: "captcha_failed" }, 403);

  // Validate every choice against the server-side config
  const entries = Object.entries(body.votes);
  if (entries.length === 0 || entries.length > CATEGORIES.length) return json({ error: "bad_request" }, 400);
  for (const [catId, nomId] of entries) {
    const cat = CATEGORIES.find((c) => c.id === catId);
    if (!cat || typeof nomId !== "string" || !cat.nominees.some((n) => n.id === nomId)) {
      return json({ error: "invalid_choice", category: catId }, 400);
    }
  }

  // Friendly pre-check (the primary key below is the real guard against races)
  const already = await votedCategories(env, voter.id);
  const dupes = entries.map(([c]) => c).filter((c) => already.includes(c));
  if (dupes.length) return json({ error: "already_voted", categories: dupes }, 409);

  const now = new Date().toISOString();
  const stmts = entries.map(([catId, nomId]) =>
    env.DB.prepare("INSERT INTO votes (voter_id, category_id, nominee_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(voter.id, catId, nomId, now)
  );
  stmts.push(env.DB.prepare("UPDATE voters SET last_vote_at = ? WHERE id = ?").bind(now, voter.id));

  try {
    await env.DB.batch(stmts); // atomic: all inserts land or none do
  } catch (e) {
    if (String(e && e.message).includes("UNIQUE") || String(e && e.message).includes("constraint")) {
      return json({ error: "already_voted" }, 409);
    }
    console.error("vote batch failed", e);
    return json({ error: "server_error" }, 500);
  }

  const voted = await votedCategories(env, voter.id);
  return json({ ok: true, votedCategories: voted, allVoted: voted.length === CATEGORIES.length });
}

export const onRequest = () => json({ error: "method_not_allowed" }, 405);
