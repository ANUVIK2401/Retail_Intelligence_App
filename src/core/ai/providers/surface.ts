import type {
  AIProvider,
  Classification,
  ClassifyRequest,
  Draft,
  DraftRequest,
} from "@/core/ai/gateway";

/**
 * Evaluation-only provider that stands in for a capable but unaided model.
 *
 * Why this exists: the offline `MockProvider` computes its answer by calling
 * `evaluateDeterministicRisk`, so running it as the "model only" arm of the
 * evaluation would compare the rules against themselves and report a flattering
 * tie. The contrast the client is asking about would be circular.
 *
 * This provider instead classifies from surface signals the way an unaided
 * model plausibly does: it weights tone, explicit urgency, and the framing the
 * sender chose. That reproduces the real failure mode — a serious fact stated
 * calmly in paragraph three reads as routine, and a promotional message
 * shouting ACT NOW reads as urgent.
 *
 * It is not a claim about how Claude specifically performs. It is a stand-in
 * that makes the rules layer's contribution measurable offline. Replacing it
 * with a live provider is a change to one argument in `scripts/evaluate.ts`.
 */
export class SurfaceSignalProvider implements AIProvider {
  readonly name = "surface-signal";
  readonly model = "surface-signal-eval-v1";

  async classify(req: ClassifyRequest): Promise<Classification> {
    const text = `${req.subject}\n${req.body}`;
    const opening = req.body.split(/(?<=[.!?])\s+/).slice(0, 1).join(" ");

    // Surface urgency: shouting, imperatives, explicit deadlines.
    const shouts = /\b(URGENT|ACTION REQUIRED|IMMEDIATE|FINAL NOTICE)\b/.test(req.subject) ||
      /\bact now\b|\blast chance\b|\bdon'?t miss\b/i.test(text);
    const deadline = /\bby (end of day|eod|five|midnight|today)\b|\btime sensitive\b/i.test(text);

    // Explicit, unmissable severity: only what is stated in the opening or
    // the subject line. A calm mention later in the body is missed, which is
    // the behaviour being measured.
    const loudSevere =
      /\b(emergency|crisis|urgent incident|lawsuit|litigation|subpoena|merger|acquisition)\b/i.test(
        `${req.subject} ${opening}`,
      );

    const transactional = /\b(invoice|payment|wire|remit|purchase order|budget|approval|sign-?off)\b/i.test(text);
    const publication = /\b(linkedin|substack|instagram|publish|post draft)\b/i.test(text);
    const scheduling = /\b(schedule|reschedul|calendar|availabilit|1:1)\b/i.test(text);
    const promotional = /\bunsubscribe\b|\bwebinar\b|\bregister (now|today)\b|\bsave \d+%/i.test(text);

    const instructionAttemptDetected =
      /\b(ignore|disregard)\b[^.]{0,40}\b(instructions?|checks?|policy)\b/i.test(text);

    let level: Classification["level"] = "low";
    let topic: Classification["topic"] = "routine_operations";

    if (promotional) {
      // The characteristic error: urgency language inflates a sales email.
      level = shouts || deadline ? "medium" : "low";
      topic = "promotional";
    } else if (loudSevere) {
      level = /\b(merger|acquisition)\b/i.test(`${req.subject} ${opening}`)
        ? "restricted"
        : "high";
      topic = /\b(lawsuit|litigation|subpoena)\b/i.test(`${req.subject} ${opening}`)
        ? "legal_matter"
        : /\b(merger|acquisition)\b/i.test(`${req.subject} ${opening}`)
          ? "confidential_strategy"
          : "crisis_incident";
    } else if (transactional) {
      level = shouts || deadline ? "medium" : "medium";
      topic = "financial_approval";
    } else if (publication) {
      level = "medium";
      topic = "external_communication";
    } else if (scheduling) {
      level = "low";
      topic = "scheduling";
    }

    return {
      level,
      topic,
      urgency: shouts || deadline ? "today" : level === "low" ? "whenever" : "this_week",
      confidence: 0.7,
      reason:
        "Assessed from the tone, stated urgency, and framing of the message, without company rules.",
      summary: opening.slice(0, 300) || req.subject,
      actionItems: [],
      entities: { people: [], amounts: [], deadlines: [], locations: [] },
      instructionAttemptDetected,
    };
  }

  async draft(req: DraftRequest): Promise<Draft> {
    return {
      body: `Acknowledged. ${req.intent}`,
      tone: "neutral",
      caveats: ["Evaluation-only provider."],
    };
  }
}
