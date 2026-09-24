# Governance walkthrough (earlier demo script)

> The current Sept 23 demo script is [DEMO.md](../DEMO.md). This walkthrough still works for the governance scenes; page names changed: Overview is now Chat with the Today panel, Schedule is Calendar, Approvals is behind `FEATURE_APPROVALS`, and the assistant is the center chat rather than a side panel.

Six minutes. Use synthetic records throughout. The product story is simple: the assistant surfaces the signal and prepares work; named people make consequential decisions.

## Before the meeting

For a local walkthrough:

```bash
npm install
AUTH_MODE=demo npm run dev
PORT=3000 bash scripts/verify-demo.sh
```

Open `http://127.0.0.1:3000`. Local demo mode starts as the synthetic CEO. Restarting the local server clears its in-memory session. The deployed version uses mapped Google accounts and Postgres-backed demo state; follow [the deployment runbook](DEPLOY.md) and verify separate CEO, assistant, and CFO sign-ins before presenting cross-person handoffs. Google sign-in does not connect live Gmail or Calendar data.

## 1. Onboard the executive (40 seconds)

On a fresh browser, the three-step executive tour opens automatically. Show the role-specific welcome, the human-control promise, and the three recommended starting points. Complete the tour; point out that it can be reopened from **Tour** beside the member profile.

Say: “This starts with the executive's role and decision boundaries, not with an empty chatbot.”

## 2. Start with the day (45 seconds)

Open **Overview**. Point to the priority queue, decision desk, daily brief, and routine queue. Open the store fire from the priority list. The message is assessed before an action is proposed, and the page shows the risk rule and approval path beside the model's proposal.

Say: “The system reduces the reading burden, but it does not get to make the decision.”

Open **Ask assistant** and choose **When is Priya Raman busy?** Show the structured free/busy cards, source/model label, suggested follow-ups, and **Open schedule** link. The assistant can find and explain permitted records, but it cannot write to the calendar.

## 3. Show the boundary (75 seconds)

Assess the fire message. It is high risk. No reply is drafted. **Acknowledge and escalate** is the permitted action, and the crisis reviewer is named in the chain.

Go to **Controls** and enable **Simulate compromised model**. Return to the same message and choose **Reassess with current policy**. The simulated model proposes a low score, while the deterministic rule keeps the outcome high and blocked. Restore the control afterward.

Say: “A model can suggest. It cannot lower a rule-enforced risk or send a reply around review.”

## 4. Make scheduling tangible (75 seconds)

Open **Schedule** from the assistant. Start with the owned-event agenda: subjects are visible only on the signed-in executive's simulated calendar. Choose **Move** on the focus block, select a new time inside working hours, and confirm it. Duration is preserved, conflicts and protected time are rechecked, and the policy-backed change is written to the audit trail.

Then select Casey Wu as the synthetic requester and **Find times**. Show the routing reason and the named executive assistant step. Availability is free/busy only. Select a proposed time to make the approval path concrete.

Then select Ray Alvarez, the CEO's direct report, and find times again. This request is allowed directly. Select a time and **Book selected time**; the simulated invitation is recorded in the audit trail.

## 5. Follow an approval (90 seconds)

In **Inbox**, assess the DC throughput email. The prepared reply is medium risk and requires a named approval chain. Clear the CEO step. The chain remains open; no draft has been created in the mailbox yet. If the text is edited, the approval chain restarts for the revised draft.

On a deployed demo with separately mapped accounts, sign in as the CFO and open **Approvals**. Clear the finance step. The connector creates a simulated mailbox draft and does not send it. In local demo mode, `scripts/verify-demo.sh` exercises this identity handoff through test-only cookies; the browser has no public role switcher.

## 6. Close on evidence (30 seconds)

Open **Audit history** to show the assessment, policy result, approval step, and connector action recorded in the current account's demo session. Open **Insights** to show that answers cite approved sources and that sources outside the acting function are excluded before retrieval.

## If asked

- **Is this using company data?** No. All records and connectors in this prototype are synthetic. Live Gmail and Calendar access are not implemented.
- **Can the assistant send or publish?** No. The assistant is read-only. The email flow creates a draft only after approval; publication creates an export for a person to review and post.
- **Is this production ready?** It is a governed prototype. See [the build plan](00-BUILD-PLAN.md) and [the deployment runbook](DEPLOY.md) for the remaining integration and operational work.
- **Has it been tested adversarially?** The local regression suite covers prompt injection, a compromised model, wrong-identity approvals, restricted access, and blocked actions. The evaluation results in [EVALUATION.md](EVALUATION.md) are for a stand-in model and the dataset used to refine the rules.
