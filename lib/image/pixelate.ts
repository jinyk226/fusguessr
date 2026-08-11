import "server-only";

import sharp from "sharp";
import * as iq from "image-q";

/**
 * Turns a generative-model image into something that reads as a real
 * Game Boy Advance sprite.
 *
 * Diffusion-class models (Imagen included) do not reliably produce genuine
 * pixel art from prompting alone - they produce smooth, anti-aliased art that
 * merely resembles it. So the prompt only has to deliver a clean, centred,
 * simply-composed subject; this deterministic pipeline is what actually
 * guarantees the sprite look.
 *
 * The target is the real Generation III sprite format: 64x64 pixels, 4bpp
 * indexed colour (a 16-entry palette), with colours drawn from the GBA's
 * native 15-bit RGB555 space.
 *
 * Note that each Gen III sprite carried its *own* 16-colour palette rather
 * than sharing one global palette, so this quantises per image and then snaps
 * the resulting palette to the RGB555 grid. A single fixed palette across
 * every fusion would be less faithful and would tint every puzzle identically.
 */

/** Native Gen III sprite resolution. */
export const SPRITE_SIZE = 64;

/** Colours per sprite palette: 15 visible plus one transparency slot. */
export const PALETTE_SIZE = 16;

/** Display size. A whole multiple of SPRITE_SIZE keeps pixels square. */
export const DISPLAY_SIZE = 512;

export interface PixelateOptions {
  spriteSize?: number;
  paletteSize?: number;
  displaySize?: number;
}

/**
 * Snaps an 8-bit channel to the GBA's 5-bit colour space.
 *
 * Keeps the top 5 bits and replicates them into the low 3, so the value stays
 * spread across the full 0-255 range instead of darkening (0xFF stays 0xFF
 * rather than becoming 0xF8).
 */
export function snapChannelToRgb555(value: number): number {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  const top5 = clamped & 0xf8;
  return top5 | (top5 >> 5);
}

/**
 * Applies the RGB555 grid to every pixel of an RGBA buffer, in place.
 *
 * Done after quantisation rather than by mutating the palette: buildPalette
 * bakes its colours into internal lookup structures, so editing the palette's
 * points afterwards has no effect on applyPalette's output. Snapping is
 * many-to-one, so it can only merge colours - the palette-size guarantee
 * established by quantisation still holds.
 */
function snapBufferToRgb555(buffer: Buffer): void {
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = snapChannelToRgb555(buffer[i]);
    buffer[i + 1] = snapChannelToRgb555(buffer[i + 1]);
    buffer[i + 2] = snapChannelToRgb555(buffer[i + 2]);
    // Alpha is left alone: it is a transparency mask, not a colour channel.
  }
}

/**
 * Runs the full downscale -> quantise -> snap -> upscale pipeline.
 *
 * Every resize uses nearest-neighbour: any smooth interpolation would
 * reintroduce exactly the anti-aliased blur this exists to remove.
 */
export async function pixelateToSprite(
  input: Buffer,
  options: PixelateOptions = {},
): Promise<Buffer> {
  const spriteSize = options.spriteSize ?? SPRITE_SIZE;
  const paletteSize = options.paletteSize ?? PALETTE_SIZE;
  const displaySize = options.displaySize ?? DISPLAY_SIZE;

  // 1. Downscale to sprite resolution. `kernel: nearest` keeps hard edges;
  //    `fit: cover` guarantees a square without letterboxing.
  const small = await sharp(input)
    .resize(spriteSize, spriteSize, {
      kernel: sharp.kernel.nearest,
      fit: "cover",
      position: "centre",
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = small;

  // 2. Reduce to a 16-colour palette.
  const points = iq.utils.PointContainer.fromUint8Array(
    new Uint8Array(data),
    info.width,
    info.height,
  );

  const palette = await iq.buildPalette([points], {
    colorDistanceFormula: "euclidean",
    paletteQuantization: "wuquant",
    colors: paletteSize,
  });

  // 3. Map pixels onto that palette. "nearest" means no dithering: real GBA
  //    sprites used clean colour bands, not dither patterns.
  const quantized = await iq.applyPalette(points, palette, {
    colorDistanceFormula: "euclidean",
    imageQuantization: "nearest",
  });

  const quantizedBuffer = Buffer.from(quantized.toUint8Array());

  // 4. Force every colour onto the GBA's 15-bit colour grid.
  snapBufferToRgb555(quantizedBuffer);

  // 5. Scale back up with hard pixel edges intact.
  return sharp(quantizedBuffer, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(displaySize, displaySize, {
      kernel: sharp.kernel.nearest,
      fit: "fill",
    })
    .png()
    .toBuffer();
}

/** Counts distinct colours in a PNG. Used by tests to verify quantisation. */
export async function countDistinctColors(image: Buffer): Promise<number> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += info.channels) {
    seen.add(
      (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3],
    );
  }
  return seen.size;
}
