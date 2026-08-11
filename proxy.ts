import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth.config";

// Renamed from middleware.ts in Next 16, which also moved this hook off the
// Edge runtime and onto Node.js. authConfig is still kept free of the Prisma
// adapter so the same config can be reused if this ever runs on Edge again.
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export default proxy;

export const config = {
  // Everything except Next internals, the auth endpoints themselves, and
  // static assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
