# Cloudflare deployment guide

This guide deploys the API-backed voting app in `voting/` to Cloudflare Pages with
Cloudflare D1. The root `index.html` is only the visual reference prototype.

## What you need

- A Cloudflare account with Pages and D1 enabled
- Node.js and npm installed locally
- The domain you want to use for voting
- The final category and nominee names in `src/config.js` and `public/categories.json`

Do not put `EMAIL_PEPPER`, `ADMIN_KEY`, or any Sendbyte credentials in HTML,
JavaScript under `public/`, Git, or a chat message.

## 1. Install and log in

From the `voting/` directory:

```powershell
npm install
npx wrangler login
```

The login opens a browser window. Approve access for the Cloudflare account that
will own the Pages project and D1 database.

## 2. Create the D1 database

Create the database once:

```powershell
npx wrangler d1 create voting
```

Copy the returned `database_id` into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "voting"
database_id = "PASTE_THE_REAL_DATABASE_ID_HERE"
```

Do not deploy while the value is still `REPLACE_WITH_YOUR_D1_ID`.

Create the production tables:

```powershell
npx wrangler d1 execute voting --remote --file=schema.sql
```

If the database was already created with the earlier schema, do not run the
full schema again. Apply the one-time hardening migration instead:

```powershell
npx wrangler d1 execute voting --remote --file=migrations/001-hardening.sql
```

Verify the important tables:

```powershell
npx wrangler d1 execute voting --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

You should see `voters`, `votes`, `rate_limits`, and `vote_requests`.

## 3. Create the Pages project

Create the Pages project once:

```powershell
npx wrangler pages project create award-voting --production-branch main
```

The project name determines the temporary URL:

`https://award-voting.pages.dev`

## 4. Set production variables and secrets

Set the exact production origin. Include the scheme and no trailing slash:

```powershell
npx wrangler pages secret put EMAIL_PEPPER --project-name award-voting
npx wrangler pages secret put ADMIN_KEY --project-name award-voting
```

When prompted, paste long random values. Use the same `EMAIL_PEPPER` value when
generating voter links. Keep both values in a password manager.

If Turnstile will be enabled:

```powershell
npx wrangler pages secret put TURNSTILE_SECRET --project-name award-voting
```

Update the production values in `wrangler.toml` before deploying:

```toml
VOTING_OPENS = "2026-11-10T08:00:00+01:00"
VOTING_CLOSES = "2026-11-17T23:59:00+01:00"
REQUIRE_EMAIL_CONFIRM = "true"
PUBLIC_ORIGIN = "https://vote.example.com"
```

Replace `https://vote.example.com` with the final URL. If you use the
`pages.dev` URL, set `PUBLIC_ORIGIN` to that exact URL instead.

## 5. Deploy the site and Functions

From `voting/`:

```powershell
npx wrangler pages deploy public --project-name award-voting
```

Open the deployment URL and confirm that the access screen loads. The deployed
frontend must load `screen.webp` and `categories.json`.

For repeatable deployments, connect the GitHub repository in Cloudflare Pages:

1. Pages > Create a project > Connect to Git.
2. Select `iayodeji/kuti-awards`.
3. Set the root directory to `voting`.
4. Leave the build command empty.
5. Set the output directory to `public`.
6. Enable production deployments from `main`.

The `functions/` directory must remain inside the `voting/` project root so
Cloudflare can deploy the API routes.

## 6. Add the custom domain

In Cloudflare Pages:

1. Open `award-voting`.
2. Select Custom domains > Set up a custom domain.
3. Enter the final voting hostname, for example `vote.example.com`.
4. Complete the DNS instructions.
5. Change `PUBLIC_ORIGIN` to that exact HTTPS origin.
6. Deploy again.

Test the origin after the second deployment:

```powershell
Invoke-WebRequest https://vote.example.com/ -UseBasicParsing
```

Do not use the old `kioskk.me` hostname. Confirm the browser address bar shows
the intended Cloudflare Pages or custom-domain URL.

## 7. Generate voters and seed D1

Prepare a private CSV. It can be one email per line or have an `email` column.
Do not commit it:

```powershell
$env:EMAIL_PEPPER = "THE_SAME_SECRET_VALUE"
$env:BASE_URL = "https://vote.example.com"
node scripts/generate-tokens.mjs voters.csv
```

The script creates private output under `out/`:

- `out/links.csv` contains each email and its private voting link.
- `out/seed.sql` contains hashed voter records for D1.

Seed production:

```powershell
npx wrangler d1 execute voting --remote --file=out/seed.sql
```

Send each link only to its matching voter through Sendbyte or another trusted
mail provider. Treat `out/links.csv` and `out/seed.sql` as secrets. Delete or
secure them after sending and never commit them.

Do not rerun the generator for the same voters after links are sent. It creates
new tokens and invalidates the old links.

## 8. Test before launch

Use one dedicated test voter and a test email address. Confirm:

- Opening the link removes `?t=...` from the address bar.
- The email confirmation is required.
- A wrong email is rejected.
- The page shows server-recorded progress after a refresh.
- Selecting a nominee records exactly one category.
- Repeating the same request returns safely or reports that the category is
  already voted.
- An invalid or revoked token is rejected.
- The API rejects requests from an unapproved origin.
- The voting window returns `not_open` before opening and `closed` afterward.
- The mobile page loads the WebP poster quickly.

You can inspect production D1 without exposing voter tokens:

```powershell
npx wrangler d1 execute voting --remote --command "SELECT COUNT(*) AS voters FROM voters;"
npx wrangler d1 execute voting --remote --command "SELECT COUNT(*) AS votes FROM votes;"
```

## 9. Launch-day checklist

- [ ] Final categories and nominees approved
- [ ] `database_id` is real
- [ ] Production D1 schema or migration applied
- [ ] `EMAIL_PEPPER` and `ADMIN_KEY` stored as Pages secrets
- [ ] Turnstile configured, if required
- [ ] `PUBLIC_ORIGIN` matches the final HTTPS URL exactly
- [ ] Voting dates and timezone verified
- [ ] Custom domain and HTTPS verified
- [ ] Test voter completed and was removed or clearly marked
- [ ] Production voter links generated once
- [ ] Sendbyte campaign reviewed and sent
- [ ] `out/` files secured or deleted
- [ ] Cloudflare WAF/rate limiting enabled for `/api/session` and `/api/vote`

## 10. Revoke a voter

Revocation is performed in D1 by setting `revoked_at`. The token is checked on
every session and vote request, so revocation takes effect immediately:

```powershell
npx wrangler d1 execute voting --remote --command "UPDATE voters SET revoked_at = datetime('now') WHERE email_hash = 'EMAIL_HASH';"
```

Prefer identifying the row by a private administrative process rather than
putting a token or email in shell history. Never expose the raw token.

## 11. Emergency close

To stop voting, set `VOTING_CLOSES` in `wrangler.toml` to a timestamp in the
past and redeploy:

```powershell
npx wrangler pages deploy public --project-name award-voting
```

The API checks the window on every vote request. Existing votes remain in D1.

## 12. Updating nominees after launch

Do not change category IDs or nominee IDs after voting begins. Those IDs are
stored in D1 and changing them can make existing votes impossible to interpret.
If a display name must be corrected, update the name while preserving its
existing array position and ID, then deploy.
