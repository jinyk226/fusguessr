import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/db/prisma";
import { authConfig } from "./auth.config";
import { isAdminEmail } from "./admin-emails";

/**
 * Resolves the role to store on a freshly-issued token.
 *
 * Exported separately from the NextAuth() config so the ADMIN_EMAILS bootstrap
 * can be unit-tested directly with fixture inputs, rather than only through a
 * full OAuth handshake.
 *
 * The env allowlist promotes; it never demotes. Once someone is ADMIN in the
 * database, removing them from ADMIN_EMAILS does not strip the role - that is
 * a deliberate database operation.
 */
export async function resolveUserRole(
  userId: string,
  email: string | null | undefined,
  currentRole: "USER" | "ADMIN" | undefined,
): Promise<"USER" | "ADMIN"> {
  if (currentRole === "ADMIN") return "ADMIN";

  if (isAdminEmail(email)) {
    await prisma.user.update({
      where: { id: userId },
      data: { role: "ADMIN" },
    });
    return "ADMIN";
  }

  return "USER";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,

    async jwt({ token, user }) {
      // `user` is only populated on initial sign-in; on later requests the
      // token already carries the role.
      if (user) {
        token.sub = user.id ?? token.sub;
        token.role = await resolveUserRole(
          user.id as string,
          user.email,
          (user as { role?: "USER" | "ADMIN" }).role,
        );
      }
      return token;
    },
  },
});
