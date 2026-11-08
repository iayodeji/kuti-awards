#!/usr/bin/env node
// Fires every voter in out/links.csv at the API simultaneously, each submitting
// their ballot TWICE at the same instant (double-click / replay simulation).
// Expect: exactly 1 success per voter, the duplicate gets 409, no 5xx.
//
// Usage: node scripts/loadtest.mjs http://localhost:8788 voter-email-domain-not-needed
import fs from "node:fs";

const base = (process.argv[2] || "http://localhost:8788").replace(/\/$/, "");
const lines = fs.readFileSync("out/links.csv", "utf8").trim().split("\n").slice(1);
const voters = lines.map((l) => {
  const [email, link] = l.split(",");
  return { email, token: new URL(link).searchParams.get("t") };
});

const session = await (await fetch(`${base}/api/session`, {
  method: "POST",
  body: JSON.stringify({ token: voters[0].token, email: voters[0].email }),
})).json();
const cats = session.categories;
if (!cats) { console.error("Could not load categories:", session); process.exit(1); }

const pick = () =>
  Object.fromEntries(cats.map((c) => [c.id, c.nominees[Math.floor(Math.random() * c.nominees.length)].id]));

const fire = (v, votes) =>
  fetch(`${base}/api/vote`, {
    method: "POST",
    body: JSON.stringify({ token: v.token, email: v.email, votes }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

const t0 = Date.now();
const results = await Promise.all(voters.flatMap((v) => { const b = pick(); return [fire(v, b), fire(v, b)]; }));
const ms = Date.now() - t0;

const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
console.log(`${voters.length} voters, ${results.length} simultaneous requests in ${ms}ms`);
console.log("Status counts:", counts);
const ok = counts[200] === voters.length && (counts[409] || 0) === voters.length && !Object.keys(counts).some((s) => s >= 500);
console.log(ok ? "PASS: exactly one accepted ballot per voter, duplicates rejected, no server errors" : "FAIL: investigate");
process.exit(ok ? 0 : 1);
