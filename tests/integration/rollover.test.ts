import { performRollover } from "@/lib/game/rollover";
import {
  createTestFusion,
  prisma,
  resetDatabase,
  seedTestPokemon,
} from "./helpers";

/**
 * The rollover is the one piece of scheduling the whole game depends on, and
 * it runs unattended at 4am. These cases pin the behaviours that matter:
 * it fires only after the cutover, it is safe to run twice, and a day with
 * nothing staged degrades gracefully instead of blanking the homepage.
 *
 * During PDT, 4am LA is 11:00 UTC. During PST it is 12:00 UTC.
 */
const BEFORE_CUTOVER_PDT = new Date("2026-08-11T10:30:00Z"); // 03:30 LA
const AFTER_CUTOVER_PDT = new Date("2026-08-11T11:30:00Z"); // 04:30 LA
const TODAY = "2026-08-11";
const YESTERDAY = "2026-08-10";

beforeEach(async () => {
  await resetDatabase();
  await seedTestPokemon();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("performRollover", () => {
  it("does nothing before 4am LA", async () => {
    await createTestFusion({
      status: "SCHEDULED",
      scheduledForDate: TODAY,
      liveDate: null,
    });

    const result = await performRollover(BEFORE_CUTOVER_PDT);

    expect(result.outcome).toBe("before-rollover-hour");
    const fusion = await prisma.fusion.findFirstOrThrow();
    expect(fusion.status).toBe("SCHEDULED");
  });

  it("promotes the staged puzzle after 4am LA", async () => {
    const staged = await createTestFusion({
      status: "SCHEDULED",
      scheduledForDate: TODAY,
      liveDate: null,
    });

    const result = await performRollover(AFTER_CUTOVER_PDT);

    expect(result.outcome).toBe("promoted");
    expect(result.promotedFusionId).toBe(staged.id);

    const updated = await prisma.fusion.findUniqueOrThrow({
      where: { id: staged.id },
    });
    expect(updated.status).toBe("LIVE");
    expect(updated.liveDate).toBe(TODAY);
    // Cleared so the date is not claimed twice.
    expect(updated.scheduledForDate).toBeNull();
  });

  it("archives the outgoing puzzle as it promotes the new one", async () => {
    const outgoing = await createTestFusion({
      pokemonAId: 4,
      pokemonBId: 25,
      status: "LIVE",
      liveDate: YESTERDAY,
    });
    const incoming = await createTestFusion({
      pokemonAId: 6,
      pokemonBId: 7,
      status: "SCHEDULED",
      scheduledForDate: TODAY,
      liveDate: null,
    });

    const result = await performRollover(AFTER_CUTOVER_PDT);

    expect(result.archivedFusionId).toBe(outgoing.id);
    expect(
      (await prisma.fusion.findUniqueOrThrow({ where: { id: outgoing.id } }))
        .status,
    ).toBe("ARCHIVED");
    expect(
      (await prisma.fusion.findUniqueOrThrow({ where: { id: incoming.id } }))
        .status,
    ).toBe("LIVE");

    // Exactly one puzzle is ever live.
    expect(await prisma.fusion.count({ where: { status: "LIVE" } })).toBe(1);
  });

  it("is idempotent when run twice in the same day", async () => {
    await createTestFusion({
      status: "SCHEDULED",
      scheduledForDate: TODAY,
      liveDate: null,
    });

    const first = await performRollover(AFTER_CUTOVER_PDT);
    const second = await performRollover(AFTER_CUTOVER_PDT);

    expect(first.outcome).toBe("promoted");
    expect(second.outcome).toBe("already-rolled-over");
    expect(await prisma.fusion.count({ where: { status: "LIVE" } })).toBe(1);
    // Only the real promotion is logged, not the repeat.
    expect(await prisma.rolloverLog.count()).toBe(1);
  });

  it("survives being retried many times, as Cloud Scheduler may do", async () => {
    await createTestFusion({
      status: "SCHEDULED",
      scheduledForDate: TODAY,
      liveDate: null,
    });

    for (let i = 0; i < 5; i++) {
      await performRollover(AFTER_CUTOVER_PDT);
    }

    expect(await prisma.fusion.count({ where: { status: "LIVE" } })).toBe(1);
    expect(await prisma.fusion.count({ where: { status: "ARCHIVED" } })).toBe(0);
  });

  describe("when nothing is staged for today", () => {
    it("leaves yesterday's puzzle live rather than blanking the homepage", async () => {
      const yesterdays = await createTestFusion({
        status: "LIVE",
        liveDate: YESTERDAY,
      });

      const result = await performRollover(AFTER_CUTOVER_PDT);

      expect(result.outcome).toBe("nothing-scheduled");
      expect(
        (await prisma.fusion.findUniqueOrThrow({ where: { id: yesterdays.id } }))
          .status,
      ).toBe("LIVE");
    });

    it("records one warning for the admin dashboard, not one per retry", async () => {
      await createTestFusion({ status: "LIVE", liveDate: YESTERDAY });

      await performRollover(AFTER_CUTOVER_PDT);
      await performRollover(AFTER_CUTOVER_PDT);
      await performRollover(AFTER_CUTOVER_PDT);

      const logs = await prisma.rolloverLog.findMany();
      expect(logs).toHaveLength(1);
      expect(logs[0].toFusionId).toBeNull();
      expect(logs[0].note).toMatch(/No fusion was scheduled/);
    });

    it("recovers once the admin stages a puzzle later that day", async () => {
      await createTestFusion({
        pokemonAId: 4,
        pokemonBId: 25,
        status: "LIVE",
        liveDate: YESTERDAY,
      });

      expect((await performRollover(AFTER_CUTOVER_PDT)).outcome).toBe(
        "nothing-scheduled",
      );

      const rescue = await createTestFusion({
        pokemonAId: 6,
        pokemonBId: 7,
        status: "SCHEDULED",
        scheduledForDate: TODAY,
        liveDate: null,
      });

      const result = await performRollover(AFTER_CUTOVER_PDT);

      expect(result.outcome).toBe("promoted");
      expect(result.promotedFusionId).toBe(rescue.id);
    });
  });

  describe("across daylight saving boundaries", () => {
    it("waits for 4am PST, not 4am PDT, in winter", async () => {
      await createTestFusion({
        status: "SCHEDULED",
        scheduledForDate: "2026-01-15",
        liveDate: null,
      });

      // 11:30 UTC is 03:30 PST - still before the cutover in winter, even
      // though the same UTC time is past it in summer.
      expect(
        (await performRollover(new Date("2026-01-15T11:30:00Z"))).outcome,
      ).toBe("before-rollover-hour");

      // 12:30 UTC is 04:30 PST.
      expect(
        (await performRollover(new Date("2026-01-15T12:30:00Z"))).outcome,
      ).toBe("promoted");
    });

    it("uses the LA date, not the UTC date, when picking the puzzle", async () => {
      // 06:00 UTC on Aug 12 is still 23:00 on Aug 11 in LA, so the Aug 12
      // puzzle must not go live yet.
      await createTestFusion({
        status: "SCHEDULED",
        scheduledForDate: "2026-08-12",
        liveDate: null,
      });

      const result = await performRollover(new Date("2026-08-12T06:00:00Z"));

      expect(result.laDate).toBe("2026-08-11");
      expect(result.outcome).toBe("nothing-scheduled");
    });
  });
});
