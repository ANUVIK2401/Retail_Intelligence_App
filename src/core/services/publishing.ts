import { INJECTION_PATTERNS } from "@/core/risk/rules";
import type { ReviewerDomain } from "@/core/contracts";

/**
 * Pre-publication check pipeline.
 *
 * Two properties this module has to keep true, and both are structural rather
 * than promised:
 *
 * 1. The review chain is DERIVED from which checks failed. No model chooses
 *    reviewers, and no caller may pass a chain in. `deriveReviewChain()` takes
 *    check results and nothing else.
 * 2. There is no publish function. Not a disabled one, not one behind a flag.
 *    The terminal operation is `exportForHuman()`, which returns a file for a
 *    person to post. Adding a network call here would be a new function and a
 *    visible diff, which is the point.
 */

export const CHECK_VERSION = "2026-09-16.c1";

export type CheckName =
  | "confidentiality"
  | "regulated_claims"
  | "brand_voice"
  | "mnpi";

export type CheckResult = {
  name: CheckName;
  label: string;
  passed: boolean;
  /** Severity decides whether a failure blocks or adds a reviewer. */
  severity: "advisory" | "review" | "block";
  detail: string;
  /** Exact spans that caused the failure, for the reviewer to look at. */
  findings: string[];
};

export type ReviewStep = {
  kind: "reviewer" | "executive";
  reviewerDomain: ReviewerDomain | null;
  label: string;
  /** Which failed check put this step in the chain. Empty for the baseline. */
  becauseOf: CheckName[];
};

export type PublicationReview = {
  checks: CheckResult[];
  chain: ReviewStep[];
  /** True when a block-severity check failed. No chain can clear a block. */
  blocked: boolean;
  blockedReason: string | null;
  checkVersion: string;
};

/* ------------------------------------------------------------------ */
/* Vocabularies                                                        */
/* ------------------------------------------------------------------ */

/**
 * Restricted internal topics. A public post naming one of these is a
 * confidentiality failure regardless of how it is phrased.
 */
const RESTRICTED_TOPICS: { term: RegExp; label: string }[] = [
  { term: /\bstore[- ]level (sales|data|numbers)\b/i, label: "store-level data" },
  { term: /\bsupplier (name|list|contract)\b/i, label: "supplier detail" },
  { term: /\bunit econom(ic|ics)\b/i, label: "unit economics" },
  { term: /\bvendor (pricing|terms)\b/i, label: "vendor terms" },
  { term: /\blayoff|\bredundanc(y|ies)\b/i, label: "workforce reduction" },
  { term: /\bstore closure(s)?\b/i, label: "store closures" },
];

/** Figures that have not been released are the common accidental leak. */
const UNRELEASED_FIGURE_PATTERNS: RegExp[] = [
  /\b(unreleased|unpublished|not yet (announced|released|public)|pre-?release|internal only|confidential)\b[^.]{0,60}/i,
  /\b(q[1-4]|quarter(ly)?|fy\s?\d{2,4})\s+(revenue|ebitda|margin|comps?|guidance|earnings)\b[^.]{0,40}/i,
  /\bcomparable store sales\b[^.]{0,40}/i,
  /\bgross margin\b\s*(expanded|contracted|of)?\s*[\d.]+\s*(basis points|bps|%)/i,
  /\bbasis points\b/i,
];

