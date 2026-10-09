/**
 * Network Overview's tables: divisions, each channel's place in them, RPM
 * assumptions over time, and the daily readings (channel totals, views gained
 * by format) everything on the page is added up from. The arithmetic lives in
 * src/network/; this only reads and writes.
 */
import { pool } from "./pool.js";
import { CATEGORIES, CHANNELS } from "../catalog.js";
import { ORG_TZ, dateIn, isRealDate } from "../parse/derive.js";
import type { ChannelDay, Division, FormatDay, NetChannel, RpmRow, VideoFormat } from "../network/types.js";

// ── divisions and channels ────────────────────────────────────────────────

export async function listDivisions(): Promise<Division[]> {
  const { rows } = await pool.query("SELECT id, name, colour, position FROM network_divisions ORDER BY position, created_at, id");
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), colour: (r.colour as string) ?? "#8A8A96", position: Number(r.position) }));
}

/** A division's id from its name: lower-case words joined, kept unique. */
export function divisionIdOf(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "division";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

export async function addDivision(name: string, colour: string): Promise<{ id: string } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return { error: "Give the division a name." };
  const divisions = await listDivisions();
  if (divisions.some((d) => d.name.toLowerCase() === clean.toLowerCase())) return { error: `There's already a division called ${clean}.` };
  const id = divisionIdOf(clean, divisions.map((d) => d.id));
  const position = Math.max(-1, ...divisions.map((d) => d.position)) + 1;
  await pool.query("INSERT INTO network_divisions (id, name, colour, position) VALUES ($1, $2, $3, $4)", [id, clean, /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null, position]);
  return { id };
}

export async function renameDivision(id: string, name: string, colour: string): Promise<{ ok: true } | { error: string }> {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!clean) return { error: "A division needs a name." };
  const divisions = await listDivisions();
  if (divisions.some((d) => d.id !== id && d.name.toLowerCase() === clean.toLowerCase())) return { error: `There's already a division called ${clean}.` };
  await pool.query("UPDATE network_divisions SET name = $2, colour = COALESCE($3, colour) WHERE id = $1", [id, clean, /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null]);
  return { ok: true };
}

/** A division can go once no channel is in it. */
export async function deleteDivision(id: string): Promise<{ ok: true } | { error: string }> {
  const channels = await listNetChannels();
  const inIt = channels.filter((c) => c.divisionId === id);
  if (inIt.length) return { error: `Move its ${inIt.length} channel${inIt.length === 1 ? "" : "s"} to another division first.` };
  await pool.query("DELETE FROM network_divisions WHERE id = $1", [id]);
  return { ok: true };
}

export async function moveDivision(id: string, by: -1 | 1): Promise<void> {
  const divisions = await listDivisions();
  const i = divisions.findIndex((d) => d.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= divisions.length) return;
  const order = [...divisions];
  [order[i], order[j]] = [order[j]!, order[i]!];
  for (const [n, d] of order.entries()) await pool.query("UPDATE network_divisions SET position = $2 WHERE id = $1", [d.id, n]);
}

/**
 * Every board channel with its division, status and YouTube link. A channel
 * with no row of its own is in its category's division and shown. One
 * primary division each, so nothing is counted twice.
 */
export async function listNetChannels(): Promise<NetChannel[]> {
  const [settings, links, divisions] = await Promise.all([
    pool.query("SELECT channel, division_id, active, position, added_at FROM network_channels"),
    pool.query("SELECT channel, youtube_id, title, avatar_url, error, checked_at, created_at FROM youtube_channels yc LEFT JOIN LATERAL (SELECT min(first_seen) AS created_at FROM uploads u WHERE u.channel = yc.channel) f ON true"),
    listDivisions(),
  ]);
  const own = new Map(settings.rows.map((r) => [String(r.channel), r]));
  const link = new Map(links.rows.map((r) => [String(r.channel), r]));
  const known = new Set(divisions.map((d) => d.id));
  return CHANNELS.map((c, i) => {
    const s = own.get(c.name);
    const l = link.get(c.name);
    const wanted = (s?.division_id as string | null) ?? c.category;
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      divisionId: known.has(wanted) ? wanted : null,
      active: s ? Boolean(s.active) : true,
      position: s?.position === null || s?.position === undefined ? 1000 + i : Number(s.position),
      addedAt: (s?.added_at as Date | undefined) ?? (l?.created_at as Date | null) ?? null,
      youtubeId: (l?.youtube_id as string | null) ?? null,
      title: (l?.title as string | null) ?? null,
      avatarUrl: (l?.avatar_url as string | null) ?? null,
      error: (l?.error as string | null) ?? null,
      checkedAt: (l?.checked_at as Date | null) ?? null,
      colour: c.color,
    };
  }).sort((a, b) => a.position - b.position);
}

