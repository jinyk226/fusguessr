/**
 * @jest-environment node
 */

import sharp from "sharp";

import {
  countDistinctColors,
  DISPLAY_SIZE,
  PALETTE_SIZE,
  pixelateToSprite,
  snapChannelToRgb555,
} from "@/lib/image/pixelate";

jest.setTimeout(60_000);

/**
 * A smooth radial gradient is the worst case for this pipeline: thousands of
 * subtly different colours and no hard edges, which is roughly what a
 * generative model hands back.
 */
async function makeSmoothTestImage(size = 512): Promise<Buffer> {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g">
        <stop offset="0%" stop-color="#ff9a3c"/>
        <stop offset="60%" stop-color="#2a6ff5"/>
        <stop offset="100%" stop-color="#0b1030"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
    <circle cx="${size / 2}" cy="${size * 0.46}" r="${size * 0.24}" fill="#f7e04b" opacity="0.85"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("snapChannelToRgb555", () => {
  it("keeps the extremes intact", () => {
    expect(snapChannelToRgb555(0)).toBe(0);
    expect(snapChannelToRgb555(255)).toBe(255);
  });

  it("is idempotent - snapping an already-snapped value changes nothing", () => {
    for (let value = 0; value <= 255; value++) {
      const once = snapChannelToRgb555(value);
      expect(snapChannelToRgb555(once)).toBe(once);
    }
  });

  it("produces exactly the 32 values of a 5-bit channel", () => {
    const distinct = new Set<number>();
    for (let value = 0; value <= 255; value++) {
      distinct.add(snapChannelToRgb555(value));
    }
    expect(distinct.size).toBe(32);
  });

  it("clamps out-of-range input", () => {
    expect(snapChannelToRgb555(-20)).toBe(0);
    expect(snapChannelToRgb555(400)).toBe(255);
  });
});

describe("pixelateToSprite", () => {
  it("reduces a smooth image to a GBA-legal palette", async () => {
    const source = await makeSmoothTestImage();
    expect(await countDistinctColors(source)).toBeGreaterThan(PALETTE_SIZE);

    const output = await pixelateToSprite(source);

    // The whole point of the pipeline: 4bpp indexed colour.
    expect(await countDistinctColors(output)).toBeLessThanOrEqual(PALETTE_SIZE);
  });

  it("emits a square image at display size", async () => {
    const output = await pixelateToSprite(await makeSmoothTestImage());
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(DISPLAY_SIZE);
    expect(metadata.height).toBe(DISPLAY_SIZE);
    expect(metadata.format).toBe("png");
  });

  it("puts every colour on the RGB555 grid", async () => {
    const output = await pixelateToSprite(await makeSmoothTestImage());
    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let offGrid = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      for (const channel of [data[i], data[i + 1], data[i + 2]]) {
        if (snapChannelToRgb555(channel) !== channel) offGrid += 1;
      }
    }

    expect(offGrid).toBe(0);
  });

  it("produces hard pixel blocks rather than a smooth gradient", async () => {
    // Upscaling 64px to 512px means each sprite pixel becomes an 8x8 block of
    // identical colour. Interpolated resampling would break that.
    const output = await pixelateToSprite(await makeSmoothTestImage());
    const { data, info } = await sharp(output)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blockSize = DISPLAY_SIZE / 64;
    const pixelAt = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return `${data[offset]},${data[offset + 1]},${data[offset + 2]}`;
    };

    // Sample inside one block; every pixel in it must be the same colour.
    const originX = blockSize * 20;
    const originY = blockSize * 20;
    const expected = pixelAt(originX, originY);
    for (let dy = 0; dy < blockSize; dy++) {
      for (let dx = 0; dx < blockSize; dx++) {
        expect(pixelAt(originX + dx, originY + dy)).toBe(expected);
      }
    }
  });

  it("honours a custom palette size", async () => {
    const output = await pixelateToSprite(await makeSmoothTestImage(), {
      paletteSize: 4,
    });
    expect(await countDistinctColors(output)).toBeLessThanOrEqual(4);
  });
});
