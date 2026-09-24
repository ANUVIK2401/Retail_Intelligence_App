# ADR-0012: One data-source seam, and a relational target schema

**Status:** accepted · **Date:** 2026-09-24

## Context

The client runs Office 365 and Claude Enterprise. The prototype reads
synthetic fixtures and stores each member's session as one JSONB row. The next
step toward a real backend has to be visible without building Graph access,
which the constitution rules out for now.

## Decision

- Every read of mail, calendar, and directory goes through
  `connectors()` in `src/core/connectors/resolve.ts`, selected by
  `DATA_SOURCE` (`synthetic` default, `graph` stub). The Graph adapter
  implements the same interfaces, names the Graph call and delegated scope for
  each method, keeps the approval-id refusal on writes, and otherwise fails
  loudly. There is no silent fallback to fixtures.
- `db/migrations` defines the target relational schema, with invariants
  enforced as constraints (no subject on free/busy, approval id required on
  sent replies and assistant-written events, append-only audit, no
  conversation-state memory) and row-level security per acting person.
- `npm run db:migrate` and `npm run db:seed` use the existing `pg` dependency.
  No ORM was added.

## Consequences

Moving services from the session row to these tables is incremental and can be
done one service at a time. Until then the schema is proven by the seed, the
constraint checks, and an RLS check, all recorded in `docs/architecture.md`.
