/**
 * Guess grading.
 *
 * Two rules matter here and both are order-independent by construction:
 *
 *  - A guess is CORRECT if the guessed Pokemon is *either* half of the fusion.
 *    Which input box the player typed it into is irrelevant.
 *  - A guess is SAME_LINE if it shares an evolution chain with either half -
 *    e.g. guessing Charmeleon when the answer involves Charizard. This is the
 *    "so close" nudge the UI surfaces as a toast.
 *
 * The string literals match the `GuessHint` enum in schema.prisma. They are
 * declared locally rather than imported from @prisma/client so this module
 * stays free of database dependencies and trivially unit-testable.
 */

export type HintValue = "CORRECT" | "SAME_LINE" | "WRONG";

/** The minimum a Pokemon needs to expose to be graded. */
export interface GradeablePokemon {
  id: number;
  evolutionChainId: number;
}

export interface FusionAnswer {
  pokemonA: GradeablePokemon;
  pokemonB: GradeablePokemon;
}

export interface GradedGuess {
  hintA: HintValue;
  hintB: HintValue;
  isCorrect: boolean;
}

/** Grades a single guessed Pokemon against both halves of the fusion. */
export function computeHint(
  pick: GradeablePokemon,
  answer: FusionAnswer,
): HintValue {
  const { pokemonA, pokemonB } = answer;

  if (pick.id === pokemonA.id || pick.id === pokemonB.id) {
    return "CORRECT";
  }

  if (
    pick.evolutionChainId === pokemonA.evolutionChainId ||
    pick.evolutionChainId === pokemonB.evolutionChainId
  ) {
    return "SAME_LINE";
  }

  return "WRONG";
}

/**
 * Grades a full two-Pokemon guess.
 *
 * `isCorrect` requires the guess to cover *both* halves, so guessing the same
 * correct Pokemon in both slots scores two CORRECT hints but does not win -
 * the player still has to name the other half.
 */
export function gradeGuess(
  firstPick: GradeablePokemon,
  secondPick: GradeablePokemon,
  answer: FusionAnswer,
): GradedGuess {
  const answerIds = new Set([answer.pokemonA.id, answer.pokemonB.id]);

  return {
    hintA: computeHint(firstPick, answer),
    hintB: computeHint(secondPick, answer),
    isCorrect:
      firstPick.id !== secondPick.id &&
      answerIds.has(firstPick.id) &&
      answerIds.has(secondPick.id),
  };
}

/** True when a graded guess deserves the "same evolution line" notification. */
export function hasSameLineHint(graded: GradedGuess): boolean {
  return graded.hintA === "SAME_LINE" || graded.hintB === "SAME_LINE";
}
