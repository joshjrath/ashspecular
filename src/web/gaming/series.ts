/**
 * Gaming is episodic: a Minecraft or Roblox channel runs numbered series —
 * "Minecraft Hardcore Ep 12", "Roblox Doors #3", "Day 5 of Skyblock". This
 * reads each title into its series and episode number, and then says, for
 * every series on a channel, whether it's still running, whether its
 * episodes are holding the audience the first ones found, and what's next.
 *
 *   episodeOf   a title → its series name and episode number, or null
 *   gamingSeries every upload → its series, live first, and the one-offs
 *   nextUp      what a channel could make next: the next episode of each
 *               series worth continuing, and any worth bringing back
 *
 * No model, no key: it's the titles and the board's own view numbers, the
 * same multiple ("how it did against the channel's usual at the same age")
 * the Uploads page gives every long-form video.
 */
import { addDays, dayOf, daysBetween } from "../cadence.js";

/** "2026-06-09" → "6/9", as the board writes a day without its year. */
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

export interface EpisodeMark {
  /** The series as the title names it: "Minecraft Hardcore". */
  series: string;
  /** Word-order and punctuation don't matter: "hardcore minecraft". */
  key: string;
  episode: number;
  /** The word the title numbers with — Ep, Part, Day, #… — for the next title. */
  marker: string;
}

