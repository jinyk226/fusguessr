/**
 * Wordle-style shareable summary.
 *
 * This is what the per-day result page shows: the shape of how someone got
 * there, with no Pokemon names and no artwork, so pasting it somewhere cannot
 * spoil the puzzle for anyone who has not played yet.
 *
 * Pure and dependency-free, so the exact output is pinned by unit tests.
 */

import type { HintValue } from "./hint";
import { MAX_GUESSES } from "./zoom";

export const HINT_EMOJI: Record<HintValue, string> = {
  CORRECT: "\u{1F7E9}", // green square
  SAME_LINE: "\u{1F7E8}", // yellow square
  WRONG: "\u{2B1B}", // black square
};

export interface ShareableGuess {
  hintA: HintValue;
  hintB: HintValue;
}

export interface BuildShareTextInput {
  date: string;
  status: "WON" | "LOST" | "IN_PROGRESS";
  guesses: ShareableGuess[];
}

/** Renders one guess as its two hint squares. */
export function guessToEmojiRow(guess: ShareableGuess): string {
  return `${HINT_EMOJI[guess.hintA]}${HINT_EMOJI[guess.hintB]}`;
}

/**
 * Builds the full share block, e.g.
 *
 *   fusguessr 2026-08-11 3/6
 *   ⬛⬛
 *   🟨⬛
 *   🟩🟩
 */
export function buildShareText({
  date,
  status,
  guesses,
}: BuildShareTextInput): string {
  const score =
    status === "WON"
      ? `${guesses.length}/${MAX_GUESSES}`
      : status === "LOST"
        ? `X/${MAX_GUESSES}`
        : `-/${MAX_GUESSES}`;

  return [`fusguessr ${date} ${score}`, ...guesses.map(guessToEmojiRow)].join(
    "\n",
  );
}
