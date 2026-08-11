import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/admin";
import { computeStats, type StatsAttempt } from "@/lib/game/stats";
import { formatLaDateForDisplay, getLaDateString } from "@/lib/time/la-date";
import { MAX_GUESSES } from "@/lib/game/zoom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] p-3">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-center text-xs text-[var(--muted-foreground)]">
        {label}
      </span>
    </div>
  );
}

export default async function ResultsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  // Admin QA plays are excluded so previewing a puzzle a day early never
  // inflates or dents the admin's own record.
  const attempts = await prisma.attempt.findMany({
    where: { userId: user.id, isAdminPreview: false },
    orderBy: { date: "desc" },
    select: { date: true, status: true, guessesUsed: true, fusionId: true },
  });

  const stats = computeStats(attempts as StatsAttempt[], getLaDateString());
  const maxInDistribution = Math.max(1, ...stats.guessDistribution);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Your stats</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Played" value={stats.played} />
        <StatTile label="Win %" value={stats.winPercentage} />
        <StatTile label="Current streak" value={stats.currentStreak} />
        <StatTile label="Max streak" value={stats.maxStreak} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <h2 className="text-sm font-semibold">Guess distribution</h2>
          {stats.guessDistribution.map((count, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <span className="w-4 tabular-nums text-[var(--muted-foreground)]">
                {index + 1}
              </span>
              <div className="flex-1">
                <div
                  className="flex h-6 min-w-6 items-center justify-end rounded bg-[var(--hint-correct)] px-2 text-xs font-medium text-white transition-all"
                  style={{ width: `${(count / maxInDistribution) * 100}%` }}
                >
                  {count}
                </div>
              </div>
            </div>
          ))}
          {stats.played === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Play your first puzzle to start building a history.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">History</h2>
        {attempts.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nothing here yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((attempt) => (
              <li key={attempt.fusionId}>
                <Link
                  href={`/day/${attempt.date}`}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3 text-sm hover:bg-[var(--accent)]"
                >
                  <span>{formatLaDateForDisplay(attempt.date)}</span>
                  <Badge
                    variant={
                      attempt.status === "WON"
                        ? "default"
                        : attempt.status === "LOST"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {attempt.status === "WON"
                      ? `${attempt.guessesUsed}/${MAX_GUESSES}`
                      : attempt.status === "LOST"
                        ? `X/${MAX_GUESSES}`
                        : "In progress"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
