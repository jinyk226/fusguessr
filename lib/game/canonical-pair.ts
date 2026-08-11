/**
 * Canonical ordering for Pokemon pairs.
 *
 * A fusion of (Charmander, Squirtle) and one of (Squirtle, Charmander) are the
 * same fusion. The database enforces "a pair is never fused twice" with
 * `@@unique([pokemonAId, pokemonBId])`, which only actually holds if every
 * write site stores the pair in one consistent order. That ordering lives
 * here, and nowhere else - reimplementing it inline is how the guarantee
 * silently breaks.
 */

export interface CanonicalPair {
  pokemonAId: number;
  pokemonBId: number;
}

/** Orders a pair so the lower dex id is always A. */
export function canonicalPair(first: number, second: number): CanonicalPair {
  if (first === second) {
    throw new Error(
      `A fusion needs two different Pokemon (both were #${first})`,
    );
  }
  return first < second
    ? { pokemonAId: first, pokemonBId: second }
    : { pokemonAId: second, pokemonBId: first };
}

/** True when both pairs describe the same unordered fusion. */
export function isSamePair(a: CanonicalPair, b: CanonicalPair): boolean {
  return a.pokemonAId === b.pokemonAId && a.pokemonBId === b.pokemonBId;
}
