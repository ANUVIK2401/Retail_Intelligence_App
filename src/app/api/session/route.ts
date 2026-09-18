import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { actorFromRequest } from "@/core/session";
import { isAdmin } from "@/core/auth/admin";
import { MEMBER_HEADER } from "@/core/deployment/access";

export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  const session = await auth();
  // Admin status is derived server-side from the authenticated member email
  // the proxy set. The client is told so it can show the console link; the
  // API re-checks it on every admin call and never trusts this value.
  const admin = isAdmin(req.headers.get(MEMBER_HEADER) ?? session?.user?.email ?? null);
  return NextResponse.json({
    actor: { id: actor.id, name: actor.name, title: actor.title, roles: actor.roles },
    member: session?.user ? { name: session.user.name ?? actor.name, email: session.user.email ?? "" } :
      { name: "Local demo", email: "Synthetic session" },
    admin,
  });
}
