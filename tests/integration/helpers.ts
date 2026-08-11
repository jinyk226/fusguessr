import { PrismaClient } from "@prisma/client";

import { canonicalPair } from "@/lib/game/canonical-pair";

export const prisma = new PrismaClient();

/**
 * A handful of real Pokemon, enough to exercise correct / same-line / wrong
 * grading. Using genuine dex ids and evolution chain ids keeps the fixtures
 * honest against the seeded data.
 */
export const TEST_POKEMON = [
  { id: 4, name: "charmander", evolutionChainId: 2, types: ["fire"], generation: 1 },
  { id: 5, name: "charmeleon", evolutionChainId: 2, types: ["fire"], generation: 1 },
  { id: 6, name: "charizard", evolutionChainId: 2, types: ["fire", "flying"], generation: 1 },
  { id: 7, name: "squirtle", evolutionChainId: 3, types: ["water"], generation: 1 },
  { id: 8, name: "wartortle", evolutionChainId: 3, types: ["water"], generation: 1 },
  { id: 25, name: "pikachu", evolutionChainId: 10, types: ["electric"], generation: 1 },
  { id: 133, name: "eevee", evolutionChainId: 67, types: ["normal"], generation: 1 },
  { id: 197, name: "umbreon", evolutionChainId: 67, types: ["dark"], generation: 2 },
  { id: 252, name: "treecko", evolutionChainId: 137, types: ["grass"], generation: 3 },
  { id: 255, name: "torchic", evolutionChainId: 138, types: ["fire"], generation: 3 },
];

/** Truncates every table. Order matters less with CASCADE, but be explicit. */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "Guess", "Attempt", "FusionGeneration", "Fusion",
                   "RolloverLog", "Session", "Account", "User", "Pokemon"
    RESTART IDENTITY CASCADE;
  `);
}

export async function seedTestPokemon(): Promise<void> {
  await prisma.pokemon.createMany({
    data: TEST_POKEMON.map((p) => ({
      ...p,
      spriteUrl: `https://example.test/sprites/${p.id}.png`,
    })),
    skipDuplicates: true,
  });
}

export async function createUser(
  email = "player@example.com",
  role: "USER" | "ADMIN" = "USER",
) {
  return prisma.user.create({ data: { email, role, name: email.split("@")[0] } });
}

export interface CreateTestFusionOptions {
  pokemonAId?: number;
  pokemonBId?: number;
  status?: "DRAFT" | "APPROVED" | "SCHEDULED" | "LIVE" | "ARCHIVED";
  scheduledForDate?: string | null;
  liveDate?: string | null;
  /**
   * Skips canonical ordering so a test can prove the database rejects a
   * non-canonical pair on its own. Production code never does this.
   */
  skipCanonicalization?: boolean;
}

/** Inserts a fusion directly, bypassing image generation. */
export async function createTestFusion(options: CreateTestFusionOptions = {}) {
  const rawA = options.pokemonAId ?? 6;
  const rawB = options.pokemonBId ?? 7;

  const { pokemonAId, pokemonBId } = options.skipCanonicalization
    ? { pokemonAId: rawA, pokemonBId: rawB }
    : canonicalPair(rawA, rawB);

  return prisma.fusion.create({
    data: {
      pokemonAId,
      pokemonBId,
      basePromptSnapshot: "test prompt",
      imageUrl: "https://example.test/fusion.png",
      imageGcsPath: "fusions/test/1.png",
      focalX: 50,
      focalY: 50,
      status: options.status ?? "LIVE",
      scheduledForDate: options.scheduledForDate ?? null,
      liveDate:
        options.liveDate !== undefined
          ? options.liveDate
          : (options.status ?? "LIVE") === "LIVE"
            ? "2026-08-11"
            : null,
      createdByAdminId: "admin-test",
    },
  });
}
