"use client";

import { useCallback, useEffect, useState } from "react";
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
  conversation_state: "Working state. Not persisted, by design.",
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
  const [saveFor, setSaveFor] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}`);
    if (!res.ok) return;
    const body = await res.json();
    setWorkspace(body.workspace);
    setMessages(body.messages);
    setMemory(body.memory);
  }, []);

  useEffect(() => {
    void (async () => {
      const listed = await fetch("/api/workspaces").then((r) => r.json());
      const existing: Workspace | undefined = listed.workspaces?.[0];
      if (existing) {
        await load(existing.id);
        return;
      }
      const created = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: SEED_TITLE }),
      }).then((r) => r.json());
      await load(created.workspace.id);
    })();
  }, [load]);

  async function send() {
    if (!workspace || input.trim().length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: input.trim() }),
      });
      const body = await res.json();
      if (res.ok) {
        setMessages(body.messages);
        setInput("");
      } else {
        setNotice(body.error ?? "The message was not added.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function save(messageId: string, content: string, category: MemoryCategory) {
    if (!workspace) return;
    setNotice(null);
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
      setMemory((m) => [...m, body.entry]);
      setSaveFor(null);
      setNotice(`Saved to ${CATEGORY_LABELS[category].toLowerCase()}.`);
    } else {
      setNotice(body.error ?? "Nothing was saved.");
    }
  }

  if (!workspace) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Workspace</h1>
        <p className="muted text-sm">
          Private to you. Attached documents and saved conclusions stay inside this
          project.
        </p>
      </header>

      <Card title={workspace.title}>
        {messages.length === 0 ? (
          <Empty>Start the thread. Nothing is saved until you save it.</Empty>
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
                          onClick={() => void save(m.id, m.text, c)}
                        >
                          {CATEGORY_LABELS[c]}
                        </button>
                      ))}
                      <button
                        className="btn text-[11px]"
                        style={{ minHeight: 44 }}
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
          <p className="mt-2 text-[12px]" style={{ color: "var(--accent)" }}>
            {notice}
          </p>
        )}
      </Card>

      <Card title="Memory">
        {memory.length === 0 ? (
          <p className="muted text-sm">
            Nothing saved. The thread stays in conversation state, which is never
            persisted, until you save something into one of the lasting categories.
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
