import "server-only";

import type { User } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { auth } from "./auth";

/**
 * Authorisation helpers.
 *
 * These re-read the role from the database rather than trusting the session
 * token. middleware.ts gates whole routes off the token for speed, but a token
 * issued before a role change is stale, and Server Actions are individually
 * addressable - a layout guard does not protect them. Every admin action calls
 * requireAdmin() in its own body.
 */

export class UnauthenticatedError extends Error {
  constructor() {
    super("You must be signed in to do that");
    this.name = "UnauthenticatedError";
  }
}

export class NotAuthorizedError extends Error {
  constructor() {
    super("You do not have permission to do that");
    this.name = "NotAuthorizedError";
  }
}

/** The signed-in user as stored in the database, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new NotAuthorizedError();
  return user;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "ADMIN";
}
