import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DisplayName } from "@/components/game/pokemon-combobox";
import { GenerateFusionForm } from "@/components/admin/generate-fusion-form";
import { BatchScheduleForm } from "@/components/admin/batch-schedule-form";
import { formatLaDateForDisplay } from "@/lib/time/la-date";

export const dynamic = "force-dynamic";

export default async function BankPage() {
  const fusions = await prisma.fusion.findMany({
    where: { status: { in: ["DRAFT", "APPROVED", "SCHEDULED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { pokemonA: true, pokemonB: true },
    take: 60,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Fusion bank</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Generate a new fusion</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateFusionForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stage approved puzzles</CardTitle>
          </CardHeader>
          <CardContent>
            <BatchScheduleForm />
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">In the bank</h2>

        {fusions.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nothing yet. Generate one above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fusions.map((fusion) => (
              <li key={fusion.id}>
                <Link
                  href={`/admin/bank/${fusion.id}`}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-3 text-sm hover:bg-[var(--accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fusion.imageUrl}
                    alt=""
                    className="pixelated size-12 rounded border border-[var(--border)]"
                  />
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">
                      {<DisplayName name={fusion.pokemonA.name} />} +{" "}
                      {<DisplayName name={fusion.pokemonB.name} />}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {fusion.name ? `"${fusion.name}" - ` : ""}v{fusion.version}
                      {fusion.scheduledForDate
                        ? ` - ${formatLaDateForDisplay(fusion.scheduledForDate)}`
                        : ""}
                    </span>
                  </span>
                  <Badge
                    variant={
                      fusion.status === "SCHEDULED"
                        ? "default"
                        : fusion.status === "APPROVED"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {fusion.status}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
