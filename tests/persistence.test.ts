import test from "node:test";
import assert from "node:assert/strict";
import { freshState, nextId, store } from "../src/core/store/index.ts";
import { deserializeState, serializeState, runMemorySession, runDatabaseSession, scopeSessionId, type DatabasePool } from "../src/core/persistence/index.ts";

test("session storage keys differ by authenticated executive", () => {
  const cookie = "a".repeat(64);
  const secret = "test-only-secret".repeat(3);
  assert.notEqual(scopeSessionId(cookie, "p_ceo", "one@gmail.com", secret), scopeSessionId(cookie, "p_cfo", "two@gmail.com", secret));
  assert.notEqual(scopeSessionId(cookie, "p_ceo", "one@gmail.com", secret), scopeSessionId(cookie, "p_ceo", "two@gmail.com", secret));
  assert.equal(scopeSessionId(cookie, "p_ceo", "one@gmail.com", secret), scopeSessionId(cookie, "p_ceo", "one@gmail.com", secret));
});

test("serialization retains maps, simulated effects, and independent copies", () => {
  const original = freshState();
  original.mockDrafts.set("draft", { messageId: "email", body: "Synthetic draft" });
  original.mockEvents.set("event", { eventId: "event", ownerId: "ceo", start: "a", end: "b", subject: "Demo", sensitivity: "normal" });
  const restored = deserializeState(serializeState(original));
  assert.deepEqual(restored.mockDrafts.get("draft"), original.mockDrafts.get("draft"));
  assert.equal(restored.mockEvents.get("event")?.subject, "Demo");
  restored.mockDrafts.delete("draft");
  assert.equal(original.mockDrafts.size, 1);
});

test("different sessions stay isolated across awaited parallel work", async () => {
  const a = "parallel-a", b = "parallel-b";
  await Promise.all([
    runMemorySession(a, async () => { nextId("a"); await new Promise((r) => setTimeout(r, 10)); assert.equal(store.seq, 1); }),
    runMemorySession(b, async () => { nextId("b"); nextId("b"); assert.equal(store.seq, 2); }),
  ]);
  await runMemorySession(a, async () => assert.equal(store.seq, 1));
  await runMemorySession(b, async () => assert.equal(store.seq, 2));
});

test("same-session concurrent mutations serialize and rejected work rolls back", async () => {
  await Promise.all(Array.from({ length: 10 }, () => runMemorySession("serial", async () => {
    const previous = store.seq;
    await new Promise((r) => setTimeout(r, 1));
    store.seq = previous + 1;
  })));
  await assert.rejects(runMemorySession("serial", async () => { store.seq = 100; throw new Error("rollback"); }));
  await runMemorySession("serial", async () => assert.equal(store.seq, 10));
});

function fakeDatabase() {
  const queries: string[] = [];
  let saved = serializeState(freshState());
  let released = false;
  const db: DatabasePool = { connect: async () => ({
    query: async (sql, values) => {
      queries.push(sql);
      if (sql.startsWith("SELECT state")) return { rows: [{ state: JSON.parse(saved), expires_at: new Date(Date.now() + 100000).toISOString() }] };
      if (sql.startsWith("UPDATE")) saved = values?.[1] as string;
      return { rows: [] };
    },
    release: () => { released = true; },
  }) };
  return { db, queries, saved: () => deserializeState(saved), released: () => released };
}

test("database transaction locks before handler and commits aggregate including effects", async () => {
  const fake = fakeDatabase();
  await runDatabaseSession("test", async () => {
    assert.ok(fake.queries.at(-1)?.includes("FOR UPDATE"));
    nextId("x");
    store.mockDrafts.set("d", { messageId: "m", body: "demo" });
  }, fake.db);
  assert.equal(fake.saved().seq, 1);
  assert.equal(fake.saved().mockDrafts.size, 1);
  assert.equal(fake.queries.at(-1), "COMMIT");
  assert.equal(fake.released(), true);
});

test("failed database handler rolls back without persisting effects and releases connection", async () => {
  const fake = fakeDatabase();
  await assert.rejects(runDatabaseSession("test", async () => {
    nextId("x");
    throw new Error("failed handler");
  }, fake.db));
  assert.equal(fake.queries.at(-1), "ROLLBACK");
  assert.equal(fake.queries.some((query) => query.startsWith("UPDATE")), false);
  assert.equal(fake.saved().seq, 0);
  assert.equal(fake.released(), true);
});

test("shared approvals cross member sessions while assessments stay private", async () => {
  const rows = new Map<string, string>();
  const db: DatabasePool = { connect: async () => ({
    query: async (sql, values) => {
      const id = String(values?.[0] ?? "");
      if (sql.startsWith("INSERT INTO ecc_demo_sessions") && !rows.has(id)) rows.set(id, String(values?.[1]));
      if (sql.startsWith("SELECT state")) return { rows: [{ state: JSON.parse(rows.get(id)!), expires_at: new Date(Date.now() + 100_000).toISOString() }] };
      if (sql.startsWith("UPDATE ecc_demo_sessions")) rows.set(id, String(values?.[1]));
      return { rows: [] };
    },
    release: () => undefined,
  }) };
  await runDatabaseSession("ceo", async () => {
    store.approvals.set("approval-1", { id: "approval-1" } as never);
    store.assessments.set("email-1", { emailId: "email-1" } as never);
  }, db, "shared-tenant");
  await runDatabaseSession("cfo", async () => {
    assert.equal(store.approvals.has("approval-1"), true);
    assert.equal(store.assessments.has("email-1"), false);
    const approval = store.approvals.get("approval-1")!;
    store.approvals.set("approval-1", { ...approval, status: "completed" });
  }, db, "shared-tenant");
  await runDatabaseSession("ceo", async () => {
    assert.equal(store.approvals.get("approval-1")?.status, "completed");
  }, db, "shared-tenant");
  await runDatabaseSession("other-tenant", async () => {
    assert.equal(store.approvals.has("approval-1"), false);
  }, db, "another-shared-tenant");
});

test("sessions saved before projects existed still get the seeded projects", async () => {
  const { deserializeState } = await import("../src/core/persistence/index.ts");
  const legacy = deserializeState({ seq: 3, audit: [], approvals: [], assessments: [] });
  assert.equal(legacy.projects.size, 4);
  assert.equal(legacy.sent.size, 0);
  const saved = deserializeState({ projects: [] });
  assert.equal(saved.projects.size, 0, "an explicitly saved empty map stays empty");
});
