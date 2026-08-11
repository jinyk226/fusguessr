import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getLaDateString, isPastRolloverHour } from "@/lib/time/la-date";

/**
 * The daily 4am America/Los_Angeles puzzle rollover.
 *
 * Cloud Scheduler fires this with an explicit --time-zone, so it already
 * tracks DST. The hour check and the idempotency guard here are belt and
 * braces: Scheduler retries on any non-2xx response and can deliver twice, and
 * an admin may hit the endpoint manually at any hour.
 *
 * Every exit path is safe to repeat.
 */

export type RolloverOutcome =
  | "promoted"
  | "before-rollover-hour"
  | "already-rolled-over"
  | "nothing-scheduled";

export interface RolloverResult {
  outcome: RolloverOutcome;
  laDate: string;
  promotedFusionId?: string;
  archivedFusionId?: string;
}

export async function performRollover(
  now: Date = new Date(),
): Promise<RolloverResult> {
  const laDate = getLaDateString(now);

  // Between midnight and 3:59am LA the previous day's puzzle is still current.
  if (!isPastRolloverHour(now)) {
    return { outcome: "before-rollover-hour", laDate };
  }

  // Any fusion already carrying today's liveDate means the rollover ran.
  // Checking liveDate rather than status also matches the DB's unique
  // constraint, so a same-day retry can never collide on it.
  const alreadyRolled = await prisma.fusion.findFirst({
    where: { liveDate: laDate },
    select: { id: true },
  });

  if (alreadyRolled) {
    return { outcome: "already-rolled-over", laDate, promotedFusionId: alreadyRolled.id };
  }

  const scheduled = await prisma.fusion.findFirst({
    where: { status: "SCHEDULED", scheduledForDate: laDate },
  });

  if (!scheduled) {
    // Deliberately do NOT blank the homepage. Yesterday's puzzle stays live and
    // the admin dashboard surfaces this log line as a warning banner.
    const alreadyLogged = await prisma.rolloverLog.findFirst({
      where: { laDate, toFusionId: null },
      select: { id: true },
    });

    if (!alreadyLogged) {
      await prisma.rolloverLog.create({
        data: {
          laDate,
          note: `No fusion was scheduled for ${laDate}. The previous puzzle stayed live.`,
        },
      });
    }

    return { outcome: "nothing-scheduled", laDate };
  }

  const currentLive = await prisma.fusion.findFirst({
    where: { status: "LIVE" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    if (currentLive) {
      await tx.fusion.update({
        where: { id: currentLive.id },
        data: { status: "ARCHIVED" },
      });
    }

    await tx.fusion.update({
      where: { id: scheduled.id },
      data: { status: "LIVE", liveDate: laDate, scheduledForDate: null },
    });

    await tx.rolloverLog.create({
      data: {
        laDate,
        fromFusionId: currentLive?.id ?? null,
        toFusionId: scheduled.id,
        note: `Promoted fusion ${scheduled.id} for ${laDate}.`,
      },
    });
  });

  return {
    outcome: "promoted",
    laDate,
    promotedFusionId: scheduled.id,
    archivedFusionId: currentLive?.id,
  };
}

/** Warning for the admin dashboard when a day went unstaged. */
export async function getMissedRolloverWarning(): Promise<string | null> {
  const log = await prisma.rolloverLog.findFirst({
    where: { toFusionId: null },
    orderBy: { ranAt: "desc" },
  });

  if (!log) return null;

  // Only warn while it is still today's problem.
  return log.laDate === getLaDateString() ? log.note : null;
}
