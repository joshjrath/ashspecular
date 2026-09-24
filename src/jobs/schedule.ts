/**
 * The daily schedule.
 *
 * Batches open at the earliest opensAt in the catalog, in the studio's zone.
 * It also runs once at boot: a container that was asleep at 6am would
 * otherwise skip the day entirely, and the opener is idempotent so a boot run
 * on a day already opened does nothing.
 */
import cron from "node-cron";
import { ORG_TZ } from "../parse/derive.js";
import { openBatchesFor, recurringChannels } from "./batches.js";

function earliestOpensAt(): string {
  const times = recurringChannels()
    .map((c) => c.recurring?.opensAt)
    .filter((t): t is string => Boolean(t))
    .sort();
  return times[0] ?? "06:00";
}

async function run(reason: string): Promise<void> {
  try {
    const result = await openBatchesFor();
    if (result.opened) {
      console.log(`[batches] ${reason}: opened ${result.opened} for ${result.date}`);
    } else {
      console.log(`[batches] ${reason}: nothing to open for ${result.date}`);
    }
  } catch (err) {
    console.error("[batches] failed:", err);
  }
}

export function startSchedule(): void {
  const [hh, mm] = earliestOpensAt().split(":");
  const expression = `${Number(mm ?? 0)} ${Number(hh ?? 6)} * * *`;

  cron.schedule(expression, () => void run("scheduled"), { timezone: ORG_TZ });
  console.log(`[batches] opening daily at ${earliestOpensAt()} ${ORG_TZ}`);

  // Catch up now in case the last opening time passed while this was down.
  void run("startup");
}
