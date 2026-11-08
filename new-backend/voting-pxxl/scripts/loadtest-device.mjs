#!/usr/bin/env node
// Device-mode test. Simulates N devices (own cookie jar + own fingerprint) voting at once, each
// double-firing, then probes the "clear cookies and retry" cases.
// Usage: node scripts/loadtest-device.mjs http://localhost:8790 [N]
import crypto from "node:crypto";

const base = (process.argv[2] || "http://localhost:8790").replace(/\/$/, "");
const N = Number(process.argv[3] || 600);

const post = async (path, body, cookie) => {
  const r = await fetch(base + path, {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: JSON.stringify(body),
  });
  const setCookie = r.headers.get("set-cookie");
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: setCookie ? setCookie.split(";")[0] : null };
};

const newFp = () => crypto.randomBytes(24).toString("base64url");
const first = await post("/api/session", { fp: newFp() });
const cats = first.body.categories;
if (!cats) { console.error("Could not load categories:", first); process.exit(1); }
const pick = () => Object.fromEntries(cats.map((c) => [c.id, c.nominees[Math.floor(Math.random() * 3)].id]));

// 1) N devices, each fires its ballot twice at the same instant (no cookie yet on either request)
const devices = Array.from({ length: N }, () => ({ fp: newFp(), votes: pick() }));
const t0 = Date.now();
const results = await Promise.all(devices.flatMap((d) => [
  post("/api/vote", { fp: d.fp, votes: d.votes }).then((r) => ((d.cookie ||= r.cookie), r)),
  post("/api/vote", { fp: d.fp, votes: d.votes }).then((r) => ((d.cookie ||= r.cookie), r)),
]));
const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
console.log(`1) ${N} devices, ${results.length} simultaneous requests in ${Date.now() - t0}ms`, counts);
const okRace = counts[200] === N && counts[409] === N && !Object.keys(counts).some((s) => s >= 500);

// 2) same device, same cookie + fingerprint, tries again
const d = devices.find((x) => x.cookie);
const again = await post("/api/vote", { fp: d.fp, votes: pick() }, d.cookie);
console.log("2) same cookie + same fingerprint:", again.status, again.body.error);

// 3) cookies cleared, same fingerprint
const cleared = await post("/api/vote", { fp: d.fp, votes: pick() });
console.log("3) cookie cleared, same fingerprint:", cleared.status, cleared.body.error);

// 4) cookies cleared, fingerprint changed (what an incognito window with a spoofed/changed fp does)
const changed = await post("/api/vote", { fp: newFp(), votes: pick() });
console.log("4) cookie cleared AND fingerprint changed:", changed.status, "(known limit: accepted as a new device)");

// 5) forged cookie
const forged = await post("/api/vote", { fp: d.fp, votes: pick() }, "akoni_vid=1.deadbeefdeadbeefdeadbeefdeadbeef");
console.log("5) forged cookie, same fingerprint:", forged.status, forged.body.error);

// 6) session reports prior votes even without the cookie
const sess = await post("/api/session", { fp: d.fp });
console.log("6) session after clearing cookie says allVoted =", sess.body.allVoted);

// 7) bad input
const noFp = await post("/api/vote", { votes: pick() });
const badNom = await post("/api/vote", { fp: newFp(), votes: { [cats[0].id]: "nope" } });
console.log("7) missing fp:", noFp.status, noFp.body.error, "| bad nominee:", badNom.status, badNom.body.error);

const pass = okRace && again.status === 409 && cleared.status === 409 && forged.status === 409 &&
  sess.body.allVoted === true && noFp.status === 400 && badNom.status === 400;
console.log(pass ? "PASS" : "FAIL: investigate");
process.exit(pass ? 0 : 1);
