import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from "@/prisma/generated/prisma";

// Next.js dev mode re-evaluates modules on every hot reload, which would
// otherwise open a new pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
