/**
 * Reading Stories' scripts — the transcripts — against how each video did.
 *
 * No AI: every transcript is measured the same way, and each measure is
 * split into thirds across the category's videos to see which third runs
 * above the usual. The measures are the parts of a script a writer controls:
 *
 *   premise at      seconds until the title's names are first said — how
 *                   quickly the video delivers what the title promised
 *   hook question   whether the first 20 seconds ask one ("what if", "have
 *                   you ever", "imagine")
 *   turns a minute  "but", "suddenly", "until", "turns out", "little did"…
 *                   — the story changing direction
 *   open loops      "stick around", "you'll see", "but first", "later"… —
 *                   promises that keep people watching (per ten minutes)
 *   twist at        where in the runtime the turns bunch up most, after the
 *                   first fifth
 *   call to action  where "subscribe" is first said
 *   you a minute    how much it talks to the viewer
 *   pace            words a minute
 *   length          minutes
 *   cast            how many of the category's names it brings in
 *
 * Automatic captions have no punctuation, so everything is counted on words
 * and phrases, never sentences.
 */
import { subjectsOf } from "./ideas.js";

export interface Segment {
  /** Start, in seconds. */
  s: number;
  /** Duration, in seconds. */
  d: number;
  t: string;
}

export interface ScriptFeatures {
  seconds: number;
  words: number;
  wpm: number;
  /** Seconds until the title's names are all said (at most its first two); null if never. */
  premiseAt: number | null;
  hookQuestion: boolean;
  turnsPerMin: number;
  loopsPer10: number;
  youPerMin: number;
  /** 0–1 through the runtime. */
  twistAt: number | null;
  ctaAt: number | null;
  /** Turn density by tenth of the runtime, 1 = its own average. */
  beats: number[];
  /** Words a minute by tenth of the runtime. */
  pace: number[];
  /** The first 45 seconds, as said. */
  hook: string;
  /** How often each word (three letters and up, no filler) is said, the top 400. */
  counts: Record<string, number>;
}

export const TURNS = [
  "but", "however", "suddenly", "until", "instead", "turns out", "turned out", "little did", "plot twist",
  "out of nowhere", "unfortunately", "that's when", "except", "no one expected", "nobody expected",
  "what he didn't", "what she didn't", "what they didn't", "all of a sudden", "just when",
];
const LOOPS = [
  "stick around", "you'll see", "you will see", "but first", "later on", "we'll get to", "find out",
  "keep watching", "wait until", "stay tuned", "by the end", "more on that", "remember this",
  "that's not all", "but that's not", "we'll see", "hold on", "trust me",
];
const QUESTIONS = ["what if", "what would", "what happens", "have you ever", "imagine", "ever wondered", "why did", "how did", "could", "would"];
const CTA = ["subscribe"];
const FILLER = new Set(
  ("the and that this with was were for you your are but not have has had his her him she they them their there then than " +
    "what when where who why how would could should will just like into out from about over all can did does its it's i'm " +
    "he's she's they're we're you're that's there's don't didn't won't can't one two now even only also very really going gonna " +
    "get got see know make made back more some any our been being because which while after before again still well yeah okay")
    .split(" "),
);

/** Lower-case words, apostrophes kept: "Gojo's" → "gojo's". */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\[[^\]]*\]/g, " ") // [Music], [Applause]
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Where each phrase is said, as word positions. */
function phraseHits(words: string[], phrases: string[]): number[] {
  const out: number[] = [];
  const split = phrases.map((p) => p.split(" "));
  for (let i = 0; i < words.length; i += 1) {
    for (const p of split) {
      if (words[i] !== p[0]) continue;
      let ok = true;
      for (let k = 1; k < p.length; k += 1) if (words[i + k] !== p[k]) { ok = false; break; }
      if (ok) { out.push(i); break; }
    }
  }
  return out;
}

