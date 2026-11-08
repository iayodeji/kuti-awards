#!/usr/bin/env node
// Usage:
//   EMAIL_PEPPER=<same value as on the server> BASE_URL=https://vote.yourdomain.com \
//   node scripts/generate-tokens.mjs voters.csv
//
// Input : CSV with an "email" column (or just one email per line).
// Output: out/links.csv   email,link   -> import into Sendbyte as merge fields. KEEP PRIVATE.
//         out/voters.json hashes only  -> load with scripts/upload-voters.mjs
//         out/seed.sql    same hashes as SQL, if you prefer to run it in a DB client
import fs from "node:fs";
import crypto from "node:crypto";

const input = process.argv[2] || "voters.csv";
const BASE_URL = (process.env.BASE_URL || "").replace(/\/$/, "");
const PEPPER = process.env.EMAIL_PEPPER;
if (!BASE_URL || !PEPPER) {
  console.error("Set BASE_URL and EMAIL_PEPPER env vars.");
  process.exit(1);
}
if (fs.existsSync("out/links.csv") && !process.argv.includes("--force")) {
  console.error(
    "out/links.csv already exists. Re-running would issue NEW tokens and invalidate links already emailed.\n" +
      "Use a fresh voters file for late additions (move out/ aside first), or pass --force if you really mean it."
  );
  process.exit(1);
}

const lines = fs.readFileSync(input, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const header = lines[0].toLowerCase().split(",").map((h) => h.replace(/"/g, "").trim());
const hasHeader = header.includes("email");
const col = hasHeader ? header.indexOf("email") : 0;
const rows = hasHeader ? lines.slice(1) : lines;

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const seen = new Set();
const invalid = [];
let dupes = 0;
const out = [];

for (const row of rows) {
  const email = (row.split(",")[col] || "").replace(/"/g, "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) { invalid.push(email || row); continue; }
  if (seen.has(email)) { dupes++; continue; }
  seen.add(email);
  const token = crypto.randomBytes(32).toString("base64url"); // 43 chars
  out.push({
    email,
    token,
    token_hash: crypto.createHash("sha256").update(token).digest("hex"),
    email_hash: crypto.createHmac("sha256", PEPPER).update(email).digest("hex"),
  });
}

fs.mkdirSync("out", { recursive: true });
fs.writeFileSync("out/voters.json", JSON.stringify(out.map(({ token_hash, email_hash }) => ({ token_hash, email_hash }))));
fs.writeFileSync(
  "out/seed.sql",
  out.map((v) => `INSERT INTO voters (token_hash, email_hash) VALUES ('${v.token_hash}', '${v.email_hash}') ON CONFLICT DO NOTHING;`).join("\n") + "\n"
);
fs.writeFileSync("out/links.csv", "email,link\n" + out.map((v) => `${v.email},${BASE_URL}/?t=${v.token}`).join("\n") + "\n");

console.log(`Voters: ${out.length} | duplicates skipped: ${dupes} | invalid skipped: ${invalid.length}`);
if (invalid.length) console.log("Invalid:", invalid.slice(0, 20).join(", "));
console.log("Wrote out/links.csv, out/voters.json and out/seed.sql");
