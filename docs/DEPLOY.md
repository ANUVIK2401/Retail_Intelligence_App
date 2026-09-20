# Deploying to Vercel

Written for: whoever owns the Vercel and Google Cloud accounts.

Roughly 20 minutes. The app **fails closed**, so a deployment with no
environment variables returns `503` on every route with the message
"Google executive sign-in is not configured." That is correct behaviour, not a
broken build. It becomes a working app once step 4 is done.

---

## 1. Import the repository

In Vercel: **Add New → Project → Import Git Repository**, choose
`ANUVIK2401/retail_intelligence_center`. The existing meeting project serves
`https://retailintelligencecenter.vercel.app` from this repository's `main`
branch (local remote `center`). Pushing only to the separate
`Retail_Intelligence_App` repository will not update the meeting site.

Leave the build settings alone. `vercel.json` already sets the framework,
`npm ci`, and `npm run build`. Do **not** deploy yet — add the environment
variables first, or the first deployment will 503 and you will wonder why.

Once imported, every push to `main` deploys automatically, and every pull
request gets its own preview URL.

## 2. Add Postgres

**Storage → Create Database → Neon** (or any Postgres). Attach it to the
project. Vercel injects `DATABASE_URL` for you.

Use the **pooled** connection string. Serverless functions open a connection
per instance, and an unpooled URL will exhaust the connection limit as soon as
more than a couple of people click around.

Without this, every request creates fresh state: you would assess an email,
click Approve, and get "Unknown approval request" because the two requests hit
different instances. See ADR-0007.

## 3. Create the Google OAuth client

Google Cloud Console → **APIs & Services → Credentials → Create OAuth client
ID → Web application**.

Authorized redirect URI, exactly:

```
https://YOUR-PROJECT.vercel.app/api/auth/callback/google
```

The path must match character for character. A trailing slash breaks it.

You will need to add a second redirect URI later if you attach a custom domain,
and Vercel preview deployments have their own URLs that will *not* work with
this client unless you add them too. For the demo, use the production URL.

Only the default sign-in scopes are requested. This does **not** grant access
to Gmail or Google Calendar; the app uses synthetic fixtures. See ADR-0008.

## 4. Set the environment variables

Project → **Settings → Environment Variables**. All of these are
**Production** scope, and none are `NEXT_PUBLIC_`.

| Variable | Value | Why |
|---|---|---|
| `AUTH_GOOGLE_ID` | from step 3 | OAuth client |
| `AUTH_GOOGLE_SECRET` | from step 3 | OAuth client |
| `AUTH_SECRET` | `openssl rand -base64 32` | signs the session cookie |
| `EXECUTIVE_MEMBER_MAP` | `anuvikt@gmail.com:p_ceo` | who may sign in, and as whom |
| `ADMIN_EMAILS` | `anuvikt@gmail.com` | who may onboard others |
| `AI_PROVIDER` | `mock` | keeps the demo deterministic |
| `DATABASE_URL` | injected in step 2 | durable sessions |

**`EXECUTIVE_MEMBER_MAP` must contain your own email before the first deploy.**
It is the bootstrap: without it nobody can sign in, including you, and there is
no way in through the UI.

For the full meeting and approval walkthrough, map separate verified accounts
to `p_ea`, `p_cfo`, `p_cmo`, and `p_gc` before presenting, or onboard them in
Administration. The assistant account is required for assistant-routed
scheduling. Each person signs in with their own account; there is no
production role switcher.

Leave `AI_PROVIDER=mock` for the demo. The mock provider is deterministic, so
the risk-engine beat produces identical output every run — better on camera
than a live model's latency and variation. Switch it later by setting
`AI_PROVIDER=anthropic` plus `ANTHROPIC_API_KEY` and a model id.

## 5. Deploy and verify

Deploy, then run these against the real URL, not localhost:

```bash
DOMAIN=https://YOUR-PROJECT.vercel.app

# 1. Configuration is complete and Postgres is reachable.
curl -s $DOMAIN/api/health
# want: {"status":"ok","demo":true,"durable":true}
#   durable:false  -> DATABASE_URL is missing or unreachable (step 2)
#   status:unavailable -> an env var is missing (step 4)

# 2. The app refuses anonymous access.
curl -s -o /dev/null -w '%{http_code}\n' $DOMAIN/api/dashboard
# want: 401

# 3. Security headers survived the platform.
curl -sI $DOMAIN | grep -i 'content-security-policy\|x-frame-options'
```

Then sign in through Google in a browser and walk
[DEMO-SCRIPT.md](DEMO-SCRIPT.md).

**The sign-in flow is the one thing no local test covers.** If Google returns
`redirect_uri_mismatch`, the URI in step 3 does not match the deployed domain.

## 6. Onboard everyone else

Sign in, open **Administration** in the sidebar, add each person's Google email
and the role they act as. They can sign in immediately; the persona is
re-derived on every request, so removing someone takes effect at once rather
than at token expiry.

Administration only controls *who may sign in and as whom*. It does not widen
what anyone can read — see ADR-0009.

---

## If something is wrong

| Symptom | Cause |
|---|---|
| Every route 503 | An env var from step 4 is missing. `curl /api/health`. |
| `redirect_uri_mismatch` | Step 3 URI does not match the deployed domain exactly. |
| Signed in, but "Sign in with an authorized Google account" | Your email is not in `EXECUTIVE_MEMBER_MAP`. |
| Approvals vanish between clicks | `durable:false`. Postgres is not attached (step 2). |
| Every POST returns 403 | Origin check. Report it — `isSafeMutation` in `src/core/deployment/access.ts` is the place to look. |
| Administration missing from the sidebar | Your email is not in `ADMIN_EMAILS`. |

## What is deliberately not deployed

No real mailbox, calendar, or social account is connected. No autonomous
sending, no publishing, no open-web ingestion, no model trained on company
data. All data is synthetic. `docs/00-BUILD-PLAN.md` lists what would unblock
each one.
