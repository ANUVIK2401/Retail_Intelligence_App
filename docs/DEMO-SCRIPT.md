# Demo script

Five minutes, four beats. Every claim below is checked by
`scripts/verify-demo.sh`, so nothing here depends on the demo behaving.

## Before you start

```bash
npm install
npm run build
npm run start            # http://localhost:3000
PORT=3000 bash scripts/verify-demo.sh    # 115 checks, run it once on the machine you will demo on
```

State is in memory. Restarting the server resets everything to a known point,
which is the recovery move if a beat goes wrong.

The sidebar identity switcher stands in for Microsoft Entra sign-in. Switching
identity changes what the policy engine permits — it is not a view filter.

---

## Beat 1 — the model does not decide (90s)

**Inbox → "URGENT: Fire at Store 412".** Assess it.

Say: the deterministic rules ran *before* the model and rated this high. The
model's own proposal is shown next to the result. Drafting is blocked and the
crisis reviewer is in the chain.

**Then the strong version.** Controls → turn on "simulate compromised model".
Re-assess the same message.

The model now reports `low / routine` for everything. The message is still
high, still blocked, and the UI says the rule overrode the model. That is
`max(deterministic, model)` in `assess.ts`, and it is the reason a manipulated
model cannot cause an action.

Turn the toggle back off.

## Beat 2 — authorization is real, not a filter (60s)

**Switch to Grace Whitfield (EA). Open Inbox.**

The restricted acquisition thread is withheld, and the withheld row carries no
subject. Try to assess it directly and the answer is 403 with no content — no
summary, no entities, and no model call was made. Authorization runs *before*
classification, which is the difference between refusing to answer and
answering then apologising.

Switch back to Maya Hollis and the same message opens normally.

## Beat 3 — approval is a record, not a button (90s)

**Publish → "Denim circularity launch".**

The checks run: regulated claims fails on "94% recovery", and legal is added to
the chain *because* that check failed. The chain is derived from the check
results — no model chose it.

Click **Send for review**. An approval id appears: `awaiting approval, 0 of 3
steps cleared`.

Now click **Approve as you: Communications review** while acting as the CEO.
It is refused: the CEO is not the communications reviewer. Switch identity to
Tomas Lund and it clears. This is the same approval gate the email flow uses.

Click **Export as unapproved draft** at any point and read the header aloud:

```
Status: DRAFT — NOT APPROVED. Do not post this text.
Decisions so far: none. No reviewer has seen this draft.
```

The export states what actually happened. There is no publish function in the
codebase to flip on.

## Beat 4 — everything is written down (60s)

**Audit history.** Every assessment, connector call, refusal, and policy change
is there, with the rule ids that fired and the prompt version. Audit lines
carry identifiers, not message subjects, because auditors are not cleared for
every message they can see a record of.

Close on **Insights**: ask a logistics question as the CMO. The answer cites
only marketing-cleared sources, and the panel names the five sources that were
excluded *before* retrieval — they were never chunked, embedded, or ranked.

---

## If someone asks

**"Has this been tested adversarially?"** Yes, and it failed twice. An
evaluation harness over 63 labelled messages found two threatened legal claims
rated low; the rule was widened and the false-safe rate went to 0%. A separate
end-to-end review found seven issues, four high severity, including exports
that claimed approvals nobody had given. All are fixed with regression tests.
`docs/END-TO-END-REVIEW.md` has the full list — it is in the repository on
purpose.

**"What is the false-safe number?"** 0% on this set, against a *stand-in*
model, on a dataset that was used to fix the rules. It is regression evidence,
not held-out evidence, and not a measurement of any hosted model. That caveat
is at the top of `docs/EVALUATION.md`.

**"Can we pilot this?"** Not yet, and the blocker is not only tenant access.
Identity is simulated, state is in memory, and nothing survives a restart.
`docs/00-BUILD-PLAN.md` has the ordered path.
