import assert from "node:assert/strict";
import { test } from "node:test";
import { RISK_ORDER } from "../src/core/contracts/index.ts";
import { SurfaceSignalProvider } from "../src/core/ai/providers/surface.ts";
import { fuse, runMode } from "../src/core/services/evaluate.ts";
import { EVAL_SET } from "../src/data/eval-set.ts";

test("the evaluation set is large enough and fully labelled", () => {
  assert.ok(EVAL_SET.length >= 60, `expected 60+ cases, got ${EVAL_SET.length}`);
  const ids = new Set(EVAL_SET.map((c) => c.id));
  assert.equal(ids.size, EVAL_SET.length, "case ids must be unique");
  for (const c of EVAL_SET) {
    assert.ok(c.note.length > 0, `${c.id} needs a note`);
    assert.ok(c.body.length > 20, `${c.id} needs a real body`);
  }
});

test("every hard family the client asked about is represented", () => {
  for (const family of ["buried_crisis", "fraud_approval", "casual_legal", "urgent_promo"]) {
    const n = EVAL_SET.filter((c) => c.family === family).length;
    assert.ok(n >= 5, `family ${family} has only ${n} cases`);
  }
});

test("fusion never rates below either layer alone", () => {
  const levels = ["low", "medium", "high", "restricted"] as const;
  for (const a of levels) {
    for (const b of levels) {
      const out = fuse({ level: a, topic: "unknown" }, { level: b, topic: "unknown" });
      assert.ok(
        RISK_ORDER[out.level] >= Math.max(RISK_ORDER[a], RISK_ORDER[b]),
        `fuse(${a}, ${b}) produced ${out.level}`,
      );
    }
  }
});

test("the shipped configuration has no false-safes on this set", async () => {
  const report = await runMode("fused", { provider: new SurfaceSignalProvider() });
  assert.equal(
    report.falseSafeCount,
    0,
    `false-safes: ${report.falseSafeIds.join(", ")}`,
  );
});

test("the rules layer catches what surface reading misses", async () => {
  const provider = new SurfaceSignalProvider();
  const model = await runMode("model", { provider });
  const fused = await runMode("fused", { provider });
  assert.ok(
    fused.falseSafeCount < model.falseSafeCount,
    "fusion must strictly improve on the model arm, or the rules layer is doing nothing",
  );
});

test("a legal threat phrased casually is still high", async () => {
  const report = await runMode("fused", { provider: new SurfaceSignalProvider() });
  for (const id of ["ev_060", "ev_124", "ev_063"]) {
    const c = report.cases.find((x) => x.id === id);
    assert.ok(c, `${id} missing from the run`);
    assert.ok(
      RISK_ORDER[c.actualLevel] >= RISK_ORDER.high,
      `${id} was rated ${c.actualLevel}`,
    );
  }
});
