import {
  approveFusion,
  batchScheduleApproved,
  createFusion,
  findOpenScheduleDates,
  FusionNotEditableError,
  pickUnusedPair,
  regenerateFusionImage,
  rerollFocalPoint,
  scheduleFusion,
  setFusionName,
  unscheduleFusion,
} from "@/lib/game/fusion-service";
import { submitGuess } from "@/lib/game/attempt";
import { addDaysToLaDate, getLaDateString } from "@/lib/time/la-date";
import {
  createTestFusion,
  createUser,
  prisma,
  resetDatabase,
  seedTestPokemon,
} from "./helpers";

jest.setTimeout(60_000);

const ADMIN_ID = "admin-test";

beforeEach(async () => {
  await resetDatabase();
  await seedTestPokemon();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createFusion", () => {
  it("generates a fusion into the DRAFT bank with a blank name", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 6, pokemonBId: 7 },
    });

    expect(fusion.status).toBe("DRAFT");
    // Naming is optional and deliberately left empty at creation.
    expect(fusion.name).toBeNull();
    expect(fusion.version).toBe(1);
    expect(fusion.imageUrl).toBeTruthy();
    // The raw model output is kept alongside the pixelated version for QA.
    expect(fusion.rawImageUrl).toBeTruthy();
    expect(fusion.imageUrl).not.toBe(fusion.rawImageUrl);
  });

  it("snapshots the prompt and records an audit row", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 6, pokemonBId: 7 },
      extraPrompt: "  make it look grumpy  ",
    });

    expect(fusion.basePromptSnapshot).toContain("fuses {{A}} and {{B}}");
    expect(fusion.extraPrompt).toBe("make it look grumpy");

    const generations = await prisma.fusionGeneration.findMany({
      where: { fusionId: fusion.id },
    });
    expect(generations).toHaveLength(1);
    // The audit row stores the fully-resolved prompt, names substituted in.
    expect(generations[0].promptFull).toContain("charizard");
    expect(generations[0].promptFull).toContain("squirtle");
    expect(generations[0].promptFull).toContain("grumpy");
  });

  it("starts with a focal point inside the guardrail range", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 6, pokemonBId: 7 },
    });

    expect(fusion.focalX).toBeGreaterThanOrEqual(25);
    expect(fusion.focalX).toBeLessThanOrEqual(75);
    expect(fusion.focalY).toBeGreaterThanOrEqual(25);
    expect(fusion.focalY).toBeLessThanOrEqual(75);
  });

  it("normalises a reversed pair before storing it", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 7, pokemonBId: 6 },
    });

    // canonicalPair is applied by the DB check even if a caller passes the
    // pair the other way round via the service.
    expect(fusion.pokemonAId).toBeLessThan(fusion.pokemonBId);
  });
});

describe("pickUnusedPair", () => {
  it("never returns a pair that already exists", async () => {
    // Seeded pokemon are ids 4-255, but the picker draws from the full dex, so
    // just assert the invariant on repeated draws.
    for (let i = 0; i < 20; i++) {
      const pair = await pickUnusedPair();
      expect(pair.pokemonAId).toBeLessThan(pair.pokemonBId);

      const existing = await prisma.fusion.findUnique({
        where: { pokemonAId_pokemonBId: pair },
      });
      expect(existing).toBeNull();
    }
  });
});

describe("regenerateFusionImage", () => {
  it("bumps the version and replaces both images", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 6, pokemonBId: 7 },
    });

    const regenerated = await regenerateFusionImage({
      fusionId: fusion.id,
      extraPrompt: "now with more teeth",
    });

    expect(regenerated.version).toBe(2);
    expect(regenerated.extraPrompt).toBe("now with more teeth");
    expect(regenerated.imageUrl).not.toBe(fusion.imageUrl);
    expect(await prisma.fusionGeneration.count({ where: { fusionId: fusion.id } })).toBe(2);
  });

  it("keeps the existing extra prompt when none is supplied", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 6, pokemonBId: 7 },
      extraPrompt: "keep me",
    });

    const regenerated = await regenerateFusionImage({ fusionId: fusion.id });
    expect(regenerated.extraPrompt).toBe("keep me");
  });

  it("discards the admin's QA play, which was made against the old image", async () => {
    const admin = await createUser("admin@example.com", "ADMIN");
    const fusion = await createFusion({
      createdByAdminId: admin.id,
      pair: { pokemonAId: 6, pokemonBId: 7 },
    });
    await scheduleFusionForTomorrow(fusion.id);

    await submitGuess({
      userId: admin.id,
      fusionId: fusion.id,
      firstPickId: 25,
      secondPickId: 133,
      isAdminPreview: true,
    });
    expect(await prisma.attempt.count({ where: { fusionId: fusion.id } })).toBe(1);

    await regenerateFusionImage({ fusionId: fusion.id });

    // Guesses about a picture that no longer exists would be nonsense.
    expect(await prisma.attempt.count({ where: { fusionId: fusion.id } })).toBe(0);
    expect(await prisma.guess.count()).toBe(0);
  });

  it("refuses to touch a live puzzle", async () => {
    const fusion = await createTestFusion({ status: "LIVE", liveDate: "2026-08-11" });

    await expect(
      regenerateFusionImage({ fusionId: fusion.id }),
    ).rejects.toThrow(FusionNotEditableError);
  });
});

