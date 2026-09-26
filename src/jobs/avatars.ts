/**
 * The Shorts channels' colours, from their YouTube avatars.
 *
 * The Stories channels wear colours sampled from their avatars by hand. The
 * Bits and Reading channels get theirs the same way, here on the server: the
 * commonest colour in the avatar's outer ring — its background, clear of the
 * character in the middle — read once a week, or as soon as a link changes.
 * Each is nudged lighter or darker only if it would otherwise look like
 * another channel's. A colour set by hand in Settings always wins.
 */
import jpeg from "jpeg-js";
import { CATEGORIES, CHANNELS, applyChannelColours, catalogColour } from "../catalog.js";
import { pool } from "../db/pool.js";
import { formatFor } from "../web/targets.js";

type Fetcher = typeof fetch;

/** The channels whose colour comes from their avatar: Bits and Reading, the Shorts. */
export function sampledChannels(): string[] {
  return CHANNELS.filter((c) => formatFor(c.category) === "short").map((c) => c.name);
}

/** The avatar at a size worth sampling, as a JPEG ("=s176-…-rj"). */
export function avatarAt(url: string, size = 176): string {
  return `${url.replace(/=s\d+[^/?#]*$/, "")}=s${size}-c-k-c0x00ffffff-no-rj`;
}

/** Where a channel's avatar is: from the API with a key, else its page's og:image. */
export async function avatarUrl(id: string, key: string, fetcher: Fetcher = fetch): Promise<string> {
  if (key) {
    const u = new URL("https://www.googleapis.com/youtube/v3/channels");
    u.search = new URLSearchParams({ part: "snippet", id, key }).toString();
    const res = await fetcher(u, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = (await res.json()) as { items?: Array<{ snippet?: { thumbnails?: Record<string, { url?: string }> } }> };
      const t = data.items?.[0]?.snippet?.thumbnails;
      const url = t?.medium?.url ?? t?.high?.url ?? t?.default?.url;
      if (url) return url;
    }
  }
  const res = await fetcher(`https://www.youtube.com/channel/${id}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { "Accept-Language": "en-US,en;q=0.8" },
  });
  if (!res.ok) throw new Error(`YouTube answered ${res.status}.`);
  const url = avatarFromPage(await res.text());
  if (!url) throw new Error("No avatar on the channel's page.");
  return url;
}

/** The avatar's address on a channel page. */
export function avatarFromPage(html: string): string | null {
  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const raw = og ?? html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1];
  return raw ? raw.replace(/&amp;/g, "&").replace(/\\u0026/g, "&") : null;
}

type Rgb = [number, number, number];

/** HSL saturation and lightness, 0–1. */
function sl([r, g, b]: Rgb): { s: number; l: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** A colour worth wearing: not black, white or grey. */
const vivid = (p: Rgb) => {
  const { s, l } = sl(p);
  return s >= 0.28 && l >= 0.14 && l <= 0.86;
};

const hex = (p: Rgb) => `#${p.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** The commonest colour among the pixels that pass, and its share of them all. */
function commonest(pixels: Rgb[], keep: (p: Rgb) => boolean): { colour: Rgb; share: number } | null {
  const bins = new Map<number, Rgb[]>();
  for (const p of pixels) {
    if (!keep(p)) continue;
    const k = ((p[0] >> 4) << 8) | ((p[1] >> 4) << 4) | (p[2] >> 4);
    const bin = bins.get(k);
    if (bin) bin.push(p);
    else bins.set(k, [p]);
  }
  let top: Rgb[] = [];
  for (const bin of bins.values()) if (bin.length > top.length) top = bin;
  if (!top.length) return null;
  const mean = (list: Rgb[]): Rgb => [0, 1, 2].map((i) => list.reduce((n, p) => n + p[i]!, 0) / list.length) as Rgb;
  // The bin's neighbours too, so a colour split across two bins isn't halved.
  const centre = mean(top);
  const near = pixels.filter((p) => keep(p) && Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]) <= 30);
  return { colour: mean(near), share: near.length / pixels.length };
}

