"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRODUCT } from "@/config/product";

type Executive = {
  id: string;
  name: string;
  title: string;
};

type ExecutiveOnboardingProps = {
  actor: Executive;
  /** Increment to reopen the tour from outside this component. */
  openRequest?: number;
};

const STEPS = ["Welcome", "Your control", "Start here"] as const;

function completionKey(actorId: string): string {
  return `ecc:executive-onboarding:v1:${actorId}`;
}

/**
 * A local-only first-run experience. It deliberately makes no network calls:
 * completion follows the selected executive in this browser via localStorage.
 */
export function ExecutiveOnboarding({ actor, openRequest = 0 }: ExecutiveOnboardingProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(completionKey(actor.id), "dismissed");
    } catch {
      // Dismissal still closes the tour when storage is unavailable.
    }
    setOpen(false);
  }, [actor.id]);

  useEffect(() => {
    let completed = false;
    try {
      completed = window.localStorage.getItem(completionKey(actor.id)) !== null;
    } catch {
      // A blocked storage API should not prevent the walkthrough from working.
    }
    if (!completed) {
      setStep(0);
      setOpen(true);
    }
  }, [actor.id]);

  useEffect(() => {
    if (openRequest < 1) return;
    setStep(0);
    setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const overlay = overlayRef.current;
    const parent = overlay?.parentElement;
    const siblings = parent
      ? [...parent.children].filter((element): element is HTMLElement =>
          element instanceof HTMLElement && element !== overlay,
        )
      : [];
    const priorInert = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });

    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...(overlay?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        headingRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      siblings.forEach((element, index) => { element.inert = priorInert[index]; });
      document.body.style.overflow = priorOverflow;
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus.focus());
    };
  }, [dismiss, open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => headingRef.current?.focus());
  }, [open, step]);

  function complete() {
    try {
      window.localStorage.setItem(completionKey(actor.id), "complete");
    } catch {
      // Completion still closes the tour when private browsing blocks storage.
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-6"
      style={{ background: "rgba(5, 11, 25, 0.72)", backdropFilter: "blur(12px)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-tour-title"
        aria-describedby="executive-tour-description"
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border shadow-2xl"
        style={{
          borderColor: "var(--hairline)",
          background: "var(--surface)",
          color: "var(--text)",
        }}
      >
        <div
          className="h-1.5 w-full"
          style={{
            background: `linear-gradient(90deg, var(--accent) ${((step + 1) / STEPS.length) * 100}%, var(--sunken) ${((step + 1) / STEPS.length) * 100}%)`,
          }}
          aria-hidden="true"
        />

        <div className="px-5 pb-5 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--accent)" }}>
                Executive setup · {step + 1} of {STEPS.length}
              </p>
              <p className="text-xs muted" aria-hidden="true">{STEPS[step]}</p>
            </div>
            <button
              type="button"
              className="tap grid h-11 w-11 flex-none place-items-center rounded-full text-2xl leading-none transition-colors hover:bg-[var(--sunken)]"
              onClick={dismiss}
              aria-label="Close tour"
              title="Close tour"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          {step === 0 && (
            <WelcomeStep actor={actor} headingRef={headingRef} />
          )}
          {step === 1 && (
            <ControlStep headingRef={headingRef} />
          )}
          {step === 2 && (
            <TourStep actor={actor} headingRef={headingRef} onNavigate={complete} />
          )}

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
              {STEPS.map((label, index) => (
                <span
                  key={label}
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: index === step ? 28 : 8,
                    background: index <= step ? "var(--accent)" : "var(--border)",
                  }}
                  aria-hidden="true"
                />
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {step > 0 && (
                <button type="button" className="btn" onClick={() => setStep((current) => current - 1)}>
                  Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setStep((current) => current + 1)}>
                  Continue <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={complete}>
                  Start with the {PRODUCT.shortName}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function WelcomeStep({ actor, headingRef }: { actor: Executive; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div>
      <div
        className="mb-5 grid h-16 w-16 place-items-center rounded-2xl text-xl font-extrabold"
        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        aria-hidden="true"
      >
        {initials(actor.name)}
      </div>
      <h2 id="executive-tour-title" ref={headingRef} tabIndex={-1} className="max-w-xl text-3xl font-bold sm:text-4xl">
        Welcome, {firstName(actor.name)}.
      </h2>
      <p id="executive-tour-description" className="mt-3 max-w-xl text-base leading-7 muted">
        Your assistant finds time with your team, keeps your inbox moving, and prepares what you need as {actor.title}. Ask in plain words, by text or voice.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <ValueCard icon="01" title="Ask anything" text="Type or speak a request, like finding 30 minutes with two colleagues." />
        <ValueCard icon="02" title="Pick an option" text="Choose from a few clear times, replies, or drafts." />
        <ValueCard icon="03" title="Confirm it" text="Nothing is booked or sent until you say so." />
      </div>
    </div>
  );
}

function ControlStep({ headingRef }: { headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  return (
    <div>
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden="true">
        <ShieldIcon />
      </div>
      <h2 id="executive-tour-title" ref={headingRef} tabIndex={-1} className="text-3xl font-bold sm:text-4xl">
        You stay in control.
      </h2>
      <p id="executive-tour-description" className="mt-3 max-w-xl text-base leading-7 muted">
        The assistant helps you understand and prepare work. Human judgment remains the final step for meaningful changes.
      </p>
      <div className="mt-6 space-y-3">
        <ControlRow number="1" title="Review before action" text="Suggestions and drafts are presented for review instead of being silently applied." />
        <ControlRow number="2" title="Confirm what matters" text="Booking a meeting or sending a reply always waits for your confirmation. Sensitive matters go to the right person." />
        <ControlRow number="3" title="Keep a record" text="Everything the assistant does is written to a history you can review under Settings." />
      </div>
      <p className="mt-4 rounded-xl border px-4 py-3 text-sm leading-6" style={{ borderColor: "var(--border)", background: "var(--sunken)" }}>
        This is a demonstration environment with synthetic records. Never enter confidential or personally sensitive information.
      </p>
    </div>
  );
}

function TourStep({ actor, headingRef, onNavigate }: { actor: Executive; headingRef: React.RefObject<HTMLHeadingElement | null>; onNavigate: () => void }) {
  return (
    <div>
      <p className="mb-3 text-sm font-semibold" style={{ color: "var(--accent)" }}>A tour shaped for {actor.title}</p>
      <h2 id="executive-tour-title" ref={headingRef} tabIndex={-1} className="text-3xl font-bold sm:text-4xl">
        Begin where the day needs you.
      </h2>
      <p id="executive-tour-description" className="mt-3 max-w-xl text-base leading-7 muted">
        Start a conversation, or open your inbox or calendar. You can return to this tour from your profile card at any time.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <TourLink href="/" eyebrow="Start here" title="Chat" text="Try: find 30 minutes next week with Ray and Priya." onClick={onNavigate} />
        <TourLink href="/inbox" eyebrow="Email" title="Inbox" text="Reply fully, reply quickly, or save it for later." onClick={onNavigate} />
        <TourLink href="/schedule" eyebrow="Time" title="Calendar" text="See your week and anything the assistant booked." onClick={onNavigate} />
      </div>
    </div>
  );
}

function ValueCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--sunken)" }}>
      <p className="mb-3 text-xs font-extrabold tracking-wider" style={{ color: "var(--accent)" }}>{icon}</p>
      <h3 className="text-sm font-bold">{title}</h3>
      <p className="mt-1 text-sm leading-5 muted">{text}</p>
    </div>
  );
}

function ControlRow({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--border)" }}>
      <span className="grid h-8 w-8 flex-none place-items-center rounded-full text-xs font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }} aria-hidden="true">
        {number}
      </span>
      <div>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-1 text-sm leading-5 muted">{text}</p>
      </div>
    </div>
  );
}

function TourLink({ href, eyebrow, title, text, onClick }: { href: string; eyebrow: string; title: string; text: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: "var(--border)", background: "var(--sunken)" }}
    >
      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>{eyebrow}</p>
      <h3 className="mt-2 flex items-center justify-between gap-2 text-base font-bold">
        {title}<span className="transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
      </h3>
      <p className="mt-2 text-sm leading-5 muted">{text}</p>
    </Link>
  );
}

function ShieldIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 19 6v5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6z" />
      <path d="m9.5 12 1.7 1.7 3.6-3.8" />
    </svg>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "EC";
}
