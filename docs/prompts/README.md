# Prompt pack

## How this works

Three pieces, and the order matters:

1. **`/CLAUDE.md`** — the constitution. Loaded automatically by Claude Code in
   this repo. It holds the invariants, the dependency direction, and the
   conventions. Nothing below repeats them.
2. **`PROMPT-PACK.md`** — the build prompts, `B0`–`B12`. One prompt, one
   session, one coherent unit of work. They assume the constitution.
3. **`REVIEW-PROMPTS.md`** — `R1`–`R4`. Run these *against* work the build
   prompts produced, in a session that did not produce it.

The reason for splitting build from review: a session that just wrote the policy
engine is the worst possible reviewer of that policy engine. It will confirm its
own assumptions. Start a fresh session for `R1`–`R4`.

## Rules for running them

- **One prompt per session.** Two prompts in one session produces code that
  bleeds concerns across module boundaries.
- **Paste the prompt verbatim.** They are written to be self-contained. Adding
  "and also could you..." is how scope creep enters.
- **Finish with the definition of done** in `CLAUDE.md` before moving to the
  next prompt. A failing build carried into the next prompt compounds.
- **`B0`–`B10` and `B12` are already done** in this repository. They are kept so the build
  is reproducible from scratch and so the professor can see the method, not just
  the output.

## Status

| Prompt | Scope | Status |
|---|---|---|
| B0 | Repo, config, constitution | done |
| B1 | Contracts and synthetic data | done |
| B2 | Deterministic risk engine | done |
| B3 | Policy engine | done |
| B4 | AI gateway and adapters | done |
| B5 | Connectors, store, approvals, audit | done |
| B6 | Assessment and scheduling services | done |
| B7 | API routes and responsive UI | done |
| B8 | Insights retrieval, for real | done |
| B9 | Workspace persistence | done |
| B10 | Publishing checks, for real | done |
| B11 | Microsoft Graph adapters | blocked on tenant |
| B12 | Evaluation harness | done |
| R1 | Adversarial review | run before the demo |
| R2 | Security review | run before the demo |
| R3 | Policy review with the professor | run before the demo |
| R4 | Demo rehearsal | run before the demo |
