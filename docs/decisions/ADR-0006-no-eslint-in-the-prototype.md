# ADR-0006 — `lint` runs typecheck and tests, not ESLint

**Date:** 2026-09-17
**Status:** accepted

## Context

`npm run lint` ran `next lint`, which Next 16 removed. The command failed with
"Invalid project directory provided, no such directory: .../lint", which an
end-to-end review reported as a broken script and which a pre-push hook then
blocked a push on.

The repository has no ESLint dependency and no ESLint configuration.

## Decision

`lint` runs `tsc --noEmit` followed by the unit suite.

ESLint is not added. The constitution requires a decision record for every new
runtime dependency, and the case for this one is weak in a prototype whose
correctness argument rests on the policy engine, the risk rules, and
`scripts/verify-demo.sh` rather than on style enforcement. TypeScript in strict
mode already catches the class of error that matters here — the signature
change to `exportForHuman()` was caught by the compiler, not by a linter.

## Consequences

- `npm run lint` is honest about what it checks, and the pre-push hook passes.
- Style drift is not caught automatically. With a single author and small
  files this is acceptable; it would not be on a team.
- If the client's engineering team owns this code, adding ESLint with their
  house configuration is a small, self-contained change and supersedes this
  record.
