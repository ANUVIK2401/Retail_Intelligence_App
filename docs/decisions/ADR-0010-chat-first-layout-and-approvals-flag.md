# ADR-0010: Chat is the center; the Approvals queue is behind a flag

**Status:** accepted · **Date:** 2026-09-24

## Context

The Sept 23 review asked for a familiar GPT-style interface with chat in the
center, a name without military overtones, and fewer tooling-flavored pages in
the executive's daily view. It also questioned whether a separate Approvals
queue belongs in the prototype before PacSun's executive workflows are known.

## Decision

- `/` is the conversation. The old overview becomes the collapsible **Today**
  panel beside it (column on wide screens, slide-over on tablets, bottom sheet
  on phones). The right-rail chat on every page is removed; other pages get an
  **Ask** button that opens the chat with a prefilled question.
- Assistant replies are typed parts (`ChatPartSchema`), so a reply can carry a
  time picker, email cards, or a booking confirmation. Parts describe; they
  never authorize.
- The separate Approvals queue is shown only with `FEATURE_APPROVALS=true`
  (default off). With it off, confirmation happens inline where the action is:
  Book on the confirmation card, Send in the reply panel. `evaluatePolicy()`,
  approval records, approval ids on every write, and the audit trail are the
  same in both modes.
- The product name is one constant in `src/config/product.ts`.

## Consequences

Hiding the queue does not weaken a control: anything that needs a second
person (a finance release, an assistant-routed meeting, a legal review) still
waits for that person, who confirms with their own account. What changes is
where the executive sees it. If the client wants the queue back, it is one
environment variable.
