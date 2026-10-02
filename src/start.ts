/**
 * The production entrypoint: one process, both halves.
 *
 * Splitting the bot and the board into two services means two deploys, two
 * sets of variables and a way to get them out of step. For one studio's
 * traffic they fit in one process, so that is the default. `SERVICE=bot` or
 * `SERVICE=web` splits them later without touching the code.
 */
import { checkConfig, config, hasDatabase } from "./config.js";
import { guardProcess } from "./process.js";

const only = (process.env.SERVICE ?? "").trim().toLowerCase();

async function main(): Promise<void> {
  guardProcess();
  checkConfig();
  // The schema, the keys and the channels first, so the bot files under the
  // right names from its first message (startWeb finds this already done).
  if (hasDatabase) {
    const { prepareDatabase } = await import("./db/prepare.js");
    await prepareDatabase();
  }

  if (only !== "web") {
    // Importing boots the bot — it logs in as a side effect.
    await import("./bot/index.js");
  }

  // The batch opener belongs with whichever half is running, but only once.
  if (hasDatabase && only !== "web") {
    const { startSchedule } = await import("./jobs/schedule.js");
    startSchedule({ withDigest: only !== "web" });
  }

  if (only === "bot") return;

  if (!config.dashboardPassword) {
    console.log("[start] board is off — set DASHBOARD_PASSWORD to turn it on.");
    return;
  }

  const { startWeb } = await import("./web/server.js");
  await startWeb();
}

main().catch((err) => {
  console.error("[start] failed:", err);
  process.exit(1);
});
