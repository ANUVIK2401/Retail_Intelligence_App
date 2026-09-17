import { NextResponse } from "next/server";
import { ACTOR_COOKIE, SWITCHABLE_ACTORS, actorFromRequest } from "@/core/session";
import { personById } from "@/data/org";

export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  return NextResponse.json({
    actor,
    options: SWITCHABLE_ACTORS.map((id) => {
      const p = personById(id)!;
      return { id: p.id, name: p.name, title: p.title, roles: p.roles };
    }),
  });
}

/** Stands in for signing in as a different Entra identity. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { actorId?: string };
  const person = body.actorId ? personById(body.actorId) : undefined;
  if (!person) {
    return NextResponse.json({ error: "Unknown identity." }, { status: 400 });
  }
  const res = NextResponse.json({ actor: person });
  res.cookies.set(ACTOR_COOKIE, person.id, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
  return res;
}
