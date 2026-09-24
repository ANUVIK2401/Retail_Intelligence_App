import { Pool } from "pg";
import { isAdmin, normalizeEmail, type MemberRecord } from "@/core/auth/admin";
import { executiveActorId } from "@/core/auth/membership";
import { personById } from "@/data/org";

/**
 * Member directory.
 *
 * Members come from two places and both are server-side:
 *   1. `EXECUTIVE_MEMBER_MAP` — the bootstrap set, so a fresh deployment has
 *      at least one person who can sign in.
 *   2. The `ecc_members` table — people an administrator onboarded at runtime.
 *
 * Configuration wins on conflict, so an operator can always recover access by
 * editing environment variables even if the table is wrong.
 *
 * Without a database the invited set is process-local. That is fine for a local
 * demo and stated plainly in the admin UI, because a member who vanishes on
 * redeploy is worse than one who was never added.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS ecc_members (
  email text PRIMARY KEY,
  actor_id text NOT NULL,
  invited_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
)`;

let pool: Pool | undefined;
function database(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
  });
  return pool;
}

/** Process-local fallback when no database is configured. */
const localMembers = new Map<string, { actorId: string; invitedBy: string }>();

function fromConfig(): Map<string, MemberRecord> {
  const result = new Map<string, MemberRecord>();
  const raw = process.env.EXECUTIVE_MEMBER_MAP?.trim();
  if (!raw) return result;

  for (const entry of raw.split(",")) {
    const [rawEmail] = entry.split(":");
    const email = normalizeEmail(rawEmail);
    if (!email) continue;
    const actorId = executiveActorId(email, process.env.EXECUTIVE_MEMBER_MAP);
    const person = actorId ? personById(actorId) : undefined;
    if (!person) continue;
    result.set(email, {
      email,
      actorId: person.id,
      personaName: person.name,
      personaTitle: person.title,
      admin: isAdmin(email),
      origin: "config",
    });
  }
  return result;
}

export async function listMembers(): Promise<MemberRecord[]> {
  const members = fromConfig();

  const db = database();
  if (db) {
    const client = await db.connect();
    try {
      await client.query(SCHEMA);
      const { rows } = await client.query("SELECT email, actor_id FROM ecc_members");
      for (const row of rows) {
        const email = normalizeEmail(String(row.email));
        const person = personById(String(row.actor_id));
        if (!email || !person || members.has(email)) continue;
        members.set(email, {
          email,
          actorId: person.id,
          personaName: person.name,
          personaTitle: person.title,
          admin: isAdmin(email),
          origin: "invited",
        });
      }
    } finally {
      client.release();
    }
  } else {
    for (const [email, entry] of localMembers) {
      const person = personById(entry.actorId);
      if (!person || members.has(email)) continue;
      members.set(email, {
        email,
        actorId: person.id,
        personaName: person.name,
        personaTitle: person.title,
        admin: isAdmin(email),
        origin: "invited",
      });
    }
  }

  // Administrators always appear, even before they have been mapped, so the
  // console can never show an empty list to the person who owns it.
  for (const email of adminSet()) {
    if (members.has(email)) continue;
    members.set(email, {
      email,
      actorId: "",
      personaName: "Not yet assigned",
      personaTitle: "Administrator (assign a role to sign in)",
      admin: true,
      origin: "config",
    });
  }

  return [...members.values()].sort((a, b) => {
    if (a.admin !== b.admin) return a.admin ? -1 : 1;
    return a.email.localeCompare(b.email);
  });
}

function adminSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => normalizeEmail(e))
      .filter((e): e is string => Boolean(e)),
  );
}

export async function addMember(
  email: string,
  actorId: string,
  invitedBy: string,
): Promise<void> {
  const db = database();
  if (!db) {
    localMembers.set(email, { actorId, invitedBy });
    return;
  }
  const client = await db.connect();
  try {
    await client.query(SCHEMA);
    await client.query(
      "INSERT INTO ecc_members (email, actor_id, invited_by) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET actor_id = EXCLUDED.actor_id",
      [email, actorId, invitedBy],
    );
  } finally {
    client.release();
  }
}

export async function removeMember(email: string): Promise<boolean> {
  // Configured members cannot be removed from the UI: the environment is the
  // source of truth for them, and a delete that silently does nothing is worse
  // than a refusal that explains itself.
  if (fromConfig().has(email)) return false;

  const db = database();
  if (!db) return localMembers.delete(email);

  const client = await db.connect();
  try {
    await client.query(SCHEMA);
    await client.query("DELETE FROM ecc_members WHERE email = $1", [email]);
    return true;
  } finally {
    client.release();
  }
}

/** Resolves a verified email to its persona, config first, then invited. */
export async function resolveMemberActor(email: string | null | undefined): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const configured = executiveActorId(normalized, process.env.EXECUTIVE_MEMBER_MAP);
  if (configured) return configured;

  const db = database();
  if (!db) {
    const local = localMembers.get(normalized);
    return local && personById(local.actorId) ? local.actorId : null;
  }

  const client = await db.connect();
  try {
    await client.query(SCHEMA);
    const { rows } = await client.query(
      "SELECT actor_id FROM ecc_members WHERE email = $1",
      [normalized],
    );
    const actorId = rows[0] ? String(rows[0].actor_id) : null;
    return actorId && personById(actorId) ? actorId : null;
  } finally {
    client.release();
  }
}

export function membersDurable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
