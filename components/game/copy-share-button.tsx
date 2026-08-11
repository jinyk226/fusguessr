"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyShareButton({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard.");
    } catch {
      toast.error("Couldn't copy - your browser blocked clipboard access.");
    }
  }

  return (
    <Button variant="outline" onClick={copy}>
      Copy result
    </Button>
  );
}
