-- PacSun Executive Assistant: target relational schema.
--
-- Today the running prototype keeps each signed-in member's demo state as one
-- JSONB row (ecc_demo_sessions) and reads synthetic fixtures through the
-- SyntheticAdapter. This schema is the shape that state takes once it lives in
-- tables, and the shape a Microsoft Graph sync would write into. Several of
-- the nine invariants are enforced here as well as in code, so a bug in one
-- layer is caught by the other.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Directory and members
-- ---------------------------------------------------------------------------

CREATE TABLE people (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  title             text NOT NULL,
  email             text NOT NULL UNIQUE CHECK (email = lower(email)),
  -- 1 is the CEO; external contacts use 99 so no level math ever ranks them inside the company.
  level             integer NOT NULL CHECK (level BETWEEN 1 AND 99),
  manager_id        text REFERENCES people(id),
  function          text NOT NULL,
  roles             text[] NOT NULL DEFAULT '{}',
  reviewer_domains  text[] NOT NULL DEFAULT '{}',
  assistant_id      text REFERENCES people(id),
  timezone          text NOT NULL,
  working_start_hour integer NOT NULL CHECK (working_start_hour BETWEEN 0 AND 23),
  working_end_hour   integer NOT NULL CHECK (working_end_hour BETWEEN 1 AND 24),
  CHECK (working_end_hour > working_start_hour)
);

-- A signed-in member and the persona they act as. Admin is a property of the
-- member, never of the persona (ADR-0009).
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL UNIQUE CHECK (email = lower(email)),
  person_id   text NOT NULL REFERENCES people(id),
  is_admin    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delegations (
  id               text PRIMARY KEY,
  executive_id     text NOT NULL REFERENCES people(id),
  delegate_id      text NOT NULL REFERENCES people(id),
  allowed_actions  text[] NOT NULL,
  max_risk         text NOT NULL CHECK (max_risk IN ('low', 'medium')),
  CHECK (executive_id <> delegate_id)
);

-- Named allowlist for restricted topics. Membership is explicit, never derived.
CREATE TABLE restricted_access (
  topic      text NOT NULL,
  person_id  text NOT NULL REFERENCES people(id),
  PRIMARY KEY (topic, person_id)
);

-- ---------------------------------------------------------------------------
-- Mail
-- ---------------------------------------------------------------------------

CREATE TABLE emails (
  id                text PRIMARY KEY,
  external_id       text NOT NULL,
  mailbox_owner_id  text NOT NULL REFERENCES people(id),
  from_id           text NOT NULL REFERENCES people(id),
  subject           text NOT NULL,
  -- Plain text only; HTML is stripped at the connector boundary.
  body              text NOT NULL,
  received_at       timestamptz NOT NULL,
  has_attachments   boolean NOT NULL DEFAULT false,
  external          boolean NOT NULL DEFAULT false,
  -- Precomputed one-line triage summary. Our words, never the body's.
  summary           text,
  UNIQUE (mailbox_owner_id, external_id)
);
CREATE INDEX emails_owner_received ON emails (mailbox_owner_id, received_at DESC);

CREATE TABLE email_recipients (
  email_id   text NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  person_id  text NOT NULL REFERENCES people(id),
  PRIMARY KEY (email_id, person_id)
);

