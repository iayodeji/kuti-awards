import { CATEGORIES } from "../../src/config.js";
import { json, readBody, findVoter, emailMatches, votingState, votedCategories } from "../../src/lib.js";

// POST /api/session   body: { token, email? }
// Validates the emailed link and tells the UI what to show.
export async function onRequestPost({ request, env }) {
  const body = await readBody(request);
  if (!body) return json({ error: "bad_request" }, 400);

  const voter = await findVoter(env, body.token);
  if (!voter) return json({ error: "invalid_link" }, 403);

  const state = votingState(env);
  const needsEmail = env.REQUIRE_EMAIL_CONFIRM === "true";

  if (needsEmail && !body.email) {
    return json({ ok: true, step: "email", state, needsEmail: true });
  }
  if (!(await emailMatches(env, voter, body.email))) {
    return json({ error: "email_mismatch" }, 403);
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
  });
}

export const onRequest = () => json({ error: "method_not_allowed" }, 405);
