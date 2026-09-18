import { headers } from "next/headers";
import type { Person } from "@/core/contracts";
import { personById } from "@/data/org";
import { ACTOR_HEADER } from "@/core/deployment/access";

export { ACTOR_HEADER } from "@/core/deployment/access";

function requireActor(id: string | null): Person {
  const actor = id ? personById(id) : undefined;
  if (!actor) throw new Error("Member authentication required.");
  return actor;
}

export async function getActor(): Promise<Person> {
  return requireActor((await headers()).get(ACTOR_HEADER));
}

export function actorFromRequest(req: Request): Person {
  return requireActor(req.headers.get(ACTOR_HEADER));
}
