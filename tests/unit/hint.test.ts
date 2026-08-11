import {
  computeHint,
  gradeGuess,
  hasSameLineHint,
  type FusionAnswer,
} from "@/lib/game/hint";

// Real dex/evolution-chain ids from the seeded PokeAPI snapshot.
const CHARMANDER = { id: 4, evolutionChainId: 2 };
const CHARMELEON = { id: 5, evolutionChainId: 2 };
const CHARIZARD = { id: 6, evolutionChainId: 2 };
const SQUIRTLE = { id: 7, evolutionChainId: 3 };
const WARTORTLE = { id: 8, evolutionChainId: 3 };
const PIKACHU = { id: 25, evolutionChainId: 10 };
const EEVEE = { id: 133, evolutionChainId: 67 };
const UMBREON = { id: 197, evolutionChainId: 67 };
const VAPOREON = { id: 134, evolutionChainId: 67 };
const WURMPLE = { id: 265, evolutionChainId: 135 };
const CASCOON = { id: 268, evolutionChainId: 135 };
const DUSTOX = { id: 269, evolutionChainId: 135 };

const charizardAndSquirtle: FusionAnswer = {
  pokemonA: CHARIZARD,
  pokemonB: SQUIRTLE,
};

describe("computeHint", () => {
  it("marks either half of the fusion CORRECT", () => {
    expect(computeHint(CHARIZARD, charizardAndSquirtle)).toBe("CORRECT");
    expect(computeHint(SQUIRTLE, charizardAndSquirtle)).toBe("CORRECT");
  });

  it("marks a relative of either half SAME_LINE", () => {
    expect(computeHint(CHARMANDER, charizardAndSquirtle)).toBe("SAME_LINE");
    expect(computeHint(CHARMELEON, charizardAndSquirtle)).toBe("SAME_LINE");
    expect(computeHint(WARTORTLE, charizardAndSquirtle)).toBe("SAME_LINE");
  });

  it("marks an unrelated Pokemon WRONG", () => {
    expect(computeHint(PIKACHU, charizardAndSquirtle)).toBe("WRONG");
  });

  it("treats branching evolution families as one line", () => {
    // Eevee's split evolutions all share a chain, so any of them hints at
    // any other.
    const answer: FusionAnswer = { pokemonA: UMBREON, pokemonB: PIKACHU };
    expect(computeHint(EEVEE, answer)).toBe("SAME_LINE");
    expect(computeHint(VAPOREON, answer)).toBe("SAME_LINE");

    // Wurmple's Silcoon/Cascoon split behaves the same way.
    const wurmpleAnswer: FusionAnswer = { pokemonA: DUSTOX, pokemonB: PIKACHU };
    expect(computeHint(WURMPLE, wurmpleAnswer)).toBe("SAME_LINE");
    expect(computeHint(CASCOON, wurmpleAnswer)).toBe("SAME_LINE");
  });

  it("prefers CORRECT over SAME_LINE when both could apply", () => {
    // Guessing Charmander when the fusion is Charmander + Charizard: it is in
    // the same line as Charizard, but it is also literally correct.
    const sameLineFusion: FusionAnswer = {
      pokemonA: CHARMANDER,
      pokemonB: CHARIZARD,
    };
    expect(computeHint(CHARMANDER, sameLineFusion)).toBe("CORRECT");
  });
});

describe("gradeGuess", () => {
  it("wins regardless of which slot each Pokemon was typed into", () => {
    const inOrder = gradeGuess(CHARIZARD, SQUIRTLE, charizardAndSquirtle);
    const reversed = gradeGuess(SQUIRTLE, CHARIZARD, charizardAndSquirtle);

    expect(inOrder.isCorrect).toBe(true);
    expect(reversed.isCorrect).toBe(true);
    expect(reversed.hintA).toBe("CORRECT");
    expect(reversed.hintB).toBe("CORRECT");
  });

  it("does not win when only one half is right", () => {
    const graded = gradeGuess(CHARIZARD, PIKACHU, charizardAndSquirtle);

    expect(graded.isCorrect).toBe(false);
    expect(graded.hintA).toBe("CORRECT");
    expect(graded.hintB).toBe("WRONG");
  });

  it("does not win when the same correct Pokemon fills both slots", () => {
    const graded = gradeGuess(CHARIZARD, CHARIZARD, charizardAndSquirtle);

    expect(graded.hintA).toBe("CORRECT");
    expect(graded.hintB).toBe("CORRECT");
    expect(graded.isCorrect).toBe(false);
  });

  it("reports per-slot hints independently", () => {
    const graded = gradeGuess(CHARMANDER, PIKACHU, charizardAndSquirtle);

    expect(graded.hintA).toBe("SAME_LINE");
    expect(graded.hintB).toBe("WRONG");
    expect(hasSameLineHint(graded)).toBe(true);
  });

  it("does not flag a same-line notification for an all-wrong guess", () => {
    expect(
      hasSameLineHint(gradeGuess(PIKACHU, EEVEE, charizardAndSquirtle)),
    ).toBe(false);
  });
});
