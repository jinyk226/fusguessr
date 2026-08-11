"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateFusionAction } from "@/app/actions/admin";

/**
 * Draws a random unused pair and generates artwork for it. The extra prompt is
 * appended to the base template rather than replacing it.
 */
export function GenerateFusionForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await generateFusionAction(formData);
      if (!result.ok) {
        toast.error(result.error ?? "Generation failed.");
        return;
      }
      toast.success("Fusion generated.");
      if (result.fusionId) router.push(`/admin/bank/${result.fusionId}`);
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3">
      <Textarea
        name="extraPrompt"
        placeholder="Optional extra prompt, appended to the base template (e.g. 'give it feathered wings')"
        disabled={pending}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Generating..." : "Generate from a random pair"}
      </Button>
      <p className="text-xs text-[var(--muted-foreground)]">
        The pair is drawn at random from any two Pokemon that have never been
        fused before.
      </p>
    </form>
  );
}
