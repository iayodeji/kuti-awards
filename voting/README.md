# Award voting backend (Cloudflare Pages + D1)

Email-link voting, no signup. One unique single-use link per voter, one vote per category,
enforced by the database. Your UI just calls two endpoints.

## 1. Edit
- `src/config.js` – categories and nominees (IDs must not change once voting starts)
- `wrangler.toml` – VOTING_OPENS / VOTING_CLOSES, REQUIRE_EMAIL_CONFIRM

## 2. Deploy
```bash
npm install
npx wrangler login
npx wrangler d1 create voting            # copy database_id into wrangler.toml
npx wrangler d1 execute voting --remote --file=schema.sql
npx wrangler pages project create award-voting --production-branch main
npx wrangler pages secret put EMAIL_PEPPER --project-name award-voting   # long random string
npx wrangler pages secret put ADMIN_KEY    --project-name award-voting   # long random string
npx wrangler pages secret put TURNSTILE_SECRET --project-name award-voting  # optional
npx wrangler pages deploy public --project-name award-voting
```
Add your custom domain in Cloudflare Pages settings.

## 3. Issue voter links
```bash
# voters.csv: one email per line, or a CSV with an "email" column
EMAIL_PEPPER=<same value as the secret> BASE_URL=https://vote.yourdomain.com \
  node scripts/generate-tokens.mjs voters.csv
npx wrangler d1 execute voting --remote --file=out/seed.sql
```
`out/links.csv` (email,link) goes into Sendbyte as merge fields. Keep it private and delete it after sending.
Do not re-run the script for the same list (it would invalidate links already sent); use a separate file for late additions.

## 4. Cloudflare dashboard (do this)
- Security > WAF > Rate limiting rule on `/api/vote` and `/api/session` (e.g. 20 requests / 1 min per IP)
- Turnstile: create a widget, put the site key in your page and the secret in `TURNSTILE_SECRET`
- DNS: SPF, DKIM, DMARC for the sending domain (Sendbyte shows the records)

## API (all POST, JSON)
`POST /api/session` `{ token, email? }`
- 403 `invalid_link` | 403 `email_mismatch`
- `{ step: "email" }` -> ask the voter for their email, call again with it
- `{ step: "vote", state, votedCategories, allVoted, categories }`; state is `not_open | open | closed`

`POST /api/vote` `{ token, email?, turnstile?, votes: { "<categoryId>": "<nomineeId>" } }`
- 200 `{ ok, votedCategories, allVoted }`
- 409 `already_voted` | 400 `invalid_choice` | 403 `captcha_failed | closed | not_open | invalid_link | email_mismatch`
- Voters can submit all categories at once or come back for the rest. Each category is final once voted.

`GET /api/results` header `x-admin-key: <ADMIN_KEY>` -> turnout + tally. Never call from the public page.

`public/index.html` is a bare working reference of the full flow; copy its fetch logic into your design.
Keep the token out of the address bar (the reference page strips it) and send `Referrer-Policy: no-referrer`.

## Tested
`node scripts/loadtest.mjs http://localhost:8788` fires every voter twice simultaneously
(600 voters, 1200 requests): exactly one accepted ballot per voter, duplicates rejected, no 5xx.
Local dev: `npm run db:local`, seed `out/seed.sql` with `--local`, then `npm run dev` (secrets in `.dev.vars`).
