import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { getMissedRolloverWarning } from "@/lib/game/rollover";
import { listScheduledDates } from "@/lib/game/attempt";
import {
  addDaysToLaDate,
  formatLaDateForDisplay,
  getLaDateString,
} from "@/lib/time/la-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName } from "@/components/game/pokemon-combobox";

export const dynamic = "force-dynamic";

/** How far ahead the QA calendar looks. */
const CALENDAR_DAYS = 21;

export default async function AdminDashboard() {
  const today = getLaDateString();

  const [live, scheduled, warning, draftCount, approvedCount] = await Promise.all([
    prisma.fusion.findFirst({
      where: { status: "LIVE" },
      include: { pokemonA: true, pokemonB: true },
    }),
    listScheduledDates(),
    getMissedRolloverWarning(),
    prisma.fusion.count({ where: { status: "DRAFT" } }),
    prisma.fusion.count({ where: { status: "APPROVED" } }),
  ]);

  const scheduledByDate = new Map(scheduled.map((s) => [s.date, s.fusionId]));
  const calendarDays = Array.from({ length: CALENDAR_DAYS }, (_, offset) =>
    addDaysToLaDate(today, offset + 1),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Admin dashboard</h1>

      {warning && (
        <div className="rounded-md border border-[var(--destructive)] bg-[var(--destructive)]/10 px-4 py-3 text-sm">
          <strong>No puzzle was staged for today.</strong> {warning} Schedule
          one from the bank so tomorrow doesn&apos;t repeat this.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Live now</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {live ? (
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {displayName(live.pokemonA.name)} +{" "}
                  {displayName(live.pokemonB.name)}
                </span>
                <span className="text-[var(--muted-foreground)]">
                  Live since {formatLaDateForDisplay(live.liveDate ?? today)}
                </span>
              </div>
            ) : (
              <span className="text-[var(--muted-foreground)]">
                Nothing live yet.
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bank</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span>{draftCount} awaiting review</span>
            <span>{approvedCount} approved, ready to schedule</span>
            <span>{scheduled.length} staged on the calendar</span>
            <Button asChild size="sm" variant="outline" className="mt-2 w-fit">
              <Link href="/admin/bank">Open the bank</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold">QA calendar</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Pick any staged date to play it early and check it&apos;s solvable.
            All dates are America/Los_Angeles.
          </p>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {calendarDays.map((date) => {
            const fusionId = scheduledByDate.get(date);
            return (
              <li key={date}>
                {fusionId ? (
                  <Link
                    href={`/admin/qa/${fusionId}`}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)]"
                  >
                    <span>{formatLaDateForDisplay(date)}</span>
                    <Badge>Staged - QA play</Badge>
                  </Link>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)]">
                    <span>{formatLaDateForDisplay(date)}</span>
                    <Badge variant="outline">Empty</Badge>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
