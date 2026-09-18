## What changed

<!-- One or two sentences. What does this change do, and why? -->

## Invariant check

The nine invariants in `CLAUDE.md` are the things a reviewer should not have to
rediscover. Tick what applies, and say plainly if something does not hold.

- [ ] The model still never decides. `evaluatePolicy()` is the only authority.
- [ ] Deterministic rules still floor the model (`max`, never `min`).
- [ ] Untrusted content is still fenced and treated as data.
- [ ] No consequential action without an approval id.
- [ ] Authorization is re-checked at the approval gate.
- [ ] Free/busy only; `BusyBlock` has no `subject`.
- [ ] Failure still escalates rather than degrading toward permission.
- [ ] Audit lines carry identifiers, never message subjects or bodies.
- [ ] Synthetic data only.

## Verification

- [ ] `npm run build` is clean
- [ ] `npm test` passes
- [ ] `scripts/verify-demo.sh` passes against a running server
- [ ] If this touches risk, policy, connectors, auth, or the gateway, a case
      was added to `verify-demo.sh` — including an adversarial one

## Anything a reviewer should look at closely

<!-- Optional. Name the risky part rather than making them find it. -->
