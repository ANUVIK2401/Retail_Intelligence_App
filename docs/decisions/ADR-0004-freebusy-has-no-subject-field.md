# ADR-0004 — Free/busy carries no subject field

**Status:** accepted · **Date:** 2026-09-16

## Context

From the 8 September discussion: "I don't want the CEO's calendar suddenly
accessible to a hundred executives where normally they will not be."

Microsoft Graph's `getSchedule` returns availability and supports richer calls
that return event details. The least-privileged permission for availability is
`Calendars.ReadBasic`.

## Decision

`BusyBlock` in the contracts has `personId`, `start`, `end`, and `status`, and
no `subject`, `attendees`, or `location`. The synthetic fixtures contain no
meeting titles at all, so there is nothing to leak in the demo. The Graph mapper
in B11 must drop everything that is not availability.

`calendar.read_details` exists as a separate action and is denied to anyone who
is not the owner or an explicit delegate.

## Consequences

A calendar-title leak through the scheduling path would require adding a field
to a shared contract, which fails type-check and is visible in review. The
guarantee is enforced by the type system rather than by care.

Scheduling quality drops slightly. The ranker cannot tell a board meeting from a
lunch, so it cannot prefer to interrupt the lunch. Acceptable: `tentative`
status carries most of that signal, and the privacy property is worth more to
this client than marginal ranking.

## Rejected

*Fetch details and redact before display.* The content would already be inside
the process, in memory, in logs on a bad day, and in model context. Redaction at
the display layer is not a privacy boundary.

*Make it configurable.* A control the client can switch off is a control an
attacker or a mistake can switch off. This one is an invariant.
