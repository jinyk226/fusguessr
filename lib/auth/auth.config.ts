import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe half of the Auth.js configuration.
 *
 * middleware.ts runs on the Edge runtime, where the Prisma adapter cannot go.
 * This half carries only what a route guard needs - the provider list and the
 * token/session shape - and is spread into the full Node-runtime config in
 * lib/auth/auth.ts, which adds the adapter and the database-backed role
 * bootstrap.
 */
export const authConfig = {
  providers: [Google],

  pages: {
    signIn: "/sign-in",
  },

  session: {
    // JWT rather than database sessions, so middleware can check auth on the
    // Edge without a database round trip. The Prisma adapter still persists
    // users and linked accounts.
    strategy: "jwt",
  },

  callbacks: {
    /**
     * Coarse route guard. Server Actions and admin pages re-check the role
     * against the database (see lib/auth/admin.ts) rather than trusting the
     * token, which can be stale after a role change.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isSignedIn = Boolean(auth?.user);

      const requiresAuth =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/results") ||
        pathname.startsWith("/day");

      if (!requiresAuth) return true;
      if (!isSignedIn) return false;

      if (pathname.startsWith("/admin")) {
        return auth?.user?.role === "ADMIN";
      }

      return true;
    },

    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
