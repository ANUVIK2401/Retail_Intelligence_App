"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech recognition (Chrome, Edge, Safari). No audio reaches this
 * app: the browser's own recognition service turns speech into text, and only
 * that text is placed in the composer. Firefox has no implementation, so the
 * caller shows an explanation instead of a working mic.
 */

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

export type SpeechState = "idle" | "listening" | "unsupported";

const MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to speak requests.",
  "service-not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to speak requests.",
  "no-speech": "I didn't hear anything. Tap the mic and try again.",
  "audio-capture": "No microphone was found on this device.",
  network: "Voice input needs a network connection in this browser.",
};

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor });
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(handlers: {
  /** Live words while speaking, replaced as recognition firms up. */
  onInterim: (text: string) => void;
  /** Called once when the utterance ends, with everything heard. */
  onFinal: (text: string) => void;
}) {
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!recognitionConstructor()) setState("unsupported");
    return () => recognitionRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setState("unsupported");
      setError("Voice input is not available in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    setError(null);
    finalRef.current = "";
    const recognition = new Constructor();
    recognition.lang = "en-US";
    // One utterance at a time: recognition stops by itself after a pause.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalRef.current += result[0].transcript;
        else interim += result[0].transcript;
      }
      handlersRef.current.onInterim(`${finalRef.current}${interim}`.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") setError(MESSAGES[event.error] ?? "Voice input stopped unexpectedly. Try again.");
    };
    recognition.onend = () => {
      setState("idle");
      recognitionRef.current = null;
      const heard = finalRef.current.trim();
      if (heard) handlersRef.current.onFinal(heard);
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState("listening");
    } catch {
      setError("Voice input could not start. Try again.");
    }
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);
  const toggle = useCallback(() => (recognitionRef.current ? stop() : start()), [start, stop]);

  return { state, error, start, stop, toggle, clearError: () => setError(null) };
}

/** Reads a short reply aloud. Behind the FEATURE_VOICE_REPLIES flag. */
export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.length > 320 ? `${text.slice(0, 317)}…` : text);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}
