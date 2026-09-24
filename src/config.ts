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
  /** How many long-form priorities the digest names. */
  digestCount: Number(opt("DIGEST_COUNT", "4")),

  anthropicKey: opt("ANTHROPIC_API_KEY"),
  anthropicModel: opt("ANTHROPIC_MODEL", "claude-opus-5"),

  /** Unset means the bot parses and replies but stores nothing. */
  databaseUrl: opt("DATABASE_URL"),

  port: Number(opt("PORT", "8080")),
  publicUrl: opt("PUBLIC_URL").replace(/\/+$/, ""),
  dashboardPassword: opt("DASHBOARD_PASSWORD"),
  sessionSecret: opt("SESSION_SECRET") || opt("DASHBOARD_PASSWORD"),
} as const;

export const hasDatabase = Boolean(config.databaseUrl);
