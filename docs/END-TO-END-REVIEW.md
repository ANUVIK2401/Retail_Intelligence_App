# End-to-end readiness review

Reviewed 2026-09-17. Scope: source review, independent security and feature reviews,
local tests, production build, live API probes, and browser checks. Application code
was not changed. All probes used synthetic fixtures and mock connector effects.

## Verdict

B8/B9/B10/B12 are implemented prototype capabilities, but their completion does not
establish secure end-to-end operation. Fix authorization, approval integrity, and
misleading approval evidence before connecting real data. B11 is not the only pilot
blocker. No autonomous send, social publication, or open-web ingestion is required
to complete a deliberately constrained pilot.

## Verification results

| Claim/check | Result |
|---|---|
| Verification script | Reproduced **84 passed, 0 failed** against a running production server |
| Unit tests | Reproduced **18 passed, 0 failed** |
| Typecheck | Passed |
| Default build | Turbopack failed on a local-port permission restriction, including the escalated retry; this is an environment failure, not demonstrated application failure |
| Alternate production build | `npm run build -- --webpack` passed |
| Lint | Failed: `next lint` is interpreted as an invalid project directory by the installed Next CLI |
| Dependency audit | `npm audit --json`: zero known vulnerabilities reported |
| Browser connector | Playwright connected successfully in this session |
| Responsive layout | Insights, Publish, Workspace loaded at 320, 768, 1440px; no document overflow or visible interactive elements below 44px height in sampled initial states |
| Visual inspection | Inspected full-page 320px screenshots of all three pages; normal layout was readable. This is not a complete accessibility or interaction-state audit |
| Publish error behavior | Browser reproduced a page crash after entering `short` and clicking Re-run checks |
| Evaluation | Synthetic harness reproduced 0% fused false-safe; this is not a hosted-provider result |

The coverage command reported 90.80% lines, 87.64% branches, 80.62% functions **over
loaded files**, including test/data files. It did not load workspace, scheduling,
assessment, approval execution, or API routes. This does not prove 80% application
coverage. Configure an explicit source denominator and CI thresholds.

## Findings requiring fixes

### 1. High: restricted content leaks through alternate read paths

Live reproduction: POST `/api/emails/e_restricted/assess` with
`Cookie: ecc_actor=p_ea` returned HTTP 200 and the acquisition/take-private summary
and entities, alongside a policy decision of `deny`.

`src/core/services/assess.ts:50` calls the provider before checking read access;
the returned assessment still contains the denied content. Authorize the source
before classification, drafting, caching, or serialization. Return 403 without
content and prove the provider was never called.

Live GET `/api/dashboard` as the EA also exposed the restricted message subject
and sender. `src/app/api/dashboard/route.ts:22` reads the CEO mailbox and assembles
unfiltered results. Its insights and audit sections also need access checks.

Approval, audit, and meeting-proposal GET routes return global records without
actor filtering. Restricted subjects are written into assessment audit details
(`assess.ts:160`), so filtering the inbox alone cannot protect them. Implement one
resource-access policy across lists, detail, assessment, dashboard, derived
content, and audit views. Use safe audit identifiers rather than private titles.

### 2. High: completed approvals can execute again; edits retain old approvals

Live reproduction: assess `e_approval`, approve as CEO, then approve twice as CFO.
Both CFO requests returned 200/completed, creating `dr_e_approval_1` and
`dr_e_approval_2` for the same approval.

`src/core/store/index.ts:128` rejects only approved/rejected states, allowing a
completed request to re-enter approval and execution. `:140` also permits content
edits without clearing earlier reviewer decisions.

Use explicit state transitions and atomic execution claims. Bind every decision
to resource, action, content hash/version, policy version, and actor. Editing must
invalidate affected approvals. Make execution idempotent and reconcile ambiguous
remote outcomes before retrying. Test sequential replay and concurrent requests.
Connector validation must establish more than a nonempty approval ID.