/** Claims that need substantiation on file before they may be published. */
const REGULATED_CLAIM_PATTERNS: { re: RegExp; why: string }[] = [
  {
    re: /\b\d{1,3}(\.\d+)?\s?%\s?(of\s+)?\w*\s*(recovery|recycled|recyclable|renewable|reduction|emissions|diverted|sustainable)/i,
    why: "environmental performance percentage",
  },
  {
    re: /\b\d{1,3}(\.\d+)?\s?%\b/,
    why: "numeric performance claim",
  },
  {
    re: /\b(first|only|best|largest|leading|number one|#1)\b\s+(in|to|company|retailer|brand)/i,
    why: "superlative market claim",
  },
  {
    re: /\b(carbon[- ]neutral|net[- ]zero|climate[- ]positive|100%\s+sustainable|chemical[- ]free)\b/i,
    why: "regulated sustainability claim",
  },
  {
    re: /\b(guarantee[sd]?|proven to|clinically|certified)\b/i,
    why: "substantiation-bearing assertion",
  },
];

/** Material non-public information. A failure here blocks; it does not route. */
const MNPI_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\b(merger|acquisition|acquire[sd]?|take-?private|tender offer)\b/i, why: "transaction" },
  { re: /\b(letter of intent|indication of interest|due diligence|exclusivity)\b/i, why: "deal process" },
  { re: /\b(guidance|earnings|results)\b[^.]{0,40}\b(raise|lower|revise|beat|miss|ahead of|below)\b/i, why: "guidance change" },
  { re: /\b(material non-?public|inside information|blackout period)\b/i, why: "explicit MNPI reference" },
  { re: /\bdivestiture|\bspin-?off\b/i, why: "structural transaction" },
];

/** Brand voice rules from the Executive Voice Guidelines source. */
const VOICE_RULES: { test: (t: string) => boolean; detail: string }[] = [
  {
    test: (t) => !/\b(i|we|our|my)\b/i.test(t),
    detail: "No first-person voice. Executive posts are written in first person.",
  },
  {
    test: (t) => t.split(/\s+/).length > 400,
    detail: "Longer than 400 words. Executive posts run shorter than this.",
  },
  {
    test: (t) => /\b(synerg|leverage our|best-in-class|paradigm|disrupt the|game[- ]chang)/i.test(t),
    detail: "Contains corporate-release vocabulary rather than executive register.",
  },
  {
    test: (t) => /!{2,}|[A-Z]{6,}/.test(t),
    detail: "Emphatic punctuation or shouting capitals.",
  },
];

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

function collect(text: string, patterns: RegExp[]): string[] {
  const out: string[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) out.push(m[0].trim());
  }
  return [...new Set(out)];
}

export function checkConfidentiality(text: string): CheckResult {
  const topics = RESTRICTED_TOPICS.filter((t) => t.term.test(text)).map((t) => t.label);
  const figures = collect(text, UNRELEASED_FIGURE_PATTERNS);
  const findings = [...topics, ...figures];

  return {
    name: "confidentiality",
    label: "Confidentiality scan",
    passed: findings.length === 0,
    severity: "review",
    detail:
      findings.length === 0
        ? "No restricted topics, unreleased figures, supplier names, or store-level data."
        : `Text references material that has not been released: ${findings.join("; ")}.`,
    findings,
  };
}

export function checkRegulatedClaims(text: string): CheckResult {
  const findings: string[] = [];
  for (const { re, why } of REGULATED_CLAIM_PATTERNS) {
    const m = text.match(re);
    if (m) findings.push(`${m[0].trim()} (${why})`);
  }
  const unique = [...new Set(findings)];

  return {
    name: "regulated_claims",
    label: "Regulated claims",
    passed: unique.length === 0,
    severity: "review",
    detail:
      unique.length === 0
        ? "No substantiation-bearing claims detected."
        : `Substantiation required before publication: ${unique.join("; ")}.`,
    findings: unique,
  };
}

export function checkBrandVoice(text: string): CheckResult {
  const findings = VOICE_RULES.filter((r) => r.test(text)).map((r) => r.detail);
  return {
    name: "brand_voice",
    label: "Brand voice",
    passed: findings.length === 0,
    severity: "advisory",
    detail:
      findings.length === 0
        ? "First-person executive register, consistent with prior posts."
        : findings.join(" "),
    findings,
  };
}