/** Every word with the second it's said at — spread evenly through its caption line. */
export function timedWords(segments: Segment[]): Array<{ w: string; at: number }> {
  const out: Array<{ w: string; at: number }> = [];
  for (const seg of segments) {
    const ws = wordsOf(seg.t);
    ws.forEach((w, i) => out.push({ w, at: seg.s + (seg.d * i) / Math.max(ws.length, 1) }));
  }
  return out;
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

export function featuresOf(segments: Segment[], title: string): ScriptFeatures | null {
  const timed = timedWords(segments);
  if (timed.length < 30) return null;
  const last = segments[segments.length - 1]!;
  const seconds = Math.max(last.s + last.d, timed[timed.length - 1]!.at, 1);
  const minutes = seconds / 60;
  const words = timed.map((x) => x.w);

  // The premise: the title's first two names, said.
  const names = subjectsOf(title).slice(0, 2).map((n) => wordsOf(n));
  let premiseAt: number | null = null;
  if (names.length) {
    const firsts = names.map((n) => {
      const i = phraseHits(words, [n.join(" ")])[0];
      return i === undefined ? null : timed[i]!.at;
    });
    premiseAt = firsts.every((f) => f !== null) ? round(Math.max(...(firsts as number[])), 1) : null;
  }

  const inFirst = (sec: number) => timed.filter((x) => x.at < sec).map((x) => x.w);
  const hookQuestion = phraseHits(inFirst(20), QUESTIONS).length > 0;
  // "but suddenly" is one turn, not two.
  const turns = phraseHits(words, TURNS).filter((i, k, all) => k === 0 || i - all[k - 1]! > 3);
  const loops = phraseHits(words, LOOPS);
  const cta = phraseHits(words, CTA);
  const you = words.filter((w) => w === "you" || w === "your" || w === "you're").length;

  // By tenth of the runtime.
  const tenthOf = (i: number) => Math.min(9, Math.floor((timed[i]!.at / seconds) * 10));
  const turnBins = new Array<number>(10).fill(0);
  const wordBins = new Array<number>(10).fill(0);
  for (const i of turns) turnBins[tenthOf(i)]! += 1;
  for (let i = 0; i < timed.length; i += 1) wordBins[tenthOf(i)]! += 1;
  const meanTurns = turns.length / 10;
  const beats = turnBins.map((n) => (meanTurns > 0 ? round(n / meanTurns) : 0));
  const pace = wordBins.map((n) => round(n / (minutes / 10), 0));
  // The twist: the busiest tenth for turns after the first fifth.
  let twistAt: number | null = null;
  if (turns.length >= 3) {
    let best = 2;
    for (let b = 2; b < 10; b += 1) if (turnBins[b]! > turnBins[best]!) best = b;
    twistAt = round((best + 0.5) / 10);
  }

  const counts = new Map<string, number>();
  for (const w of words) if (w.length >= 3 && !FILLER.has(w) && !/^\d+$/.test(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  const top = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 400);

  return {
    seconds: round(seconds, 0),
    words: words.length,
    wpm: round(words.length / minutes, 0),
    premiseAt,
    hookQuestion,
    turnsPerMin: round(turns.length / minutes),
    loopsPer10: round((loops.length / minutes) * 10),
    youPerMin: round(you / minutes),
    twistAt,
    ctaAt: cta.length ? round(timed[cta[0]!]!.at / seconds) : null,
    beats,
    pace,
    hook: segments.filter((s) => s.s < 45).map((s) => s.t).join(" ").replace(/\s+/g, " ").trim(),
    counts: Object.fromEntries(top),
  };
}

/**
 * A pasted script, with no timings: its lines spread over the time it would
 * take at the given pace, so it can be measured like a transcript.
 */
export function segmentsFromScript(text: string, wpm: number): Segment[] {
  const lines = text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Segment[] = [];
  let at = 0;
  for (const t of lines) {
    const d = (wordsOf(t).length / Math.max(wpm, 60)) * 60;
    out.push({ s: round(at, 2), d: round(d, 2), t });
    at += d;
  }
  return out;
}

// ── across videos ─────────────────────────────────────────────────────────

export interface ScriptVideo {
  videoId: string;
  title: string;
  channel: string;
  url: string;
  publishedAt: Date;
  multiple: number | null;
  features: ScriptFeatures;
}

export interface Bucket {
  label: string;
  count: number;
  median: number;
  lift: number;
  videos: ScriptVideo[];
}

export interface Pattern {
  key: MeasureKey;
  label: string;
  /** What a writer should aim for, from the best bucket. */
  advice: string;
  buckets: Bucket[];
  best: Bucket;
  worst: Bucket;
  /** Best over worst: how much this measure seems to matter. */
  strength: number;
}

type MeasureKey = "premiseAt" | "hookQuestion" | "turnsPerMin" | "loopsPer10" | "twistAt" | "ctaAt" | "youPerMin" | "wpm" | "minutes" | "cast";

interface Measure {
  key: MeasureKey;
  label: string;
  /** A number to split into thirds, or yes / no. */
  value: (v: ScriptVideo, cast: number) => number | boolean | null;
  fmt: (n: number) => string;
  aim: (b: Bucket) => string;
}

const secs = (n: number) => (n >= 90 ? `${round(n / 60, 1)} min` : `${Math.round(n)}s`);
const pctOf = (n: number) => `${Math.round(n * 100)}%`;

const MEASURES: Measure[] = [
  { key: "premiseAt", label: "Premise said by", value: (v) => v.features.premiseAt, fmt: secs, aim: (b) => `say the title's names ${b.label}` },
  { key: "hookQuestion", label: "Hook asks a question", value: (v) => v.features.hookQuestion, fmt: String, aim: (b) => (b.label === "yes" ? "open on a question in the first 20 seconds" : "open on a statement, not a question") },
  { key: "turnsPerMin", label: "Turns a minute", value: (v) => v.features.turnsPerMin, fmt: (n) => n.toFixed(1), aim: (b) => `${b.label} turns a minute` },
  { key: "loopsPer10", label: "Open loops per 10 min", value: (v) => v.features.loopsPer10, fmt: (n) => n.toFixed(1), aim: (b) => `${b.label} "stick around" promises every ten minutes` },
  { key: "twistAt", label: "Biggest twist lands at", value: (v) => v.features.twistAt, fmt: pctOf, aim: (b) => `put the biggest turn at ${b.label} of the runtime` },
  { key: "ctaAt", label: "Subscribe ask at", value: (v) => v.features.ctaAt, fmt: pctOf, aim: (b) => `ask to subscribe at ${b.label} of the way in` },
  { key: "youPerMin", label: "“You” a minute", value: (v) => v.features.youPerMin, fmt: (n) => n.toFixed(1), aim: (b) => `talk to the viewer ${b.label} times a minute` },
  { key: "wpm", label: "Pace (words a minute)", value: (v) => v.features.wpm, fmt: (n) => String(Math.round(n)), aim: (b) => `narrate at ${b.label} words a minute` },
  { key: "minutes", label: "Length", value: (v) => v.features.seconds / 60, fmt: (n) => `${round(n, 1)} min`, aim: (b) => `run ${b.label}` },
  { key: "cast", label: "Names in the story", value: (_v, cast) => cast, fmt: (n) => String(Math.round(n)), aim: (b) => `bring in ${b.label} named characters` },
];

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** A group's lift, pulled toward "no effect" when it's small (as ideas.ts does). */
function shrunk(med: number, count: number, overall: number): number {
  const k = 4;
  return (count * (med / overall) + k) / (count + k);
}

export interface CastStat {
  name: string;
  /** Videos that bring this name in (said three times or more). */
  count: number;
  median: number;
  lift: number;
  /** How many titles name it — few means untapped. */
  titled: number;
  videos: ScriptVideo[];
}

export interface StructureAnalysis {
  judged: number;
  overall: number;
  patterns: Pattern[];
  /** Turns by tenth of the runtime: the top third's average and the bottom third's. */
  curves: { hits: number[]; misses: number[]; hitsPace: number[]; missesPace: number[] } | null;
  /** Typical numbers for the top third. */
  blueprint: Array<{ label: string; value: string }>;
  cast: CastStat[];
  /** Hook phrases (two or three words, first 45 seconds) that come with hits. */
  hookPhrases: Array<{ phrase: string; count: number; lift: number; videos: ScriptVideo[] }>;
  medianWpm: number;
}

/** The category's names (from all its titles), and how often each script says them. */
export function castOf(features: ScriptFeatures, names: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const name of names) {
    const parts = wordsOf(name);
    if (!parts.length) continue;
    // A one-word name is counted directly; a longer one by its rarest word.
    const n = Math.min(...parts.map((p) => features.counts[p] ?? 0));
    if (n >= 3) out.set(name, n);
  }
  return out;
}

export function analyzeStructure(videos: ScriptVideo[], allTitles: string[]): StructureAnalysis {
  const judged = videos.filter((v) => v.multiple !== null && v.multiple > 0);
  const medianWpm = median(videos.map((v) => v.features.wpm)) || 150;
  const empty: StructureAnalysis = { judged: judged.length, overall: 1, patterns: [], curves: null, blueprint: [], cast: [], hookPhrases: [], medianWpm };
  if (judged.length < 6) return empty;
  const overall = median(judged.map((v) => v.multiple!));
  if (overall <= 0) return empty;

  // Names: every subject any title in the category has used, twice or more.
  const nameCount = new Map<string, number>();
  for (const t of allTitles) {
    const subs = subjectsOf(t);
    for (const s of subs) nameCount.set(s, (nameCount.get(s) ?? 0) + 1);
  }
  const names = [...nameCount].filter(([, n]) => n >= 2).map(([k]) => k);
  const castBy = new Map(judged.map((v) => [v.videoId, castOf(v.features, names)]));

  const bucket = (label: string, list: ScriptVideo[]): Bucket => {
    const med = median(list.map((v) => v.multiple!));
    return { label, count: list.length, median: med, lift: shrunk(med, list.length, overall), videos: [...list].sort((a, b) => b.multiple! - a.multiple!) };
  };

  const patterns: Pattern[] = [];
  for (const m of MEASURES) {
    const vals = judged
      .map((v) => ({ v, x: m.value(v, castBy.get(v.videoId)!.size) }))
      .filter((e): e is { v: ScriptVideo; x: number | boolean } => e.x !== null);
    if (vals.length < 6) continue;
    let buckets: Bucket[];
    if (typeof vals[0]!.x === "boolean") {
      const yes = vals.filter((e) => e.x === true).map((e) => e.v);
      const no = vals.filter((e) => e.x === false).map((e) => e.v);
      if (yes.length < 3 || no.length < 3) continue;
      buckets = [bucket("yes", yes), bucket("no", no)];
    } else {
      const sorted = [...vals].sort((a, b) => (a.x as number) - (b.x as number));
      const third = Math.ceil(sorted.length / 3);
      const parts = [sorted.slice(0, third), sorted.slice(third, 2 * third), sorted.slice(2 * third)].filter((p) => p.length >= 2);
      if (parts.length < 2) continue;
      buckets = parts.map((p, i) => {
        const lo = p[0]!.x as number, hi = p[p.length - 1]!.x as number;
        const label =
          i === 0 ? `${m.fmt(hi)} or less` : i === parts.length - 1 ? `over ${m.fmt(lo)}` : lo === hi ? m.fmt(lo) : `${m.fmt(lo)}–${m.fmt(hi)}`;
        return bucket(label, p.map((e) => e.v));
      });
      // "Said by 12s or less" reads better than "12s or less" for timings.
      if (m.key === "premiseAt") {
        const never = judged.filter((v) => v.features.premiseAt === null);
        if (never.length >= 3) buckets.push(bucket("never said", never));
      }
    }
    const best = buckets.reduce((a, b) => (b.lift > a.lift ? b : a));
    const worst = buckets.reduce((a, b) => (b.lift < a.lift ? b : a));
    patterns.push({ key: m.key, label: m.label, advice: m.aim(best), buckets, best, worst, strength: best.lift / worst.lift });
  }
  patterns.sort((a, b) => b.strength - a.strength);

  // The shape of a hit against a miss.
  const byMultiple = [...judged].sort((a, b) => b.multiple! - a.multiple!);
  const third = Math.max(2, Math.floor(byMultiple.length / 3));
  const hits = byMultiple.slice(0, third);
  const misses = byMultiple.slice(-third);
  const avg = (list: ScriptVideo[], pick: (f: ScriptFeatures) => number[]) =>
    Array.from({ length: 10 }, (_, i) => round(list.reduce((a, v) => a + (pick(v.features)[i] ?? 0), 0) / list.length));
  const curves = { hits: avg(hits, (f) => f.beats), misses: avg(misses, (f) => f.beats), hitsPace: avg(hits, (f) => f.pace), missesPace: avg(misses, (f) => f.pace) };

  const medOf = (pick: (v: ScriptVideo) => number | null) => {
    const xs = hits.map(pick).filter((n): n is number => n !== null);
    return xs.length ? median(xs) : null;
  };
  const blueprint: Array<{ label: string; value: string }> = [];
  const push = (label: string, n: number | null, fmt: (n: number) => string) => n !== null && blueprint.push({ label, value: fmt(n) });
  push("Length", medOf((v) => v.features.seconds / 60), (n) => `${round(n, 1)} min`);
  push("Premise said by", medOf((v) => v.features.premiseAt), secs);
  blueprint.push({ label: "Hook asks a question", value: `${Math.round((hits.filter((v) => v.features.hookQuestion).length / hits.length) * 100)}% of them` });
  push("Turns a minute", medOf((v) => v.features.turnsPerMin), (n) => n.toFixed(1));
  push("Open loops per 10 min", medOf((v) => v.features.loopsPer10), (n) => n.toFixed(1));
  push("Biggest twist at", medOf((v) => v.features.twistAt), pctOf);
  push("Subscribe ask at", medOf((v) => v.features.ctaAt), pctOf);
  push("Pace", medOf((v) => v.features.wpm), (n) => `${Math.round(n)} words a minute`);
  push("Names in the story", medOf((v) => castBy.get(v.videoId)!.size), (n) => String(Math.round(n)));

  // Names that come with hits — and whether titles have used them yet.
  const cast: CastStat[] = names
    .map((name) => {
      const list = judged.filter((v) => castBy.get(v.videoId)!.has(name));
      const med = median(list.map((v) => v.multiple!));
      return {
        name,
        count: list.length,
        median: med,
        lift: shrunk(med, list.length, overall),
        titled: nameCount.get(name) ?? 0,
        videos: [...list].sort((a, b) => b.multiple! - a.multiple!),
      };
    })
    .filter((c) => c.count >= 3)
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 20);

  // Hook phrases.
  const phraseVideos = new Map<string, ScriptVideo[]>();
  for (const v of judged) {
    const w = wordsOf(v.features.hook);
    const seen = new Set<string>();
    for (let n = 2; n <= 3; n += 1) {
      for (let i = 0; i + n <= w.length; i += 1) {
        const gram = w.slice(i, i + n);
        // A phrase starts and ends on a real word: "with avengers", never "avengers the".
        const weak = (x: string) => FILLER.has(x) || x.length < 3;
        if (weak(gram[gram.length - 1]!) || (n === 3 && weak(gram[0]!)) || gram.every(weak)) continue;
        seen.add(gram.join(" "));
      }
    }
    for (const p of seen) {
      if (!phraseVideos.has(p)) phraseVideos.set(p, []);
      phraseVideos.get(p)!.push(v);
    }
  }
  const hookPhrases = [...phraseVideos]
    .filter(([, list]) => list.length >= 3)
    .map(([phrase, list]) => ({ phrase, count: list.length, lift: shrunk(median(list.map((v) => v.multiple!)), list.length, overall), videos: [...list].sort((a, b) => b.multiple! - a.multiple!) }))
    .filter((p) => p.lift > 1.1)
    .sort((a, b) => b.lift - a.lift)
    .filter((p, i, all) => !all.slice(0, i).some((q) => q.phrase.includes(p.phrase) || p.phrase.includes(q.phrase)))
    .slice(0, 12);

  return { judged: judged.length, overall, patterns, curves, blueprint, cast, hookPhrases, medianWpm };
}

