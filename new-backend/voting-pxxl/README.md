# Akọni voting app (Node + Postgres, for Pxxl)

This folder is now the production app. It serves the single-page editorial
frontend from `public/index.html` and the API from the same Express server.
The frontend uses device mode by default: it sends the browser fingerprint to
the API, receives server-recorded progress, and votes one category at a time.

Two modes, chosen with `VOTER_MODE`:
- `device` (default): no email, no login. One ballot per device.
- `link`: emailed single-use links (the section on issuing links below applies to this mode only).

## Device mode (no email)

How a ballot is limited, strongest first:
1. **Fingerprint, enforced by the database.** A unique index on (category, fingerprint hash) means a cleared cookie or incognito window on the same browser is rejected (409), even under a race.
2. **Signed HttpOnly cookie.** Remembers the device and lets the UI show "you have voted".
3. **Turnstile** (set `TURNSTILE_SECRET`): stops simple scripts. The server warns at boot if it is missing.
4. **Per-IP ballot cap** (`IP_BALLOT_CAP`, soft): bounds how much one network can add.

Honest limits:
- The fingerprint is computed in the browser, so someone who edits the request can send any value. Turnstile and the IP cap are what slow that down. Expect some duplicate voting from determined people.
- A different browser or device is a different voter, and so is changing the fingerprint (tested: accepted as a new device).
- Two real people on identical phones can produce the same fingerprint, and the second would be blocked. Keep the fingerprint coarse; do not add noisy signals.
- Fingerprints and IPs are stored only as keyed hashes. Tell voters you do this.

UI contract in device mode (no token, no email): send `fp` (from `public/fp.js`) to `POST /api/session` and `POST /api/vote`, and send `turnstile` with the vote. `/api/session` also reports categories already voted for from that fingerprint. Host the UI on the same domain as this app if you can (cookies are simplest); if not, set `CORS_ORIGIN` and call `fetch` with `credentials: "include"`.

Tests: `node scripts/loadtest-device.mjs http://localhost:3000 600`.

One app serves the API and, optionally, your UI (drop the built UI into `public/`).
One-vote-per-category is enforced by the database primary key, not by app code.

## What is verified and what is not

Verified locally (Node 18+, Postgres): 600 voters each firing the same ballot twice at once gave exactly 600 accepted and 600 rejected, 1800 vote rows, and a tally that sums correctly. Bad token, wrong email, repeat vote, garbage JSON and missing admin key all return the right errors.

**Not verified: Pxxl itself.** I could not read Pxxl's docs. Before relying on this, confirm in your Pxxl dashboard:
1. It offers **Postgres**. If it only lists MySQL/MongoDB, tell me and I will port `src/db.js`.
2. The database's **connection limit**. Keep `DB_POOL_MAX` below it.
3. Whether the DB needs SSL (then set `DATABASE_SSL=true`).
4. That the DB storage is persistent and has backups.

## Deploy

1. Edit `src/config.js` with the real categories and nominees (ids are permanent once voting starts).
2. Push this folder to a GitHub repo (`.env`, `out/`, `voters.csv` are already git-ignored).
3. In Pxxl: create a Node app from the repo, build command `npm install`, start command `npm start`. Create the database and copy its connection string.
4. Set environment variables (see `.env.example`): `DATABASE_URL`, `DATABASE_SSL`, `DB_POOL_MAX`, `EMAIL_PEPPER`, `ADMIN_KEY` (use `openssl rand -hex 32`), `VOTING_OPENS`, `VOTING_CLOSES`. Optional: `TURNSTILE_SECRET`, `CORS_ORIGIN`.
5. Open `https://your-app/healthz`. It should say `ok`. Tables are created automatically on first boot.

## Issue links

```
EMAIL_PEPPER=<same as server> BASE_URL=https://your-app-or-domain node scripts/generate-tokens.mjs voters.csv
ADMIN_KEY=<server ADMIN_KEY> node scripts/upload-voters.mjs https://your-app-or-domain
```

- `out/links.csv` (email,link) goes into Sendbyte as merge fields. Keep it private.
- The server stores only hashes. If you lose `links.csv` you cannot recover the links.
- Never change `EMAIL_PEPPER` after issuing links. Do not re-run the generator (it refuses unless `--force`).
- Send in batches, and set SPF, DKIM and DMARC on your sending domain first.

## UI contract

- Device mode: `POST /api/session` `{fp?}` returns `{step:"vote", state, votedCategories, allVoted, categories}`.
- Device mode: `POST /api/vote` `{fp, turnstile?, votes:{categoryId: nomineeId}}` returns 200, or 409 `already_voted`, 400 `invalid_choice`, 403 `closed`/`not_open`/`captcha_failed`, 429 `rate_limited`.
- The UI is a single page. It renders categories and nominees from the server response and never navigates to another document.
- Link mode remains available by setting `VOTER_MODE=link`; use the link-mode contract and token scripts only when emailed links are required.
- Results: `GET /api/results` with header `x-admin-key`.

## Load test (against a staging copy, not production)

```
node scripts/loadtest.mjs https://your-app
```

It needs `out/links.csv` for test voters. Run it from a single machine only if you raise `RATE_IP_PER_MIN`; the default is 6000 per IP per minute, set high because a hall or campus can share one IP.

## Notes

- Rate limiters are in memory, so run a single instance. Votes stay correct with several instances; only the limits become per-instance.
- Before the real run, clear test data: `TRUNCATE votes, voters RESTART IDENTITY CASCADE;`
