"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryCategory, MemoryEntry, Workspace, WorkspaceMessage } from "@/core/contracts";
import { Card, Empty, Reason, relativeTime } from "@/components/primitives";
import { changeProjectLink } from "@/components/projectLinks";

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
  const [allNotes, setAllNotes] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; workspaceIds: string[] }[]>([]);
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
      setAllNotes(listed.workspaces as Workspace[]);
      fetch("/api/projects").then((response) => response.ok ? response.json() : null)
        .then((data) => setProjects(data?.projects ?? [])).catch(() => setProjects([]));
      // A project page can open its own notes with ?ws=<id>.
      const requested = new URLSearchParams(window.location.search).get("ws");
      const existing: Workspace | undefined = (listed.workspaces as Workspace[]).find((item) => item.id === requested) ?? listed.workspaces?.[0];
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
      // The seeded notes belong to the seeded Denim project, so its Notes tab
      // shows saved project context. Best effort: other personas have no such project.
      await changeProjectLink("pr_denim", { op: "add", kind: "workspace", id: created.workspace.id });
      await load(created.workspace.id);
    } catch {
      setLoadError("Your notes could not be loaded. Please try again.");
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

  if (!workspace && !loadError) return <p className="muted py-10 text-center text-sm" role="status">Loading your notes…</p>;
  if (!workspace) return (
    <Card title="Notes unavailable">
      <p className="muted text-sm">{loadError}</p>
      <button type="button" className="btn mt-3" onClick={() => void initialize()}>Retry</button>
    </Card>
  );

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Private</p>
        <h1 className="t-title mt-2">Notes</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Personal notes, ideas, tasks, and reminders. Think out loud with the assistant; you decide
          which conclusions become lasting memory.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {allNotes.length > 1 && (
          <label className="add-to-project">
            <span className="sr-only">Open notes</span>
            <select value={workspace.id} onChange={(event) => void load(event.target.value)}>
              {allNotes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
        )}
        {projects.length > 0 && (() => {
          const linked = projects.find((project) => project.workspaceIds.includes(workspace.id));
          return linked ? (
            <span className="project-chip">In project: {linked.name}</span>
          ) : (
            <label className="add-to-project">
              <span className="sr-only">Add these notes to a project</span>
              <select value="" onChange={async (event) => {
                const projectId = event.target.value;
                if (!projectId) return;
                if (await changeProjectLink(projectId, { op: "add", kind: "workspace", id: workspace.id })) setProjects((current) => current.map((project) => project.id === projectId ? { ...project, workspaceIds: [...project.workspaceIds, workspace.id] } : project));
              }}>
                <option value="">Add to project…</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
          );
        })()}
      </div>

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
