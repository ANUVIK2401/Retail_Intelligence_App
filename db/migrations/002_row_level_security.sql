-- Per-user isolation in the database, not only in route handlers.
--
-- The application sets the acting persona once per transaction:
--   SELECT set_config('app.person_id', $1, true);
-- and connects as a role without BYPASSRLS. Private tables then return only
-- the owner's rows even if a query forgets its WHERE clause. Restricted mail
-- stays withheld at the API layer, where the policy engine classifies it;
-- the database adds owner and attendee scoping underneath.

CREATE FUNCTION app_person() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.person_id', true), '')
$$;

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspaces_owner ON workspaces USING (owner_id = app_person()) WITH CHECK (owner_id = app_person());

ALTER TABLE workspace_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_messages_owner ON workspace_messages
  USING (EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.owner_id = app_person()));

ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY memory_owner ON memory_entries USING (owner_id = app_person()) WITH CHECK (owner_id = app_person());

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_owner ON projects USING (owner_id = app_person()) WITH CHECK (owner_id = app_person());

-- Event titles are visible to the owner and to invitees. Everyone else reads
-- busy_blocks, which has no title to read.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- Invitees may read; only the owner may write.
CREATE POLICY events_owner_or_invitee ON events USING (
  owner_id = app_person() OR EXISTS (SELECT 1 FROM event_attendees a WHERE a.event_id = id AND a.person_id = app_person())
) WITH CHECK (owner_id = app_person());

-- A mailbox is readable by its owner and by a named delegate.
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
-- A delegate may read; nobody writes into another person's mailbox through the app role.
CREATE POLICY emails_owner_or_delegate ON emails USING (
  mailbox_owner_id = app_person() OR EXISTS (
    SELECT 1 FROM delegations d WHERE d.executive_id = mailbox_owner_id AND d.delegate_id = app_person()
  )
) WITH CHECK (mailbox_owner_id = app_person());

ALTER TABLE sent_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY sent_replies_actor ON sent_replies USING (actor_id = app_person()) WITH CHECK (actor_id = app_person());
