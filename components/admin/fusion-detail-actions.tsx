"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  approveFusionAction,
  regenerateFusionAction,
  rerollFocalPointAction,
  scheduleFusionAction,
  setFusionNameAction,
  unscheduleFusionAction,
  type ActionResult,
} from "@/app/actions/admin";

interface Props {
  fusionId: string;
  status: string;
  name: string | null;
  extraPrompt: string | null;
  scheduledForDate: string | null;
  /** Earliest date a puzzle may be staged for: tomorrow. */
  minScheduleDate: string;
  hasPreviewAttempt: boolean;
}

export function FusionDetailActions({
  fusionId,
  status,
  name,
  extraPrompt,
  scheduledForDate,
  minScheduleDate,
  hasPreviewAttempt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [prompt, setPrompt] = React.useState(extraPrompt ?? "");
  const [displayNameValue, setDisplayNameValue] = React.useState(name ?? "");
  const [date, setDate] = React.useState(scheduledForDate ?? minScheduleDate);

  const isEditable = ["DRAFT", "APPROVED", "SCHEDULED"].includes(status);

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.");
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  if (!isEditable) {
    return (
      <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 text-sm">
        This puzzle is {status.toLowerCase()} and can no longer be edited.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Prompt and artwork</h3>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Extra prompt, appended to the base template"
          disabled={pending}
        />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="secondary" disabled={pending}>
              Regenerate image
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate this fusion?</AlertDialogTitle>
              <AlertDialogDescription>
                This calls Vertex AI again and costs quota. Generation is not
                seed-stable, so you get a brand new image rather than a tweak of
                this one - there is no going back to the current artwork.
                {hasPreviewAttempt &&
                  " Your QA play of this puzzle will also be discarded, since it was made against the old image."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  run(
                    () => regenerateFusionAction(fusionId, prompt),
                    "Regenerated.",
                  )
                }
              >
                Regenerate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => rerollFocalPointAction(fusionId), "New zoom origin picked.")
          }
        >
          Re-randomise zoom location
        </Button>
        <p className="text-xs text-[var(--muted-foreground)]">
          Moves where the puzzle starts zoomed in, without regenerating the
          artwork. Also clears your QA play, since the crop changes.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Name (optional)</h3>
        <div className="flex gap-2">
          <Input
            value={displayNameValue}
            onChange={(event) => setDisplayNameValue(event.target.value)}
            placeholder="Leave blank - naming is optional"
            disabled={pending}
          />
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => setFusionNameAction(fusionId, displayNameValue),
                "Name saved.",
              )
            }
          >
            Save
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Scheduling</h3>

        {status === "DRAFT" && (
          <Button
            disabled={pending}
            onClick={() =>
              run(() => approveFusionAction(fusionId), "Approved.")
            }
          >
            Approve
          </Button>
        )}

        {status === "APPROVED" && (
          <div className="flex gap-2">
            <Input
              type="date"
              value={date}
              min={minScheduleDate}
              onChange={(event) => setDate(event.target.value)}
              disabled={pending}
            />
            <Button
              disabled={pending}
              onClick={() =>
                run(() => scheduleFusionAction(fusionId, date), "Staged.")
              }
            >
              Stage
            </Button>
          </div>
        )}

        {status === "SCHEDULED" && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => unscheduleFusionAction(fusionId),
                "Pulled off the calendar.",
              )
            }
          >
            Unstage
          </Button>
        )}
      </section>
    </div>
  );
}
