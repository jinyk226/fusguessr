"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { batchScheduleAction } from "@/app/actions/admin";

/**
 * Fills the next open calendar dates from the approved bank. Staging several
 * days at once is what keeps a missed admin session from stalling the game.
 */
export function BatchScheduleForm() {
  const router = useRouter();
  const [count, setCount] = React.useState(7);
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await batchScheduleAction(count);
      if (!result.ok) {
        toast.error(result.error ?? "Scheduling failed.");
        return;
      }
      toast.success("Approved puzzles staged onto the calendar.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm" htmlFor="batch-count">
        How many days to fill
      </label>
      <Input
        id="batch-count"
        type="number"
        min={1}
        max={30}
        value={count}
        onChange={(event) => setCount(Number(event.target.value))}
        disabled={pending}
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Scheduling..." : "Stage approved puzzles"}
      </Button>
      <p className="text-xs text-[var(--muted-foreground)]">
        Fills the earliest free dates from tomorrow onwards, skipping any that
        are already staged.
      </p>
    </form>
  );
}
