/**
 * The daily schedule.
 *
 * Batches open at the earliest opensAt in the catalog, in the studio's zone.
 * It also runs once at boot: a container that was asleep at 6am would
 * otherwise skip the day entirely, and the opener is idempotent so a boot run
 * on a day already opened does nothing.
 */
import cron from "node-cron";
import { config } from "../config.js";
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

/**
 * The morning digest. Skipped entirely when no channel is configured, so the
 * board can run without the bot and vice versa.
 */
function scheduleDigest(): void {
  if (!config.digestChannelId) {
    console.log("[digest] off — set DIGEST_CHANNEL_ID to turn it on");
    return;
  }
  if (!cron.validate(config.digestCron)) {
    console.error(`[digest] DIGEST_CRON is not a cron expression: ${config.digestCron}`);
    return;
  }

  cron.schedule(
    config.digestCron,
    () => {
      void (async () => {
        try {
          const { client } = await import("../bot/client.js");
          const channel = await client.channels.fetch(config.digestChannelId);
          if (!channel?.isSendable()) {
            console.error("[digest] channel is not one the bot can post in");
            return;
          }
          const posted = await (await import("./digest.js")).postDigest(channel);
          console.log(posted ? "[digest] posted" : "[digest] already went out today");
        } catch (err) {
          console.error("[digest] failed:", err);
        }
      })();
    },
    { timezone: ORG_TZ },
  );
  console.log(`[digest] ${config.digestCron} ${ORG_TZ} → channel ${config.digestChannelId}`);
}

export function startSchedule(options: { withDigest: boolean }): void {
  const [hh, mm] = earliestOpensAt().split(":");
  const expression = `${Number(mm ?? 0)} ${Number(hh ?? 6)} * * *`;

  cron.schedule(expression, () => void run("scheduled"), { timezone: ORG_TZ });
  console.log(`[batches] opening daily at ${earliestOpensAt()} ${ORG_TZ}`);

  // Catch up now in case the last opening time passed while this was down.
  void run("startup");

  // Only the half that holds a Discord connection can post the digest.
  if (options.withDigest) scheduleDigest();
}
