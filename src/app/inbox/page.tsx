"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { RiskLevel } from "@/core/contracts";
import { Card, Empty, RiskBadge, relativeTime } from "@/components/primitives";
import { TriageActions, describeOutcome, type QuickReply, type TriageMode, type TriageOutcome } from "@/components/TriageActions";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session";
import { changeProjectLink } from "@/components/projectLinks";

type Row =
  | { id: string; redacted: true; reason: string; receivedAt: string; riskFloor: RiskLevel }
  | {
      id: string;
      redacted: false;
      subject: string;
      from: string;
      fromTitle: string;
      external: boolean;
      receivedAt: string;
      summary: string;
      risk: RiskLevel;
      injectionSuspected: boolean;
      bucket: "needs_me" | "can_wait";
      snoozedUntil: string | null;
      replied: boolean;
      replyable: boolean;
      projectId: string | null;
      suggestion: { projectId: string; projectName: string; reason: string } | null;
      quickReplies: QuickReply[];
      fullDraft: string | null;
    };
type Visible = Extract<Row, { redacted: false }>;
type Project = { id: string; name: string; color: string };
type Filter = "needs_me" | "can_wait" | "snoozed" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "needs_me", label: "Needs me" },
  { value: "can_wait", label: "Can wait" },
  { value: "snoozed", label: "Snoozed" },
  { value: "all", label: "All" },
];

/** How far a row must travel before a swipe counts. */
const SWIPE_THRESHOLD = 80;

