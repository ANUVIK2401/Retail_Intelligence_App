import assert from "node:assert/strict";
import test from "node:test";
import { assessEmail } from "../src/core/services/assess.ts";
import { authorizeApprovalStep, canSeeApproval } from "../src/core/access/index.ts";
import { matchingPublicationApproval, publicationArtifactMatchesApproval, publicationSubjectId } from "../src/core/services/publishing.ts";
import { runMemorySession } from "../src/core/persistence/index.ts";
import { listApprovals } from "../src/core/store/index.ts";
import { personById, RESTRICTED_ACCESS } from "../src/data/org.ts";
import { bookAllowedMeeting, proposeMeeting } from "../src/core/services/scheduling.ts";
import { MockCalendarConnector } from "../src/core/connectors/mock.ts";

test("reassessing an email reuses its pending approval", async () => {
  await runMemorySession("repeat-assessment", async () => {
    const first = await assessEmail({ emailId: "e_approval", actorId: "p_ceo" });
    const second = await assessEmail({ emailId: "e_approval", actorId: "p_ceo" });
    assert.ok(first.approval);
    assert.equal(second.approval?.id, first.approval.id);
    assert.equal(listApprovals().filter((a) => a.subjectId === "e_approval").length, 1);
  });
});

test("an allowed meeting can book one chosen slot only once", async () => {
  await runMemorySession("direct-booking", async () => {
    const from = new Date();
    from.setDate(from.getDate() + 7);
    from.setHours(8, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    const { proposal } = await proposeMeeting({ actorId: "p_ceo", request: {
      requesterId: "p_coo", attendeeIds: ["p_ceo"], purpose: "Operations review",
      durationMinutes: 30, sensitivity: "normal", earliest: from.toISOString(), latest: to.toISOString(),
    } });
    assert.equal(proposal.decision.outcome, "allow");
    assert.ok(proposal.slots.length > 0);
    await assert.rejects(bookAllowedMeeting({ actorId: "p_cmo", proposalId: proposal.id, slotIndex: 0 }), /not authorized/i);
    await assert.rejects(bookAllowedMeeting({ actorId: "p_ceo", proposalId: proposal.id, slotIndex: 99 }), /slot/i);
    const booked = await bookAllowedMeeting({ actorId: "p_ceo", proposalId: proposal.id, slotIndex: 0 });
    assert.equal(booked.proposal.status, "approved");
    assert.equal(booked.execution.kind, "calendar_event_created");
    await assert.rejects(bookAllowedMeeting({ actorId: "p_ceo", proposalId: proposal.id, slotIndex: 0 }), /already been booked/i);
  });
});

test("calendar availability includes session bookings and refuses overlapping writes", async () => {
  await runMemorySession("calendar-overlap", async () => {
    const calendar = new MockCalendarConnector();
    const first = { ownerId: "p_ceo", attendeeIds: ["p_cfo"], start: "2030-01-07T16:00:00.000Z", end: "2030-01-07T17:00:00.000Z", sensitivity: "normal" as const, approvalId: "approved-1" };
    await calendar.createEvent({ ...first, subject: "Budget review" });
    const busy = await calendar.getSchedule({ personIds: ["p_ceo", "p_cfo"], from: "2030-01-07T15:00:00.000Z", to: "2030-01-07T18:00:00.000Z" });
    assert.equal(busy.some((block) => block.personId === "p_ceo" && block.start === first.start), true);
    assert.equal(busy.some((block) => block.personId === "p_cfo" && block.start === first.start), true);
    await assert.rejects(calendar.createEvent({ ownerId: "p_cfo", attendeeIds: ["p_cmo"], start: "2030-01-07T16:30:00.000Z", end: "2030-01-07T17:30:00.000Z", subject: "Overlapping meeting", sensitivity: "normal", approvalId: "approved-2" }), /already booked/i);
  });
});

test("approval visibility follows owner or assigned reviewer, not executive rank", async () => {
  await runMemorySession("approval-visibility", async () => {
    const { approval } = await assessEmail({ emailId: "e_approval", actorId: "p_ceo" });
    assert.ok(approval);
    assert.equal(canSeeApproval(personById("p_ceo")!, approval), true);
    assert.equal(canSeeApproval(personById("p_cfo")!, approval), true);
    assert.equal(canSeeApproval(personById("p_cmo")!, approval), false);
    assert.equal(canSeeApproval(personById("p_ea")!, approval), false);
    assert.equal(canSeeApproval(personById("p_gc")!, approval), false);
    const restricted = { ...approval, risk: "restricted" };
    assert.equal(canSeeApproval(personById("p_cfo")!, restricted, { restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy }), true);
    assert.equal(canSeeApproval(personById("p_ea")!, restricted, { restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy }), false);
  });
});

test("an assistant confirmation step belongs to the named delegate", async () => {
  await runMemorySession("assistant-confirmation", async () => {
    const { approval } = await assessEmail({ emailId: "e_approval", actorId: "p_ceo" });
    assert.ok(approval);
    const assistantStep = { ...approval, action: "calendar.create_event" as const, risk: "low" as const,
      decision: { ...approval.decision, approvalChain: [
        { kind: "executive_assistant" as const, reviewerDomain: null, label: "Assistant confirms" },
        { kind: "executive" as const, reviewerDomain: null, label: "Executive accepts" },
      ] } };
    assert.equal(authorizeApprovalStep(personById("p_ceo")!, assistantStep).ok, false);
    assert.equal(authorizeApprovalStep(personById("p_cmo")!, assistantStep).ok, false);
    assert.equal(authorizeApprovalStep(personById("p_ea")!, assistantStep).ok, true);
  });
});

test("publication approval binds to owner, channel, title, and exact body", async () => {
  await runMemorySession("publication-provenance", async () => {
    const { saveApproval } = await import("../src/core/store/index.ts");
    const { evaluatePolicy } = await import("../src/core/policy/engine.ts");
    const { store } = await import("../src/core/store/index.ts");
    const decision = evaluatePolicy({ action: "publication.publish", actorId: "p_ceo", actorRole: "executive", resourceOwnerId: "p_ceo", risk: "low", topic: "external_communication", ruleState: store.ruleState });
    const approval = saveApproval({ id: "approved-publication", action: "publication.publish", subjectType: "publication", subjectId: "Title", title: "Publication: Title", proposedContent: "Original body", risk: "low", decision, currentStep: 0, status: "completed", contentVersion: 0, executionClaimed: true, requestedFor: "p_ceo", createdAt: new Date().toISOString(), history: [] });
    assert.equal(matchingPublicationApproval(approval, { actorId: "p_ceo", channel: "linkedin", title: "Title", body: "Original body" }), false, "old approvals without an exact channel and content binding cannot be reused");
    const bound = { ...approval, subjectId: publicationSubjectId({ channel: "linkedin", title: "Title" }) };
    assert.equal(publicationArtifactMatchesApproval({ ...bound, status: "awaiting_approval" }, { actorId: "p_ceo", channel: "linkedin", title: "Title", body: "Original body" }), true);
    assert.equal(publicationArtifactMatchesApproval({ ...bound, status: "awaiting_approval" }, { actorId: "p_cmo", channel: "linkedin", title: "Title", body: "Original body" }), false);
    assert.equal(matchingPublicationApproval(bound, { actorId: "p_ceo", channel: "linkedin", title: "Title", body: "Original body" }), true);
    assert.equal(matchingPublicationApproval(bound, { actorId: "p_cmo", channel: "linkedin", title: "Title", body: "Original body" }), false);
    assert.equal(matchingPublicationApproval(bound, { actorId: "p_ceo", channel: "substack", title: "Title", body: "Original body" }), false);
    assert.equal(matchingPublicationApproval(bound, { actorId: "p_ceo", channel: "linkedin", title: "Changed", body: "Original body" }), false);
    assert.equal(matchingPublicationApproval(bound, { actorId: "p_ceo", channel: "linkedin", title: "Title", body: "Changed body" }), false);
    assert.equal(matchingPublicationApproval({ ...bound, proposedContent: "Edited body" }, { actorId: "p_ceo", channel: "linkedin", title: "Title", body: "Edited body" }), true);
  });
});

test("editing an email draft at the final step restarts review without counting as approval", async () => {
  await runMemorySession("publication-edit-review", async () => {
    const { decideApproval, saveApproval } = await import("../src/core/store/index.ts");
    const { approval } = await assessEmail({ emailId: "e_approval", actorId: "p_ceo" });
    assert.ok(approval);
    saveApproval({ ...approval, currentStep: 1, history: [{ at: new Date().toISOString(), actorId: "p_ceo", actorRole: "executive", outcome: "approved", note: null }] });
    const edited = decideApproval({ id: approval.id, actorId: "p_cfo", actorRole: "executive", outcome: "approved", editedContent: "Revised body" });
    assert.equal(edited.currentStep, 0);
    assert.equal(edited.status, "awaiting_approval");
    assert.equal(edited.contentVersion, 1);
    assert.equal(edited.proposedContent, "Revised body");
    assert.equal(edited.history.some((entry) => entry.actorId === "p_cfo" && entry.outcome === "approved"), false);
    assert.equal(edited.history.some((entry) => entry.actorId === "p_cfo" && entry.outcome === "edited"), true);
    const reviewed = decideApproval({ id: approval.id, actorId: "p_ceo", actorRole: "executive", outcome: "approved" });
    assert.equal(reviewed.currentStep, 1);
    assert.equal(reviewed.status, "awaiting_approval");
    const complete = decideApproval({ id: approval.id, actorId: "p_cfo", actorRole: "executive", outcome: "approved" });
    assert.equal(complete.status, "approved");
  });
});

test("publication approval rejects content edits and requires a new review request", async () => {
  await runMemorySession("publication-edit-denied", async () => {
    const { decideApproval, saveApproval, store } = await import("../src/core/store/index.ts");
    const { evaluatePolicy } = await import("../src/core/policy/engine.ts");
    const decision = evaluatePolicy({ action: "publication.publish", actorId: "p_ceo", actorRole: "executive", resourceOwnerId: "p_ceo", risk: "low", topic: "external_communication", ruleState: store.ruleState });
    const original = saveApproval({ id: "publication-edit", action: "publication.publish", subjectType: "publication", subjectId: publicationSubjectId({ channel: "linkedin", title: "Title" }), title: "Publication: Title", proposedContent: "Original body", risk: "low", decision, currentStep: 1, status: "awaiting_approval", contentVersion: 0, executionClaimed: false, requestedFor: "p_ceo", createdAt: new Date().toISOString(), history: [] });
    assert.throws(() => decideApproval({ id: original.id, actorId: "p_ceo", actorRole: "executive", outcome: "approved", editedContent: "New claims" }), /new review request/i);
    assert.equal(original.currentStep, 1);
    assert.equal(original.proposedContent, "Original body");
  });
});
