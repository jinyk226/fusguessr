import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/admin";
import { buildShareText } from "@/lib/game/share";
import { guessToEmojiRow } from "@/lib/game/share";
import type { HintValue } from "@/lib/game/hint";
import {
  formatLaDateForDisplay,
  isValidLaDateString,
} from "@/lib/time/la-date";
import { MAX_GUESSES } from "@/lib/game/zoom";
import { Card, CardContent } from "@/components/ui/card";
import { CopyShareButton } from "@/components/game/copy-share-button";

export const dynamic = "force-dynamic";

/**
 * Per-day result: a shareable summary only.
 *
 * Deliberately shows no artwork and no Pokemon names, so the page can be
 * screenshotted or pasted anywhere without spoiling the puzzle for someone who
 * has not played it yet.
 */
export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidLaDateString(date)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const attempt = await prisma.attempt.findFirst({
    where: { userId: user.id, date, isAdminPreview: false },
    include: { guesses: { orderBy: { guessIndex: "asc" } } },
  });

  if (!attempt) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <h1 className="text-lg font-semibold">
            {formatLaDateForDisplay(date)}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            You didn&apos;t play this day.
          </p>
          <Link href="/results" className="mt-4 inline-block text-sm underline">
            Back to your stats
          </Link>
        </CardContent>
      </Card>
    );
  }

  const shareGuesses = attempt.guesses.map((guess) => ({
    hintA: guess.hintA as HintValue,
    hintB: guess.hintB as HintValue,
  }));

  const shareText = buildShareText({
    date,
    status: attempt.status,
    guesses: shareGuesses,
  });

  const score =
    attempt.status === "WON"
      ? `${attempt.guessesUsed}/${MAX_GUESSES}`
      : attempt.status === "LOST"
        ? `X/${MAX_GUESSES}`
        : "unfinished";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{formatLaDateForDisplay(date)}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          fusguessr {score}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6">
          <div
            className="flex flex-col gap-1 text-2xl leading-none"
            aria-label="Your result grid"
          >
            {shareGuesses.map((guess, index) => (
              <span key={index}>{guessToEmojiRow(guess)}</span>
            ))}
          </div>

          <CopyShareButton text={shareText} />

          <p className="text-center text-xs text-[var(--muted-foreground)]">
            Names and artwork are left out so you can share this without
            spoiling the puzzle.
          </p>
        </CardContent>
      </Card>

      <Link href="/results" className="text-sm underline">
        Back to your stats
      </Link>
    </div>
  );
}
