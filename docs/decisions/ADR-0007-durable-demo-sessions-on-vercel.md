# ADR-0007 — Durable demo sessions on Vercel

**Status:** accepted for Vercel deployment · **Date:** 2026-09-17

## Context

ADR-0001 selected process-local state for an offline, single-process prototype.
Vercel route requests can run in separate function instances, so an approval
created by one request may not exist when the next request reaches another.
This makes the multi-step demo unreliable even when a local production build
and a single-instance smoke test pass.

## Decision

Use a Postgres row per opaque demo-session cookie on Vercel. Each request locks
its session row, runs the handler, and commits the state and simulated connector
effects together. A failed handler rolls the transaction back. No live
executive data may be entered. The default AI provider is deterministic mock
output. The original shared-password access decision was superseded by
ADR-0008's mapped Google sign-in.

The session expires 24 hours after creation; expired rows are removed by a
best-effort hourly cleanup on subsequent requests. Database backups, provider
retention, and deletion guarantees are governed separately by the chosen
Postgres service. Do not use this prototype for real executive data without a
reviewed retention policy and proper identity/authorization design.

Local development can continue to use process memory. Production outside
Vercel may opt into memory explicitly only when operated as a single instance;
Vercel never falls back to process memory when the database is unavailable.

## Consequences

This supersedes ADR-0001's no-data-at-rest and in-memory-only properties for
the Vercel deployment. The demo now depends on a pooled `DATABASE_URL` and
database availability. ADR-0008 supersedes the original shared-password gate
with mapped Google executive sign-in.
State can survive function cold starts, but it is stored at rest for up to the
service's backup retention period. The prototype's synthetic-only boundary is
therefore mandatory. The single session row serializes concurrent requests,
preventing two approvals from executing the same mock action.

## Verification

`npm ci`, `npm run build`, and `npm test` verify the source build. The
localhost-only `AUTH_MODE=demo` development server exercises the 115 HTTP
checks, but does not prove cross-instance durability or Google sign-in. On the
deployed URL, check `/api/health` for `durable: true`, sign in as a mapped
member, and repeat the approval flow while routing successive requests to
different function instances where the hosting platform permits that test.
