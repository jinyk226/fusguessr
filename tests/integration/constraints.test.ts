import {
  createTestFusion,
  createUser,
  prisma,
  resetDatabase,
  seedTestPokemon,
} from "./helpers";

/**
 * These exercise the guarantees that live in the database rather than in
 * application code. They are the ones that would silently corrupt the game if
 * a future code path forgot them, so they are asserted against real Postgres
 * rather than a mock.
 */

beforeEach(async () => {
  await resetDatabase();
  await seedTestPokemon();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Prisma's unique-constraint violation code. */
const UNIQUE_VIOLATION = "P2002";

describe("a Pokemon pair can never be fused twice", () => {
  it("rejects an exact duplicate pair", async () => {
    await createTestFusion({ pokemonAId: 6, pokemonBId: 7, status: "DRAFT" });

    await expect(
      createTestFusion({ pokemonAId: 6, pokemonBId: 7, status: "DRAFT" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("rejects the same pair supplied in the opposite order", async () => {
    // canonicalPair() collapses both orderings onto the same row, so the
    // second insert collides on the unique index.
    await createTestFusion({ pokemonAId: 6, pokemonBId: 7, status: "DRAFT" });

    await expect(
      createTestFusion({ pokemonAId: 7, pokemonBId: 6, status: "DRAFT" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("refuses to store a non-canonical pair at all", async () => {
    // Defence in depth. The unique index alone would happily hold both (6,7)
    // and (7,6) as separate rows if a code path forgot to canonicalise, so a
    // CHECK constraint makes the bad ordering unstorable in the first place.
    await expect(
      createTestFusion({
        pokemonAId: 7,
        pokemonBId: 6,
        status: "DRAFT",
        skipCanonicalization: true,
      }),
    ).rejects.toThrow(/Fusion_pokemon_pair_canonical_order|constraint/i);
  });

  it("refuses to fuse a Pokemon with itself", async () => {
    await expect(
      createTestFusion({
        pokemonAId: 6,
        pokemonBId: 6,
        status: "DRAFT",
        skipCanonicalization: true,
      }),
    ).rejects.toThrow(/Fusion_pokemon_pair_canonical_order|constraint/i);
  });

  it("still allows a genuinely different pair", async () => {
    await createTestFusion({ pokemonAId: 6, pokemonBId: 7, status: "DRAFT" });
    const other = await createTestFusion({
      pokemonAId: 6,
      pokemonBId: 25,
      status: "DRAFT",
    });

    expect(other.id).toBeTruthy();
  });

  it("holds even after the first fusion has been archived", async () => {
    // A retired puzzle must not free its pair back up for reuse.
    await createTestFusion({
      pokemonAId: 6,
      pokemonBId: 7,
      status: "ARCHIVED",
      liveDate: "2026-01-01",
    });

    await expect(
      createTestFusion({ pokemonAId: 7, pokemonBId: 6, status: "DRAFT" }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("keeps the stored pair canonical regardless of input order", async () => {
    const fusion = await createTestFusion({
      pokemonAId: 25,
      pokemonBId: 4,
      status: "DRAFT",
    });

    expect(fusion.pokemonAId).toBe(4);
    expect(fusion.pokemonBId).toBe(25);
  });
});

describe("one attempt per user per puzzle", () => {
  it("rejects a second attempt row for the same user and fusion", async () => {
    const user = await createUser();
    const fusion = await createTestFusion();

    await prisma.attempt.create({
      data: { userId: user.id, fusionId: fusion.id, date: "2026-08-11" },
    });

    await expect(
      prisma.attempt.create({
        data: { userId: user.id, fusionId: fusion.id, date: "2026-08-11" },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("allows different users to attempt the same puzzle", async () => {
    const [alice, bob] = await Promise.all([
      createUser("alice@example.com"),
      createUser("bob@example.com"),
    ]);
    const fusion = await createTestFusion();

    await prisma.attempt.create({
      data: { userId: alice.id, fusionId: fusion.id, date: "2026-08-11" },
    });
    const second = await prisma.attempt.create({
      data: { userId: bob.id, fusionId: fusion.id, date: "2026-08-11" },
    });

    expect(second.id).toBeTruthy();
  });
});

describe("guess ordering within an attempt", () => {
  it("rejects two guesses at the same index", async () => {
    const user = await createUser();
    const fusion = await createTestFusion();
    const attempt = await prisma.attempt.create({
      data: { userId: user.id, fusionId: fusion.id, date: "2026-08-11" },
    });

    const guess = {
      attemptId: attempt.id,
      guessIndex: 1,
      pokemonAId: 4,
      pokemonBId: 25,
      hintA: "WRONG" as const,
      hintB: "WRONG" as const,
      isCorrect: false,
    };

    await prisma.guess.create({ data: guess });
    await expect(prisma.guess.create({ data: guess })).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });
});

describe("one puzzle per calendar date", () => {
  it("rejects two fusions scheduled for the same date", async () => {
    await createTestFusion({
      pokemonAId: 6,
      pokemonBId: 7,
      status: "SCHEDULED",
      scheduledForDate: "2026-09-01",
      liveDate: null,
    });

    await expect(
      createTestFusion({
        pokemonAId: 4,
        pokemonBId: 25,
        status: "SCHEDULED",
        scheduledForDate: "2026-09-01",
        liveDate: null,
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("rejects two fusions claiming the same live date", async () => {
    await createTestFusion({
      pokemonAId: 6,
      pokemonBId: 7,
      status: "ARCHIVED",
      liveDate: "2026-08-10",
    });

    await expect(
      createTestFusion({
        pokemonAId: 4,
        pokemonBId: 25,
        status: "LIVE",
        liveDate: "2026-08-10",
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("allows many unscheduled fusions to coexist", async () => {
    // NULLs do not collide in a unique index, so the bank can hold any number
    // of undated drafts.
    await createTestFusion({
      pokemonAId: 6,
      pokemonBId: 7,
      status: "DRAFT",
      liveDate: null,
    });
    await createTestFusion({
      pokemonAId: 4,
      pokemonBId: 25,
      status: "DRAFT",
      liveDate: null,
    });

    expect(await prisma.fusion.count()).toBe(2);
  });
});

describe("cascading deletes", () => {
  it("removes guesses when an attempt is deleted", async () => {
    const user = await createUser();
    const fusion = await createTestFusion();
    const attempt = await prisma.attempt.create({
      data: { userId: user.id, fusionId: fusion.id, date: "2026-08-11" },
    });

    await prisma.guess.create({
      data: {
        attemptId: attempt.id,
        guessIndex: 1,
        pokemonAId: 4,
        pokemonBId: 25,
        hintA: "WRONG",
        hintB: "WRONG",
        isCorrect: false,
      },
    });

    await prisma.attempt.delete({ where: { id: attempt.id } });

    expect(await prisma.guess.count()).toBe(0);
  });
});
