"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type AssistantItem = { label: string; detail: string; status: string };
type AssistantPayload = {
  answer?: string;
  error?: string;
  source?: string;
  model?: string;
  summary?: string;
  items?: AssistantItem[];
  deepLink?: { href: string; label: string } | null;
  suggestions?: string[];
};
type Message = {
  role: "user" | "assistant";
  text: string;
  detail?: string;
  items?: AssistantItem[];
  deepLink?: { href: string; label: string } | null;
  suggestions?: string[];
  failedQuestion?: string;
};
const STARTERS = ["What emails need attention?", "What meetings are pending?", "When is Priya Raman busy?"];

export function AssistantPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

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
      const data = await response.json() as AssistantPayload;
      setMessages((current) => [...current, {
        role: "assistant", text: response.ok ? data.summary ?? data.answer ?? "No answer was returned." : data.error ?? "Assistant is unavailable.",
        detail: response.ok ? `${data.source ?? "demo data"} · ${data.model ?? "grounded"}` : undefined,
        items: response.ok && Array.isArray(data.items) ? data.items : undefined,
        deepLink: response.ok ? data.deepLink : undefined,
        suggestions: response.ok && Array.isArray(data.suggestions) ? data.suggestions : undefined,
        failedQuestion: response.ok ? undefined : trimmed,
      }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", text: "Assistant is unavailable. Please try again.", failedQuestion: trimmed }]);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!pending && question.trim().length >= 2) void ask(question);
    }
  }

  return (
    <section aria-label="Executive assistant" className="flex h-full min-h-0 flex-col" style={{ background: "var(--surface)" }}>
      <div className="assistant-panel-head border-b px-5 py-5" style={{ borderColor: "var(--border)" }}>
        <p className="assistant-status text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}><span aria-hidden="true" />Grounded assistant</p>
        <h2 className="mt-1 text-xl font-semibold">Ask the command center</h2>
        <p className="mt-1 text-xs leading-5 muted">Answers use permitted demo records. Nothing is sent, booked, or approved.</p>
        <p className="mt-2 text-[11px] leading-4 muted">If a live AI provider is enabled, your question is sent to that provider to identify its topic. Do not enter confidential information.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">What can I help you find?</p>
            {STARTERS.map((starter) => (
              <button key={starter} type="button" onClick={() => void ask(starter)} disabled={pending}
                className="assistant-starter tap w-full text-left">
                <span>{starter}</span><span aria-hidden="true">&#8594;</span>
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div key={`${index}-${message.role}`} className={`assistant-message rounded-xl border px-4 py-3 text-sm leading-6 ${message.role === "user" ? "assistant-message-user ml-5" : "assistant-message-answer mr-4"}`}
            style={{ borderColor: "var(--border)", background: message.role === "user" ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--bg)" }}>
            <p className="whitespace-pre-wrap">{message.text}</p>
            {message.items && message.items.length > 0 && (
              <ul className="assistant-result-list">
                {message.items.map((item, itemIndex) => (
                  <li key={`${item.label}-${itemIndex}`}>
                    <span className="assistant-result-dot" data-status={item.status} aria-hidden="true" />
                    <span className="min-w-0 flex-1"><strong>{item.label}</strong><small>{item.detail}</small></span>
                  </li>
                ))}
              </ul>
            )}
            <div className="assistant-message-actions">
              {message.deepLink && <Link href={message.deepLink.href} className="assistant-deep-link tap">{message.deepLink.label}<span aria-hidden="true">&#8594;</span></Link>}
              {message.failedQuestion && <button type="button" className="assistant-retry tap" disabled={pending} onClick={() => void ask(message.failedQuestion!)}>Try again</button>}
            </div>
            {message.detail && <p className="mt-2 text-[11px] muted">{message.detail}</p>}
            {message.suggestions && message.suggestions.length > 0 && (
              <div className="assistant-followups" aria-label="Suggested follow-up questions">
                {message.suggestions.slice(0, 2).map((suggestion) => <button key={suggestion} type="button" disabled={pending} onClick={() => void ask(suggestion)}>{suggestion}</button>)}
              </div>
            )}
          </div>
        ))}
        {pending && <div className="assistant-thinking" role="status"><span /><span /><span /><span className="sr-only">Checking permitted records…</span></div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="border-t p-4" style={{ borderColor: "var(--border)" }}>
        <label htmlFor="assistant-question" className="sr-only">Ask a question</label>
        <textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleComposerKeyDown}
          rows={2} maxLength={500} placeholder="Ask about availability, meetings, or email…"
          className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] muted">Enter to send · Shift+Enter for a new line</span><button type="submit" disabled={pending || question.trim().length < 2} className="btn btn-primary">Ask</button></div>
      </form>
    </section>
  );
}
