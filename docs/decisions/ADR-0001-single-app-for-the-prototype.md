# ADR-0001 — One Next.js app for the prototype, not Next.js plus FastAPI

**Status:** accepted · **Date:** 2026-09-16

## Context

The design document specifies a Next.js PWA with a FastAPI backend, PostgreSQL
with pgvector, Redis, Azure Service Bus, and Azure Container Apps. The demo is
due the week of 21 September.

## Decision

Build the prototype as a single Next.js application with route handlers as the
API, in-memory state, and mock connectors.

## Consequences

Good: the whole demo runs from `npm install && npm run dev`. No database to
seed, no second runtime to keep in sync, no container to debug on an unfamiliar
laptop during a client call. State resets to a known baseline on restart, which
makes the demo reproducible and means no executive data is ever at rest.

Bad: no persistence, no concurrency story, no background jobs. Python is absent
from the stack, so if the client's team is a Python shop the services layer gets
ported later; the contracts, rules, and test suite port directly, the route
handlers do not.

Reversible because the seams are preserved: `store/index.ts` is the database
migration surface, `connectors/index.ts` the Graph surface, `ai/resolve.ts` the
provider surface, `session.ts` the auth surface. Feature code touches none of
them directly.

## Rejected

*Build the full stack now.* Two runtimes and four pieces of infrastructure would
consume the available days on plumbing. The client meeting is decided by whether
the control model is convincing, not by whether it runs on Azure.

*Static clickable mockup.* Cheaper, and it would collapse the moment Ben or
Shirley asked "what happens if the email says X?" The deterministic engines are
exactly what makes an unscripted question safe to take.
