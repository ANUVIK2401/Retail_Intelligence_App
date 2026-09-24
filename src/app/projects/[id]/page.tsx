"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { RiskLevel } from "@/core/contracts";
import { Card, Empty, RiskBadge, relativeTime } from "@/components/primitives";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session";
import { changeProjectLink } from "@/components/projectLinks";

type Detail = {
  project: { id: string; name: string; description: string; color: string; type: string; status: string };
  overview: { summary: string; openItems: string[] };
  emails: { id: string; subject: string; from: string; summary: string; risk: RiskLevel; receivedAt: string; replied: boolean; snoozedUntil: string | null }[];
  meetings: { eventId: string; subject: string; start: string; end: string; invited: boolean; attendeeIds?: string[] }[];
  people: { id: string; name: string; title: string }[];
  notes: { workspaceId: string; title: string; updatedAt: string; context: { id: string; content: string; category: string }[] }[];
};
type Tab = "overview" | "emails" | "meetings" | "people" | "notes";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [notesBusy, setNotesBusy] = useState(false);
  const timezone = session?.actor.timezone ?? "America/Los_Angeles";

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "This project could not be loaded.");
      setDetail(data as Detail);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This project could not be loaded.");
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function unlink(kind: "email" | "event" | "person", target: string) {
    await changeProjectLink(id, { op: "remove", kind, id: target });
    void load();
  }

  /** Notes reuse the Notes workspace; its "Project context" memory is the project's memory. */
  async function openNotes() {
    if (!detail) return;
    setNotesBusy(true);
    try {
      const existing = detail.notes[0];
      if (existing) { router.push(`/workspace?ws=${existing.workspaceId}`); return; }
      const created = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: detail.project.name }) });
      const data = await created.json();
      if (!created.ok) throw new Error(data.error);
      await changeProjectLink(id, { op: "add", kind: "workspace", id: data.workspace.id });
      router.push(`/workspace?ws=${data.workspace.id}`);
    } catch {
      setError("Notes could not be opened. Try again.");
    } finally {
      setNotesBusy(false);
    }
  }

  if (error) return <Card><p role="alert" className="text-sm">{error}</p><Link href="/projects" className="btn mt-3">All projects</Link></Card>;
  if (!detail) return <div aria-busy="true" className="space-y-3"><div className="shimmer h-28 rounded-3xl" /><div className="shimmer h-48 rounded-3xl" /></div>;

  const { project } = detail;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "emails", label: "Emails", count: detail.emails.length },
    { value: "meetings", label: "Meetings", count: detail.meetings.length },
    { value: "people", label: "People", count: detail.people.length },
    { value: "notes", label: "Notes", count: detail.notes.length },
  ];
  const when = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const ask = (prompt: string) => router.push(`/?ask=${encodeURIComponent(prompt)}`);

  return (
    <div className="space-y-5">
      <Link href="/projects" className="muted tap inline-flex items-center text-sm">← All projects</Link>
      <header className="page-head enter" data-color={project.color}>
        <p className="page-eyebrow">{project.type === "recurring" ? "Recurring" : "Project"}</p>
        <h1 className="t-title mt-2">{project.name}</h1>
        <p className="muted t-body mt-2 max-w-prose">{project.description}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" onClick={() => ask(`Schedule a check-in with the ${project.name} team`)}><Icon name="calendar" size={17} />Schedule a check-in</button>
          <button type="button" className="btn" onClick={() => ask(`What's pending on ${project.name}?`)}><Icon name="spark" size={17} />Ask about this project</button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Project sections">
        {tabs.map((option) => (
          <button key={option.value} type="button" role="tab" id={`tab-${option.value}`} aria-controls={`panel-${option.value}`} aria-selected={tab === option.value} className="tab" onClick={() => setTab(option.value)}>
            {option.label}{option.count !== undefined && <span className="count">{option.count}</span>}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-3">
        {tab === "overview" && (
          <Card title="Where this stands">
            <p className="t-body leading-relaxed">{detail.overview.summary}</p>
            {detail.overview.openItems.length > 0 && (
              <ul className="part-open-items mt-3">{detail.overview.openItems.map((item) => <li key={item}>{item}</li>)}</ul>
            )}
            <p className="muted t-caption mt-3">Summarized from the records linked to this project. It states nothing those records do not.</p>
          </Card>
        )}

        {tab === "emails" && (detail.emails.length === 0 ? <Empty>No email filed here yet. Use “Add to project” in the Inbox.</Empty> : (
          <ul className="inbox-list">
            {detail.emails.map((email) => (
              <li key={email.id} className="mail-row">
                <div className="mail-row-top"><span className="mail-from">{email.from}</span><span className="mail-time">{relativeTime(email.receivedAt)}</span></div>
                <Link href={`/inbox/${email.id}`} className="mail-subject">{email.subject}</Link>
                <p className="mail-summary">{email.summary}</p>
                <div className="mail-tags"><RiskBadge level={email.risk} />{email.replied && <span className="badge badge-low">Replied</span>}<button type="button" className="chip tap ml-auto" onClick={() => void unlink("email", email.id)}>Remove from project</button></div>
              </li>
            ))}
          </ul>
        ))}

        {tab === "meetings" && (detail.meetings.length === 0 ? <Empty>No meetings yet. Schedule a check-in to add one.</Empty> : (
          <ul className="inbox-list">
            {detail.meetings.map((meeting) => (
              <li key={meeting.eventId} className="mail-row">
                <p className="slot-day">{when(meeting.start)}</p>
                <p className="mail-subject">{meeting.subject}</p>
                <div className="mail-tags"><span className="muted t-caption">{meeting.invited ? "Invited" : "You organized"} · {(meeting.attendeeIds?.length ?? 0) + 1} people</span><button type="button" className="chip tap ml-auto" onClick={() => void unlink("event", meeting.eventId)}>Remove from project</button></div>
              </li>
            ))}
          </ul>
        ))}

        {tab === "people" && (
          <ul className="inbox-list">
            {detail.people.map((person) => (
              <li key={person.id} className="mail-row">
                <div className="mail-row-top"><span className="mail-from">{person.name}</span></div>
                <p className="mail-summary">{person.title}</p>
                <div className="mail-tags">
                  <button type="button" className="chip tap" onClick={() => ask(`Find 30 minutes next week with ${person.name}`)}>Find time</button>
                  <button type="button" className="chip tap" onClick={() => void unlink("person", person.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {tab === "notes" && (
          <Card title="Notes">
            {detail.notes.length === 0 ? <p className="muted t-caption">No notes yet. Notes open in your private Notes space; anything saved as “Project context” shows up here.</p> : detail.notes.map((note) => (
              <div key={note.workspaceId} className="mb-3">
                <p className="t-body font-semibold">{note.title}</p>
                {note.context.length === 0 ? <p className="muted t-caption">Nothing saved yet.</p> : <ul className="part-open-items">{note.context.map((entry) => <li key={entry.id}>{entry.content}</li>)}</ul>}
              </div>
            ))}
            <button type="button" className="btn mt-2" onClick={() => void openNotes()} disabled={notesBusy}>{detail.notes.length ? "Open notes" : "Start notes for this project"}</button>
          </Card>
        )}
      </section>
    </div>
  );
}