// ── checking a script before it's made ────────────────────────────────────

export interface ScriptCheck {
  words: number;
  /** Estimated at the category's usual pace. */
  seconds: number;
  predicted: number;
  verdict: string;
  notes: Array<{ label: string; value: string; lift: number; advice: string | null }>;
  features: ScriptFeatures;
}

export function checkScript(text: string, title: string, a: StructureAnalysis, allTitles: string[]): ScriptCheck | null {
  const segs = segmentsFromScript(text, a.medianWpm);
  const f = featuresOf(segs, title);
  if (!f) return null;
  const names = [...new Set(allTitles.flatMap((t) => subjectsOf(t)))];
  const cast = castOf(f, names).size;
  const probe: ScriptVideo = { videoId: "", title, channel: "", url: "", publishedAt: new Date(), multiple: null, features: f };
  const notes: ScriptCheck["notes"] = [];
  let logSum = 0;
  for (const p of a.patterns) {
    const m = MEASURES.find((x) => x.key === p.key)!;
    // Pace and length come from the pasted words at the usual pace — not the writer's to judge here.
    if (p.key === "wpm") continue;
    const x = m.value(probe, cast);
    if (x === null) {
      if (p.key === "premiseAt" && title) {
        const never = p.buckets.find((b) => b.label === "never said");
        notes.push({ label: p.label, value: "never", lift: never?.lift ?? 1, advice: p.best.label === "never said" ? null : `Say the title's names early — hits ${p.advice.replace(/^say the title's names /, "do it ")}.` });
        if (never) logSum += Math.log(never.lift);
      }
      continue;
    }
    let b: Bucket | undefined;
    if (typeof x === "boolean") b = p.buckets.find((bk) => bk.label === (x ? "yes" : "no"));
    else {
      // Which third it falls in, by the thirds' own ranges.
      const ranges = p.buckets.filter((bk) => bk.label !== "never said").map((bk) => {
        const xs = bk.videos.map((v) => m.value(v, 0)).filter((n): n is number => typeof n === "number");
        return { bk, lo: Math.min(...xs), hi: Math.max(...xs) };
      });
      b = (ranges.find((r) => x <= r.hi) ?? ranges[ranges.length - 1])?.bk;
      // Cast is counted against the names, not the videos' own counts.
      if (p.key === "cast") b = p.buckets[Math.min(p.buckets.length - 1, cast <= 1 ? 0 : cast <= 3 ? 1 : 2)];
    }
    if (!b) continue;
    logSum += Math.log(b.lift);
    notes.push({
      label: p.label,
      value: typeof x === "boolean" ? (x ? "yes" : "no") : m.fmt(x),
      lift: b.lift,
      advice: b === p.best || b.lift >= p.best.lift * 0.95 ? null : `Hits ${p.advice}.`,
    });
  }
  const predicted = Math.exp(logSum) * 1;
  notes.sort((x, y) => x.lift - y.lift);
  return {
    words: f.words,
    seconds: f.seconds,
    predicted,
    verdict: predicted >= 1.15 ? "built like your hits" : predicted <= 0.87 ? "built like your misses" : "about usual",
    notes,
    features: f,
  };
}

// ── searching ─────────────────────────────────────────────────────────────

/** Every place a phrase is said, with the second it starts at. */
export function findInSegments(segments: Segment[], query: string, max = 5): Array<{ at: number; text: string }> {
  const q = wordsOf(query).join(" ");
  if (!q) return [];
  const out: Array<{ at: number; text: string }> = [];
  for (let i = 0; i < segments.length && out.length < max; i += 1) {
    // A phrase can run across two caption lines.
    const joined = wordsOf(`${segments[i]!.t} ${segments[i + 1]?.t ?? ""}`).join(" ");
    const own = wordsOf(segments[i]!.t).join(" ");
    if (!joined.includes(q)) continue;
    if (!own.includes(q) && !own.includes(q.split(" ")[0]!)) continue;
    out.push({ at: segments[i]!.s, text: [segments[i - 1]?.t, segments[i]!.t, segments[i + 1]?.t].filter(Boolean).join(" ").replace(/\s+/g, " ") });
    i += 1;
  }
  return out;
}

/** 83 → "1:23". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
