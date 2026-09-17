# Executive Command Center

Mobile-first executive assistant prototype, built for the discussion with
Prof. Ben Lee and the prospective client.

> The AI analyzes and proposes. Authentication, deterministic policy, and human
> approval control every consequential action.

Everything here runs on synthetic data. No real executive, customer, or company
data appears anywhere in this repository.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No database, no API key, no network. It works offline by design, so a recorded
walkthrough cannot fail on someone else's infrastructure.

To use Claude instead of the offline mock provider:

```bash
ANTHROPIC_API_KEY=sk-... npm run dev
```

## Verify it

```bash
npm run build
npm run start &
PORT=3000 bash scripts/verify-demo.sh     # 115 checks
```

The suite covers the four demo scenarios plus six adversarial cases: prompt
injection, a compromised model, wrong-identity approval, restricted access,
approving a blocked matter, and disabling an invariant rule.

## The demo, in four scenes

1. **Routine approval.** Assess the DC throughput email. Medium risk, with the
   reason shown. Edit a phrase, approve as CEO, see that the chain is not
   finished, switch to the CFO, clear it. A draft is created in the mailbox and
   is not sent.
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
| `docs/decisions/` | Five ADRs covering the load-bearing choices |
| `src/core/policy/engine.ts` | The deterministic policy engine |
| `src/core/risk/rules.ts` | Risk rules and injection patterns |
| `src/core/services/assess.ts` | The assessment pipeline; the comment block explains the ordering |

## Stack

Next.js 16, TypeScript, Tailwind v4, zod. In-memory state, mock connectors.
ADR-0001 explains why this and not the FastAPI/Postgres/Azure stack from the
design document, and what that costs.
