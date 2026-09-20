# Executive Command Center

An executive decision workspace for a PacSun leadership walkthrough. The
prototype brings communication, scheduling, approvals, and grounded insights
into one governed view.

> The AI analyzes and proposes. Authentication, deterministic policy, and human
> approval control every consequential action.

Everything here runs on synthetic data. No real executive, customer, or company
data appears anywhere in this repository.

## Run it

```bash
npm install
AUTH_MODE=demo npm run dev  # localhost-only synthetic role-test mode
```

Local development can use synthetic mode without a database, Google account,
or AI key. This mode is refused in production. Normal member access uses
Google sign-in and an explicit member email-to-persona mapping.

To use a live provider, explicitly set `AI_PROVIDER`, its API key, and its
model ID (see `.env.example`). Keys alone do not switch off the mock provider.

For example:

```bash
AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... npm run dev
```

## Vercel demo deployment

Step-by-step runbook: **[docs/DEPLOY.md](docs/DEPLOY.md)**. After deploying,
check the live URL with `bash scripts/verify-deploy.sh https://your-app.vercel.app`.


The Vercel deployment requires a pooled Postgres `DATABASE_URL`, Google OAuth
web-client credentials (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`), a random
32-character-or-longer `AUTH_SECRET`, and `EXECUTIVE_MEMBER_MAP` (for example,
`member@example.com:p_ceo`). In Google Cloud Console, register the exact
redirect URI `https://your-domain/api/auth/callback/google`. Only verified
Google addresses explicitly mapped to synthetic executive or named assistant personas can enter.
There is no public role switcher. See [ADR-0008](docs/decisions/ADR-0008-google-executive-access.md).

Leave `AI_PROVIDER=mock` for a deterministic demo, or set `AI_PROVIDER=openai`
or `anthropic` with the matching server-only API key and model ID. The assistant
uses only permission-filtered demo facts and has no send/book tools. No model
key belongs in the UI or in a `NEXT_PUBLIC_` variable. Google sign-in does not
grant live Gmail or Calendar access; those integrations are not implemented.
Do not put real executive data into this prototype. The database stores
synthetic session state for 24 hours, subject to the database provider's backup
retention; see [ADR-0007](docs/decisions/ADR-0007-durable-demo-sessions-on-vercel.md).

After linking the Vercel project and configuring its environment, deploy and
check that `/api/health` responds with `{"status":"ok","durable":true}`.
Then sign in as a mapped executive and walk through the inbox, meeting,
assistant, org hierarchy, and approval flows on the real URL.

The automated demo verification script uses a localhost-only test identity mechanism:

```bash
AUTH_MODE=demo npm run dev
PORT=3000 bash scripts/verify-demo.sh
```

The local build and test run do not substitute for a remote OAuth and
Postgres-backed check. The Vercel project must be connected to the repository
containing these changes before its deployment reflects them.

## Verify it

```bash
npm run build
npm test
AUTH_MODE=demo npm run dev &
PORT=3000 bash scripts/verify-demo.sh
```

The suite covers the four demo scenarios plus six adversarial cases: prompt
injection, a compromised model, wrong-identity approval, restricted access,
approving a blocked matter, and disabling an invariant rule.

## The demo, in four scenes

Presenter walkthrough: **[docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md)**.

1. **Routine approval.** Assess the DC throughput email. Medium risk, with the
   reason shown. Clear the CEO step, see that the chain is not finished, then
   sign in as the mapped CFO to clear finance review. A simulated mailbox draft
   is created and is not sent. Editing a proposed reply restarts its approval chain.
2. **Hierarchy-aware scheduling.** Request time as a director three levels below
   the CEO. The system routes through the named executive assistant and explains
   why. Three times across three days, from free/busy only. Switch the requester
   to the COO and the same request books directly.
3. **Critical incident.** Assess the store fire. High risk, no reply drafted,
   and no way to approve one. Escalates to the executive and the crisis
   reviewer, with an audit trail.
4. **Injection and a compromised model.** Assess the fraudulent invoice: the
   instruction hidden in the body is flagged, stripped from the extracted action
   items, and ignored. Then switch on "simulate a compromised model" in Controls
   and re-assess the store fire. The model now reports low risk. The outcome
   does not change.

Scene 4 is the argument. Everything else is the product.

## Where to look

| | |
|---|---|
| `CLAUDE.md` | Build constitution: invariants, dependency direction, conventions |
| `docs/00-BUILD-PLAN.md` | Scoping decision, status, what is next, open client questions |
| `docs/prompts/` | The prompt pack that produced this and continues it |
| `docs/decisions/` | ADRs covering the load-bearing choices |
| `src/core/policy/engine.ts` | The deterministic policy engine |
| `src/core/risk/rules.ts` | Risk rules and injection patterns |
| `src/core/services/assess.ts` | The assessment pipeline; the comment block explains the ordering |

## Stack

Next.js 16, Auth.js, TypeScript, Tailwind v4, zod. Mock connectors, with
in-memory state in local development and Postgres-backed demo sessions on
Vercel. ADR-0001 explains the original scope; ADR-0007 and ADR-0008 document
deployment persistence and executive sign-in.
