import { fenceUntrusted } from "@/core/ai/gateway";
import { CORPUS, type KnowledgeSource } from "@/data/knowledge";

/**
 * Insight retrieval.
 *
 * The ordering in `retrieve()` is the point of this module, not the ranking
 * quality. Permission filtering happens BEFORE embedding and ranking, so a
 * chunk the acting person may not read is never scored, never ranked, and
 * never reaches a prompt. Filtering after retrieval would mean the model had
 * already seen it, and a paraphrase is a leak.
 *
 * Embeddings are computed locally and deterministically so the demo runs with
 * no network and produces the same answer every time. A hosted embedding model
 * is a swap of `embed()` alone.
 */

export const RETRIEVAL_VERSION = "2026-09-16.r1";

/** Dimensions of the local embedding. Small is fine: the corpus is tiny. */
const DIM = 256;
/** Words per chunk, with overlap so a sentence is not cut mid-claim. */
const CHUNK_WORDS = 45;
const CHUNK_OVERLAP = 15;
/** How many chunks are passed to synthesis. */
const TOP_K = 4;
/** Below this cosine similarity a chunk is not considered responsive. */
const MIN_SCORE = 0.08;
/**
 * A chunk must also share this many distinct content words with the question.
 * Cosine alone is too generous on a small corpus: an unrelated passage can
 * score 0.1 on incidental vocabulary and then be presented as an answer. An
 * executive reading a confident answer to a question the corpus does not
 * address is a worse failure than being told nothing was found.
 */
const MIN_TERM_OVERLAP = 2;

export type Chunk = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  text: string;
  allowedFunctions: string[];
};

export type ScoredChunk = Chunk & { score: number };

export type ExcludedSource = {
  id: string;
  label: string;
  reason: string;
};

export type InsightAnswer = {
  question: string;
  answer: string;
  citations: { sourceId: string; label: string; quote: string; score: number }[];
  /** Sources never retrieved because this function is not cleared for them. */
  excluded: ExcludedSource[];
  consideredChunks: number;
  retrievalVersion: string;
};

/* ------------------------------------------------------------------ */
/* Chunking                                                            */
/* ------------------------------------------------------------------ */

