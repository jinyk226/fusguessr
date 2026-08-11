/**
 * Wordle-style player statistics.
 *
 * Deliberately pure: it takes an already-fetched list of attempts rather than
 * touching the database, so the streak arithmetic (the fiddly part) is
 * directly unit-testable without a Postgres fixture. The database wrapper
 * lives in lib/game/stats-queries.ts.
 */

import { MAX_GUESSES } from "./zoom";
import { addDaysToLaDate, type LaDateString } from "@/lib/time/la-date";

export interface StatsAttempt {
  date: LaDateString;
  status: "IN_PROGRESS" | "WON" | "LOST";
  guessesUsed: number;
}

export interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
  winPercentage: number;
  currentStreak: number;
  maxStreak: number;
  /** Index 0 holds "solved in 1 guess", through index 5 for 6 guesses. */
  guessDistribution: number[];
}

export const EMPTY_STATS: PlayerStats = {
  played: 0,
  wins: 0,
  losses: 0,
  winPercentage: 0,
  currentStreak: 0,
  maxStreak: 0,
  guessDistribution: Array.from({ length: MAX_GUESSES }, () => 0),
};

/**
 * A streak survives only over consecutive calendar days that were won. A loss
 * breaks it, and so does a day that was never played.
 *
 * `today` matters for the current streak: a player who has not opened today's
 * puzzle yet should still see the streak they carried in with, so an absent or
 * unfinished attempt for today is skipped rather than treated as a break.
 */
export function computeStats(
  attempts: StatsAttempt[],
  today: LaDateString,
): PlayerStats {
  const completed = attempts.filter((a) => a.status !== "IN_PROGRESS");

  if (completed.length === 0) {
    return { ...EMPTY_STATS, guessDistribution: [...EMPTY_STATS.guessDistribution] };
  }

  const wins = completed.filter((a) => a.status === "WON").length;
  const played = completed.length;

  const guessDistribution = Array.from({ length: MAX_GUESSES }, () => 0);
  for (const attempt of completed) {
    if (attempt.status !== "WON") continue;
    const bucket = attempt.guessesUsed - 1;
    if (bucket >= 0 && bucket < MAX_GUESSES) {
      guessDistribution[bucket] += 1;
    }
  }

  const statusByDate = new Map<LaDateString, StatsAttempt["status"]>();
  for (const attempt of completed) {
    statusByDate.set(attempt.date, attempt.status);
  }

  return {
    played,
    wins,
    losses: played - wins,
    winPercentage: Math.round((wins / played) * 100),
    currentStreak: computeCurrentStreak(statusByDate, today),
    maxStreak: computeMaxStreak(statusByDate),
    guessDistribution,
  };
}

function computeCurrentStreak(
  statusByDate: Map<LaDateString, StatsAttempt["status"]>,
  today: LaDateString,
): number {
  // Today only breaks a streak if it was actually lost; not having played yet
  // is not a loss.
  let cursor = statusByDate.get(today) ? today : addDaysToLaDate(today, -1);

  let streak = 0;
  while (statusByDate.get(cursor) === "WON") {
    streak += 1;
    cursor = addDaysToLaDate(cursor, -1);
  }
  return streak;
}

function computeMaxStreak(
  statusByDate: Map<LaDateString, StatsAttempt["status"]>,
): number {
  const wonDates = [...statusByDate.entries()]
    .filter(([, status]) => status === "WON")
    .map(([date]) => date)
    .sort();

  let best = 0;
  let run = 0;
  let previous: LaDateString | null = null;

  for (const date of wonDates) {
    run = previous !== null && addDaysToLaDate(previous, 1) === date ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }

  return best;
}
