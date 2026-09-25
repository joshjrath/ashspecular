/**
 * Transcripts of Stories' videos, from YouTube's own captions.
 *
 * No key or sign-in: the same caption track the player shows is read the way
 * the player reads it — the video's player data lists its caption tracks
 * (the uploaded ones and YouTube's automatic English), and each track is a
 * small timed-text file. The Data API key can't do this: downloading
 * captions through the API needs the channel owner's Google sign-in.
 *
 * A few dozen videos an hour, newest first, a pause between each, so the
 * whole back catalogue fills in over a few days without hammering anything.
 * A video with no captions, or a read YouTube turns away, is retried later
 * and less often. If YouTube starts refusing this server, the run stops and
 * the page says so; any transcript can also be pasted in by hand.
 */
import { pool } from "../db/pool.js";
import { featuresOf, type Segment } from "../web/structure.js";
import { channelsIn } from "../web/targets.js";
import type { CategoryId } from "../catalog.js";

type Fetcher = typeof fetch;

const PER_RUN = Number(process.env.TRANSCRIPTS_PER_HOUR ?? 40);
const PAUSE_MS = 1500;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** The categories whose videos get transcripts — Stories unless set. */
export function transcriptCategories(): CategoryId[] {
  const raw = (process.env.TRANSCRIPT_CATEGORIES ?? "stories").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return raw as CategoryId[];
}

// ── parsing ───────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  const once = (x: string) =>
    x
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  // Captions are often encoded twice: "&amp;#39;".
  return once(once(s));
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/**
 * A timed-text file in any of the shapes YouTube serves: the classic
 * <text start dur>, the newer <p t d> (milliseconds), or JSON events.
 */
export function parseTimedText(body: string): Segment[] {
  const out: Segment[] = [];
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> };
    for (const e of data.events ?? []) {
      const t = (e.segs ?? []).map((x) => x.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
      if (t) out.push({ s: (e.tStartMs ?? 0) / 1000, d: (e.dDurationMs ?? 0) / 1000, t });
    }
    return out;
  }
  for (const m of trimmed.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = Number(m[1]!.match(/start="([\d.]+)"/)?.[1] ?? NaN);
    const dur = Number(m[1]!.match(/dur="([\d.]+)"/)?.[1] ?? 0);
    const t = clean(m[2]!);
    if (Number.isFinite(start) && t) out.push({ s: start, d: dur, t });
  }
  if (out.length) return out;
  for (const m of trimmed.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const start = Number(m[1]!.match(/\bt="(\d+)"/)?.[1] ?? NaN);
    const dur = Number(m[1]!.match(/\bd="(\d+)"/)?.[1] ?? 0);
    const t = clean(m[2]!);
    if (Number.isFinite(start) && t) out.push({ s: start / 1000, d: dur / 1000, t });
  }
  return out;
}

/** "00:01:02,500" / "1:02.5" / "0:01:02.500" → seconds. */
function timeOf(s: string): number {
  const parts = s.trim().replace(",", ".").split(":").map(Number);
  return parts.reduce((a, p) => a * 60 + p, 0);
}

/**
 * A caption file downloaded from YouTube Studio (.srt, .vtt, .sbv) or plain
 * text pasted in. Plain text gets no timings: it's spread at a usual pace.
 */
export function parseCaptionFile(body: string, wpm = 150): Segment[] {
  const lines = body.replace(/\r/g, "").split("\n");
  const cue = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*(-->|,)\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
  if (lines.some((l) => cue.test(l))) {
    const out: Segment[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!cue.test(lines[i]!)) continue;
      const [a, b] = lines[i]!.split(/-->|,(?=\s*\d{1,2}:)/).map((x) => x.trim().split(/\s/)[0]!);
      const text: string[] = [];
      for (i += 1; i < lines.length && lines[i]!.trim() && !cue.test(lines[i]!); i += 1) text.push(lines[i]!);
      i -= 1;
      const t = clean(text.join(" "));
      const s = timeOf(a!), e = timeOf(b!);
      if (t) out.push({ s, d: Math.max(0, e - s), t });
    }
    // Numbered .srt cues leave their numbers behind as text of their own.
    return out.filter((x) => !/^\d+$/.test(x.t));
  }
  const out: Segment[] = [];
  let at = 0;
  for (const t of body.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
    const d = (t.split(/\s+/).length / wpm) * 60;
    out.push({ s: Math.round(at * 100) / 100, d: Math.round(d * 100) / 100, t });
    at += d;
  }
  return out;
}

// ── fetching ──────────────────────────────────────────────────────────────

export interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string; runs?: Array<{ text?: string }> };
}

