/**
 * The daily schedule.
 *
 * Batches open at each channel's opensAt in the catalog, in the studio's zone:
 * the Shorts channels at 6 AM on their 3 AM day, Specular's daily long-form
 * batch just after midnight on the calendar day.
 * It also runs once at boot: a container that was asleep at 6am would
 * otherwise skip the day entirely, and the opener is idempotent so a boot run
 * on a day already opened does nothing.
 */
import cron from "node-cron";
import { config } from "../config.js";
import { ORG_TZ } from "../parse/derive.js";
import { openBatchesFor, recurringChannels } from "./batches.js";

/** Every distinct opening time in the catalog: Shorts at 6 AM, Specular just after midnight. */
function openingTimes(): string[] {
  return [...new Set(recurringChannels().map((c) => c.recurring?.opensAt ?? "06:00"))].sort();
}

async function run(reason: string, opensAt?: string): Promise<void> {
  try {
    // Each channel opens its own today (see batchDay): at 00:05 that's the
    // new calendar day for Specular, at 6 AM the new Shorts day.
    const result = await openBatchesFor(undefined, (c) => !opensAt || (c.recurring?.opensAt ?? "06:00") === opensAt);
    if (result.opened) {
      console.log(`[batches] ${reason}: opened ${result.opened}`);
    } else {
      console.log(`[batches] ${reason}: nothing to open`);
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

/**
 * The overdue nudge, into the same channel as the digest. Hourly by default,
 * but it only ever speaks about records it has not spoken about before.
 */
function scheduleNudge(): void {
  if (!config.digestChannelId || !config.nudgeCron) return;
  if (!cron.validate(config.nudgeCron)) {
    console.error(`[nudge] NUDGE_CRON is not a cron expression: ${config.nudgeCron}`);
    return;
  }

  cron.schedule(
    config.nudgeCron,
    () => {
      void (async () => {
        try {
          const { client } = await import("../bot/client.js");
          const channel = await client.channels.fetch(config.digestChannelId);
          if (!channel?.isSendable()) return;
          const n = await (await import("./nudge.js")).postNudge(channel);
          if (n) console.log(`[nudge] flagged ${n}`);
        } catch (err) {
          console.error("[nudge] failed:", err);
        }
      })();
    },
    { timezone: ORG_TZ },
  );
  console.log(`[nudge] ${config.nudgeCron} ${ORG_TZ}`);
}

export function startSchedule(options: { withDigest: boolean }): void {
  for (const time of openingTimes()) {
    const [hh, mm] = time.split(":");
    cron.schedule(`${Number(mm ?? 0)} ${Number(hh ?? 6)} * * *`, () => void run("scheduled", time), { timezone: ORG_TZ });
  }
  console.log(`[batches] opening daily at ${openingTimes().join(" and ")} ${ORG_TZ}`);

  // Catch up now in case an opening time passed while this was down.
  void run("startup");

  // Only the half that holds a Discord connection can post the digest.
  if (options.withDigest) {
    scheduleDigest();
    scheduleNudge();
  }
}
