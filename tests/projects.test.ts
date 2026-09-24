import assert from "node:assert/strict";
import test from "node:test";
import { runMemorySession } from "../src/core/persistence/index.ts";
import { suggestProject } from "../src/core/projects/suggest.ts";
import { createProject, linkToProject, listProjects, projectDetail, ProjectError, projectMentioned } from "../src/core/services/projects.ts";
import { triageRows } from "../src/core/services/triage.ts";
import { SEED_PROJECTS } from "../src/data/projects.ts";
import { personById } from "../src/data/org.ts";

const maya = personById("p_ceo")!;
const email = (subject: string, fromId: string, body = "") => ({ subject, body, fromId, toIds: ["p_ceo"] });

test("suggests a project from the sender and the words in the subject", () => {
  const byWords = suggestProject(email("Remodel pilot: phase two capital ask", "p_cmo"), SEED_PROJECTS);
  assert.equal(byWords?.projectId, "pr_remodel");
  assert.match(byWords!.reason, /remodel/);
  const bySender = suggestProject(email("Quick question", "p_vp_logistics", "Can we talk about peak staffing?"), SEED_PROJECTS, (id) => personById(id)!.name);
  assert.equal(bySender?.projectId, "pr_peak");
  assert.match(bySender!.reason, /Jordan Pike is on this project/);
});

test("weak matches suggest nothing rather than guessing", () => {
  assert.equal(suggestProject(email("URGENT: Fire at Store 412", "p_vp_stores", "The store is closed."), SEED_PROJECTS), null, "a member writing about something else is not filed");
  assert.equal(suggestProject(email("Lunch on Friday?", "p_auditor"), SEED_PROJECTS), null);
  assert.equal(suggestProject(email("Denim", "p_auditor"), SEED_PROJECTS.map((project) => ({ ...project, status: "done" as const }))), null);
});

test("seed projects are populated with linked synthetic records", async () => {
  await runMemorySession("projects-seed", async () => {
    const projects = listProjects(maya);
    assert.deepEqual(projects.map((project) => project.name), ["Denim circularity launch", "West region remodel pilot", "Peak season DC readiness", "Weekly leadership staff"]);
    const detail = await projectDetail(maya, "pr_peak");
    assert.deepEqual(detail.emails.map((row) => row.id), ["e_approval"]);
    assert.equal(detail.meetings[0]?.eventId, "cal_cfo_forecast");
    assert.ok(detail.overview.openItems.some((item) => item.includes("Ellie Novak")));
  });
});

test("suggestions are shown, never applied until accepted, and filing moves an email", async () => {
  await runMemorySession("projects-assign", async () => {
    const before = await triageRows(maya);
    const casey = before.find((row) => row.id === "e_schedule_l4");
    assert.ok(casey && !casey.redacted && casey.projectId === null && casey.suggestion?.projectId === "pr_remodel", "the seeded suggestion is offered, not applied");
    const crisis = before.find((row) => row.id === "e_crisis");
    assert.ok(crisis && !crisis.redacted && crisis.projectId === null, "no silent assignment");
    await linkToProject(maya, "pr_remodel", { op: "add", kind: "email", id: "e_report" });
    const after = await triageRows(maya);
    const report = after.find((row) => row.id === "e_report");
    assert.ok(report && !report.redacted && report.projectId === "pr_remodel");
    assert.ok(!(await projectDetail(maya, "pr_staff")).project.emailIds.includes("e_report"), "one project at a time");
  });
});

test("projects are private, and only visible records can be linked", async () => {
  await runMemorySession("projects-privacy", async () => {
    const cfo = personById("p_cfo")!;
    assert.deepEqual(listProjects(cfo), []);
    await assert.rejects(projectDetail(cfo, "pr_denim"), (error: unknown) => error instanceof ProjectError && error.status === 404);
    const cdio = personById("p_cdio")!;
    const own = createProject(cdio, { name: "Store systems refresh", memberIds: ["p_ext_banker", "p_coo"] });
    assert.deepEqual(own.memberIds, ["p_coo"], "external people are dropped");
    await assert.rejects(linkToProject(cdio, own.id, { op: "add", kind: "email", id: "e_restricted" }), ProjectError, "restricted mail cannot be filed by someone who cannot read it");
    await assert.rejects(linkToProject(cdio, own.id, { op: "add", kind: "event", id: "cal_ceo_leadership" }), ProjectError);
  });
});

test("project names are recognized in plain sentences", async () => {
  await runMemorySession("projects-mention", async () => {
    assert.equal(projectMentioned(maya, "What's pending on the denim launch?")?.id, "pr_denim");
    assert.equal(projectMentioned(maya, "Schedule a check-in with the remodel pilot team")?.id, "pr_remodel");
    assert.equal(projectMentioned(maya, "How is peak season looking?")?.id, "pr_peak");
    assert.equal(projectMentioned(maya, "Find time with Ray"), null);
  });
});