export default function InboxPage() {
  const session = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("needs_me");
  const [grouped, setGrouped] = useState(false);
  const [modes, setModes] = useState<Record<string, TriageMode>>({});
  const [outcomes, setOutcomes] = useState<Record<string, TriageOutcome>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const timezone = session?.actor.timezone ?? "America/Los_Angeles";

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mail, projectList] = await Promise.all([fetch("/api/emails"), fetch("/api/projects")]);
      const data = await mail.json();
      if (!mail.ok || !Array.isArray(data.messages)) throw new Error(data.error ?? "The inbox could not be loaded.");
      setRows(data.messages as Row[]);
      if (projectList.ok) setProjects(((await projectList.json()).projects ?? []) as Project[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The inbox could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => (rows ?? []).filter((row): row is Visible => !row.redacted), [rows]);
  const withheld = (rows ?? []).filter((row) => row.redacted);
  const counts = useMemo(() => ({
    needs_me: visible.filter((row) => row.bucket === "needs_me" && !row.snoozedUntil && !row.replied).length,
    can_wait: visible.filter((row) => row.bucket === "can_wait" && !row.snoozedUntil && !row.replied).length,
    snoozed: visible.filter((row) => row.snoozedUntil).length,
    all: visible.length,
  }), [visible]);
  const shown = visible.filter((row) => {
    // A row stays on screen right after an action so its confirmation is readable.
    if (outcomes[row.id] && filter !== "all") return true;
    if (filter === "all") return true;
    if (filter === "snoozed") return Boolean(row.snoozedUntil);
    return row.bucket === filter && !row.snoozedUntil && !row.replied;
  });

  const setMode = useCallback((id: string, mode: TriageMode) => setModes((current) => ({ ...current, [id]: mode })), []);
  const done = useCallback((id: string, outcome: TriageOutcome) => {
    setOutcomes((current) => ({ ...current, [id]: outcome }));
    setRows((current) => current?.map((row) => row.redacted || row.id !== id ? row : {
      ...row,
      replied: row.replied || outcome.status === "sent",
      snoozedUntil: outcome.status === "snoozed" ? outcome.until : row.snoozedUntil,
    }) ?? null);
  }, []);

  // f / q / l act on the focused message; j / k move between messages.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]") || event.metaKey || event.ctrlKey || event.altKey) return;
      const ids = shown.map((row) => row.id);
      const index = focused ? ids.indexOf(focused) : -1;
      if (event.key === "j" || event.key === "k") {
        const next = ids[Math.max(0, Math.min(ids.length - 1, index + (event.key === "j" ? 1 : -1)))];
        if (next) { setFocused(next); listRef.current?.querySelector<HTMLElement>(`[data-row="${next}"]`)?.focus(); }
        return;
      }
      if (!focused) return;
      const row = shown.find((candidate) => candidate.id === focused);
      if (!row || outcomes[row.id]) return;
      const mode: TriageMode = event.key === "f" ? "full" : event.key === "q" ? "quick" : event.key === "l" ? "later" : null;
      if (!mode || (mode !== "later" && !row.replyable)) return;
      event.preventDefault();
      setMode(row.id, modes[row.id] === mode ? null : mode);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shown, focused, modes, outcomes, setMode]);

  async function fileUnder(emailId: string, projectId: string) {
    if (await changeProjectLink(projectId, { op: "add", kind: "email", id: emailId })) setRows((current) => current?.map((row) => row.redacted || row.id !== emailId ? row : { ...row, projectId, suggestion: null }) ?? null);
  }

  const groups = grouped
    ? [...projects.map((project) => ({ key: project.id, title: project.name, color: project.color, rows: shown.filter((row) => row.projectId === project.id) })),
      { key: "none", title: "Not in a project", color: "slate", rows: shown.filter((row) => !row.projectId) }].filter((group) => group.rows.length)
    : [{ key: "all", title: "", color: "", rows: shown }];

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Email</p>
        <h1 className="t-title mt-2">Inbox</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Decide each message in one move: reply fully, send a quick reply, or set it aside for later.
          Swipe right to quick reply, left for later.
        </p>
      </header>

      <div className="inbox-toolbar">
        <div className="inbox-filters" role="group" aria-label="Filter messages">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" className="chip inbox-filter tap" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
              {option.label} <span className="count">{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <label className="composer-toggle">
          <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />
          Group by project
        </label>
      </div>
      <p className="shortcut-hint">Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>f</kbd> reply · <kbd>q</kbd> quick reply · <kbd>l</kbd> later</p>

      {error && (
        <Card>
          <p className="text-sm" role="alert">{error}</p>
          <button className="btn mt-3" onClick={() => void load()}>Retry loading inbox</button>
        </Card>
      )}
      {!rows && !error && <div aria-busy="true" className="space-y-3">{[0, 1, 2].map((key) => <div key={key} className="shimmer h-[132px] rounded-3xl" />)}</div>}

      {rows && !error && (
        <div ref={listRef}>
          {shown.length === 0 && <Empty>{filter === "needs_me" ? "Nothing needs you right now." : "No messages here."}</Empty>}
          {groups.map((group) => (
            <section key={group.key} aria-label={group.title || "Messages"}>
              {group.title && <h2 className="inbox-group-title" data-color={group.color}><span className="project-swatch" aria-hidden="true" />{group.title} · {group.rows.length}</h2>}
              <ul className="inbox-list">
                {group.rows.map((row) => (
                  <li key={row.id}>
                    <MailRow
                      row={row}
                      mode={modes[row.id] ?? null}
                      outcome={outcomes[row.id]}
                      timezone={timezone}
                      focused={focused === row.id}
                      projects={projects}
                      onFocus={() => setFocused(row.id)}
                      onMode={(mode) => setMode(row.id, mode)}
                      onDone={(outcome) => done(row.id, outcome)}
                      onFile={(projectId) => void fileUnder(row.id, projectId)}
                      onUnsnooze={async () => {
                        const response = await fetch(`/api/emails/${encodeURIComponent(row.id)}/triage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsnooze" }) });
                        await response.json().catch(() => null);
                        if (!response.ok) return;
                        setRows((current) => current?.map((item) => item.redacted || item.id !== row.id ? item : { ...item, snoozedUntil: null }) ?? null);
                        setOutcomes((current) => { const next = { ...current }; delete next[row.id]; return next; });
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {withheld.length > 0 && (
            <ul className="inbox-list mt-3">
              {withheld.map((row) => (
                <li key={row.id}>
                  <Card className="opacity-80">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-restricted">Withheld</span>
                      <span className="muted t-caption tnum">{relativeTime(row.receivedAt)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-snug">{row.reason}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MailRow({
  row, mode, outcome, timezone, focused, projects, onFocus, onMode, onDone, onFile, onUnsnooze,
}: {
  row: Visible;
  mode: TriageMode;
  outcome?: TriageOutcome;
  timezone: string;
  focused: boolean;
  projects: Project[];
  onFocus: () => void;
  onMode: (mode: TriageMode) => void;
  onDone: (outcome: TriageOutcome) => void;
  onFile: (projectId: string) => void;
  onUnsnooze: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const project = projects.find((candidate) => candidate.id === row.projectId);

  // Swipe right = quick reply, swipe left = later. Vertical scrolling wins
  // when the gesture is mostly vertical.
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || (event.target as HTMLElement).closest("button, a, textarea, input, select")) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.id !== event.pointerId) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(offset) < 8) { start.current = null; setOffset(0); return; }
    setOffset(Math.max(-140, Math.min(140, dx)));
  }
  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    if (offset > SWIPE_THRESHOLD && row.replyable && !outcome) onMode("quick");
    else if (offset < -SWIPE_THRESHOLD && !outcome) onMode("later");
    setOffset(0);
  }

  const snoozedLabel = row.snoozedUntil ? new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(row.snoozedUntil)) : null;

  return (
    <div className="mail-row-wrap">
      {offset !== 0 && <div className="mail-row-hint" aria-hidden="true"><span>Quick reply</span><span>Later</span></div>}
      <div
        className="mail-row"
        data-row={row.id}
        data-focused={focused || undefined}
        data-dragging={offset !== 0 || undefined}
        tabIndex={0}
        aria-label={`${row.from}: ${row.subject}`}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setOffset(0); }}
      >
        <div className="mail-row-top">
          <span className="mail-from">{row.from}</span>
          <span className="mail-time">{relativeTime(row.receivedAt)}</span>
        </div>
        <Link href={`/inbox/${row.id}`} className="mail-subject">{row.subject}</Link>
        <p className="mail-summary">{row.summary}</p>
        <div className="mail-tags">
          <RiskBadge level={row.risk} />
          {row.external && <span className="badge badge-medium">External</span>}
          {row.injectionSuspected && <span className="badge badge-high">Instruction attempt</span>}
          {project && <span className="project-chip" data-color={project.color}><span className="project-swatch" aria-hidden="true" />{project.name}</span>}
          {!project && row.suggestion && (
            <span className="project-chip" data-suggested="true" data-color={projects.find((candidate) => candidate.id === row.suggestion!.projectId)?.color} title={row.suggestion.reason}>
              Suggested: {row.suggestion.projectName}
              <button type="button" onClick={() => onFile(row.suggestion!.projectId)} aria-label={`Add to ${row.suggestion.projectName}`}>Add</button>
            </span>
          )}
          {!project && !row.suggestion && projects.length > 0 && (
            <span className="add-to-project">
              <label className="sr-only" htmlFor={`project-${row.id}`}>Add to project</label>
              <select id={`project-${row.id}`} value="" onChange={(event) => event.target.value && onFile(event.target.value)}>
                <option value="">Add to project…</option>
                {projects.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
            </span>
          )}
        </div>
        {outcome ? (
          <p className="mail-outcome" role="status"><Icon name="check" size={16} />{describeOutcome(outcome, timezone)}</p>
        ) : row.snoozedUntil ? (
          <div className="mail-outcome"><Icon name="clock" size={16} />Back {snoozedLabel}.<button type="button" className="chip tap ml-auto" onClick={onUnsnooze}>Bring back now</button></div>
        ) : row.replied ? (
          <p className="mail-outcome"><Icon name="check" size={16} />Replied.</p>
        ) : (
          <TriageActions
            emailId={row.id}
            replyable={row.replyable}
            quickReplies={row.quickReplies}
            fullDraft={row.fullDraft}
            mode={mode}
            onModeChange={onMode}
            onDone={onDone}
          />
        )}
      </div>
    </div>
  );
}
