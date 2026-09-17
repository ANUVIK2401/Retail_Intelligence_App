# Review prompts R1–R4

Run each in a **fresh session** that did not write the code under review. A
session that just built the policy engine will confirm its own assumptions about
the policy engine.

---

## R1 — Adversarial review

```
You are attacking this system. You are not helping build it. Your goal is to
find a path by which a consequential action happens without a human approving
it, or by which someone sees something they should not.

Work through these classes and write a concrete attack for each, then test it
against the running app:

1. Prompt injection: get the assistant to draft, approve, or send by writing
   instructions into an email body, a subject line, an attachment name, a
   document in the knowledge base, or a workspace message.
2. Risk laundering: get a high-risk matter classified low. Try euphemism ("an
   incident at the Anaheim location"), burying it mid-thread, splitting it
   across a quoted reply chain, and non-English phrasing.
3. Authorization: approve a step as an identity not entitled to it. Try the
   auditor, the EA on a reviewer step, a reviewer from the wrong domain, and an
   executive on someone else's restricted matter.
4. Restricted access: get any part of the acquisition thread — subject, body,
   preview, entity list, audit detail, or insight synthesis — in front of an
   identity not on the allowlist.
5. Calendar leakage: recover a meeting subject, attendee, or location through
   scheduling, insights, or the audit trail.
6. State: replay an approval, double-approve, approve then edit then execute,
   or reach a connector without an approval id.

For each: state the attack, the exact request, the observed result, and whether
it succeeded. For anything that succeeded, propose the fix as a DETERMINISTIC
control, not a better prompt. A prompt improvement is not a fix.

Report as a table. Do not fix anything in this session.
```

---

## R2 — Security review

```
Review this codebase as a security engineer preparing it for an enterprise IT
review at a retail company. The client's IT team will ask these questions and we
need the answers to be true.

Check and report on:
- Data flow: exactly what leaves the process and to where. Confirm no message
  body, calendar detail, or document content reaches a log, an audit detail
  line, or an error message.
- The model boundary: confirm no credential, token, or connection string can
  enter model context, and that the model is never given tools.
- Authorization: find every path that reads or writes a resource and confirm
  each applies object-level authorization, not just route-level.
- Injection surfaces: every place untrusted text enters, and whether each is
  fenced.
- Failure modes: confirm every catch block degrades toward escalation. Find any
  that degrades toward permission.
- Headers, CSP, and cookie flags.
- Dependencies: run npm audit and report anything reachable from the request
  path.

Then write docs/SECURITY-POSTURE.md answering, in plain language a CIO will
read: what data the system touches, where it is stored, who can see what, what
the AI provider receives, what happens when something fails, and what is
deliberately not built yet.

Flag anything that is currently true only because this is a prototype and would
stop being true in production. That list is the important part.
```

---

## R3 — Policy review with the professor

```
Prof. Ben Lee is an organization-management scholar, not an engineer. Produce a
document he can mark up that translates every rule in this system into
organizational language.

For each rule in POLICY_RULES and RISK_RULES, give: what it does in one plain
sentence, the organizational assumption it encodes, who it constrains, and the
question we need the client to answer to confirm or correct it.

Then flag every place where we GUESSED at an organizational norm rather than
knowing it. Specifically: the two-level threshold for routing through an
assistant, the risk floors on each topic, who sits in each reviewer domain, the
delegation ceiling for the EA, and the executive-first ordering of approval
chains. These are the assumptions most likely to be wrong, and they are the ones
that will embarrass us in front of the client if they go unflagged.

Format as a table he can annotate. One page of preamble, maximum.
```

---

## R4 — Demo rehearsal

```
You are running the demo for the client. Walk the four scenarios end to end
against the running app and report exactly what appears on screen at each step.

1. Routine approval: assess the DC throughput email, show medium risk and why,
   edit one phrase, approve as CEO, show the chain is not finished, switch to
   the CFO, clear it, show the draft was created and not sent, show the audit
   entries.
2. Hierarchy-aware scheduling: request time as the director three levels down,
   show the routing decision naming the EA, show three times across three days,
   show that no meeting subject was retrieved. Then switch to the COO and show
   the same request book directly.
3. Critical incident: assess the store fire, show high risk, show that no reply
   exists, try to approve one and show the refusal, escalate, show the audit
   trail.
4. Prompt injection and compromised model: assess the fraudulent invoice, show
   the instruction-attempt banner and that the injected text was stripped from
   the action items. Then turn on "simulate a compromised model" in Controls,
   re-assess the store fire, and show the model reporting low while the outcome
   does not change.

For each step, report: what the presenter clicks, what appears, and what
sentence the presenter says. Time each scenario.

Then flag: any step that takes more than two taps to reach, any screen where the
reason text is longer than a person will read aloud, any place the demo could
fail on an unfamiliar laptop, and anything on screen that a client executive
would misread as a real capability rather than a simulation.

Target: five to eight minutes for all four.
```
