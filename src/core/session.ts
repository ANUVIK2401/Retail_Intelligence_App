import { cookies } from "next/headers";
import type { Person } from "@/core/contracts";
import { personById } from "@/data/org";

/**
 * Prototype session.
 *
 * Stands in for Microsoft Entra ID. The role switcher writes a cookie; every
 * server path reads the acting identity from here and nowhere else, so
 * replacing this file with MSAL token validation is the whole auth migration.
 */

export const ACTOR_COOKIE = "ecc_actor";
export const DEFAULT_ACTOR = "p_ceo";

/** Identities offered in the prototype's role switcher. */
export const SWITCHABLE_ACTORS = [
  "p_ceo",
  "p_ea",
  "p_gc",
  "p_cfo",
  "p_cdio",
  "p_auditor",
] as const;

export async function getActor(): Promise<Person> {
  const jar = await cookies();
  const id = jar.get(ACTOR_COOKIE)?.value ?? DEFAULT_ACTOR;
  return personById(id) ?? personById(DEFAULT_ACTOR)!;
}

export function actorFromRequest(req: Request): Person {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`${ACTOR_COOKIE}=([^;]+)`));
  const id = match?.[1] ?? DEFAULT_ACTOR;
  return personById(decodeURIComponent(id)) ?? personById(DEFAULT_ACTOR)!;
}
