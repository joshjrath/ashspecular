/**
 * Getting the database ready, once per process, whichever half asks first
 * (start.ts for the bot and the schedule, startWeb for the board): the schema
 * migrated, then the API keys and limits set in Settings, then the channels
 * added or renamed there — before anything files, opens a batch or calls out.
 * Both keep themselves current afterwards (once a minute), so a second
 * process sees what the board saves.
 */
import { migrate } from "./migrate.js";
import { loadKeys, startKeySync } from "./keys.js";
import { loadChannelSettings, startChannelSync } from "./channelsettings.js";

let ready: Promise<void> | null = null;

export function prepareDatabase(): Promise<void> {
  ready ??= (async () => {
    await migrate();
    await loadKeys().catch((err) => console.error("[keys] load failed:", err));
    startKeySync();
    await loadChannelSettings().catch((err) => console.error("[channels] load failed:", err));
    startChannelSync();
  })();
  return ready;
}
