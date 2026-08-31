/**
 * Seeds the Pokemon reference table from the committed PokeAPI snapshot.
 *
 * Idempotent: re-running updates existing rows rather than failing, so it is
 * safe to run against an already-seeded database (including production, once).
 * Regenerate the snapshot itself with `npm run pokemon:cache`.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from "@/prisma/generated/prisma";
import { readFile } from "node:fs/promises";
import path from "node:path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter });

interface PokemonCacheEntry {
  id: number;
  name: string;
  types: string[];
  spriteUrl: string;
  evolutionChainId: number;
  generation: number;
}

const EXPECTED_COUNT = 386;

async function main() {
  const cachePath = path.join(
    process.cwd(),
    "prisma",
    "seed",
    "pokemon-cache.json",
  );

  const entries = JSON.parse(
    await readFile(cachePath, "utf8"),
  ) as PokemonCacheEntry[];

  if (entries.length !== EXPECTED_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COUNT} Pokemon in the cache, found ${entries.length}. ` +
        `Re-run "npm run pokemon:cache".`,
    );
  }

  // Chunked rather than one transaction per row: 386 round trips is slow
  // enough to be annoying in CI.
  for (const entry of entries) {
    await prisma.pokemon.upsert({
      where: { id: entry.id },
      create: entry,
      update: entry,
    });
  }

  const count = await prisma.pokemon.count();
  const chains = await prisma.pokemon.findMany({
    distinct: ["evolutionChainId"],
    select: { evolutionChainId: true },
  });

  console.log(`Seeded ${count} Pokemon across ${chains.length} evolution chains.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
