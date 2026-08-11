import { cn } from "@/lib/utils";
import type { HintValue } from "@/lib/game/hint";
import { MAX_GUESSES } from "@/lib/game/zoom";
import { displayName } from "./pokemon-combobox";

export interface HistoryGuess {
  guessIndex: number;
  firstName: string;
  secondName: string;
  hintA: HintValue;
  hintB: HintValue;
}

const HINT_STYLES: Record<HintValue, string> = {
  CORRECT: "bg-[var(--hint-correct)] text-white border-transparent",
  SAME_LINE: "bg-[var(--hint-same-line)] text-black border-transparent",
  WRONG: "bg-[var(--hint-wrong)] text-white border-transparent",
};

const HINT_LABEL: Record<HintValue, string> = {
  CORRECT: "correct",
  SAME_LINE: "same evolution line",
  WRONG: "not in this fusion",
};

function GuessCell({ name, hint }: { name: string; hint: HintValue }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm font-medium",
        HINT_STYLES[hint],
      )}
      title={HINT_LABEL[hint]}
    >
      <span className="sr-only">{HINT_LABEL[hint]}: </span>
      {displayName(name)}
    </div>
  );
}

export function GuessHistory({ guesses }: { guesses: HistoryGuess[] }) {
  const remaining = Math.max(0, MAX_GUESSES - guesses.length);

  return (
    <ol className="flex flex-col gap-2" aria-label="Your guesses">
      {guesses.map((guess) => (
        <li key={guess.guessIndex} className="grid grid-cols-2 gap-2">
          <GuessCell name={guess.firstName} hint={guess.hintA} />
          <GuessCell name={guess.secondName} hint={guess.hintB} />
        </li>
      ))}

      {Array.from({ length: remaining }, (_, index) => (
        <li key={`empty-${index}`} className="grid grid-cols-2 gap-2">
          <div className="h-[38px] rounded-md border border-dashed border-[var(--border)]" />
          <div className="h-[38px] rounded-md border border-dashed border-[var(--border)]" />
        </li>
      ))}
    </ol>
  );
}