/** Numbered episode markers, most specific first. */
const MARKERS: Array<{ re: RegExp; marker: (m: RegExpMatchArray) => string }> = [
  // "S2 E5", "S2E5", "Season 2 Episode 5": the season stays part of the series.
  { re: /\b(s(?:eason)?\s*\d{1,2})\s*[,:.-]?\s*e(?:p(?:isode)?)?\.?\s*(\d{1,4})\b/i, marker: () => "Ep" },
  { re: /\b(?:episode|ep|part|pt|chapter|ch)\.?\s*#?\s*(\d{1,4})\b/i, marker: (m) => cap(m[0]!.match(/^[a-z]+/i)![0]!) },
  { re: /\bday\s+#?(\d{1,4})\b/i, marker: () => "Day" },
  // "#3" only where it ends the name: "Roblox #1 Fan Reacts" is no episode.
  { re: /(?:^|\s)#(\d{1,4})(?=\s*(?:$|[|:)\]–—-]))/, marker: () => "#" },
];

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** Where a title splits into its name and its subtitle. */
const SEPARATORS = /\s+[|–—-]\s+|:\s+|\s*[()[\]]\s*/;

/** Words that join a marker to its series ("Day 5 of …") and mean nothing on their own. */
const JOINERS = /^(?:of|in|on|at|for|to|the)\b\s*|\s*\b(?:of|in|on|at|for|to|but)$/i;

/** Words that don't tell two series apart. */
const KEY_STOP = new Set(["the", "a", "an", "in", "of", "on", "my", "i", "we", "our", "and", "series", "season"]);

function clean(s: string): string {
  let out = s.replace(/[#|:,.!?"“”]+/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 4 && JOINERS.test(out); i += 1) out = out.replace(JOINERS, "").trim();
  return out;
}

export function seriesKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !KEY_STOP.has(w));
  return [...new Set(words)].sort().join(" ");
}

/**
 * The series and episode a title names, or null for a one-off.
 *
 *   "Minecraft Hardcore Ep 4: The Nether"   → Minecraft Hardcore, 4
 *   "Episode 4 | Minecraft Hardcore"         → Minecraft Hardcore, 4
 *   "I Built a Castle (Minecraft Hardcore #3)" → Minecraft Hardcore, 3
 *   "Day 5 of Roblox Doors"                  → Roblox Doors, 5
 *   "I Survived 100 Days in Minecraft"       → null: that's a count, not an episode
 */
export function episodeOf(title: string): EpisodeMark | null {
  for (const { re, marker } of MARKERS) {
    const m = title.match(re);
    if (!m || m.index === undefined) continue;
    const episode = Number(m[m.length - 1]);
    if (!Number.isFinite(episode) || episode < 1) continue;
    const season = m.length > 2 ? m[1]!.replace(/^s(?:eason)?\s*/i, "Season ") : "";

    // The segment of the title the marker sits in is the series, unless the
    // marker is all there is to it — then the series is the segment beside it.
    const start = m.index + (m[0]!.startsWith(" ") ? 1 : 0);
    const segments: Array<{ text: string; from: number }> = [];
    let from = 0;
    for (const part of title.split(SEPARATORS)) {
      const at = title.indexOf(part, from);
      segments.push({ text: part, from: at });
      from = at + part.length;
    }
    const home = segments.findIndex((s, i) => start >= s.from && (i === segments.length - 1 || start < segments[i + 1]!.from));
    const here = home >= 0 ? segments[home]! : { text: title, from: 0 };
    const rest = clean(here.text.slice(0, start - here.from) + " " + here.text.slice(start - here.from + m[0]!.trim().length));
    let series = rest;
    if (seriesKey(series).length < 3) {
      series = segments
        .filter((_, i) => i !== home)
        .map((s) => clean(s.text))
        .find((s) => seriesKey(s).length >= 3) ?? "";
    }
    if (!series) continue;
    if (season) series = `${series} ${season}`;
    return { series, key: seriesKey(series), episode, marker: marker(m) };
  }
  return null;
}

export interface SeriesVideo {
  title: string;
  channel: string;
  publishedAt: Date;
  url: string;
  views: number | null;
  /** How it did against its channel's usual; null when it can't be judged yet. */
  multiple: number | null;
}

export type SeriesTrend = "rising" | "holding" | "fading";

export interface Series {
  channel: string;
  name: string;
  key: string;
  marker: string;
  /** In episode order. */
  episodes: Array<SeriesVideo & { episode: number }>;
  latest: number;
  next: number;
  lastDay: string;
  daysSince: number;
  /** The usual days between its episodes, or null with only one. */
  gap: number | null;
  /** When the next episode is due at that pace. */
  nextDue: string | null;
  /** Still running (an episode within twice its usual gap, and two weeks at least), or resting. */
  live: boolean;
  /** The median of its judged episodes, against the channel's usual. */
  median: number | null;
  /** The latest episodes against the earlier ones, once there are four judged. */
  trend: SeriesTrend | null;
  /** The latest episodes' median over the earlier ones': 0.6 is 40% down. */
  change: number | null;
  /** One line on what to do with it. */
  advice: string;
  /** The next episode's title, from the latest one. */
  draft: string;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const times = (m: number) => `${m >= 10 ? Math.round(m) : m.toFixed(1)}×`;

/** The next episode's title: the series, its marker and the next number. */
export function nextTitle(name: string, marker: string, next: number): string {
  if (marker === "#") return `${name} #${next}`;
  if (marker === "Day") return `${name} Day ${next}`;
  return `${name} ${marker} ${next}`;
}

/**
 * Every series on the given uploads, live first and then the latest, with
 * the uploads that aren't part of one counted as one-offs. A series is two
 * episodes or more, or one numbered episode in the last month (a series
 * just started).
 */
export function gamingSeries(videos: SeriesVideo[], now: Date = new Date()): { series: Series[]; oneOffs: number; episodes: number } {
  const today = dayOf(now);
  const groups = new Map<string, { mark: EpisodeMark; list: Array<SeriesVideo & { episode: number }> }>();
  let oneOffs = 0;
  for (const v of videos) {
    const mark = episodeOf(v.title);
    if (!mark) {
      oneOffs += 1;
      continue;
    }
    const id = `${v.channel}|${mark.key}`;
    if (!groups.has(id)) groups.set(id, { mark, list: [] });
    groups.get(id)!.list.push({ ...v, episode: mark.episode });
  }

  const series: Series[] = [];
  let episodes = 0;
  for (const { mark, list } of groups.values()) {
    const byDate = [...list].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
    const last = byDate[byDate.length - 1]!;
    const lastDay = dayOf(last.publishedAt);
    const daysSince = daysBetween(lastDay, today);
    if (list.length < 2 && daysSince > 30) {
      oneOffs += 1;
      continue;
    }
    episodes += list.length;
    // The name as the latest episode writes it.
    const name = episodeOf(last.title)?.series ?? mark.series;
    const days = [...new Set(byDate.map((v) => dayOf(v.publishedAt)))];
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i]!, d));
    const gapM = median(gaps);
    const gap = gapM === null ? null : Math.max(1, Math.round(gapM));
    const live = daysSince <= Math.max(14, 2 * (gap ?? 7));
    const judged = byDate.filter((v) => v.multiple !== null).map((v) => v.multiple!);
    const med = median(judged);

    let trend: SeriesTrend | null = null;
    let change: number | null = null;
    if (judged.length >= 4) {
      const n = Math.min(3, Math.floor(judged.length / 2));
      const recent = median(judged.slice(-n))!;
      const earlier = median(judged.slice(0, -n))!;
      change = earlier > 0 ? recent / earlier : null;
      trend = change === null ? null : change >= 1.25 ? "rising" : change <= 0.75 ? "fading" : "holding";
    }

    const latest = Math.max(...list.map((v) => v.episode));
    const next = latest + 1;
    const nextDue = live && gap !== null ? addDays(lastDay, gap) : null;
    const draft = nextTitle(name, mark.marker, next);

    let advice: string;
    if (!live) {
      advice = med !== null && med >= 1.2
        ? `Resting since ${md(lastDay)}, and it did ${times(med)} the channel's usual — worth bringing back with ${mark.marker === "#" ? "#" : `${mark.marker} `}${next}`
        : `Resting — nothing since ${md(lastDay)}`;
    } else if (trend === "fading") {
      advice = `The latest episodes are drawing ${Math.round((1 - change!) * 100)}% less than the earlier ones — change it up, or wrap it up`;
    } else if (trend === "rising") {
      advice = `The latest episodes are ${Math.round((change! - 1) * 100)}% up on the earlier ones — keep it going`;
    } else if (med !== null && med >= 1.3) {
      advice = `Above the channel's usual (${times(med)}) — keep it going`;
    } else if (med !== null && med <= 0.7) {
      advice = `Below the channel's usual (${times(med)}) — worth a rethink before ${draft.replace(name, "").trim()}`;
    } else {
      advice = `Running${gap ? ` every ${gap === 1 ? "day" : `${gap} days`}` : ""}`;
    }

    series.push({
      channel: last.channel, name, key: mark.key, marker: mark.marker,
      episodes: [...list].sort((a, b) => a.episode - b.episode || a.publishedAt.getTime() - b.publishedAt.getTime()),
      latest, next, lastDay, daysSince, gap, nextDue, live, median: med, trend, change, advice, draft,
    });
  }
  series.sort((a, b) => Number(b.live) - Number(a.live) || b.lastDay.localeCompare(a.lastDay) || a.name.localeCompare(b.name));
  return { series, oneOffs, episodes };
}

export interface NextUp {
  series: Series;
  /** The episode's title, ready to use. */
  title: string;
  why: string[];
  /** How strongly it's recommended: its median, lifted or cut by its trend. */
  weight: number;
}

/**
 * What a channel could make next, best first: the next episode of every live
 * series that isn't fading, then any resting series that did well enough to
 * bring back. A fading series is left to the series panel, which says so.
 */
export function nextUp(series: Series[], now: Date = new Date()): NextUp[] {
  const today = dayOf(now);
  const out: NextUp[] = [];
  for (const s of series) {
    const med = s.median ?? 1;
    if (s.live && s.trend !== "fading") {
      const why: string[] = [];
      if (s.median !== null) why.push(`its episodes do ${times(s.median)} the channel's usual`);
      if (s.trend === "rising") why.push(`up ${Math.round((s.change! - 1) * 100)}% lately`);
      if (s.nextDue) why.push(s.nextDue < today ? `due ${daysBetween(s.nextDue, today)} day${daysBetween(s.nextDue, today) === 1 ? "" : "s"} ago at its pace` : s.nextDue === today ? "due today at its pace" : `due ${md(s.nextDue)} at its pace`);
      out.push({ series: s, title: s.draft, why, weight: med * (s.trend === "rising" ? 1.2 : 1) });
    } else if (!s.live && s.median !== null && s.median >= 1.2) {
      out.push({ series: s, title: s.draft, why: [`resting ${s.daysSince} days`, `did ${times(s.median)} the channel's usual`], weight: s.median * 0.9 });
    }
  }
  return out.sort((a, b) => Number(b.series.live) - Number(a.series.live) || b.weight - a.weight || a.series.name.localeCompare(b.series.name));
}
