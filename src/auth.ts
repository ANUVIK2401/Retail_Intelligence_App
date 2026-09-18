import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { executiveActorId, googleAuthConfigured } from "@/core/auth/membership";

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
      return account?.provider === "google" && profile?.email_verified === true &&
        googleAuthConfigured() && Boolean(executiveActorId(profile.email, process.env.EXECUTIVE_MEMBER_MAP));
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        token.actorId = profile?.email_verified === true
          ? executiveActorId(profile.email, process.env.EXECUTIVE_MEMBER_MAP)
          : null;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.actorId = executiveActorId(token.email, process.env.EXECUTIVE_MEMBER_MAP);
      return session;
    },
  },
});
