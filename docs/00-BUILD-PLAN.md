# Build plan

## The scoping decision

The design document specifies Next.js + FastAPI + PostgreSQL/pgvector + Redis +
Azure Service Bus + Azure Container Apps. That is the right pilot architecture
and the wrong demo architecture, because two runtimes, a database, a cache, and
a queue consume the days between now and the meeting on plumbing rather than on
the thing that has to land.

What this build does instead: one Next.js application, in-memory state, mock
connectors. The policy engine, risk engine, connector interfaces, and AI gateway
are built exactly as the design document specifies, because those are the parts
that carry the argument. The infrastructure is the part that can be added later
without redesign.

What that costs, stated plainly:

- No persistence. Restarting the server resets the demo. For a demo this is a
  feature; for a pilot it is not.
- No concurrency story. One process, no locks, no idempotency keys yet.
- Python is not in the stack. If the client's engineering team is a Python shop
  and wants to own this, B11 and the services layer get ported. The contracts,
  policy rules, and test suite port directly; the API routes do not.

What it preserves: every seam the pilot needs. `session.ts` is the whole auth
migration. `connectors/index.ts` is the whole Graph migration. `ai/resolve.ts`
is the whole provider migration. `store/index.ts` is the whole database
migration. None of them touch feature code.

---

## Where this stands

Done and verified: contracts, synthetic data, deterministic risk engine, policy
engine, AI gateway with mock and Claude adapters, mock connectors, in-memory
store with approvals and audit, assessment pipeline, policy-aware scheduling,
API routes, and eleven screens working from 320px to desktop.

Since then: permission-first insight retrieval (B8), private workspaces with
the four memory categories and an enforced explicit-save rule (B9), a
publication check pipeline whose review chain is derived from the failed checks
(B10), and an evaluation harness over 63 labelled synthetic messages (B12).

`scripts/verify-demo.sh` passes 115 checks covering the four demo scenarios, the
adversarial cases, the three new modules, the evaluation gate, and the unit
tests. `npm test` passes 18 unit tests. `npm run evaluate` regenerates
`docs/EVALUATION.md`.

The evaluation earned its place immediately: it found two genuinely high-risk
messages rated low, both threatened legal claims phrased without any of the
words `R-LEGAL` looked for. The rule was widened and the false-safe rate went
from 5.9% to 0%.

An end-to-end readiness review on 2026-09-17 then found what the evaluation
could not see, because triage quality and control integrity are different
properties. Seven findings, four of them high severity, three of which broke
the one sentence this build exists to defend: restricted content was returned
after the policy engine said `deny`; one approval executed twice and produced
two drafts; and publication exports printed "Approved by" using the list of
*required* reviewers, so every export claimed approvals that had never
happened. All seven are fixed, each with a regression case, and the suite grew
from 84 to 115 checks as a result.

The lesson worth carrying into the pilot: a green suite is evidence only about
what it tests. The 84-check suite passed while all four high findings were
live, because it tested restricted access on the inbox routes and never on the
assessment, dashboard, or approval-listing routes.

**Sept 23 review revamp (2026-09-24).** The interface was rebuilt around the
review's direction: chat in the center with a Today panel, multi-person
scheduling from a sentence (pure availability engine plus deterministic
parser, optional model extraction), voice input, mobile inbox triage (reply,
quick reply, later), Projects, plain-language navigation, the product renamed
to PacSun Executive Assistant, and the Approvals queue behind
`FEATURE_APPROVALS`. A relational target schema with row-level security and a
`DATA_SOURCE` seam were added (`docs/architecture.md`). Verification at that
point: 165 unit tests, `verify-demo.sh` 161/161 (in-memory and on Postgres 16),
`npm run e2e` 29/29 (laptop, phone, voice), and the responsive sweep 108/108.
The demo script is `DEMO.md`.

---

## Remaining before the meeting

Ordered by what most improves the client conversation per hour spent.

| | Work | Prompt | Why it matters |
|---|---|---|---|
| 1 | Run the adversarial review and fix what it finds | R1 | Anything it finds, the client's IT team will also find |
| 2 | Run the demo rehearsal, tighten the script | R4 | Ben asked for a recording; a rehearsed five minutes beats a live fifteen |
| 3 | Policy translation for Ben | R3 | His contribution is the organizational layer, and he needs the assumptions surfaced to correct them |
| 4 | Security posture document | R2 | Shirley's IT review will ask before any tenant access happens |
| 5 | Have the client's operators relabel the evaluation set | B12 | The set is written by the same people who wrote the rules; their labels are the real test |

B8, B9, B10, and B12 are done. B11 remains blocked on a test tenant.

---

## Open questions, ordered by how much they change the build

These come out of the transcript and the design document, narrowed to the ones
where a wrong guess costs real rework.

**Changes the architecture:**

1. Is "Quad" in the transcript Claude? The existing stack is Claude Enterprise,
   which suggests yes, and the adapter is written for it. Confirm before the AI
   provider is treated as settled.
2. Microsoft 365 and Entra ID, single tenant? The whole identity and connector
   plan assumes it.
3. Where must data be hosted, and is company data contractually excluded from
   provider training?

**Changes the policy engine:**

4. The real reporting hierarchy, and at what level a request must go through an
   assistant. The two-level threshold here is a guess.
5. Which subjects must always escalate, and who reviews each.
6. Who may approve on an executive's behalf, and up to what stakes.
7. May the pilot create drafts, or only display suggested text?

**Changes scope:**

8. Which executive is the first pilot user, and which of the five modules
   creates the most value for them.
9. Which internal and external sources may feed Insights.
10. Who must review public posts, and does the pilot publish or only prepare?

---

## Deliberately not built

| Not built | Unblocks when |
|---|---|
| Production Graph access, real mailboxes | A test tenant exists and delegated consent is granted |
| Autonomous sending | Never in the pilot; only after evaluation evidence and an explicit client policy |
| Direct social publication | API eligibility, corporate account ownership, and a review policy are confirmed |
| Open-web ingestion for Insights | Source licensing, reliability, confidentiality, and retention are settled |
| Fine-tuning on company data | Not planned. Retrieval over approved sources is the recommendation |
| Database, queue, Azure infrastructure | The pilot starts, i.e. after the client says yes |
