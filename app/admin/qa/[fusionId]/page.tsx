import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/admin";
import { findAttempt } from "@/lib/game/attempt";
import { GameBoard } from "@/components/game/game-board";
import { toHistoryGuesses, toPokemonOptions } from "@/lib/game/view-models";

export const dynamic = "force-dynamic";

/**
 * Admin day-ahead QA play.
 *
 * Runs the exact same board the public gets, against a staged puzzle, so the
 * check is of the real experience rather than a special preview mode. The
 * resulting attempt is flagged isAdminPreview and excluded from every
 * aggregate statistic.
 */
export default async function AdminQaPage({
  params,
}: {
  params: Promise<{ fusionId: string }>;
}) {
  const { fusionId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/");

  const fusion = await prisma.fusion.findUnique({
    where: { id: fusionId },
    include: { pokemonA: true, pokemonB: true },
  });

  if (!fusion) notFound();

  if (fusion.status !== "SCHEDULED") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          This puzzle is {fusion.status.toLowerCase()}, so there is nothing to QA
          here.
        </p>
        <Link href="/admin" className="text-sm underline">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  const [attempt, pokemon] = await Promise.all([
    findAttempt(user.id, fusion.id),
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
        <h1 className="text-xl font-semibold">QA play</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Checking the puzzle staged for {fusion.scheduledForDate}.
        </p>
      </div>

      <GameBoard
        fusionId={fusion.id}
        imageUrl={fusion.imageUrl}
        focalX={fusion.focalX}
        focalY={fusion.focalY}
        date={fusion.scheduledForDate ?? ""}
        options={toPokemonOptions(pokemon)}
        initialGuesses={toHistoryGuesses(attempt?.guesses ?? [], pokemon)}
        initialStatus={status}
        initialAnswer={
          isComplete
            ? { a: fusion.pokemonA.name, b: fusion.pokemonB.name }
            : undefined
        }
        isPreview
      />

      <Link href={`/admin/bank/${fusion.id}`} className="text-sm underline">
        Back to this fusion&apos;s settings
      </Link>
    </div>
  );
}
