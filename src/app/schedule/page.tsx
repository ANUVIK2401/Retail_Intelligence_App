"use client";

import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent, MeetingProposal } from "@/core/contracts";
import Link from "next/link";
import { Card, OutcomeBadge, Reason } from "@/components/primitives";
import { useSession } from "@/components/session";
import { Icon } from "@/components/icons";
import { changeProjectLink } from "@/components/projectLinks";

const REQUESTERS = [
  { id: "p_coo", label: "Ray Alvarez, COO (direct report)" },
  { id: "p_dir_ops", label: "Casey Wu, Director, Store Ops (3 levels down)" },
  { id: "p_mgr_analytics", label: "Ellie Novak, Manager, Analytics (4 levels down)" },
  { id: "p_ext_banker", label: "Howard Teague (external)" },
];

export default function SchedulePage() {
  const actorId = useSession()?.actor.id ?? "p_ceo";
  const [projects, setProjects] = useState<{ id: string; name: string; eventIds: string[] }[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newStart, setNewStart] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [requesterId, setRequesterId] = useState("p_dir_ops");
  const [purpose, setPurpose] = useState("West region remodel pilot review");
  const [duration, setDuration] = useState(30);
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<MeetingProposal | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [bookingClosed, setBookingClosed] = useState(false);

  const loadAgenda = useCallback(async () => {
    setAgendaError(null);
    try {
      const response = await fetch("/api/calendar-events");
      const data = await response.json() as { events?: CalendarEvent[]; actor?: { timezone?: string }; error?: string };
      if (!response.ok || !Array.isArray(data.events)) throw new Error(data.error ?? "Your schedule could not be loaded.");
      setEvents(data.events);
      setTimezone(data.actor?.timezone ?? "America/Los_Angeles");
    } catch (cause) {
      setAgendaError(cause instanceof Error ? cause.message : "Your schedule could not be loaded.");
    } finally {
      setAgendaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgenda();
    fetch("/api/projects").then((response) => response.ok ? response.json() : null)
      .then((data) => setProjects(data?.projects ?? [])).catch(() => setProjects([]));
  }, [loadAgenda]);

  async function fileEvent(eventId: string, projectId: string) {
    if (await changeProjectLink(projectId, { op: "add", kind: "event", id: eventId })) setProjects((current) => current.map((project) => project.id === projectId ? { ...project, eventIds: [...project.eventIds, eventId] } : project));
  }

  function beginReschedule(event: CalendarEvent) {
    setEditingEvent(event);
    setNewStart(toLocalInput(event.start, timezone));
    setScheduleNotice(null);
    setAgendaError(null);
  }

  async function reschedule() {
    if (!editingEvent || !newStart) return;
    const start = zonedLocalToDate(newStart, timezone);
    if (Number.isNaN(start.getTime())) {
      setAgendaError("Choose a valid date and time.");
      return;
    }
    setRescheduling(true);
    setAgendaError(null);
    try {
      const response = await fetch(`/api/calendar-events/${encodeURIComponent(editingEvent.eventId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ start: start.toISOString() }),
      });
      const data = await response.json() as { event?: CalendarEvent; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error ?? "The event could not be moved.");
      setEvents((current) => current
        .map((event) => event.eventId === data.event!.eventId ? data.event! : event)
        .sort((a, b) => a.start.localeCompare(b.start)));
      setEditingEvent(null);
      setScheduleNotice(`${data.event.subject ?? "Event"} moved to ${formatEventTime(data.event, timezone)}. The change is in the audit trail.`);
    } catch (cause) {
      setAgendaError(cause instanceof Error ? cause.message : "The event could not be moved.");
    } finally {
      setRescheduling(false);
    }
  }

  async function propose() {
    if (!purpose.trim()) {
      setError("Add a purpose before finding times.");
      return;
    }
    setBusy(true);
    setOutcome(null);
    setError(null);
    setProposal(null);
    setApprovalId(null);
    setSelectedSlot(null);
    setBookingClosed(false);
    const now = new Date();
    const earliest = new Date(now.getTime() + 18 * 60 * 60 * 1000);
    const latest = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    try {
      const res = await fetch("/api/meeting-proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requesterId,
          attendeeIds: ["p_ceo"],
          purpose: purpose.trim(),
          durationMinutes: duration,
          sensitivity: confidential ? "confidential" : "normal",
          earliest: earliest.toISOString(),
          latest: latest.toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Available times could not be found.");
      if (!data.proposal) throw new Error("The proposal returned an unexpected response.");
      setProposal(data.proposal);
      setApprovalId(data.approval?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Available times could not be found.");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!proposal || selectedSlot === null) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const path = approvalId
        ? `/api/approvals/${encodeURIComponent(approvalId)}/decide`
        : `/api/meeting-proposals/${encodeURIComponent(proposal.id)}/book`;
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(approvalId ? { outcome: "approved", slotIndex: selectedSlot } : { slotIndex: selectedSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The selected time could not be confirmed.");
      if (data.execution?.kind === "calendar_event_created") {
        setOutcome(`Invitation created for ${formatSlot(proposal.slots[selectedSlot], timezone)} (simulated). Recorded in the audit trail.`);
        setProposal(data.proposal ?? { ...proposal, status: "approved" });
        setBookingClosed(true);
      } else if (data.approval) {
        setOutcome(`Approval step cleared. Status: ${data.approval.status.replace(/_/g, " ")}.`);
        setBookingClosed(data.approval.status !== "awaiting_approval");
      } else {
        throw new Error("The booking returned an unexpected response.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The selected time could not be confirmed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="schedule-page space-y-5">
      <header className="page-head enter">
        <div className="schedule-heading-row">
          <div>
            <p className="page-eyebrow">Time</p>
            <h1 className="t-title mt-2">Calendar</h1>
            <p className="muted t-body mt-2 max-w-prose">Your week, including meetings the assistant booked for you. To find a time with anyone, just ask.</p>
            <Link href={`/?ask=${encodeURIComponent("Find 30 minutes next week with ")}`} className="btn btn-primary mt-4 inline-flex"><Icon name="spark" size={17} />Find a time</Link>
          </div>
          <div className="schedule-live-pill"><span aria-hidden="true" />Synthetic calendar · {shortTimezone(timezone)}</div>
        </div>
      </header>

      <Card title="Your upcoming schedule" className="schedule-agenda-card enter" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="schedule-card-intro">
          <p className="muted t-caption">Titles appear for meetings you organized or were invited to. Everyone else&apos;s calendar stays free/busy only.</p>
          <button type="button" className="schedule-refresh tap" onClick={() => { setAgendaLoading(true); void loadAgenda(); }} disabled={agendaLoading}>Refresh</button>
        </div>
        {agendaLoading ? <AgendaSkeleton /> : events.length === 0 ? (
          <div className="schedule-empty"><span aria-hidden="true">◇</span><p>No owned events in this demo window.</p></div>
        ) : (
          <ol className="agenda-list">
            {events.map((event, index) => (
              <li key={event.eventId} className="agenda-event enter" style={{ "--i": index + 1 } as React.CSSProperties}>
                <div className="agenda-date" aria-hidden="true"><strong>{formatDay(event.start, timezone)}</strong><span>{formatDateNumber(event.start, timezone)}</span></div>
                <div className="agenda-rail"><span /></div>
                <div className="agenda-copy">
                  <p className="agenda-time">{formatEventTime(event, timezone)}</p>
                  <h3>{event.subject}</h3>
                  <p className="muted t-caption">{event.attendeeIds?.length ? `${event.attendeeIds.length} attendee${event.attendeeIds.length === 1 ? "" : "s"}` : "Focus time"} · {event.ownerId === actorId ? "You organized" : "Invited"}</p>
                  {projects.length > 0 && (() => {
                    const filed = projects.find((project) => project.eventIds.includes(event.eventId));
                    return filed ? <span className="project-chip mt-1">{filed.name}</span> : (
                      <label className="add-to-project mt-1 inline-block">
                        <span className="sr-only">Add {event.subject} to a project</span>
                        <select value="" onChange={(change) => change.target.value && void fileEvent(event.eventId, change.target.value)}>
                          <option value="">Add to project…</option>
                          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                        </select>
                      </label>
                    );
                  })()}
                </div>
                {event.ownerId === actorId && <button type="button" className="btn agenda-move" onClick={() => beginReschedule(event)}>Move</button>}
              </li>
            ))}
          </ol>
        )}

        {editingEvent && (
          <div className="reschedule-panel" role="region" aria-label={`Move ${editingEvent.subject}`}>
            <div><p className="page-eyebrow">Adjust event</p><h3 className="t-section mt-1">Move {editingEvent.subject}</h3><p className="muted t-caption mt-1">Duration stays the same. Working hours, protected blocks, and conflicts are checked before the change.</p></div>
            <label className="reschedule-field"><span>New start</span><input type="datetime-local" value={newStart} onChange={(event) => setNewStart(event.target.value)} /></label>
            <div className="flex flex-wrap gap-2"><button type="button" className="btn btn-primary" onClick={() => void reschedule()} disabled={rescheduling || !newStart}>{rescheduling ? "Checking…" : "Confirm move"}</button><button type="button" className="btn" onClick={() => setEditingEvent(null)} disabled={rescheduling}>Cancel</button></div>
          </div>
        )}
        {agendaError && <p role="alert" className="schedule-alert schedule-alert-error">{agendaError}</p>}
        {scheduleNotice && <p role="status" className="schedule-alert schedule-alert-success"><span aria-hidden="true">✓</span>{scheduleNotice}</p>}
      </Card>

      <div className="schedule-section-label enter"><span>Requests to you</span><p>See how a request from someone in the organization is routed</p></div>

      <Card title="Try a request to Maya Hollis (CEO)" className="enter" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="space-y-3">
          <p className="muted text-xs leading-relaxed">Explore how routing changes for synthetic requesters in the demo directory.</p>
          <Field label="Scenario requester">
            <select
              className="tap w-full rounded-lg border px-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
            >
              {REQUESTERS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Purpose">
            <input
              className="tap w-full rounded-lg border px-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <Field label="Duration">
              <select
                className="tap rounded-lg border px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </Field>
            <label className="tap flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
              />
              Confidential
            </label>
          </div>

          <button className="btn btn-primary w-full" onClick={propose} disabled={busy}>
            {busy ? "Checking availability…" : "Find times"}
          </button>
        </div>
      </Card>

      {error && <Card><p role="alert" className="text-sm">{error}</p></Card>}

      {proposal && (
        <>
          <Card title="Routing decision">
            <OutcomeBadge outcome={proposal.decision.outcome} />
            <Reason>{proposal.decision.reason}</Reason>
            {proposal.decision.approvalChain.length > 0 && (
              <ol className="mt-3 space-y-1.5 text-sm">
                {proposal.decision.approvalChain.map((s, i) => (
                  <li key={i}>
                    {i + 1}. {s.label}
                  </li>
                ))}
              </ol>
            )}
            <p className="muted mt-3 font-mono text-[11px]">
              {proposal.decision.matchedRules.join(" · ")}
            </p>
          </Card>

          <Card title="Proposed times">
            <p className="muted mb-3 text-xs leading-relaxed">
              Availability came back as free/busy only. No meeting subject, attendee, or
              location on anyone&apos;s calendar was retrieved, and the connector contract
              has no field to carry one.
            </p>
            {proposal.slots.length === 0 ? (
              <p className="muted t-body mt-2 max-w-prose">
                No slot satisfies everyone&apos;s working hours and protected blocks in this
                window.
              </p>
            ) : (
              <div className="space-y-3">
              <ul className="space-y-2" role="radiogroup" aria-label="Proposed meeting times">
                {proposal.slots.map((slot, i) => (
                  <li key={slot.start}>
                    <label className="row-item flex cursor-pointer flex-wrap items-center gap-3" style={{ borderColor: selectedSlot === i ? "var(--accent)" : "var(--border)" }}>
                    <input type="radio" name="meeting-slot" checked={selectedSlot === i} onChange={() => setSelectedSlot(i)} disabled={busy || bookingClosed} />
                    <div>
                      <p className="text-sm font-semibold">{formatSlot(slot, timezone)}</p>
                      <p className="muted text-xs">{slot.rationale}</p>
                    </div>
                    </label>
                  </li>
                ))}
              </ul>
              {!bookingClosed && (
                <button className="btn btn-primary w-full" onClick={accept} disabled={busy || selectedSlot === null}>
                  {busy ? "Confirming…" : approvalId ? "Approve selected time" : "Book selected time"}
                </button>
              )}
              </div>
            )}
          </Card>
        </>
      )}

      {outcome && (
        <Card>
          <p role="status" className="text-sm leading-relaxed">{outcome}</p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading upcoming schedule">
      {[0, 1, 2].map((item) => <div key={item} className="shimmer h-[82px] rounded-2xl" />)}
    </div>
  );
}

function formatter(timezone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options });
}

function formatDay(iso: string, timezone: string): string {
  return formatter(timezone, { weekday: "short" }).format(new Date(iso)).toUpperCase();
}

function formatDateNumber(iso: string, timezone: string): string {
  return formatter(timezone, { day: "numeric" }).format(new Date(iso));
}

function formatEventTime(event: { start: string; end: string }, timezone: string): string {
  const time = (iso: string) => formatter(timezone, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return `${time(event.start)}–${time(event.end)}`;
}

function toLocalInput(iso: string, timezone: string): string {
  const parts = formatter(timezone, {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** Interpret a timezone-less form value in the executive's IANA timezone. */
function zonedLocalToDate(value: string, timezone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const desiredUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  let candidate = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rendered = toLocalInput(new Date(candidate).toISOString(), timezone);
    const renderedMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(rendered);
    if (!renderedMatch) return new Date(Number.NaN);
    const renderedUtc = Date.UTC(Number(renderedMatch[1]), Number(renderedMatch[2]) - 1, Number(renderedMatch[3]), Number(renderedMatch[4]), Number(renderedMatch[5]));
    candidate += desiredUtc - renderedUtc;
  }
  return new Date(candidate);
}

function shortTimezone(timezone: string): string {
  return timezone.replace("America/", "").replaceAll("_", " ");
}

function formatSlot(slot: { start: string; end: string }, timezone: string): string {
  const s = new Date(slot.start);
  const e = new Date(slot.end);
  const date = formatter(timezone, { weekday: "short", month: "short", day: "numeric" }).format(s);
  const fmt = (d: Date) => formatter(timezone, { hour: "numeric", minute: "2-digit" }).format(d);
  return `${date}, ${fmt(s)}–${fmt(e)}`;
}