export async function setChannelPlace(channel: string, p: { divisionId?: string | null; active?: boolean; position?: number | null }): Promise<void> {
  await pool.query(
    `INSERT INTO network_channels (channel, division_id, active, position) VALUES ($1, $2, COALESCE($3, true), $4)
     ON CONFLICT (channel) DO UPDATE SET
       division_id = CASE WHEN $5 THEN $2 ELSE network_channels.division_id END,
       active = COALESCE($3, network_channels.active),
       position = CASE WHEN $6 THEN $4 ELSE network_channels.position END,
       updated_at = now()`,
    [channel, p.divisionId ?? null, p.active ?? null, p.position ?? null, p.divisionId !== undefined, p.position !== undefined],
  );
}

/** Move a channel up or down Network Overview's order (everything gets an explicit place). */
export async function moveChannel(channel: string, by: -1 | 1): Promise<void> {
  const list = await listNetChannels();
  const i = list.findIndex((c) => c.name === channel);
  const j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return;
  const order = [...list];
  [order[i], order[j]] = [order[j]!, order[i]!];
  for (const [n, c] of order.entries()) await setChannelPlace(c.name, { position: n });
}

// ── RPM assumptions ───────────────────────────────────────────────────────

/** The bounds a typed RPM must sit in: a Shorts RPM of cents, a long-form one of dollars. */
export const RPM_BOUNDS = { min: 0, max: 100 } as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "INR"] as const;

export async function listRpm(): Promise<RpmRow[]> {
  const { rows } = await pool.query(
    "SELECT id, channel, to_char(effective_from, 'YYYY-MM-DD') AS from, long_rpm, short_rpm, blended_rpm, currency, notes, created_at FROM network_rpm ORDER BY channel, effective_from",
  );
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return rows.map((r) => ({
    id: Number(r.id), channel: String(r.channel), from: String(r.from), long: num(r.long_rpm), short: num(r.short_rpm), blended: num(r.blended_rpm),
    currency: String(r.currency), notes: String(r.notes ?? ""), createdAt: r.created_at as Date,
  }));
}

/** An RPM from a form: a number in range, or null for "not set". */
export function rpmValue(raw: unknown): number | null | "bad" {
  const s = String(raw ?? "").trim().replace(/^\$/, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= RPM_BOUNDS.min && n <= RPM_BOUNDS.max ? Math.round(n * 10_000) / 10_000 : "bad";
}

/** Set a channel's RPM from a date on. The same date again replaces that entry; earlier ones stay as they were. */
export async function saveRpm(r: { channel: string; from: string; long: number | null; short: number | null; blended: number | null; currency: string; notes: string }): Promise<void> {
  if (!isRealDate(r.from)) throw new Error("bad date");
  await pool.query(
    `INSERT INTO network_rpm (channel, effective_from, long_rpm, short_rpm, blended_rpm, currency, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (channel, effective_from) DO UPDATE SET long_rpm = $3, short_rpm = $4, blended_rpm = $5, currency = $6, notes = $7, created_at = now()`,
    [r.channel, r.from, r.long, r.short, r.blended, r.currency, r.notes.slice(0, 300)],
  );
}

export async function deleteRpm(id: number): Promise<void> {
  await pool.query("DELETE FROM network_rpm WHERE id = $1", [id]);
}

// ── readings ──────────────────────────────────────────────────────────────

/** Channel totals and views gained by format, for these channels from a day on. */
export async function loadReadings(channels: string[], from: string): Promise<{ days: ChannelDay[]; formats: FormatDay[] }> {
  const [days, formats] = await Promise.all([
    pool.query(
      `SELECT * FROM (
         SELECT channel, day, to_char(day, 'YYYY-MM-DD') AS d, views, subscribers, subs_hidden, videos, read_at, first_views, first_subs, first_at,
                day = min(day) OVER (PARTITION BY channel) AS first_day
           FROM network_channel_days WHERE channel = ANY($1)
       ) x WHERE day >= $2::date - 1 ORDER BY day`,
      [channels, from],
    ),
    pool.query(
      `SELECT channel, to_char(day, 'YYYY-MM-DD') AS day, format, gained, videos
         FROM network_format_days WHERE channel = ANY($1) AND day >= $2::date ORDER BY day`,
      [channels, from],
    ),
  ]);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    days: days.rows.map((r) => ({
      channel: String(r.channel), day: String(r.d), views: n(r.views), subscribers: r.subs_hidden ? null : n(r.subscribers), subsHidden: Boolean(r.subs_hidden),
      videos: n(r.videos), readAt: r.read_at as Date,
      first: r.first_day && r.first_at ? { views: n(r.first_views), subscribers: r.subs_hidden ? null : n(r.first_subs), at: r.first_at as Date } : null,
    })),
    formats: formats.rows.map((r) => ({ channel: String(r.channel), day: String(r.day), format: r.format as VideoFormat, gained: Number(r.gained), videos: Number(r.videos) })),
  };
}

