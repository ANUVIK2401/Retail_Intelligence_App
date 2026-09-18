import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, normalizeEmail, validateOnboarding, type MemberRecord } from "@/core/auth/admin";
import { addMember, listMembers, membersDurable, removeMember } from "@/core/auth/members";
import { MEMBER_HEADER } from "@/core/deployment/access";
import { readJsonBody } from "@/core/deployment/request";
import { PEOPLE } from "@/data/org";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Member onboarding, restricted to administrators.
 *
 * Administrator status is read from the authenticated member email that the
 * proxy set, never from the request body and never from a client header the
 * browser could forge. `ADMIN_EMAILS` is deployment configuration.
 */
function actingEmail(req: Request): string | null {
  return normalizeEmail(req.headers.get(MEMBER_HEADER));
}

function requireAdmin(req: Request): { ok: true; email: string } | { ok: false; res: NextResponse } {
  const email = actingEmail(req);
  if (!email || !isAdmin(email)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Only an administrator can manage members." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, email };
}

/** Roles an admin may assign. Synthetic personas only. */
function assignableRoles() {
  return PEOPLE.filter((p) => p.function !== "external").map((p) => ({
    id: p.id,
    name: p.name,
    title: p.title,
    function: p.function,
    roles: p.roles,
  }));
}

export async function GET(req: Request) {
  const gate = requireAdmin(req);
  if (!gate.ok) return gate.res;

  let members: MemberRecord[] = [];
  try {
    members = await listMembers();
  } catch {
    return NextResponse.json(
      { error: "The member directory is unavailable. Check DATABASE_URL." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    members,
    roles: assignableRoles(),
    durable: membersDurable(),
    actingAdmin: gate.email,
  });
}

const InviteSchema = z
  .object({ email: z.string().trim().min(3).max(320), actorId: z.string().trim().min(1).max(64) })
  .strict();

export async function POST(req: Request) {
  const gate = requireAdmin(req);
  if (!gate.ok) return gate.res;

  let body: unknown;
  try {
    body = await readJsonBody(req, 4096);
  } catch {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide an email and a role." }, { status: 400 });
  }

  let existing: Map<string, MemberRecord>;
  try {
    existing = new Map((await listMembers()).map((m) => [m.email, m]));
  } catch {
    return NextResponse.json(
      { error: "The member directory is unavailable. Check DATABASE_URL." },
      { status: 503 },
    );
  }

  const result = validateOnboarding({
    email: parsed.data.email,
    actorId: parsed.data.actorId,
    existing,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  try {
    await addMember(result.member.email, result.member.actorId, gate.email);
  } catch {
    return NextResponse.json({ error: "The member could not be saved." }, { status: 503 });
  }

  return NextResponse.json({ member: result.member }, { status: 201 });
}

const RemoveSchema = z.object({ email: z.string().trim().min(3).max(320) }).strict();

export async function DELETE(req: Request) {
  const gate = requireAdmin(req);
  if (!gate.ok) return gate.res;

  let body: unknown;
  try {
    body = await readJsonBody(req, 2048);
  } catch {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const parsed = RemoveSchema.safeParse(body);
  const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
  if (!email) {
    return NextResponse.json({ error: "Provide the member's email." }, { status: 400 });
  }

  // An administrator removing themselves would lock the console. Refuse rather
  // than let one click end the deployment's only way back in.
  if (email === gate.email) {
    return NextResponse.json(
      { error: "You cannot remove your own administrator access here." },
      { status: 400 },
    );
  }

  try {
    const removed = await removeMember(email);
    if (!removed) {
      return NextResponse.json(
        {
          error:
            "That member comes from EXECUTIVE_MEMBER_MAP. Remove them from the deployment's environment instead.",
        },
        { status: 409 },
      );
    }
  } catch {
    return NextResponse.json({ error: "The member could not be removed." }, { status: 503 });
  }

  return NextResponse.json({ removed: email });
}
