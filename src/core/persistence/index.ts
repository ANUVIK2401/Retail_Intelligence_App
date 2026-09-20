import { Pool } from "pg";
import { createHmac } from "node:crypto";
import { ACTOR_HEADER, MEMBER_HEADER } from "@/core/deployment/access";
import { freshState, stateContext, type State } from "@/core/store";

const MAP_KEYS = ["assessments", "approvals", "proposals", "publications", "workspaces", "messages", "memory", "mockDrafts", "mockEvents"] as const;
const TTL_MS = 24 * 60 * 60 * 1000;
export function scopeSessionId(cookieId: string, actorId: string, memberEmail: string, secret: string): string {
  return createHmac("sha256", secret).update(`${memberEmail.toLowerCase()}:${actorId}:${cookieId}`).digest("hex");
}
export function serializeState(state: State): string {
  return JSON.stringify({ ...state, ...Object.fromEntries(MAP_KEYS.map((key) => [key, [...state[key].entries()]])) });
}
export function deserializeState(value: string | Record<string, unknown>): State {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const base = freshState();
  return { ...base, ...parsed, ...Object.fromEntries(MAP_KEYS.map((key) => [key, new Map(parsed[key] ?? [])])),
    // Configuration is server-owned; deployment changes apply to existing sessions.
    settings: { ...base.settings, simulateCompromisedModel: parsed.settings?.simulateCompromisedModel === true },
  } as State;
}

export interface DatabaseClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface DatabasePool { connect(): Promise<DatabaseClient> }
let pool: Pool | undefined;
function database(): DatabasePool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for durable demo sessions.");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000 });
  return pool;
}
const SCHEMA = `CREATE TABLE IF NOT EXISTS ecc_demo_sessions (
  id text PRIMARY KEY, state jsonb NOT NULL, expires_at timestamptz NOT NULL
)`;

