# ADR-0011: The mailbox owner's Send is the approval for a routine reply

**Status:** accepted · **Date:** 2026-09-24

## Context

Inbox triage needs "reply quickly" to take one tap. Before this change,
`email.send` at low risk routed to the executive assistant's delegated step,
so the executive could not send a routine reply from their own mailbox without
someone else acting.

## Decision

In `evaluatePolicy()`, `email.send` by the mailbox owner at low risk returns
`require_approval` with a single executive step ("You confirm before
sending"). Pressing Send creates the approval record, clears that step through
the same `authorizeApprovalStep()` gate the queue uses, and only then calls the
connector with the approval id. Medium-risk replies still need their reviewer
(for example, finance releases a budget approval). High-risk and restricted
threads are still refused outright, and the refusal is audited.

## Consequences

The executive's explicit press is the human approval, and it is recorded like
any other. The model never decides whether a reply goes out. No send path
exists without an approval id; `sent_replies.approval_id` is `NOT NULL` in the
target schema as well.