export function checkMnpi(text: string): CheckResult {
  const findings: string[] = [];
  for (const { re, why } of MNPI_PATTERNS) {
    const m = text.match(re);
    if (m) findings.push(`${m[0].trim()} (${why})`);
  }
  const unique = [...new Set(findings)];

  return {
    name: "mnpi",
    label: "Material non-public information",
    passed: unique.length === 0,
    severity: "block",
    detail:
      unique.length === 0
        ? "No transaction, guidance, or earnings content detected."
        : `Material non-public information detected: ${unique.join("; ")}. This cannot be published through any review path.`,
    findings: unique,
  };
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * Runs every check in order. Text that tries to instruct the checker is
 * treated as a confidentiality finding, not as an instruction: the draft is
 * untrusted content like any other document.
 */
export function runChecks(text: string): CheckResult[] {
  const results = [
    checkConfidentiality(text),
    checkRegulatedClaims(text),
    checkBrandVoice(text),
    checkMnpi(text),
  ];

  const injection = INJECTION_PATTERNS.filter((p) => p.test(text)).map(
    (p) => p.source,
  );
  if (injection.length === 0) return results;

  // A draft containing "ignore the previous checks" is not a passing draft.
  // It is a draft that argued with the checker, which is itself a finding.
  return results.map((r) =>
    r.name === "confidentiality"
      ? {
          ...r,
          passed: false,
          detail: `${r.detail} The draft also contains text addressed to the review system rather than to readers, which is treated as content to review, never as an instruction.`,
          findings: [...r.findings, "text attempting to instruct the checker"],
        }
      : r,
  );
}

/**
 * The review chain is a function of the check results and nothing else.
 *
 * There is deliberately no parameter for a caller-supplied chain and no model
 * input. A reviewer appears because a specific check failed, and the step
 * carries which one, so an executive can see why a person was added.
 */
export function deriveReviewChain(checks: CheckResult[]): ReviewStep[] {
  const failed = checks.filter((c) => !c.passed);
  const by = (name: CheckName) => failed.some((c) => c.name === name);

  const chain: ReviewStep[] = [
    {
      kind: "reviewer",
      reviewerDomain: "communications",
      label: "Communications review",
      becauseOf: [],
    },
  ];

  if (by("regulated_claims")) {
    chain.push({
      kind: "reviewer",
      reviewerDomain: "legal",
      label: "Legal review",
      becauseOf: ["regulated_claims"],
    });
  }

  if (by("confidentiality")) {
    chain.push({
      kind: "reviewer",
      reviewerDomain: "security",
      label: "Confidentiality review",
      becauseOf: ["confidentiality"],
    });
  }

  chain.push({
    kind: "executive",
    reviewerDomain: null,
    label: "Executive approval",
    becauseOf: [],
  });

  return chain;
}

export function review(text: string): PublicationReview {
  const checks = runChecks(text);
  const blocking = checks.find((c) => !c.passed && c.severity === "block");

  return {
    checks,
    chain: blocking ? [] : deriveReviewChain(checks),
    blocked: Boolean(blocking),
    blockedReason: blocking ? blocking.detail : null,
    checkVersion: CHECK_VERSION,
  };
}

/* ------------------------------------------------------------------ */
/* Export — the only terminal operation                                */
/* ------------------------------------------------------------------ */

export type ExportedPost = {
  filename: string;
  contentType: "text/plain";
  content: string;
};

/**
 * Produces a file for a human to post. This is the end of the pipeline.
 *
 * There is no counterpart that posts to a platform, and this function returns
 * data rather than performing an effect, so it cannot become one by flipping a
 * flag. Adding a publish path means writing a new function, which shows up in
 * review.
 */
export function exportForHuman(input: {
  channel: string;
  title: string;
  body: string;
  approvedBy: string[];
  review: PublicationReview;
}): ExportedPost {
  if (input.review.blocked) {
    throw new Error(
      "Blocked drafts are not exported. Material non-public information cannot be cleared by any review path.",
    );
  }

  const header = [
    `Channel: ${input.channel}`,
    `Title: ${input.title}`,
    `Approved by: ${input.approvedBy.join(" -> ")}`,
    `Checks: ${input.review.checks.map((c) => `${c.label}=${c.passed ? "pass" : "review"}`).join(", ")}`,
    `Check version: ${input.review.checkVersion}`,
    "",
    "--- post this text manually ---",
    "",
  ].join("\n");

  return {
    filename: `${input.channel}-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}.txt`,
    contentType: "text/plain",
    content: header + input.body,
  };
}
