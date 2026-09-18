import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { actorId: string | null; isAdmin: boolean };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    actorId?: string | null;
  }
}
