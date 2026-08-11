/**
 * America/Los_Angeles calendar helpers.
 *
 * Everything about the daily puzzle is anchored to LA local time, and the
 * production container runs in UTC. So no code anywhere may use
 * `new Date().getHours()` or a fixed UTC offset - a hardcoded -08:00 is wrong
 * for eight months of the year. All conversions go through Intl with an
 * explicit named time zone, which tracks DST for us.
 */

export const LA_TIME_ZONE = "America/Los_Angeles";

/** The daily puzzle flips over at 4am LA time. */
export const ROLLOVER_HOUR = 4;

/** A bare calendar date, "YYYY-MM-DD". */
export type LaDateString = string;

const laFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  // h23 keeps midnight as "00" rather than "24", which hour12:false does not
  // guarantee across ICU versions.
  hourCycle: "h23",
});

interface LaParts {
  year: string;
  month: string;
  day: string;
  hour: number;
}

function getLaParts(date: Date): LaParts {
  const parts = laFormatter.formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`Missing "${type}" when formatting LA time`);
    return part.value;
  };

  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
    hour: Number(valueOf("hour")),
  };
}

/** The LA calendar date for an instant, e.g. "2026-08-11". */
export function getLaDateString(date: Date = new Date()): LaDateString {
  const { year, month, day } = getLaParts(date);
  return `${year}-${month}-${day}`;
}

/** The LA wall-clock hour (0-23) for an instant. */
export function getLaHour(date: Date = new Date()): number {
  return getLaParts(date).hour;
}

/**
 * Whether the 4am LA rollover has already happened on the LA date that this
 * instant falls in. Between midnight and 3:59am the previous day's puzzle is
 * still the live one.
 */
export function isPastRolloverHour(date: Date = new Date()): boolean {
  return getLaHour(date) >= ROLLOVER_HOUR;
}

/** Shifts a bare calendar date by whole days. Safe across DST: no clocks involved. */
export function addDaysToLaDate(
  date: LaDateString,
  days: number,
): LaDateString {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);

  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    shifted.getUTCFullYear(),
    pad(shifted.getUTCMonth() + 1),
    pad(shifted.getUTCDate()),
  ].join("-");
}

/** Whole days from `from` to `to`, positive when `to` is later. */
export function daysBetweenLaDates(
  from: LaDateString,
  to: LaDateString,
): number {
  const toUtc = (date: LaDateString) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function isValidLaDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Renders an LA date for display, e.g. "Tue, Aug 11, 2026". */
export function formatLaDateForDisplay(date: LaDateString): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
