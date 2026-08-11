import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/admin";
import { findAttempt, getLivePuzzle } from "@/lib/game/attempt";
import { formatLaDateForDisplay } from "@/lib/time/la-date";
import { GameBoard } from "@/components/game/game-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toHistoryGuesses, toPokemonOptions } from "@/lib/game/view-models";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [user, puzzle] = await Promise.all([getCurrentUser(), getLivePuzzle()]);

  if (!puzzle) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h1 className="text-xl font-semibold">No puzzle yet</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            The first daily fusion hasn&apos;t gone live. Check back soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold">Today&apos;s fusion</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Two Pokemon were fused into one sprite. Sign in to guess which two -
            the image zooms out with every wrong answer.
          </p>
          <Button asChild>
            <Link href="/sign-in">Sign in to play</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const [attempt, pokemon] = await Promise.all([
    findAttempt(user.id, puzzle.id),
    prisma.pokemon.findMany({
      orderBy: { id: "asc" },
      select: { id: true, name: true, spriteUrl: true },
    }),
  ]);

  const status = attempt?.status ?? "IN_PROGRESS";
  const isComplete = status !== "IN_PROGRESS";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Today&apos;s fusion</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {formatLaDateForDisplay(puzzle.liveDate ?? "")}
        </p>
      </div>

      <GameBoard
        fusionId={puzzle.id}
        imageUrl={puzzle.imageUrl}
        focalX={puzzle.focalX}
        focalY={puzzle.focalY}
        date={puzzle.liveDate ?? ""}
        options={toPokemonOptions(pokemon)}
        initialGuesses={toHistoryGuesses(attempt?.guesses ?? [], pokemon)}
        initialStatus={status}
        initialAnswer={
          isComplete
            ? { a: puzzle.pokemonA.name, b: puzzle.pokemonB.name }
            : undefined
        }
      />
    </div>
  );
}
