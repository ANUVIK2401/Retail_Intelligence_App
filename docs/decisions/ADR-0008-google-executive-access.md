# ADR-0008 — Google sign-in for mapped executive members

**Status:** accepted · **Date:** 2026-09-17

## Context

The prototype's role cookie and shared URL password were suitable only for a
synthetic demonstration. A member sign-in must not let a browser select its
own executive role. Google sign-in by itself also does not establish that a
person belongs to this organization's executive group.

## Decision

Use Auth.js with Google OpenID Connect and short-lived, signed sessions. A
verified Google email is admitted only when it exactly matches an entry in
`EXECUTIVE_MEMBER_MAP`, whose target must be an executive in the synthetic
directory. The server derives the acting persona from that mapping on every
request. The old role cookie is ignored outside an explicit localhost-only
development mode. API and page requests fail closed when auth is unconfigured
or the member is unauthorized.

The OAuth scopes are limited to sign-in identity. This does **not** grant
Gmail or Google Calendar access. The app continues to use synthetic mail and
free/busy fixtures. Member session storage keys are scoped to the authenticated
persona, so a later user of the same browser cannot reuse another member's
demo state. Keys and secrets remain server-side.

## Consequences

This supersedes ADR-0007's shared Basic-auth gate. Vercel now requires
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, and
`EXECUTIVE_MEMBER_MAP` in addition to `DATABASE_URL`. The Google OAuth web
client must allow the exact deployed `/api/auth/callback/google` URL. A new
executive cannot sign in until an administrator maps their verified email.
Sign-in and role authorization still need a live Google/Vercel test after
credentials are configured; local tests cannot simulate Google's consent flow.
