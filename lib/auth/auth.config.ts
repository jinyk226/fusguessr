import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Adapter-free half of the Auth.js configuration, used by proxy.ts.
 *
 * It carries only what a route guard needs - the provider list and the
 * token/session shape - and is spread into the full config in lib/auth/auth.ts,
 * which adds the Prisma adapter and the database-backed role bootstrap.
 *
 * Next 16's proxy runs on Node.js, so the adapter would technically load here
 * now (it could not on Next 15, where this ran on Edge). Keeping it out is
 * still the right call: the proxy runs on nearly every request, and it has no
 * need to open a database connection just to read a JWT.
 */
export const authConfig = {
  providers: [Google],

  pages: {
    signIn: "/sign-in",
  },

  session: {
    // JWT rather than database sessions, so the proxy can check auth without
    // a database round trip on every request. The Prisma adapter still
    // persists users and linked accounts.
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
