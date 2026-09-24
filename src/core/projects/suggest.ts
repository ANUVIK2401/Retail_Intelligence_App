import type { EmailMessage, Project } from "@/core/contracts";

/**
 * Which project a new email probably belongs to.
 *
 * Deterministic and explainable on purpose: the executive sees why it was
 * suggested and accepts with one tap. Nothing is ever filed silently.
 */
export type ProjectSuggestion = { projectId: string; projectName: string; reason: string; score: number };

const MIN_SCORE = 3;

export function suggestProject(email: Pick<EmailMessage, "subject" | "body" | "fromId" | "toIds">, projects: readonly Project[], nameOf: (id: string) => string = (id) => id): ProjectSuggestion | null {
  const subject = email.subject.toLowerCase();
  const body = email.body.toLowerCase();
  let best: ProjectSuggestion | null = null;
  for (const project of projects) {
    if (project.status === "done") continue;
    const reasons: string[] = [];
    let score = 0;
    // A member writing is a hint, not enough on its own: the store VP's fire
    // report is not about the remodel pilot just because she is on it.
    if (project.memberIds.includes(email.fromId)) {
      score += 2;
      reasons.push(`${nameOf(email.fromId)} is on this project`);
    }
    const hits = project.keywords.filter((keyword) => subject.includes(keyword) || body.includes(keyword));
    for (const keyword of hits) score += subject.includes(keyword) ? 2 : 1;
    if (hits.length) reasons.push(`mentions “${hits[0].trim()}”`);
    if (score >= MIN_SCORE && (!best || score > best.score)) {
      best = { projectId: project.id, projectName: project.name, reason: capitalize(reasons.join("; ")), score };
    }
  }
  return best;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
