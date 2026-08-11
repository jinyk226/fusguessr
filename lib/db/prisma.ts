import { PrismaClient } from "@prisma/client";

// Next.js dev mode re-evaluates modules on every hot reload, which would
// otherwise open a new pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
