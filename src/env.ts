function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function opt(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const env = {
  // --- Discord ---
  discordToken: req("DISCORD_TOKEN"),
  discordAppId: req("DISCORD_APP_ID"),
  /** Channels the bot treats as intake. Empty = listen in every channel it can see. */
  intakeChannelIds: list("INTAKE_CHANNEL_IDS"),
  /** Where the daily priority digest is posted. */
  digestChannelId: opt("DIGEST_CHANNEL_ID", ""),

  // --- Anthropic ---
  anthropicApiKey: req("ANTHROPIC_API_KEY"),
  anthropicModel: opt("ANTHROPIC_MODEL", "claude-opus-5"),

  // --- Postgres ---
  databaseUrl: req("DATABASE_URL"),

  // --- Web ---
  port: Number(opt("PORT", "8080")),
  /** Public base URL of the dashboard, used to build links posted into Discord. */
  publicUrl: opt("PUBLIC_URL", "").replace(/\/+$/, ""),
  dashboardPassword: req("DASHBOARD_PASSWORD"),
  sessionSecret: opt("SESSION_SECRET", req("DASHBOARD_PASSWORD")),

  // --- Scheduling ---
  /** IANA zone. Everything ("VO by 3pm", "due today") is resolved in this zone. */
  timezone: opt("TIMEZONE", "UTC"),
  /** Cron for the daily digest, evaluated in TIMEZONE. Default 08:00 local. */
  digestCron: opt("DIGEST_CRON", "0 8 * * *"),
  /** How many long-form items the daily digest highlights. */
  digestCount: Number(opt("DIGEST_COUNT", "4")),
} as const;
