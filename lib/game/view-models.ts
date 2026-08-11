import type { Guess } from "@prisma/client";

import type { HistoryGuess } from "@/components/game/guess-history";
import type { PokemonOption } from "@/components/game/pokemon-combobox";
import type { HintValue } from "./hint";

/**
 * Shaping helpers between database rows and the props the client components
 * take. Kept in one place so pages don't each invent their own mapping.
 */

export interface PokemonLite {
  id: number;
  name: string;
  spriteUrl: string;
}

export function toPokemonOptions(pokemon: PokemonLite[]): PokemonOption[] {
  return pokemon.map(({ id, name, spriteUrl }) => ({ id, name, spriteUrl }));
}

/** Resolves the dex ids stored on each guess back into display names. */
export function toHistoryGuesses(
  guesses: Guess[],
  pokemon: Pick<PokemonLite, "id" | "name">[],
): HistoryGuess[] {
  const nameById = new Map(pokemon.map((p) => [p.id, p.name]));
  const nameOf = (id: number) => nameById.get(id) ?? `#${id}`;

  return guesses.map((guess) => ({
    guessIndex: guess.guessIndex,
    firstName: nameOf(guess.pokemonAId),
    secondName: nameOf(guess.pokemonBId),
    hintA: guess.hintA as HintValue,
    hintB: guess.hintB as HintValue,
  }));
}
