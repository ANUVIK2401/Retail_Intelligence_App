"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icons";
import { useSpeechRecognition } from "./useSpeechRecognition";

const AUTO_SEND_KEY = "assistant:auto-send-voice";

function readSetting(key: string): boolean {
  try { return window.localStorage.getItem(key) === "1"; } catch { return false; }
}
function writeSetting(key: string, value: boolean): void {
  try { window.localStorage.setItem(key, value ? "1" : "0"); } catch { /* Settings are a convenience. */ }
}

export function Composer({
  value, onChange, onSend, pending, readAloud,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  pending: boolean;
  /** Present only when the read-aloud flag is on. */
  readAloud?: { enabled: boolean; onToggle: (enabled: boolean) => void };
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autoSend, setAutoSend] = useState(false);
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;

  useEffect(() => setAutoSend(readSetting(AUTO_SEND_KEY)), []);

  const speech = useSpeechRecognition({
    onInterim: (text) => onChange(text),
    onFinal: (text) => {
      onChange(text);
      if (autoSendRef.current) onSend(text);
      else textareaRef.current?.focus();
    },
  });

  // Grow with the text, up to a limit, like every chat composer.
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [value]);

  // Ctrl+Shift+Space toggles the mic from anywhere on the chat page.
  const toggleMic = speech.toggle;
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMic]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!pending && value.trim().length >= 2) onSend(value);
    }
  }

  const listening = speech.state === "listening";
  const unsupported = speech.state === "unsupported";

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        data-listening={listening ? "true" : undefined}
        onSubmit={(event) => { event.preventDefault(); if (!pending && value.trim().length >= 2) onSend(value); }}
      >
        <label htmlFor="chat-input" className="sr-only">Message the assistant</label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={500}
          placeholder={listening ? "Listening…" : "Ask to find a time, check email, or anything else"}
          className="composer-input"
        />
        <div className="composer-buttons">
          <button
            type="button"
            className="composer-mic tap"
            data-state={speech.state}
            aria-label={unsupported ? "Voice input is not supported in this browser" : listening ? "Stop listening" : "Speak your request"}
            aria-pressed={listening}
            aria-disabled={unsupported || undefined}
            aria-keyshortcuts="Control+Shift+Space"
            title={unsupported ? "Voice input is not supported in this browser. Try Chrome, Edge, or Safari." : "Speak (Ctrl+Shift+Space)"}
            onClick={() => speech.toggle()}
          >
            <Icon name={listening ? "stop" : "mic"} size={19} />
          </button>
          <button type="submit" className="composer-send tap" aria-label="Send" disabled={pending || value.trim().length < 2}>
            <Icon name="send" size={19} />
          </button>
        </div>
      </form>
      <div className="composer-footer">
        <p role="status" aria-live="polite" className={speech.error ? "composer-error" : "composer-hint"}>
          {speech.error ?? (listening ? "Listening. Pause when you are done, or tap stop." : "Enter to send · Shift+Enter for a new line")}
        </p>
        <div className="composer-settings">
          {!unsupported && (
            <label className="composer-toggle">
              <input type="checkbox" checked={autoSend} onChange={(event) => { setAutoSend(event.target.checked); writeSetting(AUTO_SEND_KEY, event.target.checked); }} />
              Send after speaking
            </label>
          )}
          {readAloud && (
            <label className="composer-toggle">
              <input type="checkbox" checked={readAloud.enabled} onChange={(event) => readAloud.onToggle(event.target.checked)} />
              Read replies aloud
            </label>
          )}
        </div>
      </div>
      <p className="composer-privacy">
        Synthetic demo data only. Voice is transcribed by your browser&apos;s own speech service; no audio is sent to this app. Nothing is booked or sent until you confirm.
      </p>
    </div>
  );
}
