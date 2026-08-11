import "server-only";

import type { Attempt, Fusion, Guess, Pokemon } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { gradeGuess, type GradedGuess } from "./hint";
import { MAX_GUESSES } from "./zoom";

/**
 * Play mechanics: starting an attempt and submitting guesses.
 *
 * Two shapes of play share this code path - the public daily puzzle and the
 * admin's day-ahead QA run. They differ only by the isAdminPreview flag, which
 * keeps QA plays out of every aggregate statistic.
 */

export type FusionWithPokemon = Fusion & {
  pokemonA: Pokemon;
  pokemonB: Pokemon;
};

export type AttemptWithGuesses = Attempt & { guesses: Guess[] };

export class GameOverError extends Error {
  constructor() {
    super("This puzzle is already finished");
    this.name = "GameOverError";
  }
}

export class InvalidGuessError extends Error {}

/** Today's public puzzle, or null before the first rollover has ever run. */
export async function getLivePuzzle(): Promise<FusionWithPokemon | null> {
  return prisma.fusion.findFirst({
    where: { status: "LIVE" },
    include: { pokemonA: true, pokemonB: true },
  });
}

/** The next staged puzzle - what the admin QA-plays a day ahead of everyone. */
export async function getScheduledPuzzle(
  date?: string,
): Promise<FusionWithPokemon | null> {
  return prisma.fusion.findFirst({
    where: {
      status: "SCHEDULED",
      ...(date ? { scheduledForDate: date } : {}),
    },
    orderBy: { scheduledForDate: "asc" },
    include: { pokemonA: true, pokemonB: true },
  });
}

/** Every date the admin has staged, for the dashboard QA calendar. */
export async function listScheduledDates(): Promise<
  { date: string; fusionId: string }[]
> {
  const rows = await prisma.fusion.findMany({
    where: { status: "SCHEDULED", scheduledForDate: { not: null } },
    orderBy: { scheduledForDate: "asc" },
    select: { id: true, scheduledForDate: true },
  });

  return rows.map((row) => ({
    date: row.scheduledForDate as string,
    fusionId: row.id,
  }));
}

/**
 * The calendar date an attempt belongs to.
 *
 * Taken from the puzzle rather than the clock, so an attempt started at 2am -
 * before the 4am rollover, while yesterday's puzzle is still live - is filed
 * under the puzzle's own date instead of the wall-clock date.
 */
export function attemptDateForFusion(fusion: Fusion): string {
  const date = fusion.liveDate ?? fusion.scheduledForDate;
  if (!date) {
    throw new Error(
      `Fusion ${fusion.id} has no live or scheduled date, so it cannot be played`,
    );
  }
  return date;
}

export async function getOrCreateAttempt(
  userId: string,
  fusion: Fusion,
  isAdminPreview: boolean,
): Promise<AttemptWithGuesses> {
  const existing = await prisma.attempt.findUnique({
    where: { userId_fusionId: { userId, fusionId: fusion.id } },
    include: { guesses: { orderBy: { guessIndex: "asc" } } },
  });

  if (existing) return existing;

  return prisma.attempt.create({
    data: {
      userId,
      fusionId: fusion.id,
      date: attemptDateForFusion(fusion),
      isAdminPreview,
    },
    include: { guesses: true },
  });
}

/** Read-only lookup: does not start an attempt just by looking. */
export async function findAttempt(
  userId: string,
  fusionId: string,
): Promise<AttemptWithGuesses | null> {
  return prisma.attempt.findUnique({
    where: { userId_fusionId: { userId, fusionId } },
    include: { guesses: { orderBy: { guessIndex: "asc" } } },
  });
}

export interface SubmitGuessInput {
  userId: string;
  fusionId: string;
  firstPickId: number;
  secondPickId: number;
  isAdminPreview?: boolean;
}

export interface SubmitGuessResult {
  graded: GradedGuess;
  attempt: AttemptWithGuesses;
  /** Revealed only once the game is over, win or lose. */
  answer?: { pokemonA: Pokemon; pokemonB: Pokemon };
}

export async function submitGuess(
  input: SubmitGuessInput,
): Promise<SubmitGuessResult> {
  const fusion = await prisma.fusion.findUniqueOrThrow({
    where: { id: input.fusionId },
    include: { pokemonA: true, pokemonB: true },
  });

  if (input.firstPickId === input.secondPickId) {
    throw new InvalidGuessError("Pick two different Pokemon");
  }

  const [firstPick, secondPick] = await Promise.all([
    prisma.pokemon.findUnique({ where: { id: input.firstPickId } }),
    prisma.pokemon.findUnique({ where: { id: input.secondPickId } }),
  ]);

  if (!firstPick || !secondPick) {
    throw new InvalidGuessError("That is not a Pokemon in this game's dex range");
  }

  const attempt = await getOrCreateAttempt(
    input.userId,
    fusion,
    input.isAdminPreview ?? false,
  );

  if (attempt.status !== "IN_PROGRESS" || attempt.guessesUsed >= MAX_GUESSES) {
    throw new GameOverError();
  }

  const graded = gradeGuess(firstPick, secondPick, {
    pokemonA: fusion.pokemonA,
    pokemonB: fusion.pokemonB,
  });

  const guessIndex = attempt.guessesUsed + 1;
  const isFinalGuess = guessIndex >= MAX_GUESSES;
  const nextStatus = graded.isCorrect
    ? "WON"
    : isFinalGuess
      ? "LOST"
      : "IN_PROGRESS";

  const updated = await prisma.$transaction(async (tx) => {
    await tx.guess.create({
      data: {
        attemptId: attempt.id,
        guessIndex,
        pokemonAId: firstPick.id,
        pokemonBId: secondPick.id,
        hintA: graded.hintA,
        hintB: graded.hintB,
        isCorrect: graded.isCorrect,
      },
    });

    return tx.attempt.update({
      where: { id: attempt.id },
      data: {
        guessesUsed: guessIndex,
        status: nextStatus,
        completedAt: nextStatus === "IN_PROGRESS" ? null : new Date(),
      },
      include: { guesses: { orderBy: { guessIndex: "asc" } } },
    });
  });

  return {
    graded,
    attempt: updated,
    answer:
      nextStatus === "IN_PROGRESS"
        ? undefined
        : { pokemonA: fusion.pokemonA, pokemonB: fusion.pokemonB },
  };
}
