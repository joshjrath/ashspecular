/**
 * Settings read once at start, with honest defaults. Nothing here throws
 * unless the thing it configures is actually being used.
 *
 * Not everything lives here, on purpose:
 *   - API keys (ANTHROPIC_API_KEY, YOUTUBE_API_KEY, TUMBLR_API_KEY) and the
 *     Story Lab cap are read when used, because Settings can change them
 *     while the board runs (db/keys.ts).
 *   - The date rules (ORG_TZ, TEAM_TZ, VO_BUFFER_DAYS, DEADLINE_TIME,
 *     REVIEW_HOURS) live with the code that uses them, parse/derive.ts.
 *   - Which Claude model each feature uses: modelFor() in ai/claude.ts.
 * Every variable, what it does and where it's read: ARCHITECTURE.md.
 */
function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

/**
 * A site's address as people paste it: Railway's copy button leaves off
 * "https://", and a pasted link may carry quotes, a path or ?k=. Returns
 * just the origin, or "" when there's nothing usable.
 */
export function siteAddress(raw: string): string {
  let s = raw.trim().replace(/^["'<]+|["'>]+$/g, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  try {
    return new URL(s).origin;
  } catch {
    return "";
  }
}

const ids = (raw: string) => raw.split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  discordToken: opt("DISCORD_TOKEN"),
  /** Channels the bot files from. Empty: every channel it can see, except the tasks channel. */
  intakeChannelIds: ids(opt("INTAKE_CHANNEL_IDS")),
  /** The to-do channel(s). Empty: any channel named #tasks (or to-do). */
  tasksChannelIds: ids(opt("TASKS_CHANNEL_IDS")),

  /** Where the morning digest is posted. Unset means no digest. */
  digestChannelId: opt("DIGEST_CHANNEL_ID"),
  /** Cron for the digest, in the studio's zone. Default 08:00 every day. */
  digestCron: opt("DIGEST_CRON", "0 8 * * *"),
  /** How many Stories priorities the digest names. */
  digestCount: Number(opt("DIGEST_COUNT", "4")),

  /** Hourly check for anything newly past its deadline. Off when empty. */
  nudgeCron: opt("NUDGE_CRON", "5 * * * *"),

  /** Unset means the bot parses and replies but stores nothing. */
  databaseUrl: opt("DATABASE_URL"),

  /** Another board to show under a Scripts tab — the scriptwriter's. Unset hides the tab. */
  scriptsUrl: siteAddress(opt("SCRIPTS_URL")),
  /** Kept so the Scripts tab can say what it couldn't read. */
  scriptsUrlRaw: opt("SCRIPTS_URL"),
  /** His board's view-only password (his SCRIPTCHECK_VIEW_TOKEN), to read its data. */
  scriptsToken: opt("SCRIPTS_TOKEN"),

  port: Number(opt("PORT", "8080")),
  publicUrl: opt("PUBLIC_URL").replace(/\/+$/, ""),
  dashboardPassword: opt("DASHBOARD_PASSWORD"),
  sessionSecret: opt("SESSION_SECRET") || opt("DASHBOARD_PASSWORD"),
} as const;

export const hasDatabase = Boolean(config.databaseUrl);

/**
 * What's wrong with the environment, before anything runs on it: `fatal`
 * stops the process with a plain message (a misspelt time zone would
 * otherwise fail on every page), `warnings` are only said.
 */
export function configProblems(env: NodeJS.ProcessEnv = process.env): { fatal: string[]; warnings: string[] } {
  const fatal: string[] = [];
  const warnings: string[] = [];
  const set = (name: string) => env[name]?.trim() ?? "";
  for (const zone of ["ORG_TZ", "TEAM_TZ"]) {
    if (!set(zone)) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: set(zone) });
    } catch {
      fatal.push(`${zone}="${set(zone)}" isn't a time zone. Use an IANA name such as America/New_York.`);
    }
  }
  for (const name of ["PORT", "VO_BUFFER_DAYS", "REVIEW_HOURS", "DIGEST_COUNT"]) {
    if (set(name) && !Number.isFinite(Number(set(name)))) fatal.push(`${name}="${set(name)}" isn't a number.`);
  }
  if (set("DEADLINE_TIME") && !/^([01]\d|2[0-3]):[0-5]\d$/.test(set("DEADLINE_TIME"))) fatal.push(`DEADLINE_TIME="${set("DEADLINE_TIME")}" isn't a 24-hour time like 23:59.`);
  if (set("SERVICE") && !["bot", "web"].includes(set("SERVICE").toLowerCase())) fatal.push(`SERVICE="${set("SERVICE")}" should be bot, web, or unset for both.`);
  if (set("PUBLIC_URL") && !/^https?:\/\//i.test(set("PUBLIC_URL"))) warnings.push(`PUBLIC_URL="${set("PUBLIC_URL")}" should start with https:// — links in Discord won't work without it.`);
  if (set("DASHBOARD_PASSWORD") && !set("SESSION_SECRET")) {
    warnings.push("SESSION_SECRET isn't set, so DASHBOARD_PASSWORD signs sign-ins and encrypts the keys saved in Settings: changing it on Railway signs everyone out and those keys must be entered again. Set SESSION_SECRET to a long random value.");
  }
  if (/^(1|true|yes)$/i.test(set("DASHBOARD_PASSWORD_RESET"))) warnings.push("DASHBOARD_PASSWORD_RESET is on: remove it once you've signed in, or the password resets at every restart.");
  return { fatal, warnings };
}

let checked = false;
/** Say what's wrong with the environment once per process, and stop on anything fatal. */
export function checkConfig(): void {
  if (checked) return;
  checked = true;
  const { fatal, warnings } = configProblems();
  for (const w of warnings) console.warn(`[config] ${w}`);
  if (!fatal.length) return;
  for (const f of fatal) console.error(`[config] ${f}`);
  process.exit(1);
}
