import { NextResponse } from "next/server";
import { actorFromRequest } from "@/core/session";
import { PEOPLE } from "@/data/org";

/** The internal directory: names and titles only, for pickers. */
export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  return NextResponse.json({
    people: PEOPLE.filter((person) => person.function !== "external" && person.id !== actor.id)
      .map(({ id, name, title }) => ({ id, name, title })),
  });
}
