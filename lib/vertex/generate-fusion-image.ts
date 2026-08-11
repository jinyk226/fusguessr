import "server-only";

import sharp from "sharp";

/**
 * Vertex AI (Imagen) fusion image generation.
 *
 * The model only has to deliver a clean, centred, simply-composed subject -
 * lib/image/pixelate.ts is what actually enforces the Gen III sprite look. So
 * the prompt pushes hard on composition (flat background, front-facing, bold
 * shapes) rather than begging the model for "pixel art", which it cannot
 * reliably produce anyway.
 *
 * Every call funnels through generateRawImage(), which is the single seam the
 * test suite mocks. Nothing else in the app talks to Vertex.
 */

/**
 * Snapshotted onto each Fusion row so a later prompt change never
 * retroactively rewrites the history of what produced an existing image.
 */
export const BASE_PROMPT_TEMPLATE = [
  "A single original creature that fuses {{A}} and {{B}} into one coherent monster.",
  "Front-facing, centred, full body, neutral standing pose.",
  "Flat plain background, no text, no border, no drop shadow, no frame.",
  "Bold simple shapes, strong readable silhouette, saturated colours, minimal fine detail.",
  "Retro Game Boy Advance monster sprite illustration.",
].join(" ");

export interface BuildPromptInput {
  pokemonAName: string;
  pokemonBName: string;
  basePrompt?: string;
  extraPrompt?: string | null;
}

/** Pure prompt assembly - unit tested without touching the network. */
export function buildFusionPrompt({
  pokemonAName,
  pokemonBName,
  basePrompt = BASE_PROMPT_TEMPLATE,
  extraPrompt,
}: BuildPromptInput): string {
  const base = basePrompt
    .replaceAll("{{A}}", pokemonAName)
    .replaceAll("{{B}}", pokemonBName);

  const extra = extraPrompt?.trim();
  return extra ? `${base} ${extra}` : base;
}

/** Set FUSGUESSR_FAKE_IMAGE_PIPELINE=1 to develop without spending Vertex quota. */
export function isFakeImagePipeline(): boolean {
  return process.env.FUSGUESSR_FAKE_IMAGE_PIPELINE === "1";
}

/**
 * Deterministic local stand-in for a generated image.
 *
 * Produces a different-but-stable image per prompt so the admin flow, the
 * pixelation pipeline and the zoom mechanic can all be exercised end to end
 * with no GCP project attached.
 */
async function generatePlaceholderImage(prompt: string): Promise<Buffer> {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }

  const hueA = hash % 360;
  const hueB = (hueA + 140) % 360;
  const hueC = (hueA + 40) % 360;

  const svg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="45%">
        <stop offset="0%" stop-color="hsl(${hueC},70%,62%)"/>
        <stop offset="100%" stop-color="hsl(${hueA},55%,18%)"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <ellipse cx="512" cy="620" rx="250" ry="230" fill="hsl(${hueB},65%,55%)"/>
    <circle cx="512" cy="400" r="190" fill="hsl(${hueA},70%,60%)"/>
    <circle cx="440" cy="370" r="34" fill="#ffffff"/>
    <circle cx="584" cy="370" r="34" fill="#ffffff"/>
    <circle cx="446" cy="376" r="16" fill="#101020"/>
    <circle cx="590" cy="376" r="16" fill="#101020"/>
    <path d="M430 700 Q512 780 594 700" stroke="hsl(${hueC},70%,35%)" stroke-width="22" fill="none"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The single seam between this app and Vertex AI. Mock this in tests; never
 * call the Vertex SDK from anywhere else.
 */
export async function generateRawImage(prompt: string): Promise<Buffer> {
  if (isFakeImagePipeline()) {
    return generatePlaceholderImage(prompt);
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.VERTEX_LOCATION ?? "us-central1";

  if (!project) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT is not set. Set it, or set " +
        "FUSGUESSR_FAKE_IMAGE_PIPELINE=1 to develop without Vertex AI.",
    );
  }

  // Imported lazily so the SDK (and its credential lookup) never loads in the
  // fake path or during unit tests.
  const { GoogleGenAI } = await import("@google/genai");

  // No API key: on Cloud Run this authenticates via the attached service
  // account through Application Default Credentials.
  const ai = new GoogleGenAI({ vertexai: true, project, location });

  const response = await ai.models.generateImages({
    model: process.env.VERTEX_IMAGE_MODEL ?? "imagen-3.0-generate-002",
    prompt,
    config: { numberOfImages: 1, aspectRatio: "1:1" },
  });

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error(
      "Vertex AI returned no image. This is usually a safety filter rejection " +
        "or a model/region availability problem.",
    );
  }

  return Buffer.from(imageBytes, "base64");
}
