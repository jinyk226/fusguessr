import {
  clampFocal,
  FOCAL_MAX,
  FOCAL_MIN,
  MAX_GUESSES,
  randomFocalPoint,
  scaleForDisplay,
  scaleForGuessesUsed,
  ZOOM_SCALES,
} from "@/lib/game/zoom";

describe("zoom curve", () => {
  it("has one scale per allowed guess", () => {
    expect(ZOOM_SCALES).toHaveLength(MAX_GUESSES);
  });

  it("starts fully zoomed in and ends at the cover baseline", () => {
    expect(ZOOM_SCALES[0]).toBeGreaterThan(1);
    expect(ZOOM_SCALES[ZOOM_SCALES.length - 1]).toBe(1.0);
  });

  it("zooms out monotonically", () => {
    for (let i = 1; i < ZOOM_SCALES.length; i++) {
      expect(ZOOM_SCALES[i]).toBeLessThan(ZOOM_SCALES[i - 1]);
    }
  });

  it("never drops below 1, which would expose empty space", () => {
    for (const scale of ZOOM_SCALES) {
      expect(scale).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("scaleForGuessesUsed", () => {
  it("maps each guess count to its scale", () => {
    ZOOM_SCALES.forEach((expected, guessesUsed) => {
      expect(scaleForGuessesUsed(guessesUsed)).toBe(expected);
    });
  });

  it("clamps past the final guess rather than returning undefined", () => {
    expect(scaleForGuessesUsed(MAX_GUESSES)).toBe(1.0);
    expect(scaleForGuessesUsed(999)).toBe(1.0);
  });

  it("clamps nonsense input to the most zoomed-in state", () => {
    expect(scaleForGuessesUsed(-3)).toBe(ZOOM_SCALES[0]);
    expect(scaleForGuessesUsed(Number.NaN)).toBe(ZOOM_SCALES[0]);
  });
});

describe("scaleForDisplay", () => {
  it("reveals the whole image once the game is over", () => {
    expect(scaleForDisplay(1, true)).toBe(1.0);
    expect(scaleForDisplay(0, true)).toBe(1.0);
  });

  it("follows the curve while the game is in progress", () => {
    expect(scaleForDisplay(1, false)).toBe(ZOOM_SCALES[1]);
  });
});

describe("focal points", () => {
  it("clamps to the guardrail range", () => {
    expect(clampFocal(0)).toBe(FOCAL_MIN);
    expect(clampFocal(100)).toBe(FOCAL_MAX);
    expect(clampFocal(50)).toBe(50);
  });

  it("falls back to centre for nonsense input", () => {
    expect(clampFocal(Number.NaN)).toBe(50);
  });

  it("only ever generates in-range random points", () => {
    for (let i = 0; i < 200; i++) {
      const { focalX, focalY } = randomFocalPoint();
      expect(focalX).toBeGreaterThanOrEqual(FOCAL_MIN);
      expect(focalX).toBeLessThanOrEqual(FOCAL_MAX);
      expect(focalY).toBeGreaterThanOrEqual(FOCAL_MIN);
      expect(focalY).toBeLessThanOrEqual(FOCAL_MAX);
    }
  });
});
