import {
  canonicalPair,
  isSamePair,
} from "@/lib/game/canonical-pair";

describe("canonicalPair", () => {
  it("puts the lower dex id first regardless of argument order", () => {
    expect(canonicalPair(4, 7)).toEqual({ pokemonAId: 4, pokemonBId: 7 });
    expect(canonicalPair(7, 4)).toEqual({ pokemonAId: 4, pokemonBId: 7 });
  });

  it("produces an identical pair for both orderings", () => {
    // This is precisely what makes the database's @@unique([A, B]) constraint
    // catch (A,B) and (B,A) as the same fusion.
    expect(canonicalPair(386, 1)).toEqual(canonicalPair(1, 386));
  });

  it("rejects fusing a Pokemon with itself", () => {
    expect(() => canonicalPair(25, 25)).toThrow(/two different Pokemon/);
  });

  it("handles the dex range boundaries", () => {
    expect(canonicalPair(1, 386)).toEqual({ pokemonAId: 1, pokemonBId: 386 });
  });
});

describe("isSamePair", () => {
  it("matches pairs built from either ordering", () => {
    expect(isSamePair(canonicalPair(4, 7), canonicalPair(7, 4))).toBe(true);
  });

  it("distinguishes different pairs", () => {
    expect(isSamePair(canonicalPair(4, 7), canonicalPair(4, 8))).toBe(false);
  });
});
