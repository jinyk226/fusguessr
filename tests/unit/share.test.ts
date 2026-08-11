import { buildShareText, guessToEmojiRow, HINT_EMOJI } from "@/lib/game/share";

const GREEN = HINT_EMOJI.CORRECT;
const YELLOW = HINT_EMOJI.SAME_LINE;
const BLACK = HINT_EMOJI.WRONG;

describe("guessToEmojiRow", () => {
  it("renders both slots in order", () => {
    expect(guessToEmojiRow({ hintA: "CORRECT", hintB: "WRONG" })).toBe(
      `${GREEN}${BLACK}`,
    );
    expect(guessToEmojiRow({ hintA: "SAME_LINE", hintB: "SAME_LINE" })).toBe(
      `${YELLOW}${YELLOW}`,
    );
  });
});

describe("buildShareText", () => {
  it("scores a win by the number of guesses taken", () => {
    const text = buildShareText({
      date: "2026-08-11",
      status: "WON",
      guesses: [
        { hintA: "WRONG", hintB: "WRONG" },
        { hintA: "SAME_LINE", hintB: "WRONG" },
        { hintA: "CORRECT", hintB: "CORRECT" },
      ],
    });

    expect(text).toBe(
      [
        "fusguessr 2026-08-11 3/6",
        `${BLACK}${BLACK}`,
        `${YELLOW}${BLACK}`,
        `${GREEN}${GREEN}`,
      ].join("\n"),
    );
  });

  it("scores a loss as X/6", () => {
    const text = buildShareText({
      date: "2026-08-11",
      status: "LOST",
      guesses: Array.from({ length: 6 }, () => ({
        hintA: "WRONG" as const,
        hintB: "WRONG" as const,
      })),
    });

    expect(text.split("\n")[0]).toBe("fusguessr 2026-08-11 X/6");
    expect(text.split("\n")).toHaveLength(7);
  });

  it("contains nothing but the header and hint squares", () => {
    // The whole point: this can be pasted anywhere without spoiling the answer,
    // so no row may carry anything other than emoji.
    const text = buildShareText({
      date: "2026-08-11",
      status: "WON",
      guesses: [
        { hintA: "SAME_LINE", hintB: "WRONG" },
        { hintA: "CORRECT", hintB: "CORRECT" },
      ],
    });

    const [header, ...rows] = text.split("\n");
    expect(header).toBe("fusguessr 2026-08-11 2/6");

    for (const row of rows) {
      expect(row).toMatch(
        new RegExp(`^(${GREEN}|${YELLOW}|${BLACK}){2}$`, "u"),
      );
    }
  });

  it("handles an unfinished attempt", () => {
    const text = buildShareText({
      date: "2026-08-11",
      status: "IN_PROGRESS",
      guesses: [{ hintA: "WRONG", hintB: "WRONG" }],
    });

    expect(text.split("\n")[0]).toBe("fusguessr 2026-08-11 -/6");
  });
});