describe("rerollFocalPoint", () => {
  it("moves the zoom origin without regenerating the image", async () => {
    const fusion = await createFusion({
      createdByAdminId: ADMIN_ID,
      pair: { pokemonAId: 6, pokemonBId: 7 },
    });

    const rerolled = await rerollFocalPoint(fusion.id);

    expect(rerolled.imageUrl).toBe(fusion.imageUrl);
    expect(rerolled.version).toBe(fusion.version);
    expect(rerolled.focalX).toBeGreaterThanOrEqual(25);
    expect(rerolled.focalX).toBeLessThanOrEqual(75);
  });

  it("also discards the admin's QA play, since the crop changed", async () => {
    const admin = await createUser("admin@example.com", "ADMIN");
    const fusion = await createFusion({
      createdByAdminId: admin.id,
      pair: { pokemonAId: 6, pokemonBId: 7 },
    });
    await scheduleFusionForTomorrow(fusion.id);

    await submitGuess({
      userId: admin.id,
      fusionId: fusion.id,
      firstPickId: 25,
      secondPickId: 133,
      isAdminPreview: true,
    });

    await rerollFocalPoint(fusion.id);

    expect(await prisma.attempt.count({ where: { fusionId: fusion.id } })).toBe(0);
  });

  it("refuses to touch a live puzzle", async () => {
    const fusion = await createTestFusion({ status: "LIVE", liveDate: "2026-08-11" });
    await expect(rerollFocalPoint(fusion.id)).rejects.toThrow(
      FusionNotEditableError,
    );
  });
});

describe("the approval and scheduling gate", () => {
  it("moves DRAFT to APPROVED", async () => {
    const fusion = await createTestFusion({ status: "DRAFT", liveDate: null });
    expect((await approveFusion(fusion.id)).status).toBe("APPROVED");
  });

  it("refuses to schedule a puzzle that was never approved", async () => {
    const fusion = await createTestFusion({ status: "DRAFT", liveDate: null });
    await expect(
      scheduleFusion(fusion.id, addDaysToLaDate(getLaDateString(), 1)),
    ).rejects.toThrow(FusionNotEditableError);
  });

  it("refuses to schedule into the past", async () => {
    const fusion = await createTestFusion({ status: "APPROVED", liveDate: null });
    await expect(
      scheduleFusion(fusion.id, addDaysToLaDate(getLaDateString(), -1)),
    ).rejects.toThrow(/future date/);
  });

  it("schedules an approved puzzle for a future date", async () => {
    const fusion = await createTestFusion({ status: "APPROVED", liveDate: null });
    const tomorrow = addDaysToLaDate(getLaDateString(), 1);

    const scheduled = await scheduleFusion(fusion.id, tomorrow);

    expect(scheduled.status).toBe("SCHEDULED");
    expect(scheduled.scheduledForDate).toBe(tomorrow);
  });

  it("can pull a staged puzzle back off the calendar", async () => {
    const fusion = await createTestFusion({ status: "APPROVED", liveDate: null });
    await scheduleFusion(fusion.id, addDaysToLaDate(getLaDateString(), 1));

    const unscheduled = await unscheduleFusion(fusion.id);

    expect(unscheduled.status).toBe("APPROVED");
    expect(unscheduled.scheduledForDate).toBeNull();
  });
});

describe("batchScheduleApproved", () => {
  it("fills consecutive open dates from the approved bank", async () => {
    const pairs: [number, number][] = [
      [4, 5],
      [4, 6],
      [4, 7],
    ];
    for (const [a, b] of pairs) {
      const fusion = await createTestFusion({
        pokemonAId: a,
        pokemonBId: b,
        status: "APPROVED",
        liveDate: null,
      });
      void fusion;
    }

    const scheduled = await batchScheduleApproved(3);

    expect(scheduled).toHaveLength(3);
    const dates = scheduled.map((f) => f.scheduledForDate).sort();
    const today = getLaDateString();
    expect(dates).toEqual([
      addDaysToLaDate(today, 1),
      addDaysToLaDate(today, 2),
      addDaysToLaDate(today, 3),
    ]);
  });

  it("skips dates that already have a puzzle staged", async () => {
    const today = getLaDateString();
    const tomorrow = addDaysToLaDate(today, 1);

    await createTestFusion({
      pokemonAId: 4,
      pokemonBId: 5,
      status: "SCHEDULED",
      scheduledForDate: tomorrow,
      liveDate: null,
    });
    await createTestFusion({
      pokemonAId: 4,
      pokemonBId: 6,
      status: "APPROVED",
      liveDate: null,
    });

    const scheduled = await batchScheduleApproved(1);

    expect(scheduled[0].scheduledForDate).toBe(addDaysToLaDate(today, 2));
  });

  it("does nothing when the approved bank is empty", async () => {
    expect(await batchScheduleApproved(5)).toEqual([]);
  });

  it("reports the next open dates", async () => {
    const today = getLaDateString();
    const dates = await findOpenScheduleDates(3);
    expect(dates).toEqual([
      addDaysToLaDate(today, 1),
      addDaysToLaDate(today, 2),
      addDaysToLaDate(today, 3),
    ]);
  });
});

describe("setFusionName", () => {
  it("sets and clears the optional name", async () => {
    const fusion = await createTestFusion({ status: "DRAFT", liveDate: null });

    expect((await setFusionName(fusion.id, "  Charizzle  ")).name).toBe("Charizzle");
    expect((await setFusionName(fusion.id, "   ")).name).toBeNull();
  });
});

/** Approves and stages a fusion for tomorrow, so it can be QA-played. */
async function scheduleFusionForTomorrow(fusionId: string) {
  await approveFusion(fusionId);
  await scheduleFusion(fusionId, addDaysToLaDate(getLaDateString(), 1));
}