/** Every upload (both formats) of these channels, with what's known of its views. */
export async function loadVideos(channels: string[]): Promise<Array<{
  videoId: string; channel: string; title: string; publishedAt: Date; url: string; views: number | null; format: VideoFormat; board: boolean;
}>> {
  const { rows } = await pool.query(
    "SELECT video_id, channel, title, published_at, url, views, COALESCE(format, 'unknown') AS format, board FROM uploads WHERE channel = ANY($1)",
    [channels],
  );
  return rows.map((r) => ({
    videoId: String(r.video_id), channel: String(r.channel), title: String(r.title), publishedAt: r.published_at as Date, url: String(r.url),
    views: r.views === null ? null : Number(r.views), format: r.format as VideoFormat, board: Boolean(r.board),
  }));
}

/** The earliest day a channel total was read: history before it doesn't exist. */
export async function firstReading(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT to_char(LEAST(
       (SELECT min(day) FROM network_channel_days),
       (SELECT min(d.day) FROM network_analytics_days d JOIN youtube_channels y ON y.youtube_id = d.youtube_id)
     ), 'YYYY-MM-DD') AS d`,
  );
  return (rows[0]?.d as string | null) ?? null;
}

/** Per channel: how many days of totals have been read, and since when. */
export async function readingCoverage(): Promise<Map<string, { days: number; first: string; last: string }>> {
  const { rows } = await pool.query(
    "SELECT channel, count(*)::int AS days, to_char(min(day), 'YYYY-MM-DD') AS first, to_char(max(day), 'YYYY-MM-DD') AS last FROM network_channel_days GROUP BY channel",
  );
  return new Map(rows.map((r) => [String(r.channel), { days: Number(r.days), first: String(r.first), last: String(r.last) }]));
}

/** When the channel totals were last read, and whether the latest read for each linked channel worked. */
export async function readStatus(): Promise<{ lastRead: Date | null; lastFull: { day: string; at: Date; error: string | null } | null }> {
  const [a, b] = await Promise.all([
    pool.query("SELECT max(read_at) AS at FROM network_channel_days"),
    pool.query("SELECT to_char(day, 'YYYY-MM-DD') AS day, at, error FROM network_reads ORDER BY day DESC LIMIT 1"),
  ]);
  const f = b.rows[0];
  return { lastRead: (a.rows[0]?.at as Date | null) ?? null, lastFull: f ? { day: String(f.day), at: f.at as Date, error: (f.error as string | null) ?? null } : null };
}

/** Keep a channel's public totals as today's reading (the last read of a day stands for it). */
export async function saveChannelDay(channel: string, s: { views: number | null; subscribers: number | null; subsHidden: boolean; videos: number | null }, now = new Date()): Promise<void> {
  await pool.query(
    `INSERT INTO network_channel_days (channel, day, views, subscribers, subs_hidden, videos, read_at, first_views, first_subs, first_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $3, $4, $7)
     ON CONFLICT (channel, day) DO UPDATE SET views = COALESCE($3, network_channel_days.views), subscribers = $4, subs_hidden = $5,
       videos = COALESCE($6, network_channel_days.videos), read_at = $7,
       first_views = COALESCE(network_channel_days.first_views, $3), first_subs = COALESCE(network_channel_days.first_subs, $4),
       first_at = COALESCE(network_channel_days.first_at, $7)`,
    [channel, dateIn(ORG_TZ, now), s.views, s.subsHidden ? null : s.subscribers, s.subsHidden, s.videos, now],
  );
}

/** A video's views are only compared with a reading this recent: a longer gap isn't one day's gain. */
export const GAIN_WINDOW_HOURS = 36;
/** A video first read this young counts all its views as gained (it had none before it went up). */
export const NEW_VIDEO_HOURS = 48;

/**
 * What a new reading of a video's views gained, or null when it can't say:
 * against the last reading if that was recent, whole if the video is new,
 * otherwise it only sets the baseline. A fall (views removed) is a real,
 * negative gain.
 */
export function gainOf(prev: { views: number | null; at: Date | null }, now: number, publishedAt: Date, at: Date): number | null {
  if (prev.views !== null && prev.at && at.getTime() - prev.at.getTime() <= GAIN_WINDOW_HOURS * 3_600_000) return now - prev.views;
  if (prev.views === null && at.getTime() - publishedAt.getTime() <= NEW_VIDEO_HOURS * 3_600_000) return now;
  return null;
}

/**
 * New view counts for videos: each is stored with when it was read, and what
 * it gained since the last reading is added to its channel's day by format.
 * Every place that reads views goes through here, so each gain is counted
 * once. `count: false` stores without counting (a less exact source, like
 * the free feed when a key is reading the same videos).
 */
export async function recordViewReadings(readings: Array<{ videoId: string; views: number }>, opts: { count?: boolean; now?: Date } = {}): Promise<void> {
  if (!readings.length) return;
  const at = opts.now ?? new Date();
  const { rows } = await pool.query(
    "SELECT video_id, channel, COALESCE(format, 'unknown') AS format, views, views_at, published_at FROM uploads WHERE video_id = ANY($1)",
    [readings.map((r) => r.videoId)],
  );
  const known = new Map(rows.map((r) => [String(r.video_id), r]));
  const sums = new Map<string, { channel: string; format: string; gained: number; videos: number }>();
  for (const r of readings) {
    const row = known.get(r.videoId);
    if (!row) continue;
    const prev = { views: row.views === null ? null : Number(row.views), at: (row.views_at as Date | null) ?? null };
    const gain = opts.count === false ? null : gainOf(prev, r.views, row.published_at as Date, at);
    await pool.query("UPDATE uploads SET views = $2, views_at = $3 WHERE video_id = $1", [r.videoId, r.views, at]);
    if (gain === null) continue;
    const k = `${row.channel}|${row.format}`;
    const s = sums.get(k) ?? { channel: String(row.channel), format: String(row.format), gained: 0, videos: 0 };
    s.gained += gain;
    s.videos += 1;
    sums.set(k, s);
  }
  const day = dateIn(ORG_TZ, at);
  for (const s of sums.values()) {
    await pool.query(
      `INSERT INTO network_format_days (channel, day, format, gained, videos) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (channel, day, format) DO UPDATE SET gained = network_format_days.gained + $4, videos = network_format_days.videos + $5`,
      [s.channel, day, s.format, s.gained, s.videos],
    );
  }
}

// ── alerts ────────────────────────────────────────────────────────────────

export async function saveAlert(a: { key: string; kind: string; channel: string | null; text: string; href: string | null }): Promise<boolean> {
  const { rowCount } = await pool.query(
    "INSERT INTO network_alerts (key, kind, channel, text, href) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING",
    [a.key, a.kind, a.channel, a.text.slice(0, 400), a.href],
  );
  return (rowCount ?? 0) > 0;
}

export async function recentAlerts(days = 7): Promise<Array<{ key: string; kind: string; channel: string | null; text: string; href: string | null; at: Date }>> {
  const { rows } = await pool.query(
    "SELECT key, kind, channel, text, href, at FROM network_alerts WHERE at > now() - make_interval(days => $1) ORDER BY at DESC LIMIT 30",
    [days],
  );
  return rows.map((r) => ({ key: String(r.key), kind: String(r.kind), channel: (r.channel as string | null) ?? null, text: String(r.text), href: (r.href as string | null) ?? null, at: r.at as Date }));
}

/** The category a division started as, for its colour when it has none. */
export const categoryColour = (id: string) => CATEGORIES.find((c) => c.id === id)?.color ?? null;
