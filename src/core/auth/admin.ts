import { personById } from "@/data/org";

/**
 * Administration and member onboarding.
 *
 * Two distinct ideas, deliberately kept apart:
 *
 *  - ADMIN is a deployment-level capability: who may onboard members and see
 *    the member list. It comes from `ADMIN_EMAILS`, never from the synthetic
 *    directory, and never from anything a browser can send.
 *  - The PERSONA is what the policy engine reasons about. Onboarding maps a
 *    verified Google email to one of the synthetic personas, and that persona's
 *    permissions are then decided by `evaluatePolicy()` exactly as before.
 *
 * Being an administrator does NOT widen what you can read. An admin still acts
 * as their mapped persona for every policy decision, so an admin who is mapped
 * to a marketing persona still cannot read a restricted thread. Onboarding
 * rights and reading rights are different things, and conflating them is how
 * "admin" quietly becomes "root".
 */

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

export function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && EMAIL.test(email) ? email : null;
}

/** Administrators, from server configuration only. */
export function adminEmails(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Set<string> {
  const raw = env.ADMIN_EMAILS?.trim();
  if (!raw) return new Set();
  const emails = raw
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter((entry): entry is string => Boolean(entry));
  return new Set(emails);
}

export function isAdmin(
  email: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && adminEmails(env).has(normalized));
}

/* ------------------------------------------------------------------ */
/* Member records                                                      */
/* ------------------------------------------------------------------ */

export type MemberRecord = {
  email: string;
  actorId: string;
  /** Display-only; the policy engine reads the persona, not this. */
  personaName: string;
  personaTitle: string;
  admin: boolean;
  /** "config" = from EXECUTIVE_MEMBER_MAP, "invited" = onboarded at runtime. */
  origin: "config" | "invited";
};

export type OnboardResult =
  | { ok: true; member: MemberRecord }
  | { ok: false; reason: string };

/**
 * Validates an onboarding request.
 *
 * Kept pure so the rules are readable by a non-engineer and testable without a
 * request: a well-formed email, a persona that actually exists, and no silent
 * overwrite of an existing member.
 */
export function validateOnboarding(input: {
  email: string;
  actorId: string;
  existing: ReadonlyMap<string, MemberRecord>;
  env?: Readonly<Record<string, string | undefined>>;
}): OnboardResult {
  const email = normalizeEmail(input.email);
  if (!email) {
    return { ok: false, reason: "Enter a valid email address." };
  }

  const person = personById(input.actorId);
  if (!person) {
    return { ok: false, reason: "Choose a role that exists in the directory." };
  }

  if (input.existing.has(email)) {
    return {
      ok: false,
      reason: `${email} is already onboarded. Remove them first to change their role.`,
    };
  }

  return {
    ok: true,
    member: {
      email,
      actorId: person.id,
      personaName: person.name,
      personaTitle: person.title,
      admin: isAdmin(email, input.env),
      origin: "invited",
    },
  };
}
