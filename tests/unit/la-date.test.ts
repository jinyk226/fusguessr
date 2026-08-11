import {
  addDaysToLaDate,
  daysBetweenLaDates,
  formatLaDateForDisplay,
  getLaDateString,
  getLaHour,
  isPastRolloverHour,
  isValidLaDateString,
} from "@/lib/time/la-date";

/**
 * The container runs in UTC and the rollover is defined in LA local time, so
 * these cases pin the two DST transitions where a fixed UTC offset would give
 * the wrong answer.
 *
 * During PDT (summer) LA is UTC-7, so 4am LA is 11:00 UTC.
 * During PST (winter) LA is UTC-8, so 4am LA is 12:00 UTC.
 */
describe("getLaDateString", () => {
  it("uses the LA calendar date, not the UTC one", () => {
    // 06:30 UTC on Aug 12 is still 23:30 on Aug 11 in LA.
    expect(getLaDateString(new Date("2026-08-12T06:30:00Z"))).toBe("2026-08-11");
  });

  it("rolls to the next LA date after LA midnight", () => {
    // 07:30 UTC on Aug 12 is 00:30 Aug 12 in LA.
    expect(getLaDateString(new Date("2026-08-12T07:30:00Z"))).toBe("2026-08-12");
  });
});

describe("isPastRolloverHour", () => {
  it("is false just before 4am during PDT", () => {
    // 10:59 UTC = 03:59 PDT.
    expect(getLaHour(new Date("2026-08-11T10:59:00Z"))).toBe(3);
    expect(isPastRolloverHour(new Date("2026-08-11T10:59:00Z"))).toBe(false);
  });

  it("is true at 4am during PDT", () => {
    // 11:00 UTC = 04:00 PDT.
    expect(getLaHour(new Date("2026-08-11T11:00:00Z"))).toBe(4);
    expect(isPastRolloverHour(new Date("2026-08-11T11:00:00Z"))).toBe(true);
  });

  it("is false just before 4am during PST", () => {
    // 11:59 UTC = 03:59 PST. A fixed -07:00 offset would wrongly call this 4am.
    expect(getLaHour(new Date("2026-01-15T11:59:00Z"))).toBe(3);
    expect(isPastRolloverHour(new Date("2026-01-15T11:59:00Z"))).toBe(false);
  });

  it("is true at 4am during PST", () => {
    // 12:00 UTC = 04:00 PST.
    expect(getLaHour(new Date("2026-01-15T12:00:00Z"))).toBe(4);
    expect(isPastRolloverHour(new Date("2026-01-15T12:00:00Z"))).toBe(true);
  });

  it("handles the spring-forward transition", () => {
    // DST starts 2026-03-08. At 11:00 UTC that day LA is already PDT (04:00).
    expect(getLaHour(new Date("2026-03-08T11:00:00Z"))).toBe(4);
    expect(isPastRolloverHour(new Date("2026-03-08T11:00:00Z"))).toBe(true);
    // The day before, 11:00 UTC was still PST (03:00) - not yet rollover.
    expect(getLaHour(new Date("2026-03-07T11:00:00Z"))).toBe(3);
    expect(isPastRolloverHour(new Date("2026-03-07T11:00:00Z"))).toBe(false);
  });

  it("handles the fall-back transition", () => {
    // DST ends 2026-11-01. At 12:00 UTC that day LA is back on PST (04:00).
    expect(getLaHour(new Date("2026-11-01T12:00:00Z"))).toBe(4);
    expect(isPastRolloverHour(new Date("2026-11-01T12:00:00Z"))).toBe(true);
    // The day before, 12:00 UTC was PDT (05:00) - already past rollover too.
    expect(getLaHour(new Date("2026-10-31T12:00:00Z"))).toBe(5);
  });

  it("reports midnight as hour 0, not 24", () => {
    // 08:00 UTC on Aug 11 = 01:00 PDT; 07:00 UTC = 00:00 PDT.
    expect(getLaHour(new Date("2026-08-11T07:00:00Z"))).toBe(0);
  });
});

describe("addDaysToLaDate", () => {
  it("moves forward and backward", () => {
    expect(addDaysToLaDate("2026-08-11", 1)).toBe("2026-08-12");
    expect(addDaysToLaDate("2026-08-11", -1)).toBe("2026-08-10");
  });

  it("crosses month and year boundaries", () => {
    expect(addDaysToLaDate("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysToLaDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToLaDate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles leap days", () => {
    expect(addDaysToLaDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToLaDate("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("does not drift across a DST transition", () => {
    // Pure calendar arithmetic, so the 23-hour spring-forward day is still
    // exactly one day.
    expect(addDaysToLaDate("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysToLaDate("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("daysBetweenLaDates", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetweenLaDates("2026-08-11", "2026-08-14")).toBe(3);
    expect(daysBetweenLaDates("2026-08-14", "2026-08-11")).toBe(-3);
    expect(daysBetweenLaDates("2026-08-11", "2026-08-11")).toBe(0);
  });

  it("is unaffected by DST transitions", () => {
    expect(daysBetweenLaDates("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetweenLaDates("2026-10-31", "2026-11-02")).toBe(2);
  });
});

describe("isValidLaDateString", () => {
  it("accepts well-formed dates", () => {
    expect(isValidLaDateString("2026-08-11")).toBe(true);
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidLaDateString("2026-8-11")).toBe(false);
    expect(isValidLaDateString("not-a-date")).toBe(false);
    expect(isValidLaDateString("2026-02-30")).toBe(false);
    expect(isValidLaDateString("2026-13-01")).toBe(false);
  });
});

describe("formatLaDateForDisplay", () => {
  it("renders the calendar date without shifting it", () => {
    expect(formatLaDateForDisplay("2026-08-11")).toBe("Tue, Aug 11, 2026");
  });
});
