"use client";

import { useCallback, useEffect, useState } from "react";
import type { Insight, PolicyDecision } from "@/core/contracts";
import { Card, Empty, Reason } from "@/components/primitives";

type Payload = {
  decision: PolicyDecision;
  sources: { id: string; label: string; kind: string }[];
  insights: Insight[];
  excludedCount: number;
  retrievalVersion: string;
};

type AnswerPayload = {
  question: string;
  answer: string;
  citations: { sourceId: string; label: string; quote: string; score: number }[];
  excluded: { id: string; label: string; reason: string }[];
  consideredChunks: number;
  retrievalVersion: string;
};

const EXAMPLES = [
  "What is driving freight cost this quarter?",
  "Should the launch post go out under the CEO's profile?",
  "Why are Southwest comps trailing?",
];

export default function InsightsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AnswerPayload | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/insights");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.sources) || !Array.isArray(body.insights)) {
        throw new Error("Invalid insights response");
      }
      setData(body);
    } catch {
      setLoadError("Insights could not be loaded. Please try again.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Retrieval failed.");
        setResult(null);
      } else {
        if (!Array.isArray(body?.citations) || !Array.isArray(body?.excluded)) {
          throw new Error("Invalid retrieval response");
        }
        setResult(body);
      }
    } catch {
      setError("Retrieval could not be completed. Please try again.");
      setResult(null);
    } finally {
      setAsking(false);
    }
  }

  if (!data && !loadError) return <p className="muted py-10 text-center text-sm" role="status">Loading insights…</p>;
  if (!data) return (
    <Card title="Insights unavailable">
      <p className="muted text-sm">{loadError}</p>
      <button type="button" className="btn mt-3" onClick={() => void load()}>Retry</button>
    </Card>
  );

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Business signals</p>
        <h1 className="t-title mt-2">Insights</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Different functions get different insights from different sources. Every claim
          carries the document it came from.
        </p>
      </header>

      {loadError && (
        <Card title="Insights may be out of date">
          <p className="muted text-sm">{loadError}</p>
          <button type="button" className="btn mt-3" onClick={() => void load()}>Retry</button>
        </Card>
      )}

      <Card title="Ask the approved corpus">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
          className="space-y-2"
        >
          <label htmlFor="insight-q" className="sr-only">
            Your question
          </label>
          <textarea
            id="insight-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="Ask a question about the approved sources…"
            className="w-full rounded-lg border p-2.5 text-[13px] leading-relaxed"
            style={{ borderColor: "var(--border)", background: "var(--bg)" }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={asking || question.trim().length < 3}
              style={{ minHeight: 44 }}
            >
              {asking ? "Retrieving…" : "Retrieve"}
            </button>
            {result && (
              <button
                type="button"
                className="btn"
                style={{ minHeight: 44 }}
                onClick={() => {
                  setResult(null);
                  setQuestion("");
                }}
              >
                Clear
              </button>
            )}
          </div>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              className="btn text-[11px]"
              style={{ minHeight: 44 }}
              disabled={asking}
              onClick={() => {
                setQuestion(e);
                void ask(e);
              }}
            >
              {e}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-[13px]" role="alert" style={{ color: "var(--high)" }}>
            {error}
          </p>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <p className="text-[13px] leading-relaxed">{result.answer}</p>

            {result.citations.length > 0 && (
              <ol className="space-y-2">
                {result.citations.map((c, i) => (
                  <li key={`${c.sourceId}-${i}`} className="text-xs">
                    <p className="font-medium" style={{ color: "var(--accent)" }}>
                      [{i + 1}] {c.label}{" "}
                      <span className="muted font-normal">similarity {c.score}</span>
                    </p>
                    <p className="muted mt-0.5 leading-relaxed">{c.quote}</p>
                  </li>
                ))}
              </ol>
            )}

            <div
              className="rounded-lg border p-2.5"
              style={{ borderColor: "var(--border)" }}
            >
              <p className="text-[12px] font-medium">
                {result.excluded.length} source
                {result.excluded.length === 1 ? "" : "s"} excluded before retrieval
              </p>
              {result.excluded.length === 0 ? (
                <p className="muted mt-1 text-[11px]">
                  Your function is cleared for the whole approved corpus.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {result.excluded.map((e) => (
                    <li key={e.id} className="muted text-[11px] leading-relaxed">
                      <span className="font-medium">{e.label}</span>: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted mt-2 text-[11px] leading-relaxed">
                Excluded sources were never chunked, embedded, or ranked.
                {" "}
                {result.consideredChunks} permitted passage
                {result.consideredChunks === 1 ? "" : "s"} were scored. Filtering after
                retrieval would mean the model had already read the content.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card title="Approved sources for your function">
        {data.sources.length === 0 ? (
          <Empty>No approved sources for this function.</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.sources.map((s) => (
              <li key={s.id} className="flex items-baseline gap-2">
                <span className="badge badge-low">{s.kind.replace(/_/g, " ")}</span>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        )}
        {data.excludedCount > 0 && (
          <p className="muted mt-3 text-xs">
            {data.excludedCount} further source
            {data.excludedCount === 1 ? "" : "s"} exist but are not cleared for your
            function, so they were never retrieved.
          </p>
        )}
        <Reason>{data.decision.reason}</Reason>
      </Card>

      {data.insights.map((i) => (
        <Card key={i.id} title={i.function.toUpperCase()}>
          <h2 className="text-sm font-semibold leading-snug">{i.headline}</h2>
          <p className="mt-2 text-[13px] leading-relaxed">{i.body}</p>
          <p className="mt-3 text-[11px]" style={{ color: "var(--accent)" }}>
            Source: {i.citations.map((c) => c.label).join(", ")}
          </p>
        </Card>
      ))}

      <Card title="Prototype boundary">
        <p className="muted text-[13px] leading-relaxed">
          Retrieval is real (chunk, embed, filter by permission, rank, cite), but it runs
          over synthetic documents standing in for the client&apos;s approved reports, and
          the embedding is computed locally so the demo needs no network. Open-web
          ingestion waits until source licensing, reliability, confidentiality, and
          retention are settled with them. Retrieval version {data.retrievalVersion}.
        </p>
      </Card>
    </div>
  );
}
