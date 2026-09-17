import type { RiskLevel, Topic } from "@/core/contracts";

/**
 * Deterministic risk rules.
 *
 * These run BEFORE the model and their result is a floor, never a ceiling.
 * A model may raise risk above what the rules found; it can never lower it.
 * This is the mechanism that makes "the AI cannot go rogue" a property of the
 * system rather than a property of the prompt.
 */

export type RiskRule = {
  id: string;
  label: string;
  /** Minimum risk level this rule imposes when it matches. */
  floor: RiskLevel;
  topic: Topic;
  reason: string;
  /** Matched against subject + body, lowercased. */
  patterns: RegExp[];
  /** When true, matching also requires the sender to be external. */
  externalOnly?: boolean;
};

export const RISK_RULES: RiskRule[] = [
  {
    id: "R-CRISIS-SAFETY",
    label: "Life safety or physical incident",
    floor: "high",
    topic: "crisis_incident",
    reason:
      "Message reports a physical incident or injury. Incidents affecting people require senior executive and crisis-team handling.",
    patterns: [
      /\bfire\b/i,
      /\binjur(y|ed|ies)\b/i,
      /\bhospital(ized)?\b/i,
      /\bevacuat(e|ed|ion)\b/i,
      /\bfatal(ity|ities)?\b/i,
      /\bambulance\b/i,
      /\bearthquake\b/i,
      /\bactive shooter\b/i,
      /\bemergency\b/i,
      /\bosha\b/i,
    ],
  },
  {
    id: "R-LEGAL",
    label: "Legal exposure",
    floor: "high",
    topic: "legal_matter",
    reason:
      "Message concerns legal exposure. Legal matters are routed to counsel and are never answered automatically.",
    patterns: [
      /\bdemand letter\b/i,
      /\bsubpoena\b/i,
      /\blitigation\b/i,
      /\blawsuit\b/i,
      /\bclass (action|claim)\b/i,
      /\boutside counsel\b/i,
      /\bregulator(y|s)?\b/i,
      /\battorney general\b/i,
      /\bcease and desist\b/i,
      /\bprivileged\b/i,
      // Found by the evaluation harness: a threatened claim is routinely
      // described without any of the nouns above ("their counsel is preparing
      // a claim", "a law firm says they intend to file"). Those cases were
      // rated low until these patterns were added. See docs/EVALUATION.md.
      /\b(law firm|counsel|attorney|lawyer)\b[^.]{0,80}\b(claim|file|filing|suit|action|proceedings?)\b/i,
      /\b(claim|suit|action|proceedings?)\b[^.]{0,60}\b(against us|on behalf of)\b/i,
      /\bintend(s|ing)? to (file|sue|pursue)\b/i,
      /\blegal (action|claim|notice)\b/i,
      /\bprocess server\b/i,
    ],
  },
  {
    id: "R-MEDIA",
    label: "Media or public exposure",
    floor: "high",
    topic: "media_inquiry",
    reason:
      "Message involves press or public statements. External statements require communications review.",
    patterns: [
      /\bjournalist\b/i,
      /\breporter\b/i,
      /\bnews crew\b/i,
      /\bpress (inquiry|statement|release)\b/i,
      /\bmedia (inquiry|request)\b/i,
      /\bholding statement\b/i,
      /\bon the record\b/i,
    ],
  },
  {
    id: "R-MNPI",
    label: "Material non-public information",
    floor: "restricted",
    topic: "confidential_strategy",
    reason:
      "Message concerns a transaction or strategy matter. Access is limited to a named group and no automated handling is permitted.",
    patterns: [
      /\bacquisition\b/i,
      /\bmerger\b/i,
      /\btake-?private\b/i,
      /\btender offer\b/i,
      /\bindication of interest\b/i,
      /\bletter of intent\b/i,
      /\bdue diligence\b/i,
      /\bmaterial non-?public\b/i,
      /\bexclusivity\b/i,
      /\bdivestiture\b/i,
    ],
  },
  {
    id: "R-FINANCIAL",
    label: "Financial commitment requested",
    floor: "medium",
    topic: "financial_approval",
    reason:
      "Message requests a financial commitment. Spending decisions require an explicit human approval.",
    patterns: [
      /\bapprov(e|al)\b/i,
      /\bsign-?off\b/i,
      /\bbudget\b/i,
      /\bpurchase order\b/i,
      /\binvoice\b/i,
      /\bwire (transfer|payment)?\b/i,
      /\bremit\b/i,
      /\$\s?[\d,]{3,}/,
    ],
  },
  {
    id: "R-PAYMENT-EXTERNAL",
    label: "External payment instruction",
    floor: "high",
    topic: "financial_approval",
    reason:
      "An external sender is requesting payment or new remittance details. This is the standard shape of an invoice-fraud attempt and is never handled automatically.",
    externalOnly: true,
    patterns: [
      /\bwire\b/i,
      /\bremit\b/i,
      /\bupdated (account|bank|remittance)\b/i,
      /\bpast due\b/i,
      /\bbank details\b/i,
    ],
  },
  {
    id: "R-SCHEDULING",
    label: "Scheduling coordination",
    floor: "low",
    topic: "scheduling",
    reason: "Message is a scheduling request and can be handled as routine coordination.",
    patterns: [
      /\b(schedule|reschedul\w+)\b/i,
      /\bcalendar\b/i,
      /\bavailabilit(y|ies)\b/i,
      /\b\d{1,2}\s?(minutes|min)\b/i,
      /\b1:1\b/i,
      /\bmove our\b/i,
    ],
  },
  {
    id: "R-PROMO",
    label: "Promotional content",
    floor: "low",
    topic: "promotional",
    reason: "Message is promotional and requires no executive attention.",
    patterns: [
      /\bunsubscribe\b/i,
      /\bearly-?bird\b/i,
      /\bregister (now|today)\b/i,
      /\bwebinar\b/i,
      /\bsave \d+%/i,
      /\blast chance\b/i,
    ],
  },
  {
    id: "R-EXTERNAL-COMMS",
    label: "External publication",
    floor: "medium",
    topic: "external_communication",
    reason:
      "Message concerns content intended for external publication and requires a review chain.",
    patterns: [
      /\blinkedin\b/i,
      /\bsubstack\b/i,
      /\binstagram\b/i,
      /\bpost (draft|copy)\b/i,
      /\bdraft (linkedin|post)\b/i,
      /\bpublish\b/i,
    ],
  },
];

