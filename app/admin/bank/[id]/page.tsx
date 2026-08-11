import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/admin";
import { addDaysToLaDate, formatLaDateForDisplay, getLaDateString } from "@/lib/time/la-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName } from "@/components/game/pokemon-combobox";
import { FusionDetailActions } from "@/components/admin/fusion-detail-actions";

export const dynamic = "force-dynamic";

export default async function FusionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();

  const fusion = await prisma.fusion.findUnique({
    where: { id },
    include: {
      pokemonA: true,
      pokemonB: true,
      generations: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!fusion) notFound();

  const previewAttempt = user
    ? await prisma.attempt.findUnique({
        where: { userId_fusionId: { userId: user.id, fusionId: fusion.id } },
        select: { id: true },
      })
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {displayName(fusion.pokemonA.name)} +{" "}
            {displayName(fusion.pokemonB.name)}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            #{fusion.pokemonAId} + #{fusion.pokemonBId} - version{" "}
            {fusion.version}
            {fusion.scheduledForDate
              ? ` - staged for ${formatLaDateForDisplay(fusion.scheduledForDate)}`
              : ""}
          </p>
        </div>
        <Badge>{fusion.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">What players see</CardTitle>
          </CardHeader>
          <CardContent>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fusion.imageUrl}
              alt="Post-processed fusion sprite"
              className="pixelated w-full rounded-lg border border-[var(--border)]"
            />
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Zoom starts at {Math.round(fusion.focalX)}%,{" "}
              {Math.round(fusion.focalY)}%.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Raw model output</CardTitle>
          </CardHeader>
          <CardContent>
            {fusion.rawImageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fusion.rawImageUrl}
                  alt="Raw Vertex AI output before pixelation"
                  className="w-full rounded-lg border border-[var(--border)]"
                />
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Before the pixelation pipeline. Useful for telling a bad
                  generation apart from a bad post-process.
                </p>
              </>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                No raw image stored for this version.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {fusion.status === "SCHEDULED" && (
        <Button asChild variant="secondary" className="w-fit">
          <Link href={`/admin/qa/${fusion.id}`}>
            {previewAttempt ? "Continue QA play" : "QA play this puzzle"}
          </Link>
        </Button>
      )}

      <FusionDetailActions
        fusionId={fusion.id}
        status={fusion.status}
        name={fusion.name}
        extraPrompt={fusion.extraPrompt}
        scheduledForDate={fusion.scheduledForDate}
        minScheduleDate={addDaysToLaDate(getLaDateString(), 1)}
        hasPreviewAttempt={Boolean(previewAttempt)}
      />

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Generation history</h3>
        <ul className="flex flex-col gap-2 text-xs">
          {fusion.generations.map((generation) => (
            <li
              key={generation.id}
              className="rounded border border-[var(--border)] p-2"
            >
              <p className="text-[var(--muted-foreground)]">
                {generation.createdAt.toISOString()}
              </p>
              <p className="mt-1">{generation.promptFull}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
