import type { AIProvider } from "@/core/ai/gateway";
import { MockProvider } from "@/core/ai/providers/mock";
import { RISK_ORDER, type RiskLevel, type Topic } from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import { evaluateDeterministicRisk } from "@/core/risk/rules";
import { EVAL_SET, type EvalCase } from "@/data/eval-set";

/**
 * Evaluation harness.
 *
 * The number that matters here is the FALSE-SAFE RATE: genuinely high-risk
 * messages that the system rated medium or lower. Recall and accuracy are
 * reported because the client will ask for them, but a false-safe is the only
 * error in this system that can cause harm — everything else costs a person
 * thirty seconds of review.
 *
 * Every case is run three ways so the report can show what each layer
 * contributes rather than asserting it:
 *   - rules:  deterministic rules only, no model
 *   - model:  model only, rules removed
 *   - fused:  max(rules, model), which is production
 *
 * `fuse()` below duplicates the two lines of fusion from `assess.ts` rather
 * than importing the whole pipeline, because the pipeline reads a mailbox and
 * writes audit events. If those two lines diverge, the test at the bottom of
 * `tests/evaluate.test.ts` fails.
 */

export type Mode = "rules" | "model" | "fused";

export type CaseResult = {
  id: string;
  family: EvalCase["family"];
  expectedLevel: RiskLevel;
  expectedTopic: Topic;
  actualLevel: RiskLevel;
  actualTopic: Topic;
  expectedOutcome: string;
  actualOutcome: string;
  /** Rated lower than a high-or-above ground truth. The dangerous error. */
  falseSafe: boolean;
  /** Rated higher than ground truth. Costs review time, not safety. */
  overEscalated: boolean;
  topicCorrect: boolean;
  policyAgrees: boolean;
};

export type ModeReport = {
  mode: Mode;
  total: number;
  highRiskTotal: number;
  highRiskRecall: number;
  falseSafeCount: number;
  falseSafeRate: number;
  falseSafeIds: string[];
  overEscalationRate: number;
  topicAccuracy: number;
  policyAgreement: number;
  byFamily: Record<
    string,
    { total: number; highRiskTotal: number; falseSafe: number; recall: number }
  >;
  cases: CaseResult[];
};

const HIGH = RISK_ORDER.high;

/* ------------------------------------------------------------------ */

function rulesOnly(c: EvalCase): { level: RiskLevel; topic: Topic } {
  const det = evaluateDeterministicRisk({
    subject: c.subject,
    body: c.body,
    senderIsExternal: c.senderIsExternal,
  });
  return { level: det.floor, topic: det.topic };
}

async function modelOnly(
  c: EvalCase,
  provider: AIProvider,
): Promise<{ level: RiskLevel; topic: Topic }> {
  const m = await provider.classify({
    subject: c.subject,
    body: c.body,
    senderName: c.senderIsExternal ? "External sender" : "Internal colleague",
    senderIsExternal: c.senderIsExternal,
    recipientTitle: "Chief Executive Officer",
  });
  return { level: m.level, topic: m.topic };
}

/** The production fusion rule: rules floor the model. Never min(). */
export function fuse(
  rules: { level: RiskLevel; topic: Topic },
  model: { level: RiskLevel; topic: Topic },
): { level: RiskLevel; topic: Topic } {
  const level =
    RISK_ORDER[rules.level] >= RISK_ORDER[model.level] ? rules.level : model.level;
  const topic =
    rules.topic !== "unknown" && RISK_ORDER[rules.level] >= RISK_ORDER[model.level]
      ? rules.topic
      : model.topic;
  return { level, topic };
}

/* ------------------------------------------------------------------ */

export async function runMode(
  mode: Mode,
  opts: { provider?: AIProvider; cases?: EvalCase[] } = {},
): Promise<ModeReport> {
  const provider = opts.provider ?? new MockProvider();
  const cases = opts.cases ?? EVAL_SET;
  const results: CaseResult[] = [];

  for (const c of cases) {
    const r = rulesOnly(c);
    const m = mode === "rules" ? null : await modelOnly(c, provider);

    const assessed =
      mode === "rules" ? r : mode === "model" ? m! : fuse(r, m!);

    const decision = evaluatePolicy({
      action: "email.draft",
      actorId: "p_ceo",
      actorRole: "executive",
      resourceOwnerId: "p_ceo",
      risk: assessed.level,
      topic: assessed.topic,
    });

    const expectedIsHigh = RISK_ORDER[c.expectedLevel] >= HIGH;

    results.push({
      id: c.id,
      family: c.family,
      expectedLevel: c.expectedLevel,
      expectedTopic: c.expectedTopic,
      actualLevel: assessed.level,
      actualTopic: assessed.topic,
      expectedOutcome: c.expectedOutcome,
      actualOutcome: decision.outcome,
      falseSafe: expectedIsHigh && RISK_ORDER[assessed.level] < HIGH,
      overEscalated: RISK_ORDER[assessed.level] > RISK_ORDER[c.expectedLevel],
      topicCorrect: assessed.topic === c.expectedTopic,
      policyAgrees: decision.outcome === c.expectedOutcome,
    });
  }

  return summarize(mode, results);
}

function summarize(mode: Mode, cases: CaseResult[]): ModeReport {
  const total = cases.length;
  const high = cases.filter((c) => RISK_ORDER[c.expectedLevel] >= HIGH);
  const caught = high.filter((c) => RISK_ORDER[c.actualLevel] >= HIGH);
  const falseSafe = cases.filter((c) => c.falseSafe);

  const byFamily: ModeReport["byFamily"] = {};
  for (const c of cases) {
    const bucket = (byFamily[c.family] ??= {
      total: 0,
      highRiskTotal: 0,
      falseSafe: 0,
      recall: 0,
    });
    bucket.total += 1;
    if (c.falseSafe) bucket.falseSafe += 1;
  }
  for (const [family, bucket] of Object.entries(byFamily)) {
    const fam = cases.filter(
      (c) => c.family === family && RISK_ORDER[c.expectedLevel] >= HIGH,
    );
    bucket.highRiskTotal = fam.length;
    // 0 rather than 1 when there is nothing to measure; the report prints
    // "n/a" for this case rather than implying a perfect score.
    bucket.recall =
      fam.length === 0
        ? 0
        : fam.filter((c) => RISK_ORDER[c.actualLevel] >= HIGH).length / fam.length;
  }

  return {
    mode,
    total,
    highRiskTotal: high.length,
    highRiskRecall: high.length === 0 ? 1 : caught.length / high.length,
    falseSafeCount: falseSafe.length,
    // Denominator is the genuinely high-risk population: the rate answers
    // "of the messages that could hurt us, how many did we wave through".
    falseSafeRate: high.length === 0 ? 0 : falseSafe.length / high.length,
    falseSafeIds: falseSafe.map((c) => c.id),
    overEscalationRate: cases.filter((c) => c.overEscalated).length / total,
    topicAccuracy: cases.filter((c) => c.topicCorrect).length / total,
    policyAgreement: cases.filter((c) => c.policyAgrees).length / total,
    byFamily,
    cases,
  };
}

export async function runAll(opts: { provider?: AIProvider } = {}): Promise<{
  rules: ModeReport;
  model: ModeReport;
  fused: ModeReport;
}> {
  return {
    rules: await runMode("rules", opts),
    model: await runMode("model", opts),
    fused: await runMode("fused", opts),
  };
}
