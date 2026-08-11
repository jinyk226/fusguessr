/**
 * One-off script: builds prisma/seed/pokemon-cache.json from PokeAPI.
 *
 * The app never calls PokeAPI at request time (or even at seed time) - this
 * script produces a committed snapshot that `prisma db seed` reads. Re-run it
 * only when the reference data itself needs refreshing.
 *
 *   npm run pokemon:cache              # live pokeapi.co
 *   POKEAPI_SOURCE=mirror npm run pokemon:cache
 *
 * The "mirror" source reads PokeAPI's own static JSON dump on GitHub
 * (PokeAPI/api-data). It is useful when pokeapi.co is unreachable - e.g. from
 * a sandboxed CI runner with a restrictive network egress policy.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/** National dex range covered by the game: Kanto through Hoenn. */
const FIRST_DEX_ID = 1;
const LAST_DEX_ID = 386;

/** Concurrent HTTP requests. Kept modest to stay a polite API citizen. */
const CONCURRENCY = 8;

const LIVE_BASE = "https://pokeapi.co/api/v2";
const MIRROR_BASE =
  "https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2";

const useMirror = process.env.POKEAPI_SOURCE === "mirror";
const BASE = useMirror ? MIRROR_BASE : LIVE_BASE;

/** The static mirror serves directory-style paths ending in /index.json. */
function resourceUrl(resource: string, id: number): string {
  return useMirror
    ? `${BASE}/${resource}/${id}/index.json`
    : `${BASE}/${resource}/${id}`;
}

export interface PokemonCacheEntry {
  id: number;
  name: string;
  types: string[];
  spriteUrl: string;
  evolutionChainId: number;
  generation: number;
}

/**
 * Dex ranges are exact for gens 1-3, so this avoids a dependency on the
 * `generation.name` string format.
 */
function generationForDexId(id: number): number {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  return 3;
}

/**
 * Evolution chain URLs are absolute on pokeapi.co but relative on the mirror,
 * so match the trailing id rather than parsing a full URL.
 */
function parseTrailingId(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  if (!match) throw new Error(`Could not parse an id out of URL: ${url}`);
  return Number(match[1]);
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function fetchPokemon(id: number): Promise<PokemonCacheEntry> {
  const [pokemon, species] = await Promise.all([
    fetchJson(resourceUrl("pokemon", id)) as Promise<any>,
    fetchJson(resourceUrl("pokemon-species", id)) as Promise<any>,
  ]);

  const spriteUrl =
    pokemon.sprites?.versions?.["generation-iii"]?.["ruby-sapphire"]
      ?.front_default;

  // Loud failure rather than a silently blank sprite: the whole guessing UI
  // depends on every dex entry having one.
  if (typeof spriteUrl !== "string" || spriteUrl.length === 0) {
    throw new Error(`#${id} (${pokemon.name}) has no ruby-sapphire sprite`);
  }

  const chainUrl = species.evolution_chain?.url;
  if (typeof chainUrl !== "string") {
    throw new Error(`#${id} (${pokemon.name}) has no evolution_chain`);
  }

  return {
    id,
    name: pokemon.name,
    types: (pokemon.types as any[])
      .sort((a, b) => a.slot - b.slot)
      .map((t) => t.type.name),
    spriteUrl,
    evolutionChainId: parseTrailingId(chainUrl),
    generation: generationForDexId(id),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Simple fixed-size worker pool - avoids pulling in a dependency for this. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

async function main() {
  const ids = Array.from(
    { length: LAST_DEX_ID - FIRST_DEX_ID + 1 },
    (_, i) => FIRST_DEX_ID + i,
  );

  console.log(
    `Fetching ${ids.length} Pokemon from ${useMirror ? "GitHub mirror" : "pokeapi.co"}...`,
  );

  let done = 0;
  const entries = await mapWithConcurrency(ids, CONCURRENCY, async (id) => {
    const entry = await fetchPokemon(id);
    if (++done % 50 === 0) console.log(`  ${done}/${ids.length}`);
    return entry;
  });

  entries.sort((a, b) => a.id - b.id);

  // Verify the assumption the whole seed rests on: complete, gap-free coverage.
  if (entries.length !== LAST_DEX_ID) {
    throw new Error(`Expected ${LAST_DEX_ID} entries, got ${entries.length}`);
  }
  entries.forEach((entry, index) => {
    if (entry.id !== index + 1) {
      throw new Error(`Gap in dex ids near #${entry.id}`);
    }
  });

  const outPath = path.join(process.cwd(), "prisma", "seed", "pokemon-cache.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

  const chains = new Set(entries.map((e) => e.evolutionChainId));
  console.log(`Wrote ${entries.length} entries to ${outPath}`);
  console.log(`Distinct evolution chains: ${chains.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
