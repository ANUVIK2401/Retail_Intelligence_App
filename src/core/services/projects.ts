import { z } from "zod";
import {
  CreateProjectSchema,
  type CalendarEvent,
  type MemoryEntry,
  type Person,
  type Project,
  type ProjectLink,
} from "@/core/contracts";
import { listVisibleCalendarEvents } from "@/core/services/calendar-management";
import { triageRows, type TriageRow } from "@/core/services/triage";
import { getWorkspace, listMemory, listProposals, listWorkspaces, nextId, recordAudit, store } from "@/core/store";
import { PEOPLE, personById } from "@/data/org";

/**
 * Projects: an executive's own way of grouping email, meetings, people, and
 * notes by initiative. Private to the owner, like workspaces. Linking only
 * ever points at records the owner can already see.
 */

export class ProjectError extends Error {
  readonly status: 400 | 403 | 404;
  constructor(message: string, status: 400 | 403 | 404) {
    super(message);
    this.status = status;
  }
}

export type ProjectSummary = Project & { counts: { emails: number; meetings: number; people: number; notes: number } };

export type ProjectDetail = {
  project: Project;
  overview: { summary: string; openItems: string[] };
  emails: Extract<TriageRow, { redacted: false }>[];
  meetings: (CalendarEvent & { invited: boolean })[];
  people: Pick<Person, "id" | "name" | "title">[];
  notes: { workspaceId: string; title: string; updatedAt: string; context: MemoryEntry[] }[];
};

export function listProjects(actor: Person): ProjectSummary[] {
  return owned(actor).map((project) => ({
    ...project,
    counts: {
      emails: project.emailIds.length,
      meetings: project.eventIds.length,
      people: project.memberIds.length,
      notes: project.workspaceIds.length,
    },
  }));
}

export async function projectDetail(actor: Person, id: string, now = new Date()): Promise<ProjectDetail> {
  const project = ownedOrThrow(actor, id);
  const rows = (await triageRows(actor, now)).filter((row): row is Extract<TriageRow, { redacted: false }> =>
    !row.redacted && project.emailIds.includes(row.id));
  const meetings = listVisibleCalendarEvents(actor.id)
    .filter((event) => project.eventIds.includes(event.eventId))
    .map((event) => ({ ...event, invited: event.ownerId !== actor.id }));
  const notes = project.workspaceIds
    .map((workspaceId) => getWorkspace(workspaceId))
    .filter((workspace) => workspace?.ownerId === actor.id)
    .map((workspace) => ({
      workspaceId: workspace!.id,
      title: workspace!.title,
      updatedAt: workspace!.updatedAt,
      context: listMemory(workspace!.id).filter((entry) => entry.category === "project_context" || entry.category === "saved_decision"),
    }));
  return {
    project,
    overview: overviewFor(project, rows, meetings, now),
    emails: rows,
    meetings,
    people: project.memberIds.map((memberId) => personById(memberId)).filter((person): person is Person => Boolean(person))
      .map(({ id: personId, name, title }) => ({ id: personId, name, title })),
    notes,
  };
}

/**
 * A status summary written from the linked records by rules, so it cannot
 * state anything the records do not. A live model could phrase it better;
 * it could not make it more accurate.
 */
function overviewFor(project: Project, emails: Extract<TriageRow, { redacted: false }>[], meetings: CalendarEvent[], now: Date): ProjectDetail["overview"] {
  const openItems: string[] = [];
  for (const email of emails) {
    if (email.replied) continue;
    if (email.snoozedUntil) openItems.push(`Set aside until later: “${email.subject}”`);
    else if (email.bucket === "needs_me") openItems.push(`Reply to ${email.from}: ${email.summary}`);
  }
  const upcoming = meetings.filter((meeting) => Date.parse(meeting.end) > now.getTime());
  const pendingProposals = listProposals().filter((proposal) =>
    proposal.status === "proposed" && proposal.request.attendeeIds.some((id) => project.memberIds.includes(id)) &&
    proposal.request.purpose.toLowerCase().includes(project.name.split(" ")[0].toLowerCase()));
  if (pendingProposals.length) openItems.push(`${pendingProposals.length} meeting option${pendingProposals.length === 1 ? "" : "s"} offered but not yet booked`);
  const next = upcoming[0];
  const parts = [
    `${project.memberIds.length} ${project.memberIds.length === 1 ? "person" : "people"}`,
    `${emails.length} email${emails.length === 1 ? "" : "s"}`,
    `${upcoming.length} upcoming meeting${upcoming.length === 1 ? "" : "s"}`,
  ];
  const summary = `${project.name} has ${parts.join(", ")}. ${openItems.length ? `${openItems.length} item${openItems.length === 1 ? " needs" : "s need"} you.` : "Nothing is waiting on you."}${next ? ` Next: ${next.subject}.` : ""}`;
  return { summary, openItems };
}

