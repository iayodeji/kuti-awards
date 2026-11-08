#!/usr/bin/env node
// Uploads out/voters.json (hashes only) to the deployed backend. Safe to re-run: hashes already
// stored are skipped, so if it stops halfway just run it again.
//
// Usage: ADMIN_KEY=<server ADMIN_KEY> node scripts/upload-voters.mjs https://your-backend-url
import fs from "node:fs";

const base = (process.argv[2] || "").replace(/\/$/, "");
const key = process.env.ADMIN_KEY;
if (!base || !key) {
  console.error("Usage: ADMIN_KEY=... node scripts/upload-voters.mjs https://your-backend-url");
  process.exit(1);
}
const voters = JSON.parse(fs.readFileSync("out/voters.json", "utf8"));
let received = 0;
let inserted = 0;
for (let i = 0; i < voters.length; i += 500) {
  const batch = voters.slice(i, i + 500);
  const res = await fetch(`${base}/api/admin/voters`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-key": key },
    body: JSON.stringify({ voters: batch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Batch starting at ${i} failed: HTTP ${res.status}`, data);
    process.exit(1);
  }
  received += data.received;
  inserted += data.inserted;
  console.log(`  ${Math.min(i + 500, voters.length)}/${voters.length}`);
}
console.log(`Done. Sent ${received}, newly stored ${inserted}.`);
