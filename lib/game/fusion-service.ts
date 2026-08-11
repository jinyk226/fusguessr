import "server-only";

import { randomUUID } from "node:crypto";
import type { Fusion } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { canonicalPair, type CanonicalPair } from "./canonical-pair";
import { randomFocalPoint } from "./zoom";
import { pixelateToSprite } from "@/lib/image/pixelate";
import {
  BASE_PROMPT_TEMPLATE,
  buildFusionPrompt,
  generateRawImage,
} from "@/lib/vertex/generate-fusion-image";
import { buildObjectPath, uploadFusionImage } from "@/lib/gcs/upload-fusion-image";
import { addDaysToLaDate, getLaDateString } from "@/lib/time/la-date";

/** National dex range in play: Kanto through Hoenn. */
export const FIRST_DEX_ID = 1;
export const LAST_DEX_ID = 386;

/**
 * Bounded retries when drawing an unused pair. There are C(386,2) = 74,305
 * possible fusions - about two centuries of daily puzzles - so collisions are
 * vanishingly rare, but an unbounded loop would be a hang rather than an error
 * once the space did fill up.
 */
const MAX_PAIR_DRAW_ATTEMPTS = 50;

/** Statuses an admin may still edit. Once LIVE, a puzzle is frozen. */
const EDITABLE_STATUSES = ["DRAFT", "APPROVED", "SCHEDULED"] as const;

export class FusionNotEditableError extends Error {
  constructor(status: string) {
    super(`A fusion with status ${status} can no longer be edited`);
    this.name = "FusionNotEditableError";
  }
}

export class PairExhaustedError extends Error {
  constructor() {
    super(
      `Could not find an unused Pokemon pair in ${MAX_PAIR_DRAW_ATTEMPTS} attempts`,
    );
    this.name = "PairExhaustedError";
  }
}

function randomDexId(): number {
  return FIRST_DEX_ID + Math.floor(Math.random() * (LAST_DEX_ID - FIRST_DEX_ID + 1));
}

/** Draws a canonically-ordered pair that has never been fused before. */
export async function pickUnusedPair(): Promise<CanonicalPair> {
  for (let attempt = 0; attempt < MAX_PAIR_DRAW_ATTEMPTS; attempt++) {
    const first = randomDexId();
    const second = randomDexId();
    if (first === second) continue;

    const pair = canonicalPair(first, second);
    const existing = await prisma.fusion.findUnique({
      where: { pokemonAId_pokemonBId: pair },
      select: { id: true },
    });

    if (!existing) return pair;
  }

  throw new PairExhaustedError();
}

interface RenderedImages {
  finalUrl: string;
  finalPath: string;
  rawUrl: string;
  rawPath: string;
  promptFull: string;
}

/**
 * Generates, pixelates and stores both the raw model output and the
 * post-processed sprite. The raw copy is kept so the admin can see what the
 * model actually produced when a fusion comes out badly.
 */
async function renderFusionImages(
  fusionId: string,
  version: number,
  pokemonAName: string,
  pokemonBName: string,
  extraPrompt: string | null,
): Promise<RenderedImages> {
  const promptFull = buildFusionPrompt({
    pokemonAName,
    pokemonBName,
    extraPrompt,
  });

  const raw = await generateRawImage(promptFull);
  const pixelated = await pixelateToSprite(raw);

  const rawStored = await uploadFusionImage(
    buildObjectPath(fusionId, version, "raw"),
    raw,
  );
  const finalStored = await uploadFusionImage(
    buildObjectPath(fusionId, version, "final"),
    pixelated,
  );

  return {
    finalUrl: finalStored.url,
    finalPath: finalStored.gcsPath,
    rawUrl: rawStored.url,
    rawPath: rawStored.gcsPath,
    promptFull,
  };
}

export interface CreateFusionInput {
  createdByAdminId: string;
  extraPrompt?: string | null;
  /** Optional explicit pair; a random unused one is drawn when omitted. */
  pair?: CanonicalPair;
}

