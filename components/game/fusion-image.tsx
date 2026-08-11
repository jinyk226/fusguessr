"use client";

import { cn } from "@/lib/utils";
import { clampFocal, scaleForDisplay } from "@/lib/game/zoom";

interface FusionImageProps {
  src: string;
  alt: string;
  focalX: number;
  focalY: number;
  guessesUsed: number;
  isComplete: boolean;
  className?: string;
}

/**
 * The daily puzzle artwork, zoomed to match how many guesses have been used.
 *
 * One stored image plus a focal point, scaled with a CSS transform - no
 * pre-cropped variants. The container is `overflow: hidden` and the image is
 * `object-fit: cover`, so scale 1.0 already fills it and any larger scale only
 * crops further in, never exposing empty space.
 *
 * Uses a plain <img> rather than next/image on purpose: next/image's fill mode
 * wraps the element in its own positioning, which fights with putting a
 * transform directly on it, and the optimisation it offers is moot for a
 * single already-optimised sprite.
 */
export function FusionImage({
  src,
  alt,
  focalX,
  focalY,
  guessesUsed,
  isComplete,
  className,
}: FusionImageProps) {
  const scale = scaleForDisplay(guessesUsed, isComplete);

  return (
    <div
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="pixelated absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: `${clampFocal(focalX)}% ${clampFocal(focalY)}%`,
        }}
      />
    </div>
  );
}
