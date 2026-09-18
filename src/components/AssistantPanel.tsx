"use client";

import { useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; text: string; detail?: string };
const STARTERS = ["What emails need attention?", "What meetings are pending?", "When is Priya Raman busy?"];

export function AssistantPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);

  async function ask(value: string) {
    const trimmed = value.trim();
    if (pending || trimmed.length < 2) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setQuestion("");
    setPending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json() as { answer?: string; error?: string; source?: string; model?: string };
      setMessages((current) => [...current, {
        role: "assistant", text: response.ok ? data.answer ?? "No answer was returned." : data.error ?? "Assistant is unavailable.",
        detail: response.ok ? `${data.source ?? "demo data"} · ${data.model ?? "grounded"}` : undefined,
      }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "Assistant is unavailable. Please try again." }]);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <section aria-label="Executive assistant" className="flex h-full min-h-0 flex-col" style={{ background: "var(--surface)" }}>
      <div className="border-b px-5 py-5" style={{ borderColor: "var(--border)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>Read-only assistant</p>
        <h2 className="mt-1 text-lg font-semibold">Ask the command center</h2>
        <p className="mt-1 text-xs leading-5 muted">Answers use permitted demo records. Nothing is sent, booked, or approved.</p>
        <p className="mt-2 text-[11px] leading-4 muted">If a live AI provider is enabled, your question is sent to that provider to identify its topic. Do not enter confidential information.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">What can I help you find?</p>
            {STARTERS.map((starter) => (
              <button key={starter} type="button" onClick={() => void ask(starter)} disabled={pending}
                className="btn w-full justify-start text-left text-xs leading-5">
                {starter}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`rounded-xl border px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-5" : "mr-4"}`}
            style={{ borderColor: "var(--border)", background: message.role === "user" ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--bg)" }}>
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.detail && <p className="mt-2 text-[11px] muted">{message.detail}</p>}
          </div>
        ))}
        {pending && <p className="text-sm muted">Checking permitted records…</p>}
      </div>
      <form onSubmit={submit} className="border-t p-4" style={{ borderColor: "var(--border)" }}>
        <label htmlFor="assistant-question" className="sr-only">Ask a question</label>
        <textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)}
          rows={2} maxLength={500} placeholder="Ask about availability, meetings, or email…"
          className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        <button type="submit" disabled={pending || question.trim().length < 2} className="btn btn-primary mt-2 w-full">Ask assistant</button>
      </form>
    </section>
  );
}
