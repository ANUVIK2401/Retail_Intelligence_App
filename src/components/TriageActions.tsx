"use client";

import { useEffect, useState } from "react";
import type { SnoozePreset } from "@/core/contracts";
import { Icon } from "./icons";

export type QuickReply = { id: string; label: string; body: string };
export type TriageMode = "full" | "quick" | "later" | null;
export type TriageOutcome =
  | { status: "sent"; at: string }
  | { status: "needs_review"; reviewers: string[] }
  | { status: "snoozed"; until: string };

const PRESETS: { value: SnoozePreset; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "tomorrow_morning", label: "Tomorrow morning" },
  { value: "next_week", label: "Next week" },
];

/**
 * The three things a busy executive does with a message: reply fully, reply
 * quickly, or come back to it later. Shared by the inbox and the chat so the
 * behavior is identical in both places. Send is always an explicit press.
 */
export function TriageActions({
  emailId, replyable, quickReplies, fullDraft, mode, onModeChange, onDone, compact = false,
}: {
  emailId: string;
  replyable: boolean;
  quickReplies: QuickReply[];
  fullDraft: string | null;
  mode: TriageMode;
  onModeChange: (mode: TriageMode) => void;
  onDone: (outcome: TriageOutcome) => void;
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (mode === "full") setBody(fullDraft ?? "");
    if (mode === "quick") { setPicked(null); setBody(""); }
  }, [mode, fullDraft]);

  async function post(payload: object): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/triage`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "That did not go through. Try again.");
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not go through. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function send(kind: "full" | "quick") {
    const data = await post({ action: "send", kind, body });
    if (!data) return;
    if (data.status === "sent") onDone({ status: "sent", at: String(data.sentAt) });
    else onDone({ status: "needs_review", reviewers: Array.isArray(data.reviewers) ? data.reviewers.map(String) : [] });
    onModeChange(null);
  }

  async function later(preset: SnoozePreset) {
    const data = await post({ action: "snooze", preset });
    if (!data) return;
    onDone({ status: "snoozed", until: String(data.until) });
    onModeChange(null);
  }

  return (
    <div className={`triage ${compact ? "triage-compact" : ""}`}>
      <div className="triage-buttons" role="group" aria-label="Respond to this message">
        <button type="button" className="triage-button tap" aria-pressed={mode === "full"} disabled={!replyable || busy} onClick={() => onModeChange(mode === "full" ? null : "full")} aria-keyshortcuts="F">
          Reply
        </button>
        <button type="button" className="triage-button tap" aria-pressed={mode === "quick"} disabled={!replyable || busy} onClick={() => onModeChange(mode === "quick" ? null : "quick")} aria-keyshortcuts="Q">
          Quick reply
        </button>
        <button type="button" className="triage-button tap" aria-pressed={mode === "later"} disabled={busy} onClick={() => onModeChange(mode === "later" ? null : "later")} aria-keyshortcuts="L">
          <Icon name="clock" size={15} />Later
        </button>
      </div>
      {!replyable && <p className="triage-note">High-risk or restricted: respond personally. The assistant will not send on this thread.</p>}

      {mode === "full" && (
        <div className="triage-panel">
          <label className="sr-only" htmlFor={`draft-${emailId}`}>Reply draft</label>
          <textarea id={`draft-${emailId}`} className="triage-textarea" rows={compact ? 6 : 8} value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} />
          <SendRow busy={busy} disabled={body.trim().length < 2} onSend={() => void send("full")} onCancel={() => onModeChange(null)} />
        </div>
      )}

      {mode === "quick" && (
        <div className="triage-panel">
          <div className="triage-chips" role="radiogroup" aria-label="Suggested quick replies">
            {quickReplies.map((reply) => (
              <button key={reply.id} type="button" role="radio" aria-checked={picked === reply.id} className="chip tap" onClick={() => { setPicked(reply.id); setBody(reply.body); }}>
                {reply.label}
              </button>
            ))}
          </div>
          {picked && (
            <>
              <label className="sr-only" htmlFor={`quick-${emailId}`}>Quick reply</label>
              <textarea id={`quick-${emailId}`} className="triage-textarea" rows={3} value={body} maxLength={4000} onChange={(event) => setBody(event.target.value)} />
              <SendRow busy={busy} disabled={body.trim().length < 2} onSend={() => void send("quick")} onCancel={() => onModeChange(null)} />
            </>
          )}
        </div>
      )}

      {mode === "later" && (
        <div className="triage-panel">
          <p className="triage-note">Bring this back:</p>
          <div className="triage-chips">
            {PRESETS.map((preset) => (
              <button key={preset.value} type="button" className="chip tap" disabled={busy} onClick={() => void later(preset.value)}>{preset.label}</button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="triage-error">{error}</p>}
    </div>
  );
}

function SendRow({ busy, disabled, onSend, onCancel }: { busy: boolean; disabled: boolean; onSend: () => void; onCancel: () => void }) {
  return (
    <div className="triage-send-row">
      <p className="triage-note">Goes to a synthetic Sent folder. Nothing leaves the demo.</p>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={onSend} disabled={busy || disabled}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </div>
  );
}

export function describeOutcome(outcome: TriageOutcome, timezone: string): string {
  if (outcome.status === "sent") return "Sent. It is in your Sent folder and the audit history.";
  if (outcome.status === "needs_review") return `Confirmed. Waiting on: ${outcome.reviewers.join(", ") || "review"}. Nothing is sent until then.`;
  const when = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(outcome.until));
  return `Set aside until ${when}.`;
}
