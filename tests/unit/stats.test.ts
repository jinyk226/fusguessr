import { computeStats, type StatsAttempt } from "@/lib/game/stats";

const won = (date: string, guessesUsed: number): StatsAttempt => ({
  date,
  status: "WON",
  guessesUsed,
});

const lost = (date: string): StatsAttempt => ({
  date,
  status: "LOST",
  guessesUsed: 6,
});

describe("computeStats", () => {
  it("returns zeroed stats for a player who has never finished a puzzle", () => {
    const stats = computeStats([], "2026-08-11");

    expect(stats.played).toBe(0);
    expect(stats.winPercentage).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(0);
    expect(stats.guessDistribution).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("ignores an unfinished attempt", () => {
    const stats = computeStats(
      [{ date: "2026-08-11", status: "IN_PROGRESS", guessesUsed: 2 }],
      "2026-08-11",
    );

    expect(stats.played).toBe(0);
  });

  it("counts wins, losses and win percentage", () => {
    const stats = computeStats(
      [won("2026-08-09", 3), lost("2026-08-10"), won("2026-08-11", 1)],
      "2026-08-11",
    );

    expect(stats.played).toBe(3);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.winPercentage).toBe(67);
  });

  it("buckets wins by guess count", () => {
    const stats = computeStats(
      [won("2026-08-09", 1), won("2026-08-10", 6), won("2026-08-11", 1)],
      "2026-08-11",
    );

    // Index 0 is "solved in one guess".
    expect(stats.guessDistribution[0]).toBe(2);
    expect(stats.guessDistribution[5]).toBe(1);
  });

  it("does not bucket losses", () => {
    const stats = computeStats([lost("2026-08-11")], "2026-08-11");
    expect(stats.guessDistribution).toEqual([0, 0, 0, 0, 0, 0]);
  });

  describe("current streak", () => {
    it("counts consecutive wins ending today", () => {
      const stats = computeStats(
        [won("2026-08-09", 2), won("2026-08-10", 2), won("2026-08-11", 2)],
        "2026-08-11",
      );
      expect(stats.currentStreak).toBe(3);
    });

    it("survives today being unplayed", () => {
      // Opening the app before playing should not wipe the streak.
      const stats = computeStats(
        [won("2026-08-09", 2), won("2026-08-10", 2)],
        "2026-08-11",
      );
      expect(stats.currentStreak).toBe(2);
    });

    it("breaks on a loss today", () => {
      const stats = computeStats(
        [won("2026-08-09", 2), won("2026-08-10", 2), lost("2026-08-11")],
        "2026-08-11",
      );
      expect(stats.currentStreak).toBe(0);
    });

    it("breaks on a skipped day", () => {
      // Aug 10 was never played, so the Aug 9 win no longer counts.
      const stats = computeStats(
        [won("2026-08-09", 2), won("2026-08-11", 2)],
        "2026-08-11",
      );
      expect(stats.currentStreak).toBe(1);
    });

    it("is zero when the most recent completed day was a loss", () => {
      const stats = computeStats(
        [won("2026-08-08", 2), lost("2026-08-09")],
        "2026-08-11",
      );
      expect(stats.currentStreak).toBe(0);
    });

    it("counts a streak across a month boundary", () => {
      const stats = computeStats(
        [won("2026-08-31", 2), won("2026-09-01", 2)],
        "2026-09-01",
      );
      expect(stats.currentStreak).toBe(2);
    });
  });

  describe("max streak", () => {
    it("finds the longest historical run", () => {
      const stats = computeStats(
        [
          won("2026-08-01", 2),
          won("2026-08-02", 2),
          won("2026-08-03", 2),
          lost("2026-08-04"),
          won("2026-08-05", 2),
        ],
        "2026-08-11",
      );

      expect(stats.maxStreak).toBe(3);
      expect(stats.currentStreak).toBe(0);
    });

    it("is at least as large as the current streak", () => {
      const stats = computeStats(
        [won("2026-08-10", 2), won("2026-08-11", 2)],
        "2026-08-11",
      );
      expect(stats.maxStreak).toBe(2);
      expect(stats.currentStreak).toBe(2);
    });

    it("does not join runs separated by an unplayed day", () => {
      const stats = computeStats(
        [won("2026-08-01", 2), won("2026-08-03", 2)],
        "2026-08-11",
      );
      expect(stats.maxStreak).toBe(1);
    });

    it("handles out-of-order input", () => {
      const stats = computeStats(
        [won("2026-08-03", 2), won("2026-08-01", 2), won("2026-08-02", 2)],
        "2026-08-03",
      );
      expect(stats.maxStreak).toBe(3);
    });
  });
});