/** Generates a new fusion into the DRAFT bank. */
export async function createFusion(input: CreateFusionInput): Promise<Fusion> {
  // Re-canonicalise rather than trusting the caller: an explicitly-supplied
  // pair is exactly where a reversed ordering would sneak in.
  const pair = input.pair
    ? canonicalPair(input.pair.pokemonAId, input.pair.pokemonBId)
    : await pickUnusedPair();

  const [pokemonA, pokemonB] = await Promise.all([
    prisma.pokemon.findUniqueOrThrow({ where: { id: pair.pokemonAId } }),
    prisma.pokemon.findUniqueOrThrow({ where: { id: pair.pokemonBId } }),
  ]);

  // Generated up front so the storage path is stable before the row exists.
  const fusionId = randomUUID();
  const extraPrompt = input.extraPrompt?.trim() || null;

  const images = await renderFusionImages(
    fusionId,
    1,
    pokemonA.name,
    pokemonB.name,
    extraPrompt,
  );

  const focal = randomFocalPoint();

  return prisma.$transaction(async (tx) => {
    const fusion = await tx.fusion.create({
      data: {
        id: fusionId,
        pokemonAId: pair.pokemonAId,
        pokemonBId: pair.pokemonBId,
        // Left blank deliberately: naming a fusion is optional and can happen
        // later, or never.
        name: null,
        basePromptSnapshot: BASE_PROMPT_TEMPLATE,
        extraPrompt,
        imageUrl: images.finalUrl,
        imageGcsPath: images.finalPath,
        rawImageUrl: images.rawUrl,
        rawImageGcsPath: images.rawPath,
        focalX: focal.focalX,
        focalY: focal.focalY,
        createdByAdminId: input.createdByAdminId,
      },
    });

    await tx.fusionGeneration.create({
      data: {
        fusionId: fusion.id,
        promptFull: images.promptFull,
        imageUrl: images.finalUrl,
      },
    });

    return fusion;
  });
}

