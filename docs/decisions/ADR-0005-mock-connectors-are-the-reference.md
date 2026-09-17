# ADR-0005 — Mock connectors are the behavioural reference, not a placeholder

**Status:** accepted · **Date:** 2026-09-16

## Context

No Microsoft 365 test tenant exists yet, and none will before the client
meeting. The usual response is to stub the connectors and treat the stubs as
throwaway.

## Decision

The mock connectors are a maintained, permanent part of the system. They
implement the full interface including the approval-id gate, they back the demo
and the whole test suite, and they define the behaviour the Graph adapters must
match.

`scripts/verify-demo.sh` must pass against both implementations with only an
environment variable changed.

## Consequences

The demo runs offline, on any laptop, with no tenant, no network, and no API
key. For a recorded walkthrough that Ben can forward, that removes every failure
mode that is not our code.

The test suite keeps working after B11, because it tests behaviour rather than
Graph. A Graph adapter that diverges fails the same verification suite.

Development does not block on IT. The client's security review can happen on its
own schedule while the product keeps moving.

The cost is drift risk: a mock can quietly stop resembling the real thing.
Mitigated by requiring the same suite to pass against both, and by keeping the
mocks strict — they throw on a missing approval id rather than shrugging.

## Rejected

*Wait for a tenant.* Puts the meeting date at the mercy of somebody else's
access-request queue.

*Record real Graph traffic and replay it.* Better fidelity, but it requires the
tenant we do not have, and it would bring real data into the repository, which
ADR-0001's synthetic-data-only rule forbids.
