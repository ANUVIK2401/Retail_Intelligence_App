import assert from "node:assert/strict";
import test from "node:test";
import { runMemorySession } from "../src/core/persistence/index.ts";
import { bucketFor, quickReplies, sendReply, snoozeMessage, snoozeUntil, triageRows, TriageError } from "../src/core/services/triage.ts";
import { zonedClock } from "../src/core/scheduling/availability.ts";
import { getApproval, listAudit, store } from "../src/core/store/index.ts";
import { emailById } from "../src/data/emails.ts";
import { personById } from "../src/data/org.ts";

const maya = personById("p_ceo")!;
const tz = "America/Los_Angeles";
const at = (iso: string) => new Date(iso);

test("snooze presets land at sensible local times", () => {
  const morning = at("2026-09-24T16:00:00.000Z"); // Thu 9:00 AM PT
  assert.deepEqual(zonedClock(snoozeUntil("tonight", morning, tz), tz), { date: "2026-09-24", weekday: "Thu", minutes: 18 * 60 });
  assert.deepEqual(zonedClock(snoozeUntil("tomorrow_morning", morning, tz), tz), { date: "2026-09-25", weekday: "Fri", minutes: 8 * 60 });
  assert.deepEqual(zonedClock(snoozeUntil("next_week", morning, tz), tz), { date: "2026-09-28", weekday: "Mon", minutes: 8 * 60 });
  const lateEvening = at("2026-09-25T04:00:00.000Z"); // Thu 9:00 PM PT
  assert.equal(snoozeUntil("tonight", lateEvening, tz).getTime(), lateEvening.getTime() + 2 * 60 * 60_000, "tonight after 6 PM is two hours out");
  const sunday = at("2026-09-27T17:00:00.000Z");
  assert.equal(zonedClock(snoozeUntil("next_week", sunday, tz), tz).date, "2026-09-28");
});

test("snoozed mail leaves the list and comes back on time", async () => {
  await runMemorySession("snooze", async () => {
    const now = at("2026-09-24T16:00:00.000Z");
    await snoozeMessage(maya, "e_schedule_l4", "tomorrow_morning", now);
    const hidden = (await triageRows(maya, now)).find((row) => row.id === "e_schedule_l4");
    assert.ok(hidden && !hidden.redacted && hidden.snoozedUntil);
    const later = (await triageRows(maya, at("2026-09-25T15:30:00.000Z"))).find((row) => row.id === "e_schedule_l4");
    assert.ok(later && !later.redacted && later.snoozedUntil === null, "back after 8 AM Friday");
    assert.ok(listAudit().some((event) => event.action === "email.snoozed"));
  });
});

test("routine low-risk mail can wait; everything else needs the executive", () => {
  assert.equal(bucketFor("low", "promotional"), "can_wait");
  assert.equal(bucketFor("low", "scheduling"), "needs_me");
  assert.equal(bucketFor("medium", "report_review"), "needs_me");
});

test("a routine reply sends on the owner's confirmation, under an approval id, into the Sent folder", async () => {
  await runMemorySession("send-low", async () => {
    const result = await sendReply(maya, "e_schedule_direct", "Friday at 10 works. Maya", "quick");
    assert.equal(result.status, "sent");
    if (result.status !== "sent") return;
    assert.ok(result.approvalId);
    assert.equal(getApproval(result.approvalId)?.status, "completed");
    assert.equal(store.sent.get(result.reply.id)?.approvalId, result.approvalId);
    const audit = listAudit().find((event) => event.action === "connector.mail.send");
    assert.ok(audit && !audit.detail.includes("Friday at 10"), "audit carries no reply text");
    await assert.rejects(import("../src/core/services/triage.ts").then(({ executeReply }) => executeReply(getApproval(result.approvalId)!, maya, "quick")), TriageError, "an approval sends once");
  });
});

test("a finance approval reply waits for the finance reviewer", async () => {
  await runMemorySession("send-medium", async () => {
    const result = await sendReply(maya, "e_approval", "Approved, go ahead. Maya", "full");
    assert.equal(result.status, "needs_review");
    if (result.status !== "needs_review") return;
    assert.deepEqual(result.reviewers, ["Finance reviewer releases"]);
    assert.equal(store.sent.size, 0, "nothing sent yet");
  });
});

test("high-risk and restricted messages are never sent from triage", async () => {
  await runMemorySession("send-high", async () => {
    await assert.rejects(sendReply(maya, "e_crisis", "On it.", "quick"), (error: unknown) => error instanceof TriageError && error.status === 409);
    await assert.rejects(sendReply(maya, "e_inject", "Wire sent.", "quick"), (error: unknown) => error instanceof TriageError && error.status === 409);
    await assert.rejects(sendReply(personById("p_cdio")!, "e_restricted", "Thanks", "quick"), (error: unknown) => error instanceof TriageError && error.status === 403);
    assert.equal(store.sent.size, 0);
    assert.ok(listAudit().some((event) => event.action === "email.send.refused"), "refusals are audited");
  });
});

test("quick replies cover acknowledge, delegate, and ask for more", () => {
  const replies = quickReplies(emailById("e_schedule_l4")!, maya);
  assert.deepEqual(replies.map((reply) => reply.id), ["acknowledge", "delegate", "ask"]);
  assert.match(replies[1].label, /Grace/);
  assert.ok(replies.every((reply) => reply.body.startsWith("Thanks, Casey.")));
});
