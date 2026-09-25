/**
 * Settings, read once, with honest defaults.
 *
 * Deliberately not the old env.ts, which demanded every key at import time and
 * so made the bot impossible to run without a database or an API key. Nothing
 * here throws unless the thing it configures is actually being used.
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

export const config = {
  discordToken: opt("DISCORD_TOKEN"),
  intakeChannelIds: opt("INTAKE_CHANNEL_IDS")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /** Where the morning digest is posted. Unset means no digest. */
  digestChannelId: opt("DIGEST_CHANNEL_ID"),
  /** Cron for the digest, in the studio's zone. Default 08:00 every day. */
  digestCron: opt("DIGEST_CRON", "0 8 * * *"),
  /** How many Stories priorities the digest names. */
  digestCount: Number(opt("DIGEST_COUNT", "4")),

  /** Hourly check for anything newly past its deadline. Off when empty. */
  nudgeCron: opt("NUDGE_CRON", "5 * * * *"),

  anthropicKey: opt("ANTHROPIC_API_KEY"),
  anthropicModel: opt("ANTHROPIC_MODEL", "claude-opus-5"),

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
