"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin, NotAuthorizedError, UnauthenticatedError } from "@/lib/auth/admin";
import {
  approveFusion,
  batchScheduleApproved,
  createFusion,
  regenerateFusionImage,
  rerollFocalPoint,
  scheduleFusion,
  setFusionName,
  unscheduleFusion,
} from "@/lib/game/fusion-service";
import { isValidLaDateString } from "@/lib/time/la-date";

/**
 * Admin Server Actions.
 *
 * Every one of these calls requireAdmin() in its own body. The /admin layout
 * and proxy both gate the routes, but Server Actions are individually
 * addressable endpoints - a layout guard does not protect them, so the check
 * cannot live only there.
 */

export interface ActionResult {
  ok: boolean;
  error?: string;
  fusionId?: string;
}

/** Wraps an admin operation with the authorisation check and error shaping. */
async function withAdmin(
  operation: (adminId: string) => Promise<string | void>,
): Promise<ActionResult> {
  let adminId: string;
  try {
    adminId = (await requireAdmin()).id;
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "Sign in first." };
    }
    if (error instanceof NotAuthorizedError) {
      return { ok: false, error: "Admins only." };
    }
    throw error;
  }

  try {
    const fusionId = await operation(adminId);
    revalidatePath("/admin");
    revalidatePath("/admin/bank");
    revalidatePath("/");
    return { ok: true, fusionId: fusionId ?? undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Something went wrong.",
    };
  }
}

const extraPromptSchema = z.string().max(2000).optional();

export async function generateFusionAction(
  formData: FormData,
): Promise<ActionResult> {
  const extraPrompt = extraPromptSchema.parse(
    (formData.get("extraPrompt") as string | null) ?? undefined,
  );

  return withAdmin(async (adminId) => {
    const fusion = await createFusion({
      createdByAdminId: adminId,
      extraPrompt,
    });
    return fusion.id;
  });
}

export async function approveFusionAction(fusionId: string): Promise<ActionResult> {
  return withAdmin(async () => {
    await approveFusion(fusionId);
  });
}

export async function regenerateFusionAction(
  fusionId: string,
  extraPrompt?: string,
): Promise<ActionResult> {
  return withAdmin(async () => {
    await regenerateFusionImage({ fusionId, extraPrompt });
  });
}

export async function rerollFocalPointAction(
  fusionId: string,
): Promise<ActionResult> {
  return withAdmin(async () => {
    await rerollFocalPoint(fusionId);
  });
}

export async function scheduleFusionAction(
  fusionId: string,
  date: string,
): Promise<ActionResult> {
  if (!isValidLaDateString(date)) {
    return { ok: false, error: "That isn't a valid date." };
  }

  return withAdmin(async () => {
    await scheduleFusion(fusionId, date);
  });
}

export async function unscheduleFusionAction(
  fusionId: string,
): Promise<ActionResult> {
  return withAdmin(async () => {
    await unscheduleFusion(fusionId);
  });
}

export async function batchScheduleAction(count: number): Promise<ActionResult> {
  const safeCount = Math.max(1, Math.min(30, Math.floor(count)));
  return withAdmin(async () => {
    await batchScheduleApproved(safeCount);
  });
}

export async function setFusionNameAction(
  fusionId: string,
  name: string,
): Promise<ActionResult> {
  return withAdmin(async () => {
    await setFusionName(fusionId, name);
  });
}
