# PacSun Executive Assistant: build constitution

Read this before writing code in this repository. Every prompt in `docs/prompts/`
inherits these rules; none of them restate the rules, they assume them.

This file is the structure mechanism. A list of prompts alone drifts, because
each session re-derives conventions. A constitution plus thin prompts does not.

---

## What this system is

A mobile-first executive assistant for a retail company, built for a client
discussion led by Prof. Ben Lee. Five capabilities: scheduling, email, insights,
brainstorming, publishing. The capabilities are not the product. The product is
the control layer around them.

The one-line claim the whole build must keep true:

> The AI analyzes and proposes. Authentication, deterministic policy, and human
> approval control every consequential action.

If a change makes that sentence less true, the change is wrong regardless of how
much it improves the demo.

---

## Nine invariants

These are not preferences. A pull request that violates one is rejected.

1. **The model never decides.** It returns an assessment. `evaluatePolicy()` in
   `src/core/policy/engine.ts` decides. Nothing else in the codebase may branch
   on model output to authorize an action.
2. **Deterministic rules floor the model, never cap it.** In `assess.ts` the
   fusion step is `max(deterministic, model)`. A model may raise risk. It may
   never lower it. Never write `min` here.
3. **Untrusted content is data.** Email bodies, documents, web text, and
   attachments are fenced with `fenceUntrusted()` before reaching a model, and
   their contents never become instructions, action items, or approvals.
4. **No consequential action without an approval id.** Every connector write
   method takes `approvalId` and throws without one. Do not add a write path
   that bypasses this.
5. **Authorization is re-checked at the approval gate**, against the acting
   identity, independent of anything the model produced earlier.
6. **Free/busy only.** `BusyBlock` has no `subject` field. Do not add one. A
   calendar-title leak should require changing a type and failing type-check.
7. **Failure is conservative.** A timeout, a parse failure, or an unknown
   condition escalates. `conservativeClassification()` returns `high`. Never
   degrade toward permission.
8. **Everything consequential is audited**, including refusals. Audit detail
   lines carry no message bodies.
9. **Synthetic data only.** No real executive, customer, or company data enters
   this repository, ever, including in a branch or a test fixture.

---

## Architecture in one paragraph

Single Next.js app. `src/core/` holds the domain and has no React in it.
`src/app/api/` holds thin route handlers that parse, call one core service, and
serialize. `src/app/` pages are client components that call those routes.
Features depend on connector *interfaces*, never on a vendor SDK. The AI gateway
is one interface with swappable adapters. State is in-memory by design.

Dependency direction, strictly one-way:

```
app/pages  →  app/api  →  core/services  →  core/policy   (pure)
                                        →  core/risk      (pure)
                                        →  core/ai        (interface + adapters)
                                        →  core/connectors (interface + adapters)
                                        →  core/store
                          all of the above →  core/contracts
```

`core/policy` and `core/risk` import nothing but `contracts` and `data`. Keep
them pure so they stay testable and reviewable by a non-engineer.

---

## Conventions

- **Contracts first.** A value crossing a module boundary is defined in
  `src/core/contracts/index.ts` before it is used. Zod schema, then inferred
  type. Never hand-write a type that duplicates a schema.
- **Reasons are mandatory.** `RiskAssessment.reason` and
  `PolicyDecision.reason` are non-empty strings written for an executive to
  read, not log strings. No "policy violation" or "denied by rule 7".
- **Rule ids are stable.** `R-*` for risk rules, `P-*` for policy rules. They
  appear in the UI and the audit trail. Renaming one is a breaking change.
- **Versioned prompts.** `PROMPT_VERSION` changes when a prompt changes, and it
  is recorded on every assessment and audit event.
- **Comments explain why, not what.** The reviewer is a professor and a client
  executive, not only an engineer.
- **No new runtime dependency** without a line in `docs/decisions/` saying why.
- Touch targets ≥ 44px. Risk is conveyed by text as well as color. Layout works
  at 320px.

---

## What is deliberately not built

Say so plainly rather than stubbing something that looks real:

- Production Microsoft Graph access, real mailboxes, real sending.
- Direct publication to LinkedIn, Substack, or Instagram.
- Open-web ingestion for Insights.
- A database, a queue, or Azure infrastructure.
- Fine-tuning on company data.

Each is listed with its unblocking condition in `docs/00-BUILD-PLAN.md`.

---

## Definition of done for any change

1. `npm run build` is clean.
2. `npm test` passes, and `scripts/verify-demo.sh` passes every check (161 as of
   2026-09-24) against a running server. For UI changes, `npm run e2e` and
   `node scripts/verify-responsive.mjs` pass too.
3. If the change touches risk, policy, connectors, or the gateway, add a case to
   that script, including an adversarial one.
4. The nine invariants above still hold.

---

## Product summary

A calm, chat-first executive assistant for PacSun leadership (demo persona:
Maya Hollis, CEO). The executive asks in plain words, by text or voice; the
assistant finds time across several calendars, triages email into reply fully,
quick reply, or later, and organizes work into projects. Everything runs on
synthetic data, and every booking or send waits for the executive's explicit
confirmation. The name lives in one place: `src/config/product.ts`.

