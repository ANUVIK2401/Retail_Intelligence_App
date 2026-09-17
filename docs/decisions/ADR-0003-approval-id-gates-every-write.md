# ADR-0003 — Every connector write requires an approval id

**Status:** accepted · **Date:** 2026-09-16

## Context

The risk that matters is not a bad draft. It is a bad draft that gets sent. Once
a message leaves the tenant or an event lands on a CEO's calendar, the damage is
done and an apology is the only remedy.

Policy evaluation happens well upstream of the connector. Between the two sit
several call frames, and a future contributor adding a convenience path is a
realistic way for an action to escape.

## Decision

Every write method on every connector interface takes `approvalId: string` and
throws when it is empty. `createReplyDraft`, `sendDraft`, `createEvent`, and any
write added later.

Execution happens in exactly one place: after the final step of an approval
chain clears in `/api/approvals/[id]/decide`. Authorization is re-checked there
against the acting identity, independently of anything the model produced.

## Consequences

A connector that cannot name the approval that authorized it cannot write. Any
new write path must either carry an approval or be visibly, deliberately
bypassing the gate in code review.

The audit trail joins cleanly: approval id, connector call, and outcome share a
correlation id, so "who authorized this" is a lookup rather than an
investigation.

The cost is ceremony. Even a low-risk acknowledgement requires an approval
object. That is acceptable: approving a routine reply is one tap, and the
uniformity is what makes the guarantee simple enough to state to a client.

## Rejected

*Check policy at the service layer and trust the call path.* Correct today,
fragile forever. The guarantee should not depend on nobody adding a shortcut.

*A middleware that inspects outgoing calls.* Ambient and easy to misconfigure. A
required argument fails loudly at the type level instead.
