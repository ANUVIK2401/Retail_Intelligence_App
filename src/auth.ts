import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { executiveActorId, googleAuthConfigured } from "@/core/auth/membership";
import { isAdmin } from "@/core/auth/admin";
import { resolveMemberActor } from "@/core/auth/members";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // An explicit localhost-only demo secret keeps Auth.js quiet during synthetic
  // development. Production never uses this predictable fallback.
  secret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV !== "production" && process.env.AUTH_MODE === "demo"
    ? "local-demo-auth-secret-not-for-production-2026" : undefined),
  providers: [Google],
  pages: { signIn: "/sign-in" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || profile?.email_verified !== true) return false;
      if (!googleAuthConfigured()) return false;
      // Admitted when mapped in configuration OR onboarded by an administrator.
      // An administrator who has not been assigned a persona is still admitted,
      // so the person who owns the deployment can always reach the console.
      return (
        Boolean(await resolveMemberActor(profile.email)) || isAdmin(profile.email)
      );
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        token.actorId =
          profile?.email_verified === true ? await resolveMemberActor(profile.email) : null;
      }
      return token;
    },
    async session({ session, token }) {
      // Re-derived on every request rather than trusted from the token, so
      // revoking a member takes effect immediately instead of at token expiry.
      session.user.actorId = await resolveMemberActor(token.email);
      session.user.isAdmin = isAdmin(token.email);
      return session;
    },
  },
});