/**
 * Patterns that indicate untrusted content is attempting to steer the
 * assistant. A match never lowers risk; it raises it and flags the message.
 */
export const INJECTION_PATTERNS: RegExp[] = [
  // The determiner is optional and unconstrained on purpose: "ignore the
  // previous instructions" and "ignore all prior checks" are the same attack,
  // and pinning the wording to "all" let the first form through.
  /ignore (all |the |any )?(previous|prior|above|earlier) (instructions?|checks?|rules?|steps?)/i,
  /disregard (all |the |any |your )?(previous|prior|above|earlier)? ?(instructions?|policy|rules?|checks?)/i,
  /system (note|prompt|message) (for|to) (the )?[a-z ]{0,20}(assistant|ai|model|tool|system|review|checker)/i,
  /mark (every|all|the) checks? as (passed|clear)/i,
  /(route|send|post) (this |it )?(directly |straight )?to (export|publication|publish)/i,
  /already (been )?approved by (legal|communications|comms|the (ceo|executive))/i,
  /you are now\b/i,
  /pre-?approved by the (ceo|executive|user)/i,
  /without (requesting|needing) (human )?approval/i,
  /do not mention (these|this|the) instructions?/i,
  /classify (it|this) as ["']?(low|routine)/i,
  /send it immediately/i,
  /\bnew instructions?:/i,
];

export type DeterministicResult = {
  floor: RiskLevel;
  topic: Topic;
  reasons: string[];
  triggeredRules: string[];
  injectionSuspected: boolean;
};

const ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  restricted: 3,
};

/**
 * Evaluate every rule against the message. Highest floor wins; the topic
 * comes from the rule that set that floor.
 */
export function evaluateDeterministicRisk(input: {
  subject: string;
  body: string;
  senderIsExternal: boolean;
}): DeterministicResult {
  const haystack = `${input.subject}\n${input.body}`;

  let floor: RiskLevel = "low";
  let topic: Topic = "unknown";
  const reasons: string[] = [];
  const triggeredRules: string[] = [];

  for (const rule of RISK_RULES) {
    if (rule.externalOnly && !input.senderIsExternal) continue;
    const hit = rule.patterns.some((p) => p.test(haystack));
    if (!hit) continue;

    triggeredRules.push(rule.id);
    reasons.push(rule.reason);

    if (ORDER[rule.floor] > ORDER[floor]) {
      floor = rule.floor;
      topic = rule.topic;
    } else if (ORDER[rule.floor] === ORDER[floor] && topic === "unknown") {
      topic = rule.topic;
    }
  }

  const injectionSuspected = INJECTION_PATTERNS.some((p) => p.test(haystack));
  if (injectionSuspected) {
    triggeredRules.push("R-INJECTION");
    reasons.unshift(
      "The message body contains instructions addressed to the assistant. Content from senders is treated as data, never as instructions, and a message that attempts to alter handling is escalated rather than followed.",
    );
    if (ORDER["high"] > ORDER[floor]) {
      floor = "high";
      if (topic === "unknown") topic = "unknown";
    }
  }

  if (topic === "unknown" && triggeredRules.length === 0) {
    reasons.push("No risk rule matched. Treated as routine pending model review.");
  }

  return { floor, topic, reasons, triggeredRules, injectionSuspected };
}