export function createProject(actor: Person, input: unknown): Project {
  const parsed = CreateProjectSchema.safeParse(input);
  if (!parsed.success) throw new ProjectError("Give the project a name of 2 to 80 characters.", 400);
  const members = parsed.data.memberIds.filter((id) => validPerson(id));
  const project: Project = {
    id: nextId("pr"), ownerId: actor.id, name: parsed.data.name, description: parsed.data.description,
    color: parsed.data.color, type: parsed.data.type, status: "active", createdAt: new Date().toISOString(),
    memberIds: [...new Set(members)], emailIds: [], eventIds: [], workspaceIds: [],
    keywords: keywordsFrom(parsed.data.name),
  };
  store.projects = new Map(store.projects).set(project.id, project);
  audit(actor, "project.created", project.id, `Project ${project.id} created.`);
  return project;
}

/** Manual "Add to project", and accepting a suggestion. Validates that the owner can see what is linked. */
export async function linkToProject(actor: Person, projectId: string, link: ProjectLink): Promise<Project> {
  const project = ownedOrThrow(actor, projectId);
  if (link.op === "add") await assertLinkable(actor, link);
  const key = ({ email: "emailIds", event: "eventIds", person: "memberIds", workspace: "workspaceIds" } as const)[link.kind];
  const current = project[key];
  const nextIds = link.op === "add" ? [...new Set([...current, link.id])] : current.filter((id) => id !== link.id);
  const updated: Project = { ...project, [key]: nextIds };
  // An email belongs to one project at a time, so filing it here unfiles it elsewhere.
  const others = link.op === "add" && link.kind === "email"
    ? owned(actor).filter((other) => other.id !== projectId && other.emailIds.includes(link.id))
      .map((other) => ({ ...other, emailIds: other.emailIds.filter((id) => id !== link.id) }))
    : [];
  const next = new Map(store.projects).set(updated.id, updated);
  for (const other of others) next.set(other.id, other);
  store.projects = next;
  audit(actor, `project.${link.op === "add" ? "linked" : "unlinked"}`, projectId, `${link.kind} ${link.id} ${link.op === "add" ? "added to" : "removed from"} project ${projectId}.`);
  return updated;
}

/** Finds a project named in a sentence: "the denim launch", "remodel pilot team". */
export function projectMentioned(actor: Person, text: string): Project | null {
  const lower = text.toLowerCase();
  let best: { project: Project; hits: number } | null = null;
  for (const project of owned(actor)) {
    const words = project.name.toLowerCase().split(/\s+/).filter((word) => word.length >= 4 && !["weekly", "launch", "season", "region", "west"].includes(word));
    const hits = words.filter((word) => lower.includes(word)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { project, hits };
  }
  return best?.project ?? null;
}

function owned(actor: Person): Project[] {
  return [...store.projects.values()].filter((project) => project.ownerId === actor.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function ownedOrThrow(actor: Person, id: string): Project {
  const project = store.projects.get(id);
  // Same answer whether the project is missing or someone else's.
  if (!project || project.ownerId !== actor.id) throw new ProjectError("Project not found.", 404);
  return project;
}

async function assertLinkable(actor: Person, link: ProjectLink): Promise<void> {
  if (link.kind === "person") {
    if (!validPerson(link.id)) throw new ProjectError("Choose someone from the directory.", 400);
    return;
  }
  if (link.kind === "workspace") {
    if (!listWorkspaces(actor.id).some((workspace) => workspace.id === link.id)) throw new ProjectError("Notes not found.", 404);
    return;
  }
  if (link.kind === "event") {
    if (!listVisibleCalendarEvents(actor.id).some((event) => event.eventId === link.id)) throw new ProjectError("Meeting not found.", 404);
    return;
  }
  const row = (await triageRows(actor)).find((candidate) => candidate.id === link.id);
  if (!row || row.redacted) throw new ProjectError("Message not found.", 404);
}

function validPerson(id: string): boolean {
  return z.string().max(40).safeParse(id).success && PEOPLE.some((person) => person.id === id && person.function !== "external");
}

function keywordsFrom(name: string): string[] {
  return name.toLowerCase().split(/\s+/).filter((word) => word.length >= 5);
}

function audit(actor: Person, action: string, resourceId: string, detail: string): void {
  recordAudit({
    correlationId: nextId("cor"), actorId: actor.id, actorRole: actor.roles[0] ?? "executive", action,
    resourceType: "project", resourceId, outcome: "completed", risk: "low", policyVersion: "n/a",
    matchedRules: [], aiModel: null, promptVersion: null, detail,
  });
}
