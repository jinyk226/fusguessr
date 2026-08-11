/**
 * Local development helper: generates a fusion and puts it live immediately,
 * plus one staged for tomorrow so the admin QA flow has something to open.
 *
 * Bypasses the 4am rollover so you do not have to wait for (or fake) a cron
 * run to see the game working. Development only.
 *
 *   npm run dev:puzzle
 */

import { PrismaClient } from "@prisma/client";

import { createFusion } from "../lib/game/fusion-service";
import { addDaysToLaDate, getLaDateString } from "../lib/time/la-date";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("dev-seed-puzzle is not for production use");
  }

  const pokemonCount = await prisma.pokemon.count();
  if (pokemonCount === 0) {
    throw new Error('No Pokemon seeded. Run "npm run db:seed" first.');
  }

  const today = getLaDateString();
  const tomorrow = addDaysToLaDate(today, 1);

  const existingLive = await prisma.fusion.findFirst({ where: { status: "LIVE" } });
  if (existingLive) {
    console.log(`A puzzle is already live (${existingLive.id}). Nothing to do.`);
  } else {
    const live = await createFusion({ createdByAdminId: "dev-script" });
    await prisma.fusion.update({
      where: { id: live.id },
      data: { status: "LIVE", liveDate: today },
    });
    console.log(`Live puzzle for ${today}: ${live.id}`);
  }

  const existingScheduled = await prisma.fusion.findFirst({
    where: { status: "SCHEDULED", scheduledForDate: tomorrow },
  });
  if (existingScheduled) {
    console.log(`Tomorrow is already staged (${existingScheduled.id}).`);
  } else {
    const staged = await createFusion({ createdByAdminId: "dev-script" });
    await prisma.fusion.update({
      where: { id: staged.id },
      data: { status: "SCHEDULED", scheduledForDate: tomorrow },
    });
    console.log(`Staged for ${tomorrow}: ${staged.id}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