/**
 * An avatar's colour: the commonest colour in the ring just inside the circle
 * YouTube shows — the background, clear of whatever sits in the middle. When
 * that ring is black, white or grey, the commonest strong colour anywhere in
 * the circle. Null when there's no colour to take at all.
 */
export function avatarColour(img: { width: number; height: number; data: ArrayLike<number> }): string | null {
  const { width: w, height: h, data } = img;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const r = Math.min(w, h) / 2;
  const ring: Rgb[] = [];
  const circle: Rgb[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 0.96) continue;
      const i = (y * w + x) * 4;
      const p: Rgb = [data[i]!, data[i + 1]!, data[i + 2]!];
      circle.push(p);
      if (d >= 0.8) ring.push(p);
    }
  }
  const back = commonest(ring, () => true);
  if (back && back.share >= 0.35 && vivid(back.colour)) return hex(back.colour);
  const strong = commonest(circle, vivid);
  if (strong && strong.share >= 0.04) return hex(strong.colour);
  return null;
}

/** CIE L*a*b* for a colour, for judging how alike two look. */
function lab(h: string): [number, number, number] {
  const lin = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  const [x, y, z] = [
    (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047,
    lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722,
    (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116)) as Rgb;
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How different two colours look (CIE76): under about 10 reads as the same. */
export function deltaE(a: string, b: string): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * The same colour turned round the colour wheel by `turn` degrees, then taken
 * lighter (t > 0) or darker (t < 0) by t of the way to white or black.
 */
function shade(h: string, t: number, turn = 0): string {
  let rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  if (turn) {
    const [r, g, b] = rgb.map((c) => c / 255) as Rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const hue0 = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const hue = (((hue0 * 60 + turn) % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    const [r1, g1, b1] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
    rgb = [r1 + m, g1 + m, b1 + m].map((v) => v * 255) as Rgb;
  }
  return hex(rgb.map((c) => (t > 0 ? c + (255 - c) * t : c * (1 + t))) as Rgb);
}

/**
 * The colour, moved as little as it takes to stay apart from every other
 * channel's and category's: lighter or darker first, then a turn round the
 * wheel. If nothing clears them all, the one furthest from its nearest.
 */
export function apart(colour: string, others: string[], min = 10): string {
  const nearest = (c: string) => Math.min(...others.map((o) => deltaE(c, o)), Infinity);
  if (nearest(colour) >= min) return colour;
  const tries: Array<{ c: string; cost: number }> = [];
  for (const turn of [0, 12, -12, 24, -24, 36, -36]) {
    for (const t of [0, 0.08, -0.08, 0.16, -0.16, 0.24, -0.24, 0.32, -0.32]) {
      if (!turn && !t) continue;
      tries.push({ c: shade(colour, t, turn), cost: Math.abs(t) * 100 + Math.abs(turn) });
    }
  }
  tries.sort((a, b) => a.cost - b.cost);
  const first = tries.find((x) => nearest(x.c) >= min);
  if (first) return first.c;
  return tries.reduce((best, x) => (nearest(x.c) > nearest(best.c) ? x : best), tries[0]!).c;
}

/**
 * Every channel's colour as it stands: set by hand, else sampled from its
 * avatar (kept apart from the rest), else the catalog's. Applied to the
 * catalog in memory, so every page wears it.
 */
export async function loadChannelColours(): Promise<void> {
  const [hand, sampled] = await Promise.all([
    pool.query<{ channel: string; colour: string }>("SELECT channel, colour FROM channel_colours"),
    pool.query<{ channel: string; avatar_colour: string }>(
      "SELECT channel, avatar_colour FROM youtube_channels WHERE avatar_colour IS NOT NULL",
    ),
  ]);
  const byHand = new Map(hand.rows.map((r) => [r.channel, r.colour.toUpperCase()]));
  const fromAvatar = new Map(sampled.rows.filter((r) => sampledChannels().includes(r.channel)).map((r) => [r.channel, r.avatar_colour]));
  const colours = new Map<string, string>();
  // Hand-set and catalog colours are fixed; sampled ones fit around them, in catalog order.
  for (const c of CHANNELS) if (!fromAvatar.has(c.name) || byHand.has(c.name)) colours.set(c.name, byHand.get(c.name) ?? catalogColour(c.name));
  for (const c of CHANNELS) {
    const s = fromAvatar.get(c.name);
    if (!s || byHand.has(c.name)) continue;
    colours.set(c.name, apart(s, [...colours.values(), ...CATEGORIES.map((k) => k.color)]));
  }
  applyChannelColours(colours);
}

/**
 * Sample the avatars that need it: new links, and any not read in a week.
 * `force` reads them all now. One failing never stops the rest.
 */
export async function sampleAvatars(fetcher: Fetcher = fetch, force = false): Promise<{ sampled: number; failed: number }> {
  const key = process.env.YOUTUBE_API_KEY?.trim() ?? "";
  const { rows } = await pool.query<{ channel: string; youtube_id: string }>(
    `SELECT channel, youtube_id FROM youtube_channels
     WHERE youtube_id IS NOT NULL AND channel = ANY($1::text[])
       AND ($2 OR avatar_checked_at IS NULL OR avatar_checked_at < now() - interval '7 days')`,
    [sampledChannels(), force],
  );
  let sampled = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const url = avatarAt(await avatarUrl(row.youtube_id, key, fetcher));
      const res = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`The avatar answered ${res.status}.`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("The avatar isn't a JPEG.");
      const colour = avatarColour(jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 64 }));
      if (!colour) throw new Error("The avatar has no colour to take — black, white or grey all over.");
      await pool.query(
        `UPDATE youtube_channels SET avatar_colour = $2, avatar_url = $3, avatar_error = NULL, avatar_checked_at = now()
         WHERE channel = $1`,
        [row.channel, colour, url],
      );
      sampled += 1;
    } catch (err) {
      failed += 1;
      await pool.query("UPDATE youtube_channels SET avatar_error = $2, avatar_checked_at = now() WHERE channel = $1", [
        row.channel,
        err instanceof Error ? err.message : "Couldn't read the avatar.",
      ]);
    }
  }
  if (rows.length) await loadChannelColours();
  return { sampled, failed };
}