export function chunkSource(source: KnowledgeSource): Chunk[] {
  const words = source.excerpt.split(/\s+/).filter(Boolean);
  const chunks: Chunk[] = [];
  const stride = CHUNK_WORDS - CHUNK_OVERLAP;

  for (let start = 0; start < words.length; start += stride) {
    const slice = words.slice(start, start + CHUNK_WORDS);
    if (slice.length === 0) break;
    chunks.push({
      id: `${source.id}#${chunks.length}`,
      sourceId: source.id,
      sourceLabel: source.label,
      text: slice.join(" "),
      allowedFunctions: source.allowedFunctions,
    });
    if (start + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
}

/* ------------------------------------------------------------------ */
/* Local deterministic embedding                                       */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "is",
  "are", "was", "were", "be", "by", "with", "as", "that", "this", "it", "from",
  "we", "our", "us", "i", "you", "what", "which", "how", "do", "does", "did",
  "should", "would", "could", "about", "than", "then", "so", "not",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

/** Crude suffix stripping. Enough to match "carriers" to "carrier". */
function stem(word: string): string {
  for (const suffix of ["ing", "ies", "es", "s"]) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) {
      return suffix === "ies" ? `${word.slice(0, -3)}y` : word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** FNV-1a. Stable across runs and processes, unlike a JS object hash. */
function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % DIM;
}

export function embed(text: string): Float64Array {
  const vec = new Float64Array(DIM);
  const tokens = tokenize(text);
  for (const token of tokens) {
    vec[hashToken(token)] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < DIM; i += 1) vec[i] /= norm;
  return vec;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let dot = 0;
  for (let i = 0; i < DIM; i += 1) dot += a[i] * b[i];
  return dot;
}

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

/**
 * Returns the chunks this function may read, ranked against the question.
 *
 * Step order matters and is asserted by the demo verification script:
 *   1. filter the corpus by function
 *   2. chunk what survives
 *   3. embed and rank
 * Nothing the person may not read is embedded at all.
 */
export function retrieve(
  question: string,
  actorFunction: string,
): { ranked: ScoredChunk[]; excluded: ExcludedSource[]; consideredChunks: number } {
  const permitted: KnowledgeSource[] = [];
  const excluded: ExcludedSource[] = [];

  for (const source of CORPUS) {
    if (source.allowedFunctions.includes(actorFunction)) {
      permitted.push(source);
    } else {
      excluded.push({
        id: source.id,
        label: source.label,
        reason: `Cleared for ${source.allowedFunctions.join(", ")}; your function is ${actorFunction}.`,
      });
    }
  }

  const chunks = permitted.flatMap(chunkSource);
  const qv = embed(question);
  const qTerms = new Set(tokenize(question));

  const ranked = chunks
    .map((c) => ({ ...c, score: cosine(qv, embed(c.text)) }))
    .filter((c) => c.score >= MIN_SCORE && termOverlap(qTerms, c.text) >= MIN_TERM_OVERLAP)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K);

  return { ranked, excluded, consideredChunks: chunks.length };
}

/** Distinct content words shared between the question and a passage. */
function termOverlap(questionTerms: Set<string>, text: string): number {
  return new Set(tokenize(text).filter((t) => questionTerms.has(t))).size;
}

/* ------------------------------------------------------------------ */
/* Synthesis                                                           */
/* ------------------------------------------------------------------ */

/**
 * Builds the synthesis prompt. Retrieved chunks are untrusted content — they
 * are documents, and a document can contain text shaped like an instruction —
 * so they are fenced exactly like email bodies are.
 */
export function buildSynthesisPrompt(question: string, chunks: ScoredChunk[]): string {
  return [
    "Answer the executive's question using ONLY the numbered passages below.",
    "Every factual claim must end with the passage number it came from, like [2].",
    "If the passages do not answer the question, say so plainly. Do not use outside knowledge.",
    "",
    `Question: ${question}`,
    "",
    ...chunks.map((c, i) =>
      fenceUntrusted(`passage-${i + 1}`, `[${i + 1}] ${c.sourceLabel}\n${c.text}`),
    ),
  ].join("\n");
}

/**
 * Extractive synthesis over the retrieved chunks.
 *
 * Deliberately not a model call. The claim this module has to support is that
 * every sentence is traceable to a retrieved passage; an extractive answer
 * makes that true by construction rather than by asking a model to behave.
 * `buildSynthesisPrompt` is the seam for generative synthesis once the client
 * accepts a provider, and the citation contract does not change.
 */
export function answer(question: string, actorFunction: string): InsightAnswer {
  const { ranked, excluded, consideredChunks } = retrieve(question, actorFunction);

  if (ranked.length === 0) {
    return {
      question,
      answer:
        consideredChunks === 0
          ? "No approved source is cleared for your function, so nothing was retrieved."
          : "No approved source cleared for your function addresses this question. Nothing was inferred beyond the retrieved material.",
      citations: [],
      excluded,
      consideredChunks,
      retrievalVersion: RETRIEVAL_VERSION,
    };
  }

  const sentences = ranked.map((c, i) => `${bestSentence(question, c.text)} [${i + 1}]`);

  return {
    question,
    answer: sentences.join(" "),
    citations: ranked.map((c) => ({
      sourceId: c.sourceId,
      label: c.sourceLabel,
      quote: c.text,
      score: Number(c.score.toFixed(3)),
    })),
    excluded,
    consideredChunks,
    retrievalVersion: RETRIEVAL_VERSION,
  };
}

/** Picks the sentence inside a chunk that best overlaps the question. */
function bestSentence(question: string, chunkText: string): string {
  const qTokens = new Set(tokenize(question));
  const sentences = chunkText.split(/(?<=[.;])\s+/).filter((s) => s.trim().length > 20);
  if (sentences.length === 0) return chunkText.trim();

  let best = sentences[0];
  let bestScore = -1;
  for (const s of sentences) {
    const overlap = tokenize(s).filter((t) => qTokens.has(t)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = s;
    }
  }
  return best.trim().replace(/[.;]$/, ".");
}

/* ------------------------------------------------------------------ */
/* Curated insight visibility                                          */
/* ------------------------------------------------------------------ */

/**
 * Filters pre-written insights by checking EVERY cited source against this
 * actor's own function.
 *
 * The earlier version built a union of `allowedFunctions` across the actor's
 * permitted sources and matched insights against that union. Because
 * `src_dc_weekly` is cleared for logistics AND operations, a logistics reader
 * inherited operations' clearance and received an insight citing
 * `src_traffic`, which logistics may not read. Permission is not transitive
 * through a shared document.
 */
export function visibleInsights<T extends { function: string; citations: { sourceId: string }[] }>(
  insights: T[],
  actorFunction: string,
): T[] {
  const cleared = new Set(
    CORPUS.filter((s) => s.allowedFunctions.includes(actorFunction)).map((s) => s.id),
  );
  return insights.filter((i) => i.citations.every((c) => cleared.has(c.sourceId)));
}