## Product direction (Sept 23 review)

These decisions came from the review with Prof. Ben Lee and the client. They
shape every change:

- **Scheduling is the #1 demo capability.** Natural language, multi-person
  availability, selectable options, booking, by text or voice.
- **Chat is the center of the UI**, GPT-style: left nav, center chat, optional
  right "Today" panel. Do not imitate Outlook's layout.
- **No "Command Center" and no militaristic language** anywhere user-facing.
- **Keep the org hierarchy** (People page). It also drives meeting routing.
- **Approvals are behind `FEATURE_APPROVALS` (default off)** until PacSun's
  executive workflows are understood. Confirmation happens inline where the
  action is; policy and audit run underneath regardless.
- **Inbox is mobile-first triage:** reply fully, quick reply, or later.
- **Projects** group emails, meetings, people, and notes by initiative.
  Suggestions are shown; nothing is filed silently. Slack/WhatsApp ingestion is
  an open question: `src/core/projects/sources.ts` is the marked extension point.
- **All data stays synthetic.** Never add real Gmail, Outlook, or Calendar writes.

## Architecture map

| Path | Owns |
|---|---|
| `src/config/product.ts` | Product name (single constant) |
| `src/config/nav.ts` | The one navigation map for sidebar and phone drawer; `navFor()` is flag-aware |
| `src/config/features.ts` | `FEATURE_APPROVALS`, `FEATURE_VOICE_REPLIES` (server-read, sent via `/api/session`) |
| `src/app/page.tsx` | Center chat + Today panel (was the dashboard) |
| `src/components/chat/` | Composer (voice), message-part renderer, slot picker, Today panel, pure helpers in `parts.ts` |
| `src/components/TriageActions.tsx` | Reply / Quick reply / Later, shared by Inbox and chat email cards |
| `src/core/scheduling/availability.ts` | Pure multi-person availability engine (working hours per timezone, protected and focus blocks, buffers, constraints, alternatives) |
| `src/core/scheduling/parse.ts` | Deterministic natural-language parser for requests and follow-ups |
| `src/core/services/chat.ts` | Chat orchestration: parse, propose via policy, return typed parts. Never books or sends |
| `src/core/services/scheduling.ts` | `proposeMeeting`, `bookAllowedMeeting`; `rankSlots` delegates to the engine |
| `src/core/services/triage.ts` | Inbox buckets, snooze, quick replies, send (policy, approval id, synthetic Sent folder) |
| `src/core/services/projects.ts`, `src/core/projects/` | Projects, link tables, suggestion logic, source extension point |
| `src/core/connectors/resolve.ts` | `DATA_SOURCE=synthetic|graph`; the Graph adapter is a loud stub |
| `src/core/policy`, `src/core/risk` | Pure, deterministic. Unchanged in spirit; `email.send` now lets the mailbox owner confirm a routine reply themselves |
| `db/migrations/` | Target relational schema with invariants and row-level security; see `docs/architecture.md` |

## Navigation map

Main: Chat `/`, Inbox `/inbox`, Calendar `/schedule`, (Approvals `/approvals`
only with the flag), Projects `/projects`, Notes `/workspace`, Posts
`/publish`, Insights `/insights`, People `/org-chart`. Settings (collapsible, at
the bottom): Controls `/controls`, Audit history `/audit`, Administration
`/admin` (administrators only). Aliases `/calendar`, `/notes`, `/posts`,
`/people` redirect; `/more` and `/today` redirect to `/`.

## Data model (synthetic)

People and delegations: `src/data/org.ts`. Emails and one-line summaries:
`src/data/emails.ts`. Free/busy (a hand-placed week plus a recurring week for
everyone, no subjects) and owned events: `src/data/calendar.ts`. Knowledge
sources and insights: `src/data/knowledge.ts`. Seed projects:
`src/data/projects.ts`. Per-session state (assessments, approvals, proposals,
bookings, sent replies, snoozes, projects, notes, memory, audit):
`src/core/store/index.ts`, persisted as one JSONB row per member.

## Commands

```bash
AUTH_MODE=demo npm run dev          # local synthetic session, no Google needed
npm run typecheck                   # tsc --noEmit
npm test                            # unit tests (node --test)
npm run build                       # production build
PORT=3000 bash scripts/verify-demo.sh   # API scenarios + adversarial cases, needs a running server
npm run e2e                         # browser demo script incl. voice, needs a running server
node scripts/verify-responsive.mjs  # 9 widths x 12 pages: overflow and 44px targets
DATABASE_URL=... npm run db:migrate && npm run db:seed
```

There is no ESLint (ADR-0006); `npm run lint` is typecheck plus tests.

## Conventions observed

- Client pages fetch thin API routes; routes wrap handlers in `withDemoState`.
- Services return plain data; UI copy for an executive, never log strings.
- Pure logic that needs unit tests lives in `.ts` files, because `node --test`
  does not compile JSX (see `src/components/chat/parts.ts`).
- Chat replies are typed parts (`ChatPartSchema` in contracts). Add a part type
  there first, then render it in `MessageParts.tsx`.
- Per-viewer conveniences (theme, panel open, thread, voice settings) use
  browser storage; anything that must be shared or audited is server state.