/** A colour set by hand in Settings, or null to go back to the avatar's (or the catalog's). */
export async function setChannelColour(channel: string, colour: string | null): Promise<void> {
  if (colour) {
    await pool.query(
      `INSERT INTO channel_colours (channel, colour) VALUES ($1, $2)
       ON CONFLICT (channel) DO UPDATE SET colour = $2, updated_at = now()`,
      [channel, colour.toUpperCase()],
    );
  } else {
    await pool.query("DELETE FROM channel_colours WHERE channel = $1", [channel]);
  }
  await loadChannelColours();
}

/** For Settings: where each channel's colour comes from right now. */
export async function colourSources(): Promise<
  Map<string, { source: "hand" | "avatar" | "catalog"; avatar: string | null; error: string | null; linked: boolean }>
> {
  const [hand, links] = await Promise.all([
    pool.query<{ channel: string }>("SELECT channel FROM channel_colours"),
    pool.query<{ channel: string; youtube_id: string | null; avatar_colour: string | null; avatar_error: string | null }>(
      "SELECT channel, youtube_id, avatar_colour, avatar_error FROM youtube_channels",
    ),
  ]);
  const byHand = new Set(hand.rows.map((r) => r.channel));
  const link = new Map(links.rows.map((r) => [r.channel, r]));
  const out = new Map<string, { source: "hand" | "avatar" | "catalog"; avatar: string | null; error: string | null; linked: boolean }>();
  for (const c of CHANNELS) {
    const l = link.get(c.name);
    const avatar = sampledChannels().includes(c.name) ? l?.avatar_colour ?? null : null;
    out.set(c.name, {
      source: byHand.has(c.name) ? "hand" : avatar ? "avatar" : "catalog",
      avatar,
      error: l?.avatar_error ?? null,
      linked: Boolean(l?.youtube_id),
    });
  }
  return out;
}
