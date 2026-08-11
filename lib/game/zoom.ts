/**
 * Zoom curve for the daily puzzle image.
 *
 * The image is stored once and zoomed purely with a CSS transform against a
 * per-fusion focal point, rather than pre-rendering six cropped variants. The
 * container uses `object-fit: cover`, so scale 1.0 already fills it - every
 * scale >= 1 only crops further in and can never expose empty space.
 */

/** Guesses allowed per puzzle. Wordle-style. */
export const MAX_GUESSES = 6;

/**
 * Indexed by guesses used so far: index 0 is the untouched, most zoomed-in
 * state, and index 5 (the final guess) is fully zoomed out.
 */
export const ZOOM_SCALES = [3.0, 2.5, 2.0, 1.6, 1.3, 1.0] as const;

/** Focal points are clamped to keep the crop away from the image edges. */
export const FOCAL_MIN = 25;
export const FOCAL_MAX = 75;

/**
 * Scale for a given number of guesses used, clamped at both ends so an
 * out-of-range value can never produce an undefined transform.
 */
export function scaleForGuessesUsed(guessesUsed: number): number {
  if (!Number.isFinite(guessesUsed) || guessesUsed <= 0) {
    return ZOOM_SCALES[0];
  }
  const index = Math.min(Math.floor(guessesUsed), ZOOM_SCALES.length - 1);
  return ZOOM_SCALES[index];
}

/** Once the game is over the player always sees the whole image. */
export function scaleForDisplay(
  guessesUsed: number,
  isComplete: boolean,
): number {
  return isComplete ? 1.0 : scaleForGuessesUsed(guessesUsed);
}

export function clampFocal(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(FOCAL_MAX, Math.max(FOCAL_MIN, value));
}

/** Picks a random focal point inside the guardrail range. */
export function randomFocalPoint(): { focalX: number; focalY: number } {
  const pick = () =>
    Math.round((FOCAL_MIN + Math.random() * (FOCAL_MAX - FOCAL_MIN)) * 10) / 10;
  return { focalX: pick(), focalY: pick() };
}