CREATE TABLE email_assessments (
  email_id        text PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  assessment      jsonb NOT NULL,
  prompt_version  text NOT NULL,
  model           text NOT NULL,
  assessed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE snoozes (
  email_id   text NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  person_id  text NOT NULL REFERENCES people(id),
  until      timestamptz NOT NULL,
  PRIMARY KEY (email_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

-- Invariant 6: free/busy only. There is deliberately no subject, location, or
-- attendee column. A title leak would need a migration, not a bug.
CREATE TABLE busy_blocks (
  id         bigserial PRIMARY KEY,
  person_id  text NOT NULL REFERENCES people(id),
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  status     text NOT NULL CHECK (status IN ('busy', 'tentative', 'out_of_office')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX busy_blocks_person_time ON busy_blocks (person_id, starts_at);

CREATE TABLE meeting_proposals (
  id          text PRIMARY KEY,
  requester_id text NOT NULL REFERENCES people(id),
  request     jsonb NOT NULL,
  slots       jsonb NOT NULL,
  decision    jsonb NOT NULL,
  status      text NOT NULL CHECK (status IN ('proposed', 'awaiting_approval', 'approved', 'rejected', 'expired')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id               text PRIMARY KEY,
  owner_id         text NOT NULL REFERENCES people(id),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  subject          text NOT NULL,
  sensitivity      text NOT NULL CHECK (sensitivity IN ('normal', 'confidential')),
  original_start   timestamptz,
  source           text NOT NULL CHECK (source IN ('fixture', 'assistant')),
  approval_id      text,
  policy_grant_id  text,
  CHECK (ends_at > starts_at),
  -- Invariant 4: anything the assistant wrote names exactly one authorization.
  CHECK (source = 'fixture' OR num_nonnulls(approval_id, policy_grant_id) = 1)
);
CREATE INDEX events_owner_time ON events (owner_id, starts_at);

CREATE TABLE event_attendees (
  event_id   text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id  text NOT NULL REFERENCES people(id),
  PRIMARY KEY (event_id, person_id)
);

-- ---------------------------------------------------------------------------
-- Approvals and audit
-- ---------------------------------------------------------------------------

CREATE TABLE approvals (
  id                 text PRIMARY KEY,
  action             text NOT NULL,
  subject_type       text NOT NULL CHECK (subject_type IN ('email_draft', 'email_reply', 'meeting_proposal', 'publication')),
  subject_id         text NOT NULL,
  title              text NOT NULL,
  proposed_content   text NOT NULL,
  risk               text NOT NULL CHECK (risk IN ('low', 'medium', 'high', 'restricted')),
  decision           jsonb NOT NULL,
  current_step       integer NOT NULL DEFAULT 0,
  status             text NOT NULL,
  content_version    integer NOT NULL DEFAULT 0,
  -- Flipped once by a conditional UPDATE ... WHERE execution_claimed = false,
  -- which is what makes execution exactly-once across concurrent requests.
  execution_claimed  boolean NOT NULL DEFAULT false,
  requested_for      text NOT NULL REFERENCES people(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_requested_for ON approvals (requested_for, status);

CREATE TABLE approval_steps (
  approval_id  text NOT NULL REFERENCES approvals(id) ON DELETE CASCADE,
  seq          integer NOT NULL,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_id     text NOT NULL REFERENCES people(id),
  actor_role   text NOT NULL,
  outcome      text NOT NULL CHECK (outcome IN ('approved', 'rejected', 'edited', 'escalated')),
  note         text,
  PRIMARY KEY (approval_id, seq)
);

-- The synthetic Sent folder. Invariant 4: no row without the approval that authorized it.
CREATE TABLE sent_replies (
  id           text PRIMARY KEY,
  email_id     text NOT NULL REFERENCES emails(id),
  actor_id     text NOT NULL REFERENCES people(id),
  body         text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  kind         text NOT NULL CHECK (kind IN ('full', 'quick')),
  approval_id  text NOT NULL REFERENCES approvals(id),
  sent_at      timestamptz NOT NULL DEFAULT now()
);

-- Invariant 8: everything consequential is audited, and the trail is append-only.
CREATE TABLE audit_log (
  id              text PRIMARY KEY,
  at              timestamptz NOT NULL DEFAULT now(),
  correlation_id  text NOT NULL,
  actor_id        text NOT NULL,
  actor_role      text NOT NULL,
  action          text NOT NULL,
  resource_type   text NOT NULL,
  resource_id     text NOT NULL,
  outcome         text NOT NULL,
  risk            text,
  policy_version  text,
  matched_rules   text[] NOT NULL DEFAULT '{}',
  ai_model        text,
  prompt_version  text,
  -- Identifiers only. No message bodies, reply text, or subjects.
  detail          text NOT NULL
);
CREATE INDEX audit_log_actor_at ON audit_log (actor_id, at DESC);

CREATE FUNCTION audit_log_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- ---------------------------------------------------------------------------
-- Notes (workspaces), memory, posts
-- ---------------------------------------------------------------------------

CREATE TABLE workspaces (
  id          text PRIMARY KEY,
  owner_id    text NOT NULL REFERENCES people(id),
  title       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_messages (
  id              text PRIMARY KEY,
  workspace_id    text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('executive', 'assistant')),
  text            text NOT NULL,
  at              timestamptz NOT NULL DEFAULT now(),
  model           text,
  prompt_version  text
);

-- Nothing becomes memory without an explicit save, and working conversation
-- state is not a category that can be stored at all.
CREATE TABLE memory_entries (
  id                 text PRIMARY KEY,
  workspace_id       text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id           text NOT NULL REFERENCES people(id),
  category           text NOT NULL CHECK (category IN ('executive_profile', 'project_context', 'saved_decision')),
  content            text NOT NULL,
  saved_by           text NOT NULL REFERENCES people(id),
  saved_at           timestamptz NOT NULL DEFAULT now(),
  source_message_id  text REFERENCES workspace_messages(id),
  CHECK (saved_by = owner_id)
);

CREATE TABLE posts (
  id         text PRIMARY KEY,
  author_id  text NOT NULL REFERENCES people(id),
  channel    text NOT NULL CHECK (channel IN ('linkedin', 'substack', 'instagram', 'internal')),
  title      text NOT NULL,
  body       text NOT NULL,
  checks     jsonb NOT NULL DEFAULT '[]',
  decision   jsonb NOT NULL,
  status     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Projects and their link tables
-- ---------------------------------------------------------------------------

CREATE TABLE projects (
  id           text PRIMARY KEY,
  owner_id     text NOT NULL REFERENCES people(id),
  name         text NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  description  text NOT NULL DEFAULT '',
  color        text NOT NULL CHECK (color IN ('teal', 'indigo', 'amber', 'rose', 'slate', 'green')),
  type         text NOT NULL CHECK (type IN ('initiative', 'recurring', 'custom')),
  status       text NOT NULL CHECK (status IN ('active', 'paused', 'done')),
  keywords     text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_people (
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id   text NOT NULL REFERENCES people(id),
  PRIMARY KEY (project_id, person_id)
);
-- An email is filed under one project at a time.
CREATE TABLE project_emails (
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email_id    text NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, email_id)
);
CREATE TABLE project_events (
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id    text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, event_id)
);
CREATE TABLE project_notes (
  project_id    text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id  text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, workspace_id)
);

-- ---------------------------------------------------------------------------
-- Current prototype session store (kept so one database serves both)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ecc_demo_sessions (
  id          text PRIMARY KEY,
  state       jsonb NOT NULL,
  expires_at  timestamptz NOT NULL
);
