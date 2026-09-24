/**
 * Loads the synthetic fixtures into the relational schema. Idempotent: every
 * run replaces the synthetic rows with the current fixtures, in one
 * transaction. Contains no real data, by construction (invariant 9).
 *
 *   DATABASE_URL=postgres://... npm run db:seed
 */
import pg from "pg";
import { BUSY_BLOCKS, SYNTHETIC_CALENDAR_EVENTS } from "../src/data/calendar.ts";
import { EMAILS, EMAIL_SUMMARIES } from "../src/data/emails.ts";
import { DELEGATIONS, PEOPLE, RESTRICTED_ACCESS } from "../src/data/org.ts";
import { SEED_PROJECTS } from "../src/data/projects.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const counts: Record<string, number> = {};
const insert = async (table: string, columns: string[], rows: unknown[][]) => {
  for (const row of rows) {
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`, row);
  }
  counts[table] = rows.length;
};

try {
  await client.query("BEGIN");
  // Children first. The audit log is append-only and is never truncated here.
  await client.query(`TRUNCATE project_notes, project_events, project_emails, project_people, projects,
    event_attendees, events, busy_blocks, snoozes, email_assessments, email_recipients, emails,
    restricted_access, delegations RESTART IDENTITY CASCADE`);
  await client.query("DELETE FROM people");

  // Managers before reports, so the self-reference always resolves.
  const ordered = [...PEOPLE].sort((a, b) => a.level - b.level);
  await insert("people", ["id", "name", "title", "email", "level", "manager_id", "function", "roles", "reviewer_domains", "assistant_id", "timezone", "working_start_hour", "working_end_hour"],
    ordered.map((person) => [person.id, person.name, person.title, person.email.toLowerCase(), person.level, null, person.function, person.roles, person.reviewerDomains, null, person.timezone, person.workingHours.startHour, person.workingHours.endHour]));
  for (const person of PEOPLE) {
    await client.query("UPDATE people SET manager_id = $2, assistant_id = $3 WHERE id = $1", [person.id, person.managerId, person.assistantId]);
  }
  await insert("delegations", ["id", "executive_id", "delegate_id", "allowed_actions", "max_risk"],
    DELEGATIONS.map((delegation) => [delegation.id, delegation.executiveId, delegation.delegateId, delegation.allowedActions, delegation.maxRisk]));
  await insert("restricted_access", ["topic", "person_id"],
    Object.entries(RESTRICTED_ACCESS).flatMap(([topic, ids]) => ids.map((id) => [topic, id])));

  await insert("emails", ["id", "external_id", "mailbox_owner_id", "from_id", "subject", "body", "received_at", "has_attachments", "external", "summary"],
    EMAILS.map((email) => [email.id, email.externalId, email.mailboxOwnerId, email.fromId, email.subject, email.body, email.receivedAt, email.hasAttachments, email.external, EMAIL_SUMMARIES[email.id] ?? null]));
  await insert("email_recipients", ["email_id", "person_id"], EMAILS.flatMap((email) => email.toIds.map((id) => [email.id, id])));

  await insert("busy_blocks", ["person_id", "starts_at", "ends_at", "status"], BUSY_BLOCKS.map((block) => [block.personId, block.start, block.end, block.status]));
  await insert("events", ["id", "owner_id", "starts_at", "ends_at", "subject", "sensitivity", "source"],
    SYNTHETIC_CALENDAR_EVENTS.map((event) => [event.eventId, event.ownerId, event.start, event.end, event.subject, event.sensitivity, "fixture"]));
  await insert("event_attendees", ["event_id", "person_id"], SYNTHETIC_CALENDAR_EVENTS.flatMap((event) => (event.attendeeIds ?? []).map((id) => [event.eventId, id])));

  await insert("projects", ["id", "owner_id", "name", "description", "color", "type", "status", "keywords", "created_at"],
    SEED_PROJECTS.map((project) => [project.id, project.ownerId, project.name, project.description, project.color, project.type, project.status, project.keywords, project.createdAt]));
  await insert("project_people", ["project_id", "person_id"], SEED_PROJECTS.flatMap((project) => project.memberIds.map((id) => [project.id, id])));
  await insert("project_emails", ["project_id", "email_id"], SEED_PROJECTS.flatMap((project) => project.emailIds.map((id) => [project.id, id])));
  await insert("project_events", ["project_id", "event_id"], SEED_PROJECTS.flatMap((project) => project.eventIds.map((id) => [project.id, id])));

  await client.query("COMMIT");
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table.padEnd(18)} ${count}`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error(`Seed failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