/** One row lock covers the entire handler, including simulated connector effects. */
export async function runDatabaseSession<T>(id: string, operation: () => Promise<T>, db: DatabasePool = database(), sharedId?: string): Promise<T> {
  const client = await db.connect();
  try {
    await client.query(SCHEMA);
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '55000'");
    await client.query("SET LOCAL lock_timeout = '45000'");
    // Lock the shared row first for every member. Approval decisions and their
    // connector effects must serialize across different personal sessions.
    let shared: State | undefined;
    let sharedExpiry: unknown;
    if (sharedId) {
      await client.query("INSERT INTO ecc_demo_sessions (id, state, expires_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING", [sharedId, serializeState(freshState()), new Date(Date.now() + TTL_MS)]);
      const result = await client.query("SELECT state, expires_at FROM ecc_demo_sessions WHERE id = $1 FOR UPDATE", [sharedId]);
      const row = result.rows[0];
      if (!row) throw new Error("Shared session could not be loaded.");
      sharedExpiry = row.expires_at;
      shared = new Date(String(sharedExpiry)).getTime() <= Date.now() ? freshState() : deserializeState(row.state as Record<string, unknown>);
    }
    await client.query("INSERT INTO ecc_demo_sessions (id, state, expires_at) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING", [id, serializeState(freshState()), new Date(Date.now() + TTL_MS)]);
    const result = await client.query("SELECT state, expires_at FROM ecc_demo_sessions WHERE id = $1 FOR UPDATE", [id]);
    const row = result.rows[0];
    if (!row) throw new Error("Session could not be loaded.");
    const expired = new Date(String(row.expires_at)).getTime() <= Date.now();
    const state = expired ? freshState() : deserializeState(row.state as Record<string, unknown>);
    if (shared) {
      state.approvals = new Map([...state.approvals, ...shared.approvals]);
      state.proposals = new Map([...state.proposals, ...shared.proposals]);
      state.mockDrafts = new Map([...state.mockDrafts, ...shared.mockDrafts]);
      state.mockEvents = new Map([...state.mockEvents, ...shared.mockEvents]);
      state.seq = Math.max(state.seq, shared.seq);
    }
    const value = await stateContext.run(state, operation);
    if (shared && sharedId) {
      shared.approvals = state.approvals;
      shared.proposals = state.proposals;
      shared.mockDrafts = state.mockDrafts;
      shared.mockEvents = state.mockEvents;
      shared.seq = state.seq;
      await client.query("UPDATE ecc_demo_sessions SET state = $2::jsonb, expires_at = $3 WHERE id = $1", [sharedId, serializeState(shared), new Date(Date.now() + TTL_MS)]);
    }
    await client.query("UPDATE ecc_demo_sessions SET state = $2::jsonb, expires_at = $3 WHERE id = $1", [id, serializeState(state), expired ? new Date(Date.now() + TTL_MS) : row.expires_at]);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const memory = new Map<string, { state: string; expires: number }>();
const pending = new Map<string, Promise<unknown>>();
export async function runMemorySession<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const prior = pending.get(id) ?? Promise.resolve();
  const task = prior.catch(() => undefined).then(async () => {
    for (const [key, entry] of memory) if (entry.expires <= Date.now()) memory.delete(key);
    const saved = memory.get(id);
    const state = saved ? deserializeState(saved.state) : freshState();
    const result = await stateContext.run(state, operation);
    memory.set(id, { state: serializeState(state), expires: saved?.expires ?? Date.now() + TTL_MS });
    return result;
  });
  pending.set(id, task);
  try { return await task; } finally { if (pending.get(id) === task) pending.delete(id); }
}
function useMemory(): boolean {
  return !process.env.VERCEL && (process.env.STORE_BACKEND === "memory" || (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL));
}
let lastCleanup = 0;
async function cleanupExpired(): Promise<void> {
  if (Date.now() - lastCleanup < 60 * 60 * 1000) return;
  lastCleanup = Date.now();
  const client = await database().connect();
  try { await client.query("DELETE FROM ecc_demo_sessions WHERE expires_at < NOW()"); }
  finally { client.release(); }
}
export function withDemoState<Args extends unknown[]>(handler: (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const cookieId = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith("ecc_demo_session="))?.slice("ecc_demo_session=".length);
    const actorId = request.headers.get(ACTOR_HEADER);
    const memberEmail = request.headers.get(MEMBER_HEADER);
    if (!cookieId || !/^[a-f0-9]{64}$/.test(cookieId) || !actorId || !memberEmail) return Response.json({ error: "Sign in to start a demo session." }, { status: 401 });
    const localDemo = process.env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
    if (!localDemo && !process.env.AUTH_SECRET) return Response.json({ error: "Session storage is not configured." }, { status: 503 });
    const id = localDemo ? cookieId : scopeSessionId(cookieId, actorId, memberEmail, process.env.AUTH_SECRET!);
    const sharedId = localDemo || !process.env.EXECUTIVE_MEMBER_MAP ? undefined : `shared_${createHmac("sha256", process.env.AUTH_SECRET!).update(process.env.EXECUTIVE_MEMBER_MAP).digest("hex")}`;
    try {
      const result = await (useMemory() ? runMemorySession(id, () => handler(request, ...args)) : runDatabaseSession(id, () => handler(request, ...args), database(), sharedId));
      if (!useMemory()) await cleanupExpired().catch(() => console.error("Demo session cleanup failed."));
      result.headers.set("Cache-Control", "private, no-store");
      return result;
    } catch (error) {
      console.error("Demo session request failed:", error instanceof Error ? error.name : "UnknownError");
      return Response.json({ error: "Demo storage is unavailable. Please retry shortly." }, { status: 503 });
    }
  };
}
export async function checkPersistence(): Promise<{ backend: "memory" | "postgres"; durable: boolean }> {
  if (useMemory()) return { backend: "memory", durable: false };
  const client = await database().connect();
  try { await client.query(SCHEMA); await client.query("SELECT 1"); }
  finally { client.release(); }
  return { backend: "postgres", durable: true };
}
