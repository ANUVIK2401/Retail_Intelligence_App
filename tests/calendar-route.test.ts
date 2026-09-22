import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/calendar-events/route.ts";
import { PATCH } from "../src/app/api/calendar-events/[id]/route.ts";

const COOKIE = "b".repeat(64);

function headers(actorId = "p_ceo") {
  return {
    cookie: `ecc_demo_session=${COOKIE}`,
    "x-ecc-actor-id": actorId,
    "x-ecc-member-email": `${actorId}@demo.example`,
    "content-type": "application/json",
  };
}

test("calendar routes list owned events and preserve duration on a valid move", async () => {
  const prior = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "demo";
  try {
    const listed = await GET(new Request("http://localhost/api/calendar-events", { headers: headers() }));
    assert.equal(listed.status, 200);
    const payload = await listed.json() as { events: { eventId: string; ownerId: string; start: string; end: string }[] };
    assert.ok(payload.events.length > 0);
    assert.ok(payload.events.every((event) => event.ownerId === "p_ceo"));

    const original = payload.events[0];
    const start = new Date(Date.parse(original.start) + 14 * 24 * 60 * 60 * 1000).toISOString();
    const moved = await PATCH(new Request(`http://localhost/api/calendar-events/${original.eventId}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ start }),
    }), { params: Promise.resolve({ id: original.eventId }) });
    assert.equal(moved.status, 200);
    const changed = await moved.json() as { event: { start: string; end: string } };
    assert.equal(changed.event.start, start);
    assert.equal(
      Date.parse(changed.event.end) - Date.parse(changed.event.start),
      Date.parse(original.end) - Date.parse(original.start),
    );
  } finally {
    if (prior === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prior;
  }
});

test("calendar move returns the same not-found response for missing and unauthorized events", async () => {
  const prior = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "demo";
  try {
    const body = JSON.stringify({ start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() });
    const missing = await PATCH(new Request("http://localhost/api/calendar-events/not-real", {
      method: "PATCH", headers: headers("p_cfo"), body,
    }), { params: Promise.resolve({ id: "not-real" }) });
    const unauthorized = await PATCH(new Request("http://localhost/api/calendar-events/cal_ceo_leadership", {
      method: "PATCH", headers: headers("p_cfo"), body,
    }), { params: Promise.resolve({ id: "cal_ceo_leadership" }) });
    assert.equal(missing.status, 404);
    assert.equal(unauthorized.status, 404);
    assert.deepEqual(await unauthorized.json(), await missing.json());
  } finally {
    if (prior === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = prior;
  }
});
