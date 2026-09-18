import { personById } from "@/data/org";

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

function parseMemberMap(value: string | undefined): Map<string, string> | null {
  if (!value?.trim()) return null;
  const result = new Map<string, string>();
  for (const entry of value.split(",")) {
    const parts = entry.trim().split(":");
    if (parts.length !== 2) return null;
    const [email, actorId] = parts.map((part) => part.trim().toLowerCase());
    const actor = personById(actorId);
    if (!EMAIL.test(email) || !actor?.roles.includes("executive") || result.has(email)) return null;
    result.set(email, actorId);
  }
  return result.size > 0 ? result : null;
}

/** Verified Google email is only an identity; explicit membership grants access. */
export function executiveActorId(email: string | null | undefined, mapping: string | undefined): string | null {
  if (!email) return null;
  return parseMemberMap(mapping)?.get(email.trim().toLowerCase()) ?? null;
}

export function googleAuthConfigured(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim() &&
    env.AUTH_SECRET && env.AUTH_SECRET.length >= 32 && parseMemberMap(env.EXECUTIVE_MEMBER_MAP));
}
