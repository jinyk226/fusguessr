import { NextResponse } from "next/server";

import { performRollover } from "@/lib/game/rollover";

/**
 * Daily puzzle rollover, invoked by Cloud Scheduler at 4am America/Los_Angeles.
 *
 * Cloud Scheduler presents an OIDC identity and Cloud Run verifies it before
 * the request reaches this handler; the shared secret below is a second,
 * independent check so the endpoint is not reliant on IAM alone being
 * configured correctly.
 *
 * Safe to call repeatedly - performRollover() is idempotent, and Cloud
 * Scheduler retries on any non-2xx response.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await performRollover();
  return NextResponse.json(result);
}
