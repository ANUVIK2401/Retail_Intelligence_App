"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ChatContext, ChatPart } from "@/core/contracts";
import { Composer } from "@/components/chat/Composer";
import { MessageParts } from "@/components/chat/MessageParts";
import { TodayPanel } from "@/components/chat/TodayPanel";
import { SUGGESTIONS, greetingFor, partToText } from "@/components/chat/parts";
import { speak } from "@/components/chat/useSpeechRecognition";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session";
import { PRODUCT } from "@/config/product";

type Turn = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  parts?: ChatPart[];
  model?: string;
  /** Set when a request failed, so the turn can offer a retry. */
  failed?: string;
};

type Thread = { turns: Turn[]; context: ChatContext | null };

const PANEL_KEY = "assistant:today-panel";
const READ_ALOUD_KEY = "assistant:read-aloud";
const threadKey = (actorId: string) => `assistant:thread:v1:${actorId}`;

export default function ChatPage() {
  return <Suspense fallback={null}><Chat /></Suspense>;
}

function Chat() {
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [thread, setThread] = useState<Thread>({ turns: [], context: null });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [readAloud, setReadAloud] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const restoredFor = useRef<string | null>(null);

  // Restore this tab's conversation and panel state. Session storage only:
  // it is a convenience, and the server never depends on it.
  useEffect(() => {
    setHour(new Date().getHours());
    try {
      const panel = window.sessionStorage.getItem(PANEL_KEY);
      // Default: open on wide screens, closed where it would cover the chat.
      setPanelOpen(panel ? panel === "open" : window.matchMedia("(min-width: 1280px)").matches);
      setReadAloud(window.localStorage.getItem(READ_ALOUD_KEY) === "1");
    } catch { /* Storage can be unavailable; defaults apply. */ }
  }, []);

  useEffect(() => {
    if (!session || restoredFor.current === session.actor.id) return;
    restoredFor.current = session.actor.id;
    try {
      const saved = window.sessionStorage.getItem(threadKey(session.actor.id));
      if (saved && !params.get("new")) setThread(JSON.parse(saved) as Thread);
    } catch { /* A corrupt saved thread just starts fresh. */ }
  }, [session, params]);

  useEffect(() => {
    if (!session) return;
    try { window.sessionStorage.setItem(threadKey(session.actor.id), JSON.stringify(thread)); } catch { /* ignore */ }
  }, [thread, session]);

  // "Ask" from another page lands here with the composer prefilled.
  useEffect(() => {
    const ask = params.get("ask");
    if (ask) setInput(ask);
    if (ask || params.get("new")) {
      if (params.get("new")) setThread({ turns: [], context: null });
      router.replace("/", { scroll: false });
    }
  }, [params, router]);

  useEffect(() => {
    const reset = () => { setThread({ turns: [], context: null }); setInput(""); };
    window.addEventListener("assistant:new-chat", reset);
    return () => window.removeEventListener("assistant:new-chat", reset);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [thread.turns.length, pending]);

  function togglePanel(open: boolean) {
    setPanelOpen(open);
    try { window.sessionStorage.setItem(PANEL_KEY, open ? "open" : "closed"); } catch { /* ignore */ }
  }

  const send = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (question.length < 2 || pending) return;
    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", text: question };
    setThread((current) => ({ ...current, turns: [...current.turns, userTurn] }));
    setInput("");
    setPending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, context: thread.context }),
      });
      const data = await response.json() as { parts?: ChatPart[]; context?: ChatContext | null; model?: string; summary?: string; error?: string };
      if (!response.ok || !Array.isArray(data.parts)) throw new Error(data.error ?? "The assistant is unavailable right now.");
      setThread((current) => ({
        turns: [...current.turns, { id: crypto.randomUUID(), role: "assistant", parts: data.parts, model: data.model }],
        context: data.context ?? null,
      }));
      if (readAloud && data.summary) speak(data.summary);
    } catch (cause) {
      setThread((current) => ({
        ...current,
        turns: [...current.turns, { id: crypto.randomUUID(), role: "assistant", text: cause instanceof Error ? cause.message : "The assistant is unavailable right now.", failed: question }],
      }));
    } finally {
      setPending(false);
    }
  }, [pending, readAloud, thread.context]);

  const onBooked = useCallback((part: Extract<ChatPart, { type: "event_confirmation" }>) => {
    // Context is kept: "actually make it 45 and add Nina" after a booking
    // revises the same request and offers fresh times.
    setThread((current) => ({ ...current, turns: [...current.turns, { id: crypto.randomUUID(), role: "assistant", parts: [part] }] }));
    window.dispatchEvent(new CustomEvent("assistant:changed"));
  }, []);

  const firstName = session?.actor.name.split(" ")[0];
  const empty = thread.turns.length === 0;

  return (
    <div className="chat-layout" data-panel={panelOpen ? "open" : "closed"}>
      <section className="chat-column" aria-label="Conversation">
        <div className="chat-toolbar">
          <button type="button" className="chat-panel-toggle tap" aria-expanded={panelOpen} aria-controls="today-panel" onClick={() => togglePanel(!panelOpen)}>
            <Icon name="panel" size={18} /><span>Today</span>
          </button>
        </div>

        <div className="chat-scroll" aria-live="polite">
          {empty ? (
            <div className="chat-empty">
              <p className="chat-kicker"><span aria-hidden="true" className="chat-kicker-mark" />{PRODUCT.name}</p>
              <h1 className="chat-greeting">{hour === null ? "Hello" : greetingFor(hour)}{firstName ? `, ${firstName}` : ""}.</h1>
              <p className="chat-sub">What can I take off your plate? Ask by typing or tap the mic to speak.</p>
              <div className="chat-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion.prompt} type="button" className="suggestion-card tap" onClick={() => void send(suggestion.prompt)} disabled={pending}>
                    <span className="suggestion-title">{suggestion.title}</span>
                    <span className="suggestion-detail">{suggestion.detail}</span>
                    <Icon name="arrow" size={16} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="chat-thread">
              {thread.turns.map((turn) => (
                <li key={turn.id} className={`turn turn-${turn.role}`}>
                  {turn.role === "user" ? (
                    <p className="bubble">{turn.text}</p>
                  ) : (
                    <div className="answer">
                      <span className="answer-mark" aria-hidden="true"><Icon name="spark" size={15} /></span>
                      <div className="answer-body">
                        {turn.parts ? (
                          <MessageParts parts={turn.parts} handlers={{ onPrompt: (prompt) => void send(prompt), onBooked, disabled: pending }} />
                        ) : <p className="part-text">{turn.text}</p>}
                        {turn.failed && <button type="button" className="chip tap mt-2" onClick={() => void send(turn.failed!)} disabled={pending}>Try again</button>}
                        {turn.parts && <p className="sr-only">{turn.parts.map(partToText).join(" ")}</p>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {pending && (
                <li className="turn turn-assistant" role="status">
                  <div className="answer"><span className="answer-mark" aria-hidden="true"><Icon name="spark" size={15} /></span><div className="assistant-thinking"><span /><span /><span /><span className="sr-only">Checking calendars and records…</span></div></div>
                </li>
              )}
            </ol>
          )}
          <div ref={endRef} />
        </div>

        <div className="chat-composer">
          <Composer
            value={input}
            onChange={setInput}
            onSend={(text) => void send(text)}
            pending={pending}
            readAloud={session?.features.voiceReplies ? {
              enabled: readAloud,
              onToggle: (enabled) => { setReadAloud(enabled); try { window.localStorage.setItem(READ_ALOUD_KEY, enabled ? "1" : "0"); } catch { /* ignore */ } },
            } : undefined}
          />
        </div>
      </section>

      {panelOpen && <button type="button" className="today-backdrop" aria-label="Close Today panel" onClick={() => togglePanel(false)} />}
      <aside id="today-panel" className="today-panel" aria-label="Today" hidden={!panelOpen}>
        <TodayPanel approvalsEnabled={session?.features.approvals ?? false} onClose={() => togglePanel(false)} onAsk={(prompt) => { void send(prompt); if (!window.matchMedia("(min-width: 1280px)").matches) togglePanel(false); }} />
      </aside>
    </div>
  );
}
