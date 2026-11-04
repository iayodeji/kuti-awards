import { CATEGORIES } from "../../src/config.js";
import { json, safeEqual } from "../../src/lib.js";

// GET /api/results   header: x-admin-key: <ADMIN_KEY>
// Never expose publicly. Keep ADMIN_KEY as a secret.
export async function onRequestGet({ request, env }) {
  const key = request.headers.get("x-admin-key") || "";
  if (!env.ADMIN_KEY || !safeEqual(key, env.ADMIN_KEY)) return json({ error: "forbidden" }, 403);

  const { results } = await env.DB
    .prepare("SELECT category_id, nominee_id, COUNT(*) AS votes FROM votes GROUP BY category_id, nominee_id")
    .all();
  const turnout = await env.DB
    .prepare("SELECT (SELECT COUNT(*) FROM voters) AS eligible, (SELECT COUNT(DISTINCT voter_id) FROM votes) AS voted")
    .first();

  const tally = CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    nominees: c.nominees
      .map((n) => ({
        id: n.id,
        name: n.name,
        votes: results.find((r) => r.category_id === c.id && r.nominee_id === n.id)?.votes ?? 0,
      }))
      .sort((a, b) => b.votes - a.votes),
  }));

  return json({ turnout, tally });
}

export const onRequest = () => json({ error: "method_not_allowed" }, 405);