### 3. High: publication exports falsely claim human approval

Live POST `/api/publications` with body `Our stores welcome the community this
weekend.` and `export:true`, without any review decisions, returned:

`Approved by: Communications review -> Executive approval`

`src/app/api/publications/route.ts:79` constructs this from required reviewer
labels. The UI's Clear buttons only increment local state (`publish/page.tsx:253`).
There is no authenticated approval chain behind them.

Persist actual reviewer decisions bound to the complete draft version. Approved
exports must require a completed chain. Alternatively, permit unapproved exports
only when clearly labeled as drafts awaiting review. Do not generate fabricated
approval evidence. The absence of a direct publishing function does not fix this.

### 4. High: Insights GET permission filtering is incorrect

`src/app/api/insights/route.ts:32` unions every allowed function from an actor's
permitted sources, then uses that union to select derived insights. Logistics
inherits operations through a shared source and can receive `i_operations`, whose
`src_traffic` citation is not authorized for logistics. Independently reproduced
the selection logic against fixture ACLs.

Check every cited source against the actual actor; do not inherit other readers'
permissions. Apply the same policy to dashboard insights. B8's POST retrieval
correctly filters before chunking/embedding, but that does not secure GET.

### 5. High/medium: publication check bypasses

Direct service reproductions:

- `We will raise earnings guidance tomorrow; this is confidential.` is not MNPI
  blocked. The pattern in `publishing.ts:109` expects guidance/earnings before the
  change verb, missing ordinary verb-before-noun wording.
- `We reduced costs by 30%.` passes numeric-claim detection. `%\b` at `:88` fails
  when percent is followed by punctuation or whitespace.
- The route checks body only; the exported title is never checked.

Add regression cases for these and independent semantic variants, including
non-English wording and quoted text. Check the entire exported artifact. Regex
coverage alone cannot justify treating unseen material as safe; retain mandatory
human review and conservative handling of uncertainty.

### 6. Medium: Publish crashes on a normal validation error

Entering fewer than 20 characters and clicking Re-run checks produces a 400 JSON
error. `src/app/publish/page.tsx:100` stores it as a review result, then `:171`
calls `result.checks.map`. Browser observed `Cannot read properties of undefined
(reading 'map')` and the page error fallback.

Check HTTP status and response shape, preserve editable text, show a useful error,
and clear stale approvals/results when content changes. Also handle out-of-order
responses and network failures. Add browser tests for these states.

### 7. Scheduling is not yet a complete booking flow

Invalid `slotIndex` can mark approval completed without creating an event
(`api/approvals/[id]/decide/route.ts:136-165`). Validate existence and bounds before
changing approval state. Requests also accept a requester ID independent of the
acting identity; enforce self-request or explicit delegation.

Ranking uses server-local hours instead of each participant's timezone. Add
timezone/DST handling, date-window limits, all-attendee validation, no-slot
behavior, and a final availability check. The direct-report path returns a
proposal with `allow`; the verification check does not prove that it books an
event. Implement an explicit human-confirmed booking path and test the result.

### 8. Workspace is a partial product workflow

Ownership and explicit-save checks are present, including refusal to promote
conversation state. They operate under simulated identity, not real authentication.
The API exposes create/read/delete but no workspace update operation. The UI
opens the first workspace and lacks project management and memory edit/delete.

Saved memory is not read into the assistant context; `workspace.ts:116` uses only
the last six messages. Define profile versus project scope and retrieve authorized
saved memory intentionally. Attachment wording has no implemented upload flow.
All memory remains process-local despite UI claims about lasting categories.

On provider failure, the service appends both the user's turn and a fallback turn
claiming nothing was added. Make retention/failure text accurate; add initialization,
send, save, duplicate-submit, deletion, and ownership regression tests.

## Evaluation changes before sharing numbers

