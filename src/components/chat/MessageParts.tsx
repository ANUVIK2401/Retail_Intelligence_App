"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatPart } from "@/core/contracts";
import { Icon } from "@/components/icons";
import { RiskBadge, relativeTime } from "@/components/primitives";
import { TriageActions, describeOutcome, type TriageMode, type TriageOutcome } from "@/components/TriageActions";
import { otherZoneTimes, slotDay, slotTime, visibleSlots } from "./parts";

type EventPart = Extract<ChatPart, { type: "event_confirmation" }>;

export type PartHandlers = {
  /** Sends a follow-up message as if the executive typed it. */
  onPrompt: (prompt: string) => void;
  /** Appends a booking confirmation to the thread. */
  onBooked: (part: EventPart) => void;
  disabled: boolean;
};

/** Renders one assistant turn. Unknown part types render nothing rather than breaking the thread. */
export function MessageParts({ parts, handlers }: { parts: ChatPart[]; handlers: PartHandlers }) {
  return (
    <div className="parts">
      {parts.map((part, index) => <Part key={`${part.type}-${index}`} part={part} handlers={handlers} />)}
    </div>
  );
}

function Part({ part, handlers }: { part: ChatPart; handlers: PartHandlers }) {
  switch (part.type) {
    case "text":
      return <p className="part-text">{part.text}</p>;
    case "items":
      return (
        <ul className="part-items">
          {part.items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              <span className="part-item-dot" data-status={item.status} aria-hidden="true" />
              <span className="min-w-0"><strong>{item.label}</strong><small>{item.detail}</small></span>
            </li>
          ))}
        </ul>
      );
    case "link":
      return <Link href={part.href} className="part-link tap">{part.label}<Icon name="arrow" size={15} /></Link>;
    case "actions":
      return part.actions.length ? (
        <div className="part-chips" aria-label="Suggested follow-ups">
          {part.actions.map((action) => (
            <button key={action.prompt} type="button" className="chip tap" disabled={handlers.disabled} onClick={() => handlers.onPrompt(action.prompt)}>{action.label}</button>
          ))}
        </div>
      ) : null;
    case "clarify":
      return (
        <div className="part-clarify" role="group" aria-label={part.question}>
          {part.options.map((option) => (
            <button key={option.prompt} type="button" className="part-option tap" disabled={handlers.disabled} onClick={() => handlers.onPrompt(option.prompt)}>
              <span>{option.label}</span><Icon name="arrow" size={15} />
            </button>
          ))}
        </div>
      );
    case "slots":
      return <SlotPicker part={part} handlers={handlers} />;
    case "no_slots":
      return (
        <div className="part-card">
          <p className="part-card-title">{part.message}</p>
          <div className="part-clarify">
            {part.alternatives.map((alternative) => (
              <button key={alternative.prompt} type="button" className="part-option tap" disabled={handlers.disabled} onClick={() => handlers.onPrompt(alternative.prompt)}>
                <span><strong>{alternative.label}</strong>{alternative.detail && <small>{alternative.detail}</small>}</span>
                <Icon name="arrow" size={15} />
              </button>
            ))}
          </div>
        </div>
      );
    case "email_card":
      return <EmailCard part={part} />;
    case "event_confirmation":
      return <EventConfirmation part={part} />;
    case "project_card":
      return (
        <Link href={`/projects/${part.project.id}`} className="part-card part-project tap" data-color={part.project.color}>
          <span className="project-swatch" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="part-card-title">{part.project.name}</strong>
            <small className="muted block">{part.project.counts.emails} emails · {part.project.counts.meetings} meetings · {part.project.counts.people} people</small>
            {part.openItems.length > 0 && (
              <ul className="part-open-items">{part.openItems.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
            )}
          </span>
          <Icon name="arrow" size={16} />
        </Link>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */

function SlotPicker({ part, handlers }: { part: Extract<ChatPart, { type: "slots" }>; handlers: PartHandlers }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [title, setTitle] = useState(part.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<string | null>(null);
  const slots = visibleSlots(part, expanded);
  const chosen = part.slots.find((slot) => slot.index === selected) ?? null;
  const others = part.attendees.slice(1);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected !== null) confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  async function book() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const approval = part.approvalId;
      const response = await fetch(approval ? `/api/approvals/${encodeURIComponent(approval)}/decide` : `/api/meeting-proposals/${encodeURIComponent(part.proposalId)}/book`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(approval
          ? { outcome: "approved", slotIndex: chosen.index }
          : { slotIndex: chosen.index, ...(title.trim() && title.trim() !== part.title ? { title: title.trim() } : {}), ...(part.projectId ? { projectId: part.projectId } : {}) }),
      });
      const data = await response.json() as { error?: string; execution?: { kind?: string; eventId?: string }; approval?: { status?: string } };
      if (!response.ok) throw new Error(data.error ?? "That time could not be booked. Pick another.");
      if (data.execution?.kind !== "calendar_event_created" || !data.execution.eventId) {
        setBooked("pending");
        return;
      }
      setBooked(data.execution.eventId);
      handlers.onBooked({
        type: "event_confirmation",
        eventId: data.execution.eventId,
        title: approval ? part.title : title.trim() || part.title,
        start: chosen.start,
        end: chosen.end,
        timezone: part.timezone,
        attendees: part.attendees.map(({ id, name }) => ({ id, name })),
        note: "Added to everyone's synthetic calendar and recorded in Audit history. No real invitation was sent.",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That time could not be booked. Pick another.");
    } finally {
      setBusy(false);
    }
  }

  if (booked) {
    return (
      <p className="part-muted-note"><Icon name="check" size={15} />{booked === "pending" ? "Your confirmation is recorded. The next approver has been asked; nothing is booked until they confirm." : `Booked ${slotDay(chosen!.start, part.timezone)}, ${slotTime(chosen!.start, chosen!.end, part.timezone)}.`}</p>
    );
  }

  return (
    <div className="slots">
      <div className="slots-head">
        <span className="slots-meta">{part.durationMinutes} min · {part.windowLabel}</span>
        <span className="slots-people">with {others.map((person) => person.name.split(" ")[0]).join(", ")}</span>
      </div>
      <div className="slots-grid" role="radiogroup" aria-label="Available times">
        {slots.map((slot) => {
          const zones = otherZoneTimes(slot.start, others, part.timezone);
          return (
            <button
              key={slot.index}
              type="button"
              role="radio"
              aria-checked={selected === slot.index}
              className="slot-card tap"
              disabled={busy}
              onClick={() => setSelected(slot.index)}
            >
              <span className="slot-day">{slotDay(slot.start, part.timezone)}</span>
              <span className="slot-time">{slotTime(slot.start, slot.end, part.timezone)}</span>
              {zones.length > 0 && <span className="slot-zones">{zones.join(" · ")}</span>}
              <span className="slot-why">{slot.rationale}</span>
            </button>
          );
        })}
      </div>
      <div className="slots-foot">
        {part.slots.length > part.initiallyVisible && (
          <button type="button" className="chip tap" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer times" : `Show more times (${part.slots.length - part.initiallyVisible})`}
          </button>
        )}
      </div>

      {chosen && (
        <div ref={confirmRef} className="confirm-card" role="region" aria-label="Confirm meeting">
          <p className="confirm-eyebrow">Review before booking</p>
          <label className="confirm-field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} disabled={Boolean(part.approvalId) || busy} />
          </label>
          <dl className="confirm-grid">
            <dt>When</dt><dd>{slotDay(chosen.start, part.timezone)}, {slotTime(chosen.start, chosen.end, part.timezone)}</dd>
            <dt>Who</dt><dd>{part.attendees.map((person) => person.name).join(", ")}</dd>
          </dl>
          {part.policyNote && <p className="confirm-policy">{part.policyNote}</p>}
          {error && <p role="alert" className="triage-error">{error}</p>}
          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => { setSelected(null); setError(null); }} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => void book()} disabled={busy || title.trim().length < 3}>
              {busy ? "Booking…" : part.approvalId ? "Confirm and request approval" : "Book"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventConfirmation({ part }: { part: EventPart }) {
  return (
    <div className="part-card event-confirmation" role="status">
      <span className="event-check" aria-hidden="true"><Icon name="check" size={18} /></span>
      <div className="min-w-0">
        <p className="confirm-eyebrow">Booked</p>
        <p className="part-card-title">{part.title}</p>
        <p className="event-when">{slotDay(part.start, part.timezone)}, {slotTime(part.start, part.end, part.timezone)}</p>
        <p className="muted t-caption">{part.attendees.map((person) => person.name).join(", ")}</p>
        <p className="part-muted-note">{part.note}</p>
        <Link href="/schedule" className="part-link tap">Open Calendar<Icon name="arrow" size={15} /></Link>
      </div>
    </div>
  );
}

function EmailCard({ part }: { part: Extract<ChatPart, { type: "email_card" }> }) {
  const { email } = part;
  const [mode, setMode] = useState<TriageMode>(null);
  const [outcome, setOutcome] = useState<TriageOutcome | null>(null);
  return (
    <article className="part-card email-card">
      <div className="email-card-head">
        <RiskBadge level={email.risk} />
        {email.external && <span className="badge badge-medium">External</span>}
        {email.injectionSuspected && <span className="badge badge-high">Instruction attempt</span>}
        <span className="muted t-caption tnum ml-auto">{relativeTime(email.receivedAt)}</span>
      </div>
      <Link href={`/inbox/${email.id}`} className="email-card-subject">{email.subject}</Link>
      <p className="muted t-caption">{email.from}{email.fromTitle ? ` · ${email.fromTitle}` : ""}</p>
      <p className="email-card-summary">{email.summary}</p>
      {outcome ? (
        <p className="part-muted-note"><Icon name="check" size={15} />{describeOutcome(outcome, Intl.DateTimeFormat().resolvedOptions().timeZone)}</p>
      ) : (
        <TriageActions
          emailId={email.id}
          replyable={email.replyable}
          quickReplies={email.quickReplies}
          fullDraft={email.fullDraft}
          mode={mode}
          onModeChange={setMode}
          onDone={setOutcome}
          compact
        />
      )}
    </article>
  );
}