/** Uploaded English first, then automatic English, then anything English, then whatever there is. */
export function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  const en = (t: CaptionTrack) => t.languageCode === "en" || t.languageCode.startsWith("en-");
  return (
    tracks.find((t) => en(t) && t.kind !== "asr") ??
    tracks.find((t) => en(t) && t.kind === "asr") ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0] ??
    null
  );
}

/** The caption tracks listed in a watch page's own player data. */
export function tracksFromWatchPage(html: string): CaptionTrack[] {
  const at = html.indexOf('"captionTracks":');
  if (at < 0) return [];
  const start = html.indexOf("[", at);
  // The array ends at its matching bracket; strings can hold brackets.
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[") depth += 1;
    else if (c === "]" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, i + 1)) as CaptionTrack[];
      } catch {
        return [];
      }
    }
  }
  return [];
}

export class Blocked extends Error {}
export class NoCaptions extends Error {}

type Got = { segments: Segment[]; language: string; auto: boolean };

/**
 * The player clients to ask as, in order. YouTube checks some for bots more
 * than others, and which ones get through changes; the one that last worked
 * is tried first.
 */
export const PLAYER_CLIENTS: Array<{ name: string; client: Record<string, unknown>; embedded?: boolean }> = [
  { name: "android", client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 } },
  { name: "ios", client: { clientName: "IOS", clientVersion: "20.10.4", deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" } },
  { name: "tv-embedded", client: { clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER", clientVersion: "2.0" }, embedded: true },
  { name: "web-embedded", client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20250310.01.00" }, embedded: true },
  { name: "mweb", client: { clientName: "MWEB", clientVersion: "2.20250311.03.00" } },
];
let lastWorking: string | null = null;

/** Every transcript segment in a get_transcript answer, wherever it's nested. */
export function segmentsFromTranscriptPanel(data: unknown): Segment[] {
  const out: Segment[] = [];
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { for (const y of x) walk(y); return; }
    const o = x as Record<string, unknown>;
    const seg = o.transcriptSegmentRenderer as { startMs?: string; endMs?: string; snippet?: { runs?: Array<{ text?: string }>; simpleText?: string } } | undefined;
    if (seg) {
      const t = (seg.snippet?.runs?.map((r) => r.text ?? "").join("") ?? seg.snippet?.simpleText ?? "").replace(/\s+/g, " ").trim();
      const s0 = Number(seg.startMs ?? NaN) / 1000, s1 = Number(seg.endMs ?? NaN) / 1000;
      if (t && Number.isFinite(s0)) out.push({ s: s0, d: Number.isFinite(s1) ? Math.max(0, s1 - s0) : 0, t });
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(data);
  return out;
}

export async function fetchTranscript(videoId: string, fetcher: Fetcher = fetch): Promise<Got> {
  const headers = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+cb; SOCS=CAI" };
  const page = await fetcher(`https://www.youtube.com/watch?v=${videoId}&hl=en`, { headers, signal: AbortSignal.timeout(15_000) });
  if (page.status === 429) throw new Blocked("YouTube is rate-limiting this server (429).");
  if (!page.ok) throw new Error(`YouTube answered ${page.status}.`);
  const html = await page.text();
  const pageBlocked = html.includes('class="g-recaptcha"') || html.includes("unusual traffic");
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ?? "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
  const webVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? "2.20250312.04.00";

  const refusals: string[] = [];
  let sawTracks = false;
  const readTrack = async (track: CaptionTrack): Promise<Got | null> => {
    const url = track.baseUrl.replace(/&fmt=[^&]*/g, "");
    const res = await fetcher(url.startsWith("http") ? url : `https://www.youtube.com${url}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { refusals.push(`caption file ${res.status}`); return null; }
    const segments = parseTimedText(await res.text());
    if (!segments.length) { refusals.push("empty caption file"); return null; }
    return { segments, language: track.languageCode, auto: track.kind === "asr" };
  };

  // 1. The player, asked as each app in turn — the last one that worked first.
  const clients = [...PLAYER_CLIENTS].sort((a, b) => Number(b.name === lastWorking) - Number(a.name === lastWorking));
  for (const c of clients) {
    const res = await fetcher(`https://www.youtube.com/youtubei/v1/player?key=${key}&prettyPrint=false`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { ...c.client, hl: "en", gl: "US" }, ...(c.embedded ? { thirdParty: { embedUrl: "https://www.google.com/" } } : {}) },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res) { refusals.push(`${c.name}: no answer`); continue; }
    if (res.status === 429) throw new Blocked("YouTube is rate-limiting this server (429).");
    if (!res.ok) { refusals.push(`${c.name}: ${res.status}`); continue; }
    const data = (await res.json().catch(() => ({}))) as {
      playabilityStatus?: { status?: string; reason?: string };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
    };
    const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    if (!tracks.length) {
      const st = data.playabilityStatus;
      refusals.push(`${c.name}: ${st?.status === "OK" ? "no captions listed" : `${st?.status ?? "?"} ${st?.reason ?? ""}`.trim()}`);
      continue;
    }
    sawTracks = true;
    const got = await readTrack(pickTrack(tracks)!);
    if (got) { lastWorking = c.name; return got; }
  }

  // 2. The watch page's own caption list.
  const pageTracks = tracksFromWatchPage(html);
  if (pageTracks.length) {
    sawTracks = true;
    const got = await readTrack(pickTrack(pageTracks)!);
    if (got) return got;
  }

  // 3. The "Show transcript" panel youtube.com opens under a video.
  const params = html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/)?.[1];
  if (params) {
    const res = await fetcher(`https://www.youtube.com/youtubei/v1/get_transcript?key=${key}&prettyPrint=false`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: webVersion, hl: "en", gl: "US" } }, params }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (res?.ok) {
      const segments = segmentsFromTranscriptPanel(await res.json().catch(() => null));
      if (segments.length) return { segments, language: "en", auto: true };
      refusals.push("transcript panel: empty");
    } else refusals.push(`transcript panel: ${res?.status ?? "no answer"}`);
    sawTracks = true;
  }

  const botty = pageBlocked || refusals.some((r) => /bot|LOGIN_REQUIRED|UNPLAYABLE|empty|403|401/i.test(r));
  if (!sawTracks && !botty) throw new NoCaptions("This video has no captions, not even automatic ones (yet).");
  const bots = refusals.filter((r) => /bot/i.test(r)).length;
  throw new Blocked(
    bots && bots >= refusals.length - 1
      ? `YouTube wants this server to prove it isn't a bot — all ${refusals.length} ways in were refused.`
      : `YouTube is refusing this server (${refusals.slice(0, 3).join("; ") || "bot check"}).`,
  );
}

// ── storage ───────────────────────────────────────────────────────────────

export async function saveTranscript(videoId: string, title: string, segments: Segment[], source: "youtube" | "pasted", language: string | null, auto: boolean | null): Promise<void> {
  const features = featuresOf(segments, title);
  const text = segments.map((s) => s.t).join(" ");
  await pool.query(
    `INSERT INTO transcripts (video_id, source, language, auto, segments, text, features, fetched_at, error, attempts, tried_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), NULL, 0, now())
     ON CONFLICT (video_id) DO UPDATE SET source = $2, language = $3, auto = $4, segments = $5, text = $6, features = $7,
       fetched_at = now(), error = NULL, tried_at = now()`,
    [videoId, source, language, auto, JSON.stringify(segments), text, features ? JSON.stringify(features) : null],
  );
}

async function saveFailure(videoId: string, message: string, blocked: boolean): Promise<void> {
  // A refusal doesn't count against the video: it's tried again next hour.
  await pool.query(
    `INSERT INTO transcripts (video_id, error, attempts, tried_at, blocked) VALUES ($1, $2, CASE WHEN $3 THEN 0 ELSE 1 END, now(), $3)
     ON CONFLICT (video_id) DO UPDATE SET error = $2, blocked = $3, tried_at = now(),
       attempts = CASE WHEN $3 THEN transcripts.attempts ELSE transcripts.attempts + 1 END
     WHERE transcripts.segments IS NULL`,
    [videoId, message, blocked],
  );
}

export interface TranscriptRow {
  videoId: string;
  source: string | null;
  auto: boolean | null;
  features: import("../web/structure.js").ScriptFeatures | null;
  error: string | null;
  fetchedAt: Date | null;
}

/** Features (not the text) for every transcript of these channels' videos. */
export async function listTranscriptFeatures(channels: string[]): Promise<Map<string, TranscriptRow>> {
  const { rows } = await pool.query<{ video_id: string; source: string | null; auto: boolean | null; features: TranscriptRow["features"]; error: string | null; fetched_at: Date | null }>(
    `SELECT t.video_id, t.source, t.auto, t.features, t.error, t.fetched_at
       FROM transcripts t JOIN uploads u ON u.video_id = t.video_id WHERE u.channel = ANY($1)`,
    [channels],
  );
  return new Map(rows.map((r) => [r.video_id, { videoId: r.video_id, source: r.source, auto: r.auto, features: r.features, error: r.error, fetchedAt: r.fetched_at }]));
}

export async function getTranscript(videoId: string): Promise<{ segments: Segment[] | null; source: string | null; auto: boolean | null; error: string | null; features: TranscriptRow["features"] } | null> {
  const { rows } = await pool.query<{ segments: Segment[] | null; source: string | null; auto: boolean | null; error: string | null; features: TranscriptRow["features"] }>(
    "SELECT segments, source, auto, error, features FROM transcripts WHERE video_id = $1",
    [videoId],
  );
  return rows[0] ?? null;
}

export async function getUpload(videoId: string): Promise<{ videoId: string; channel: string; title: string; publishedAt: Date; url: string; views: number | null } | null> {
  const { rows } = await pool.query<{ video_id: string; channel: string; title: string; published_at: Date; url: string; views: string | null }>(
    "SELECT video_id, channel, title, published_at, url, views FROM uploads WHERE video_id = $1",
    [videoId],
  );
  const r = rows[0];
  return r ? { videoId: r.video_id, channel: r.channel, title: r.title, publishedAt: r.published_at, url: r.url, views: r.views === null ? null : Number(r.views) } : null;
}

/** Videos whose transcript says a phrase, newest first. */
export async function searchTranscripts(channels: string[], phrase: string, limit = 40): Promise<Array<{ videoId: string; segments: Segment[] }>> {
  const q = phrase.trim();
  if (q.length < 2) return [];
  const { rows } = await pool.query<{ video_id: string; segments: Segment[] }>(
    `SELECT t.video_id, t.segments FROM transcripts t JOIN uploads u ON u.video_id = t.video_id
      WHERE u.channel = ANY($1) AND t.segments IS NOT NULL AND t.text ILIKE '%' || $2 || '%'
      ORDER BY u.published_at DESC LIMIT $3`,
    [channels, q.replace(/[%_\\]/g, (c) => `\\${c}`), limit],
  );
  return rows.map((r) => ({ videoId: r.video_id, segments: r.segments }));
}

/** Where the transcript run stands, for the page. */
export const transcriptStatus: { lastRun: Date | null; fetched: number; failed: number; blocked: string | null } = {
  lastRun: null,
  fetched: 0,
  failed: 0,
  blocked: null,
};

/**
 * One run: the newest videos with no transcript yet, and failures due a
 * retry — a day after the first, then two, four, up to a week.
 */
export async function syncTranscripts(fetcher: Fetcher = fetch, limit = PER_RUN): Promise<{ fetched: number; failed: number; blocked: string | null }> {
  const channels = transcriptCategories().flatMap((c) => channelsIn(c));
  if (!channels.length) return { fetched: 0, failed: 0, blocked: null };
  const { rows } = await pool.query<{ video_id: string; title: string }>(
    `SELECT u.video_id, u.title FROM uploads u LEFT JOIN transcripts t ON t.video_id = u.video_id
      WHERE u.channel = ANY($1) AND u.published_at < now() - interval '3 hours'
        AND (t.video_id IS NULL OR (t.segments IS NULL AND (
              (t.blocked AND t.tried_at < now() - interval '50 minutes')
           OR (NOT t.blocked AND t.tried_at < now() - LEAST(power(2, t.attempts - 1), 7) * interval '1 day'))))
      ORDER BY u.published_at DESC LIMIT $2`,
    [channels, limit],
  );
  let fetched = 0, failed = 0, strikes = 0;
  let blocked: string | null = null;
  for (const row of rows) {
    try {
      const t = await fetchTranscript(row.video_id, fetcher);
      await saveTranscript(row.video_id, row.title, t.segments, "youtube", t.language, t.auto);
      fetched += 1;
      strikes = 0;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Couldn't read the captions.";
      await saveFailure(row.video_id, message, err instanceof Blocked);
      if (err instanceof Blocked) {
        strikes += 1;
        // Three refusals in a row: stop for this hour rather than dig deeper.
        if (strikes >= 3) { blocked = message; break; }
      }
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  Object.assign(transcriptStatus, { lastRun: new Date(), fetched, failed, blocked });
  return { fetched, failed, blocked };
}

/** How far the catalogue has got: videos, with transcripts, and failing. */
export async function transcriptCoverage(channels: string[]): Promise<{ videos: number; done: number; failing: number }> {
  const { rows } = await pool.query<{ videos: string; done: string; failing: string }>(
    `SELECT count(*) AS videos, count(t.segments) AS done, count(*) FILTER (WHERE t.segments IS NULL AND t.error IS NOT NULL AND NOT t.blocked) AS failing
       FROM uploads u LEFT JOIN transcripts t ON t.video_id = u.video_id WHERE u.channel = ANY($1)`,
    [channels],
  );
  const r = rows[0]!;
  return { videos: Number(r.videos), done: Number(r.done), failing: Number(r.failing) };
}
