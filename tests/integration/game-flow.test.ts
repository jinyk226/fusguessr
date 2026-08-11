import {
  GameOverError,
  InvalidGuessError,
  findAttempt,
  submitGuess,
} from "@/lib/game/attempt";
import { MAX_GUESSES } from "@/lib/game/zoom";
import {
  createTestFusion,
  createUser,
  prisma,
  resetDatabase,
  seedTestPokemon,
} from "./helpers";

// The puzzle under test throughout: Charizard (#6) fused with Squirtle (#7).
const CHARIZARD = 6;
const SQUIRTLE = 7;
const CHARMANDER = 4; // same evolution line as Charizard
const WARTORTLE = 8; // same evolution line as Squirtle
const PIKACHU = 25; // unrelated
const EEVEE = 133; // unrelated

beforeEach(async () => {
  await resetDatabase();
  await seedTestPokemon();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const user = await createUser();
  const fusion = await createTestFusion({
    pokemonAId: CHARIZARD,
    pokemonBId: SQUIRTLE,
    status: "LIVE",
    liveDate: "2026-08-11",
  });
  return { user, fusion };
}

describe("submitGuess", () => {
  it("starts an attempt on the first guess", async () => {
    const { user, fusion } = await setup();

    expect(await findAttempt(user.id, fusion.id)).toBeNull();

    const result = await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: PIKACHU,
      secondPickId: EEVEE,
    });

    expect(result.attempt.guessesUsed).toBe(1);
    expect(result.attempt.status).toBe("IN_PROGRESS");
    expect(result.attempt.date).toBe("2026-08-11");
  });

  it("wins regardless of which slot each Pokemon was typed into", async () => {
    const { user, fusion } = await setup();

    // Squirtle first, Charizard second - the reverse of stored order.
    const result = await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: SQUIRTLE,
      secondPickId: CHARIZARD,
    });

    expect(result.graded.isCorrect).toBe(true);
    expect(result.attempt.status).toBe("WON");
    expect(result.attempt.guessesUsed).toBe(1);
    expect(result.answer?.pokemonA.id).toBe(CHARIZARD);
  });

  it("reports a same-line hint for a relative of either half", async () => {
    const { user, fusion } = await setup();

    const result = await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: CHARMANDER,
      secondPickId: PIKACHU,
    });

    expect(result.graded.hintA).toBe("SAME_LINE");
    expect(result.graded.hintB).toBe("WRONG");
    expect(result.attempt.status).toBe("IN_PROGRESS");
  });

  it("persists the hints on the guess row for history rendering", async () => {
    const { user, fusion } = await setup();

    await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: CHARMANDER,
      secondPickId: WARTORTLE,
    });

    const attempt = await findAttempt(user.id, fusion.id);
    expect(attempt?.guesses).toHaveLength(1);
    expect(attempt?.guesses[0]).toMatchObject({
      guessIndex: 1,
      hintA: "SAME_LINE",
      hintB: "SAME_LINE",
      isCorrect: false,
    });
  });

  it("does not win when one slot is right and the other is not", async () => {
    const { user, fusion } = await setup();

    const result = await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: CHARIZARD,
      secondPickId: PIKACHU,
    });

    expect(result.graded.hintA).toBe("CORRECT");
    expect(result.graded.isCorrect).toBe(false);
    expect(result.attempt.status).toBe("IN_PROGRESS");
  });

  it("rejects the same Pokemon in both slots", async () => {
    const { user, fusion } = await setup();

    await expect(
      submitGuess({
        userId: user.id,
        fusionId: fusion.id,
        firstPickId: CHARIZARD,
        secondPickId: CHARIZARD,
      }),
    ).rejects.toThrow(InvalidGuessError);
  });

  it("rejects a Pokemon outside the seeded dex", async () => {
    const { user, fusion } = await setup();

    await expect(
      submitGuess({
        userId: user.id,
        fusionId: fusion.id,
        firstPickId: 9999,
        secondPickId: PIKACHU,
      }),
    ).rejects.toThrow(InvalidGuessError);
  });

  it("loses after six wrong guesses and reveals the answer", async () => {
    const { user, fusion } = await setup();

    const wrongPairs: [number, number][] = [
      [PIKACHU, EEVEE],
      [252, 255],
      [PIKACHU, 252],
      [EEVEE, 255],
      [PIKACHU, 255],
      [EEVEE, 252],
    ];

    let last;
    for (const [first, second] of wrongPairs) {
      last = await submitGuess({
        userId: user.id,
        fusionId: fusion.id,
        firstPickId: first,
        secondPickId: second,
      });
    }

    expect(last?.attempt.guessesUsed).toBe(MAX_GUESSES);
    expect(last?.attempt.status).toBe("LOST");
    expect(last?.attempt.completedAt).not.toBeNull();
    // The answer is only revealed once the game is over.
    expect(last?.answer?.pokemonA.id).toBe(CHARIZARD);
    expect(last?.answer?.pokemonB.id).toBe(SQUIRTLE);
  });

  it("refuses a seventh guess", async () => {
    const { user, fusion } = await setup();

    const wrongPairs: [number, number][] = [
      [PIKACHU, EEVEE],
      [252, 255],
      [PIKACHU, 252],
      [EEVEE, 255],
      [PIKACHU, 255],
      [EEVEE, 252],
    ];
    for (const [first, second] of wrongPairs) {
      await submitGuess({
        userId: user.id,
        fusionId: fusion.id,
        firstPickId: first,
        secondPickId: second,
      });
    }

    await expect(
      submitGuess({
        userId: user.id,
        fusionId: fusion.id,
        firstPickId: CHARIZARD,
        secondPickId: SQUIRTLE,
      }),
    ).rejects.toThrow(GameOverError);
  });

  it("refuses further guesses after a win", async () => {
    const { user, fusion } = await setup();

    await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: CHARIZARD,
      secondPickId: SQUIRTLE,
    });

    await expect(
      submitGuess({
        userId: user.id,
        fusionId: fusion.id,
        firstPickId: PIKACHU,
        secondPickId: EEVEE,
      }),
    ).rejects.toThrow(GameOverError);

    // The winning guess count is not inflated by the rejected attempt.
    const attempt = await findAttempt(user.id, fusion.id);
    expect(attempt?.guessesUsed).toBe(1);
  });

  it("numbers guesses sequentially", async () => {
    const { user, fusion } = await setup();

    await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: PIKACHU,
      secondPickId: EEVEE,
    });
    await submitGuess({
      userId: user.id,
      fusionId: fusion.id,
      firstPickId: 252,
      secondPickId: 255,
    });

    const attempt = await findAttempt(user.id, fusion.id);
    expect(attempt?.guesses.map((g) => g.guessIndex)).toEqual([1, 2]);
  });

  it("keeps two players' attempts independent", async () => {
    const { fusion } = await setup();
    const alice = await createUser("alice@example.com");
    const bob = await createUser("bob@example.com");

    await submitGuess({
      userId: alice.id,
      fusionId: fusion.id,
      firstPickId: CHARIZARD,
      secondPickId: SQUIRTLE,
    });
    await submitGuess({
      userId: bob.id,
      fusionId: fusion.id,
      firstPickId: PIKACHU,
      secondPickId: EEVEE,
    });

    expect((await findAttempt(alice.id, fusion.id))?.status).toBe("WON");
    expect((await findAttempt(bob.id, fusion.id))?.status).toBe("IN_PROGRESS");
  });

  it("marks an admin QA play so it stays out of public statistics", async () => {
    const admin = await createUser("admin@example.com", "ADMIN");
    const fusion = await createTestFusion({
      status: "SCHEDULED",
      scheduledForDate: "2026-09-01",
      liveDate: null,
    });

    const result = await submitGuess({
      userId: admin.id,
      fusionId: fusion.id,
      firstPickId: PIKACHU,
      secondPickId: EEVEE,
      isAdminPreview: true,
    });

    expect(result.attempt.isAdminPreview).toBe(true);
    // Filed under the scheduled date, not today's wall-clock date.
    expect(result.attempt.date).toBe("2026-09-01");
  });
});
