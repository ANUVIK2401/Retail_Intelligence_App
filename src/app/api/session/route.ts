import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { actorFromRequest } from "@/core/session";

export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  const session = await auth();
  return NextResponse.json({
    actor: { id: actor.id, name: actor.name, title: actor.title, roles: actor.roles },
    member: session?.user ? { name: session.user.name ?? actor.name, email: session.user.email ?? "" } :
      { name: "Local demo", email: "Synthetic session" },
  });
}
