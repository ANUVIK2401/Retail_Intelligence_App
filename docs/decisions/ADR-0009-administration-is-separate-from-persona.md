# ADR-0009 — Administration is separate from the acting persona

**Status:** accepted · **Date:** 2026-09-18

## Context

The deployment needs an owner who can onboard people, and everyone else needs
a role that determines what they may do. The obvious shortcut is to make
"administrator" the most powerful role in the directory and let it read
everything. That shortcut breaks invariant 1: the policy engine, not a role
label, decides what an identity may do.

## Decision

Two independent concepts.

**Administration** is a deployment capability, read from `ADMIN_EMAILS`. It
grants exactly one thing: the ability to onboard members, assign the persona
they act as, and remove members who were onboarded at runtime. It is not a
persona and does not appear in the synthetic directory.

**The persona** is what `evaluatePolicy()` reasons about. Onboarding maps a
verified Google email to an existing synthetic persona. Nothing about the
mapping widens that persona's permissions.

An administrator therefore reads exactly what their own persona may read. An
administrator mapped to a marketing persona cannot open a restricted thread,
and that refusal is audited like any other. An administrator who has not been
assigned a persona can sign in and reach the console, but has no executive
surface to act on.

Onboarding refuses a silent role change: an existing member must be removed
and re-added, so a privilege change is always deliberate and visible.
Configured members (`EXECUTIVE_MEMBER_MAP`) cannot be removed from the UI,
because environment configuration is the recovery path if the table is wrong.

## Consequences

`ADMIN_EMAILS` is a new required setting for a deployment that wants runtime
onboarding. Without it there are no administrators and membership is whatever
`EXECUTIVE_MEMBER_MAP` says — which remains a complete, if manual, way to run
the deployment.

Runtime members live in `ecc_members` and need `DATABASE_URL`. Without a
database they are process-local and vanish on restart; the console says so
rather than implying durability it does not have.

The alternative — a per-user permission matrix — was rejected. It would create
a second authorization system beside the policy engine, and two sources of
truth for "may this person do this" is the shape of the bug that ADR-0003 and
invariant 1 exist to prevent.
