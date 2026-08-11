import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

// Edge-safe instance: authConfig deliberately excludes the Prisma adapter,
// which cannot run on the Edge runtime.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Everything except Next internals, the auth endpoints themselves, and
  // static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