1. Put the stand-in warning beside the headline. 91.2% is the stand-in's
   **false-safe rate**, not Claude accuracy. Runtime selects Mock/Anthropic, never
   SurfaceSignalProvider; remove “configuration that ships” from this result.
2. Treat this dataset as regression evidence because it was used to fix the rules.
   Obtain independently labeled, held-out cases and record label disagreements.
3. Cache one real-model response per case for paired model-only/fused comparison.
   `evaluate.ts:197-199` currently calls the provider separately for those arms.
4. Measure restricted-to-high downgrades, reviewer routing, access leakage, draft
   faithfulness, and unauthorized effects separately. The existing false-safe
   metric ignores restricted-to-high downgrades (`:141`).
5. Use N/A when a family has no high-risk cases; `:168` currently displays 100%.
6. Test the production assessment pipeline against harness results. Current tests
   exercise a separate fusion helper rather than establishing pipeline parity.
7. Record provider/model, prompt/rule/policy versions, dataset hash, failures,
   latency, and cost. Do not count fallback escalations as model success.
8. Remove claims that false-safes are the only harmful error or that all other
   errors cost thirty seconds. This review demonstrates other failure classes.

## Ordered path to a constrained real pilot

| Phase | Work | Exit criterion |
|---|---|---|
| A: repair demo controls | Findings 1-6, scheduling false-success, accurate labels, lint, boundary and browser regressions | Each reproduction fails safely; baseline tests still pass |
| B: settle client policy | Confirm Quad/provider, tenant, pilot executive, deployment region, retention, sources, hierarchy, reviewer domains, delegation, draft/export scope | Ben and client owners approve a versioned policy matrix; Shirley reviews data flow/security posture |
| C: durable security foundation | Verified Entra identity; no default CEO; tenant/resource ACLs; schema validation and request limits; durable approvals/state/audit; content versions; transactional outbox/idempotency | Restart, concurrency, replay, revocation, and cross-user/tenant isolation tests pass |
| D: Graph integration | Connector resolver instead of direct mock construction; contract tests; delegated consent; mail drafts and free/busy; explicitly approved calendar writes; token lifecycle, pagination, throttling, retry/reconciliation | Test-tenant E2E flow proves the exact approved effect once; denied/revoked consent fails closed |
| E: complete feature workflows | Workspace management/memory retrieval; approved source ingestion and ACL/deletion lifecycle; versioned publication approvals and export; usable loading/error/empty states | Each agreed user journey works through UI/API/storage/provider boundaries |
| F: pilot release | Real-provider held-out eval; accessibility/browser tests; source-wide coverage gates; CI; secrets management; monitored deployment; backup/restore; rollback and incident runbooks | Recorded rehearsal and client acceptance on the deployed pilot |

Graph adapter implementation and simulated error/contract tests can proceed before
tenant access; actual delegated-consent and integration validation cannot. Use
least-privileged permissions and throttling handling according to Microsoft's
[Graph guidance](https://learn.microsoft.com/en-us/graph/best-practices-concept).
Graph event creation exposes a transactionId mechanism worth incorporating into
the application's own idempotency design:
[Create event](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0).

Do not assume replacing one file migrates auth, storage, or connectors. Services
and routes directly construct mocks, and synchronous mutable store references are
used across workflows. Introduce injectable connector/repository interfaces and
transaction boundaries first. Keep the single Next.js app unless ownership or
operational requirements justify a second runtime; Azure/queues are deployment
choices, not substitutes for these correctness controls.

## Remaining limits of this review

No real-provider evaluation, tenant consent test, full R4 timed rehearsal/recording,
or complete multilingual injection campaign was performed. Responsive checks cover
sampled states, not every role, error, long-text, or assistive-technology state.
“Quad” remains unresolved; repository comments cannot confirm the transcript's
meaning. README/CLAUDE still reference 38 checks and should be reconciled with the
84-check suite. No Git repository was present, so historical before/after claims
and a clean Git diff could not be verified.
