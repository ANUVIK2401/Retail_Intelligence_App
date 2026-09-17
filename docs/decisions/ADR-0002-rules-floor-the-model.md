# ADR-0002 — Deterministic rules floor the model and cannot be overridden by it

**Status:** accepted · **Date:** 2026-09-16

## Context

Prof. Lee's central requirement, from the 8 September discussion: a store fire
with injured employees, a legal threat, or an acquisition approach must not be
handled autonomously, and "we need a way of not having the AI go rogue."

A prompt instructing a model to escalate such cases is not a way. It is a
request, subject to the model's judgment, to prompt injection, to a provider
change, and to a bad day.

## Decision

Risk is computed twice. Deterministic pattern rules run first, before any model
sees the content, and produce a floor. The model runs second and produces its
own assessment. The two are fused with `max()`.

The model may raise risk. It may never lower it. Where the rules came in higher,
`escalatedByRule` is set and the interface shows both numbers.

## Consequences

The safety claim becomes structural. It survives a swapped provider, a
successful prompt injection, and a model that is simply wrong. "Simulate a
compromised model" in the Control Center demonstrates this: the classification
changes, the outcome does not.

The cost is false positives. Pattern rules fire on words, so a message
mentioning a fire drill rates high. This is the correct direction to be wrong
in, and B12 measures the rate so the client can see it rather than discover it.

Rules need maintenance. They encode a vocabulary, and vocabulary drifts. They
are versioned and audited, and every rule that fired is shown alongside the
decision so a wrong one is visible rather than mysterious.

## Rejected

*Trust the model with a strong system prompt.* Prompt injection defeats it, and
more importantly it cannot be shown to a client. There is nothing to point at.

*Rules only.* Loses summarization, entity extraction, and any handling of
phrasing the vocabulary does not cover. The model earns its place; it just does
not get the last word.
