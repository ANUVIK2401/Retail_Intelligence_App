"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryCategory, MemoryEntry, Workspace, WorkspaceMessage } from "@/core/contracts";
import { Card, Empty, Reason, relativeTime } from "@/components/primitives";

/**
 * Brainstorming workspace. Private to the executive; nothing here becomes
 * permanent memory without an explicit save, and that rule is enforced in
 * `core/services/workspace.ts` rather than by this interface.
 */

const SEED_TITLE = "Denim circularity launch";

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  executive_profile: "Executive profile",
  project_context: "Project context",
  conversation_state: "Conversation state",
  saved_decision: "Saved decision",
};

const CATEGORY_HINTS: Record<MemoryCategory, string> = {
  executive_profile: "Long-term, and yours to edit. Survives every project.",
  project_context: "Lives as long as this project does.",
  conversation_state: "Working context. Cannot be saved as a memory category.",
  saved_decision: "Holds until you change it.",
};

const SAVEABLE: MemoryCategory[] = [
  "saved_decision",
  "project_context",
  "executive_profile",
];

export default function WorkspacePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFor, setSaveFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialized = useRef(false);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (!body.workspace || !Array.isArray(body.messages) || !Array.isArray(body.memory)) {
      throw new Error("Invalid workspace response");
    }
    setWorkspace(body.workspace);
    setMessages(body.messages);
    setMemory(body.memory);
  }, []);

  const initialize = useCallback(async () => {
    setLoadError(null);
    try {
      const listResponse = await fetch("/api/workspaces");
      if (!listResponse.ok) throw new Error(`HTTP ${listResponse.status}`);
      const listed = await listResponse.json();
      if (!Array.isArray(listed.workspaces)) throw new Error("Invalid workspace list");
      const existing: Workspace | undefined = listed.workspaces?.[0];
      if (existing) {
        await load(existing.id);
        return;
      }
      const createResponse = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: SEED_TITLE }),
      });
      if (!createResponse.ok) throw new Error(`HTTP ${createResponse.status}`);
      const created = await createResponse.json();
      if (!created.workspace?.id) throw new Error("Invalid new workspace");
      await load(created.workspace.id);
    } catch {
      setLoadError("Your workspace could not be loaded. Please try again.");
    }
  }, [load]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initialize();
  }, [initialize]);

  async function send() {
    if (!workspace || input.trim().length === 0) return;
    setBusy(true);
    setNotice(null);
    setNoticeError(false);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: input.trim() }),
      });
      const body = await res.json();
      if (res.ok) {
        if (!Array.isArray(body.messages)) throw new Error("Invalid message response");
        setMessages(body.messages);
        setInput("");
      } else {
        setNoticeError(true);
        setNotice(body.error ?? "The message was not added.");
      }
    } catch {
      setNoticeError(true);
      setNotice("The message could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function save(messageId: string, content: string, category: MemoryCategory) {
    if (!workspace) return;
    setNotice(null);
    setNoticeError(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/memory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          content,
          sourceMessageId: messageId,
          explicitSave: true,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        if (!body.entry) throw new Error("Invalid memory response");
        setMemory((m) => [...m, body.entry]);
        setSaveFor(null);
        setNotice(`Saved to ${CATEGORY_LABELS[category].toLowerCase()}.`);
      } else {
        setNoticeError(true);
        setNotice(body.error ?? "Nothing was saved.");
      }
    } catch {
      setNoticeError(true);
      setNotice("Memory could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!workspace && !loadError) return <p className="muted py-10 text-center text-sm" role="status">Loading your workspace…</p>;
  if (!workspace) return (
    <Card title="Workspace unavailable">
      <p className="muted text-sm">{loadError}</p>
      <button type="button" className="btn mt-3" onClick={() => void initialize()}>Retry</button>
    </Card>
  );

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Intelligence</p>
        <h1 className="t-title mt-2">Workspace</h1>
        <p className="muted t-body mt-2 max-w-prose">
          A private space to explore ideas. You decide which conclusions become lasting memory.
        </p>
      </header>

      <Card title={workspace.title}>
        {messages.length === 0 ? (
          <Empty>Start the thread. Save a conclusion when it should become lasting memory.</Empty>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => (
              <li key={m.id} className="flex gap-3">
                <span
                  className="mt-0.5 h-6 w-6 shrink-0 rounded-full text-center text-[11px] font-semibold leading-6"
                  style={{
                    background:
                      m.role === "executive"
                        ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                        : "color-mix(in srgb, var(--border) 60%, transparent)",
                    color: m.role === "executive" ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {m.role === "executive" ? "MH" : "AI"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed">{m.text}</p>
                  <p className="muted mt-0.5 text-[11px]">
                    {relativeTime(m.at)}
                    {m.model ? ` · ${m.model}` : ""}
                  </p>

                  {saveFor === m.id ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {SAVEABLE.map((c) => (
                        <button
                          key={c}
                          className="btn text-[11px]"
                          style={{ minHeight: 44 }}
                          disabled={saving}
                          onClick={() => void save(m.id, m.text, c)}
                        >
                          {CATEGORY_LABELS[c]}
                        </button>
                      ))}
                      <button
                        className="btn text-[11px]"
                        style={{ minHeight: 44 }}
                        disabled={saving}
                        onClick={() => setSaveFor(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="mt-1 text-[11px] font-semibold"
                      style={{ color: "var(--accent)", minHeight: 44 }}
                      onClick={() => setSaveFor(m.id)}
                    >
                      Save to memory…
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2">
          <label htmlFor="ws-input" className="sr-only">
            Continue the thread
          </label>
          <input
            id="ws-input"
            className="tap min-w-0 flex-1 rounded-lg border px-3 text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              minHeight: 44,
            }}
            placeholder="Continue the thread…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <button
            className="btn"
            style={{ minHeight: 44 }}
            disabled={!input.trim() || busy}
            onClick={() => void send()}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>

        {notice && (
          <p className="mt-2 text-[12px]" role={noticeError ? "alert" : "status"} style={{ color: noticeError ? "var(--high)" : "var(--accent)" }}>
            {notice}
          </p>
        )}
      </Card>

      <Card title="Memory">
        {memory.length === 0 ? (
          <p className="muted t-body mt-2 max-w-prose">
            No lasting memory yet. Messages remain in this private workspace; save a
            conclusion explicitly to make it part of your memory.
          </p>
        ) : (
          <ul className="space-y-2">
            {memory.map((e) => (
              <li key={e.id}>
                <p className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
                  {CATEGORY_LABELS[e.category]}
                </p>
                <p className="text-[13px] leading-relaxed">{e.content}</p>
                <p className="muted text-[11px]">saved {relativeTime(e.savedAt)}</p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-1">
          {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((c) => (
            <p key={c} className="text-[11px]">
              <span className="font-semibold">{CATEGORY_LABELS[c]}</span>{" "}
              <span className="muted">{CATEGORY_HINTS[c]}</span>
            </p>
          ))}
        </div>

        <Reason>
          The assistant never decides on its own that something private should become
          permanent memory. A save carries a category and a saver, and a request to
          persist conversation state is refused rather than quietly downgraded.
        </Reason>
      </Card>
    </div>
  );
}