function assertEditable(fusion: Fusion): void {
  if (!EDITABLE_STATUSES.includes(fusion.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new FusionNotEditableError(fusion.status);
  }
}

/**
 * Clears admin QA plays of a fusion.
 *
 * Called whenever the thing being looked at changes - a new image or a new
 * focal point - so a half-finished preview never carries guesses made against
 * a picture that no longer exists. Only preview attempts are touched; a live
 * puzzle is not editable in the first place.
 */
async function resetPreviewAttempts(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  fusionId: string,
): Promise<void> {
  await tx.attempt.deleteMany({ where: { fusionId, isAdminPreview: true } });
}

export interface RegenerateInput {
  fusionId: string;
  /** Replaces the stored extra prompt when provided. */
  extraPrompt?: string | null;
}

/** Re-runs generation for an existing pair, bumping the version. */
export async function regenerateFusionImage(
  input: RegenerateInput,
): Promise<Fusion> {
  const fusion = await prisma.fusion.findUniqueOrThrow({
    where: { id: input.fusionId },
    include: { pokemonA: true, pokemonB: true },
  });

  assertEditable(fusion);

  const extraPrompt =
    input.extraPrompt === undefined
      ? fusion.extraPrompt
      : input.extraPrompt?.trim() || null;

  const nextVersion = fusion.version + 1;

  const images = await renderFusionImages(
    fusion.id,
    nextVersion,
    fusion.pokemonA.name,
    fusion.pokemonB.name,
    extraPrompt,
  );

  return prisma.$transaction(async (tx) => {
    await resetPreviewAttempts(tx, fusion.id);

    const updated = await tx.fusion.update({
      where: { id: fusion.id },
      data: {
        version: nextVersion,
        extraPrompt,
        imageUrl: images.finalUrl,
        imageGcsPath: images.finalPath,
        rawImageUrl: images.rawUrl,
        rawImageGcsPath: images.rawPath,
      },
    });

    await tx.fusionGeneration.create({
      data: {
        fusionId: fusion.id,
        promptFull: images.promptFull,
        imageUrl: images.finalUrl,
      },
    });

    return updated;
  });
}

/** Picks a new random zoom origin without touching the image itself. */
export async function rerollFocalPoint(fusionId: string): Promise<Fusion> {
  const fusion = await prisma.fusion.findUniqueOrThrow({ where: { id: fusionId } });
  assertEditable(fusion);

  const focal = randomFocalPoint();

  return prisma.$transaction(async (tx) => {
    await resetPreviewAttempts(tx, fusionId);
    return tx.fusion.update({ where: { id: fusionId }, data: focal });
  });
}

/** Sets or clears the optional display name. */
export async function setFusionName(
  fusionId: string,
  name: string | null,
): Promise<Fusion> {
  return prisma.fusion.update({
    where: { id: fusionId },
    data: { name: name?.trim() || null },
  });
}

/** DRAFT -> APPROVED: the admin is happy with how it looks. */
export async function approveFusion(fusionId: string): Promise<Fusion> {
  const fusion = await prisma.fusion.findUniqueOrThrow({ where: { id: fusionId } });
  if (fusion.status !== "DRAFT") {
    throw new FusionNotEditableError(fusion.status);
  }

  return prisma.fusion.update({
    where: { id: fusionId },
    data: { status: "APPROVED" },
  });
}

/** Puts an approved fusion on a specific future date. */
export async function scheduleFusion(
  fusionId: string,
  date: string,
): Promise<Fusion> {
  const fusion = await prisma.fusion.findUniqueOrThrow({ where: { id: fusionId } });

  if (fusion.status !== "APPROVED" && fusion.status !== "SCHEDULED") {
    throw new FusionNotEditableError(fusion.status);
  }

  const today = getLaDateString();
  if (date <= today) {
    throw new Error(
      `Puzzles must be scheduled for a future date (got ${date}, today is ${today})`,
    );
  }

  return prisma.fusion.update({
    where: { id: fusionId },
    data: { status: "SCHEDULED", scheduledForDate: date },
  });
}

/** SCHEDULED -> APPROVED: pulls a staged puzzle back off the calendar. */
export async function unscheduleFusion(fusionId: string): Promise<Fusion> {
  const fusion = await prisma.fusion.findUniqueOrThrow({ where: { id: fusionId } });
  if (fusion.status !== "SCHEDULED") {
    throw new FusionNotEditableError(fusion.status);
  }

  return prisma.fusion.update({
    where: { id: fusionId },
    data: { status: "APPROVED", scheduledForDate: null },
  });
}

/** The next calendar dates from tomorrow onwards that have nothing staged. */
export async function findOpenScheduleDates(count: number): Promise<string[]> {
  const taken = new Set(
    (
      await prisma.fusion.findMany({
        where: { scheduledForDate: { not: null } },
        select: { scheduledForDate: true },
      })
    ).map((row) => row.scheduledForDate as string),
  );

  const today = getLaDateString();
  const open: string[] = [];

  for (let offset = 1; open.length < count && offset <= count + taken.size + 1; offset++) {
    const candidate = addDaysToLaDate(today, offset);
    if (!taken.has(candidate)) open.push(candidate);
  }

  return open;
}

/**
 * Fills the next open dates from the approved bank, oldest first.
 *
 * This is what keeps the rollover from ever needing its fallback: staging
 * several days at once means a missed admin session does not stall the game.
 */
export async function batchScheduleApproved(limit: number): Promise<Fusion[]> {
  const approved = await prisma.fusion.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  if (approved.length === 0) return [];

  const dates = await findOpenScheduleDates(approved.length);

  const scheduled: Fusion[] = [];
  for (let i = 0; i < approved.length && i < dates.length; i++) {
    scheduled.push(
      await prisma.fusion.update({
        where: { id: approved[i].id },
        data: { status: "SCHEDULED", scheduledForDate: dates[i] },
      }),
    );
  }

  return scheduled;
}
