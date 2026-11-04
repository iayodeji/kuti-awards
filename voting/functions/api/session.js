import { CATEGORIES } from "../../src/config.js";
import { json, readBody, findVoter, emailMatches, votingState, votedCategories, rateLimit, corsHeaders } from "../../src/lib.js";

// POST /api/session   body: { token, email? }
// Validates the emailed link and tells the UI what to show.
export async function onRequestPost({ request, env }) {
  const body = await readBody(request);
  if (!body) return json({ error: "bad_request" }, 400, request, env);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (!(await rateLimit(env, `ip:${ip}`, 60))) return json({ error: "rate_limited" }, 429, request, env);
  const voter = await findVoter(env, body.token);
  if (!voter) return json({ error: "invalid_link" }, 403, request, env);
  if (!(await rateLimit(env, `token:${voter.token_hash}`, 30))) {
    return json({ error: "rate_limited" }, 429, request, env);
  }

  const state = votingState(env);
  const needsEmail = env.REQUIRE_EMAIL_CONFIRM === "true";

  if (needsEmail && !body.email) {
    return json({ ok: true, step: "email", state, needsEmail: true }, 200, request, env);
  }
  if (!(await emailMatches(env, voter, body.email))) {
    return json({ error: "email_mismatch" }, 403, request, env);
  }

  const voted = await votedCategories(env, voter.id);
  return json({
    ok: true,
    step: "vote",
    state, // "not_open" | "open" | "closed"
    needsEmail,
    votedCategories: voted,
    allVoted: voted.length === CATEGORIES.length,
    categories: CATEGORIES,
  }, 200, request, env);
}

export const onRequest = ({ request, env }) => json({ error: "method_not_allowed" }, 405, request, env);
export const onRequestOptions = ({ request, env }) => new Response(null, { status: 204, headers: corsHeaders(request, env) });
