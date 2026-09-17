# Executive Command Center — build constitution

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
2. `scripts/verify-demo.sh` passes 115/115 against a running server.
3. If the change touches risk, policy, connectors, or the gateway, add a case to
   that script, including an adversarial one.
4. The nine invariants above still hold.
