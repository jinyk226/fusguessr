"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FusionImage } from "./fusion-image";
import { GuessHistory, type HistoryGuess } from "./guess-history";
import {
  PokemonCombobox,
  DisplayName,
  type PokemonOption,
} from "./pokemon-combobox";
import { submitGuessAction } from "@/app/actions/game";
import { MAX_GUESSES } from "@/lib/game/zoom";
import { buildShareText } from "@/lib/game/share";

export interface GameBoardProps {
  fusionId: string;
  imageUrl: string;
  focalX: number;
  focalY: number;
  date: string;
  options: PokemonOption[];
  initialGuesses: HistoryGuess[];
  initialStatus: "IN_PROGRESS" | "WON" | "LOST";
  /** Revealed only once the puzzle is finished. */
  initialAnswer?: { a: string; b: string };
  isPreview?: boolean;
}

export function GameBoard({
  fusionId,
  imageUrl,
  focalX,
  focalY,
  date,
  options,
  initialGuesses,
  initialStatus,
  initialAnswer,
  isPreview = false,
}: GameBoardProps) {
  const [guesses, setGuesses] = React.useState(initialGuesses);
  const [status, setStatus] = React.useState(initialStatus);
  const [answer, setAnswer] = React.useState(initialAnswer);
  const [firstPick, setFirstPick] = React.useState<number | null>(null);
  const [secondPick, setSecondPick] = React.useState<number | null>(null);
  const [pending, startTransition] = React.useTransition();

  const isComplete = status !== "IN_PROGRESS";
  const canSubmit =
    !isComplete &&
    !pending &&
    firstPick !== null &&
    secondPick !== null &&
    firstPick !== secondPick;

  function handleSubmit() {
    if (firstPick === null || secondPick === null) return;

    startTransition(async () => {
      const result = await submitGuessAction({
        fusionId,
        firstPickId: firstPick,
        secondPickId: secondPick,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }

      const nameOf = (id: number) =>
        options.find((option) => option.id === id)?.name ?? String(id);

      setGuesses((previous) => [
        ...previous,
        {
          guessIndex: previous.length + 1,
          firstName: nameOf(firstPick),
          secondName: nameOf(secondPick),
          hintA: result.hintA!,
          hintB: result.hintB!,
        },
      ]);
      setStatus(result.status ?? "IN_PROGRESS");
      setAnswer(result.answer);
      setFirstPick(null);
      setSecondPick(null);

      // The "so close" nudge: one half of the guess is in the right family.
      const sameLine =
        result.hintA === "SAME_LINE" || result.hintB === "SAME_LINE";

      if (result.isCorrect) {
        toast.success("Got it! Both halves correct.");
      } else if (sameLine) {
        toast("Same evolution line - but not the right Pokemon.", {
          description: "You're close. Try another stage of that family.",
        });
      } else if (result.status === "LOST") {
        toast.error("Out of guesses.");
      }
    });
  }

  async function handleShare() {
    const text = buildShareText({
      date,
      status: status as "WON" | "LOST",
      guesses: guesses.map((guess) => ({
        hintA: guess.hintA,
        hintB: guess.hintB,
      })),
    });

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Result copied to clipboard.");
    } catch {
      toast.error("Couldn't copy - your browser blocked clipboard access.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {isPreview && (
        <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
          <strong>QA preview.</strong> This puzzle goes live on {date}. Your
          guesses here are excluded from public statistics.
        </p>
      )}

      <FusionImage
        src={imageUrl}
        alt={
          isComplete
            ? "The full fusion artwork"
            : "The daily fusion, zoomed in. It zooms out with every guess."
        }
        focalX={focalX}
        focalY={focalY}
        guessesUsed={guesses.length}
        isComplete={isComplete}
      />

      {!isComplete && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <PokemonCombobox
              label="First Pokemon"
              options={options}
              value={firstPick}
              onChange={setFirstPick}
              placeholder="First Pokemon"
              disabled={pending}
            />
            <PokemonCombobox
              label="Second Pokemon"
              options={options}
              value={secondPick}
              onChange={setSecondPick}
              placeholder="Second Pokemon"
              disabled={pending}
            />
          </div>

          <Button onClick={handleSubmit} disabled={!canSubmit} size="lg">
            {pending
              ? "Checking..."
              : `Guess (${MAX_GUESSES - guesses.length} left)`}
          </Button>

          <p className="text-center text-xs text-[var(--muted-foreground)]">
            Order doesn&apos;t matter - either Pokemon can go in either box.
          </p>
        </div>
      )}

      {isComplete && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4 text-center">
          <p className="text-lg font-semibold">
            {status === "WON" ? "Solved it!" : "Out of guesses."}
          </p>
          {answer && (
            <p className="text-sm text-[var(--muted-foreground)]">
              It was <strong>{<DisplayName name={answer.a} />}</strong> fused with{" "}
              <strong>{<DisplayName name={answer.b} />}</strong>.
            </p>
          )}
          <Button variant="outline" onClick={handleShare}>
            Copy result
          </Button>
        </div>
      )}

      <GuessHistory guesses={guesses} />
    </div>
  );
}
