"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/admin";
import {
  GameOverError,
  InvalidGuessError,
  submitGuess,
} from "@/lib/game/attempt";
import { LAST_DEX_ID, FIRST_DEX_ID } from "@/lib/game/fusion-service";
import type { HintValue } from "@/lib/game/hint";

const guessSchema = z.object({
  fusionId: z.string().min(1),
  firstPickId: z.number().int().min(FIRST_DEX_ID).max(LAST_DEX_ID),
  secondPickId: z.number().int().min(FIRST_DEX_ID).max(LAST_DEX_ID),
});

export interface GuessActionResult {
  ok: boolean;
  error?: string;
  hintA?: HintValue;
  hintB?: HintValue;
  isCorrect?: boolean;
  status?: "IN_PROGRESS" | "WON" | "LOST";
  guessesUsed?: number;
  answer?: { a: string; b: string };
}

/**
 * Submits one guess against a puzzle.
 *
 * Whether this counts as a real play or an admin QA play is derived from the
 * puzzle's own status, never from a client-supplied flag - otherwise anyone
 * could mark their attempt as a preview to keep a loss off their record.
 */
export async function submitGuessAction(
  input: z.infer<typeof guessSchema>,
): Promise<GuessActionResult> {
  const parsed = guessSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That guess wasn't valid." };
  }

  let user;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Sign in to play." };
  }

  const fusion = await prisma.fusion.findUnique({
    where: { id: parsed.data.fusionId },
    select: { id: true, status: true },
  });

  if (!fusion) return { ok: false, error: "That puzzle doesn't exist." };

  let isAdminPreview: boolean;
  if (fusion.status === "LIVE") {
    isAdminPreview = false;
  } else if (fusion.status === "SCHEDULED") {
    if (user.role !== "ADMIN") {
      return { ok: false, error: "That puzzle isn't available yet." };
    }
    isAdminPreview = true;
  } else {
    return { ok: false, error: "That puzzle isn't playable." };
  }

  try {
    const result = await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: parsed.data.firstPickId,
      secondPickId: parsed.data.secondPickId,
      isAdminPreview,
    });

    revalidatePath("/");
    revalidatePath("/results");

    return {
      ok: true,
      hintA: result.graded.hintA,
      hintB: result.graded.hintB,
      isCorrect: result.graded.isCorrect,
      status: result.attempt.status,
      guessesUsed: result.attempt.guessesUsed,
      answer: result.answer
        ? { a: result.answer.pokemonA.name, b: result.answer.pokemonB.name }
        : undefined,
    };
  } catch (error) {
    if (error instanceof InvalidGuessError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof GameOverError) {
      return { ok: false, error: "This puzzle is already finished." };
    }
    throw error;
  }
}
