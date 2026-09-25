/**
 * The idea filter and recommender: what the category's own numbers say about
 * which videos work, turned into suggestions and a checker for new ideas.
 *
 * Every video gets one number — how it did against its own channel's usual
 * (its breakout multiple, or lifetime views against the channel median once
 * it's two weeks old) — so a small channel's hit counts as much as a big
 * channel's. Then titles are taken apart into:
 *
 *   format   the shape of the title: What If, Could … Survive, Ranked, Versus…
 *   subjects the names in it: Gojo, Deadpool, FNAF, Spider-Man
 *   day      the weekday it went up (New York time)
 *
 * and each is scored by the median result of the videos that have it, as a
 * lift over the category's overall median: "What If" titles doing 1.4× the
 * usual median is +40%. Everything needs at least three videos (subjects
 * two) before it's trusted, and the checker shrinks small samples toward
 * "no effect", so one lucky video can't make a rule.
 */
import { ORG_TZ } from "../parse/derive.js";

export interface IdeaVideo {
  title: string;
  channel: string;
  publishedAt: Date;
  url: string;
  /** How it did against its channel's usual; null when it can't be judged yet. */
  multiple: number | null;
}

export interface FeatureStat {
  key: string;
  count: number;
  median: number;
  /** Median result over the category's overall median: 1.4 is +40%. */
  lift: number;
  best: IdeaVideo | null;
  lastUsed: Date;
}

export interface IdeaAnalysis {
  judged: number;
  overall: number;
  formats: FeatureStat[];
  subjects: FeatureStat[];
  days: FeatureStat[];
  length: { short: FeatureStat | null; long: FeatureStat | null };
  suggestions: Suggestion[];
}

export interface Suggestion {
  kind: "pairing" | "sequel" | "revisit";
  idea: string;
  why: string;
  lift: number;
}

/** Title shapes, first match wins. */
const FORMATS: Array<[string, RegExp]> = [
  ["What If", /^\s*what\s+if\b/i],
  ["Could … Survive", /^\s*(could|can|would)\b.*\bsurvive\b/i],
  ["Could … Beat / Kill", /^\s*(could|can|would)\b.*\b(beat|kill|defeat|win|destroy)\b/i],
  ["Could / Would …", /^\s*(could|can|would)\b/i],
  ["Ranked", /\b(ranked|ranking|tier list|every)\b/i],
  ["Versus", /\b(vs\.?|versus)\b/i],
  ["How …", /^\s*how\b/i],
  ["Why …", /^\s*why\b/i],
  ["Explained / Theory", /\b(explained|theory|lore|origin|story of)\b/i],
  ["Top / Best", /^\s*(top\s*\d+|the\s+best|best|worst)\b/i],
];

const STOP = new Set(
  "What If Could Can Would Should How Why When Where Who Which The A An And Or Of In On At To For With From Into Vs Versus Is Are Was Were Be Been Every Ranked Explained Theory Top Best Worst Than Then Their They He She It His Her Its This That These Those Actually Really Ever Real Life Only All Most More Most New Your You We Our I My Me Do Does Did Has Have Had Not No Yes Survive Beat Kill Joined Join Build Built Fought Fight Were Become Became Was Went Got Get Part Episode Ep Full Movie Video Short Shorts Work Works Worked Train Trained Happen Happens Happened Look Looks Make Makes Made Go Goes Went Know Knew Win Won Lose Lost Die Died Dies Live Lived Take Took Save Saved Stop Stopped Meet Met Find Found Turn Turned Actually Truly Secretly Just Still Now Again Ever Never Always".split(" "),
);

/** The format a title follows, or "Other". */
export function formatOf(title: string): string {
  return FORMATS.find(([, re]) => re.test(title))?.[0] ?? "Other";
}

/**
 * The names in a title: runs of capitalised words, less the words titles
 * capitalise anyway. "Could Walter White Build Compound V?" → Walter White,
 * Compound V. Possessives are dropped: Spider-Man's → Spider-Man.
 */
export function subjectsOf(title: string): string[] {
  const words = title.replace(/[?!.,:;"“”()[\]]/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) out.push(run.join(" "));
    run = [];
  };
  for (const raw of words) {
    const w = raw.replace(/['’]s$/i, "");
    const isName = /^[A-Z0-9][\w-]*$/.test(w) && !STOP.has(w) && !/^\d+$/.test(w);
    const isAcronym = /^[A-Z]{2,}$/.test(w) && !STOP.has(w);
    if (isName || isAcronym) run.push(w);
    else flush();
    // A possessive ends a name: "Spider-Man's Webs" is Spider-Man, then Webs.
    if (/['’]s$/i.test(raw)) flush();
  }
  flush();
  // A name has letters in it: "34-3" or "2024" is a number, not a subject.
  return [...new Set(out.filter((s) => s.length >= 2 && /[A-Za-z]{2}/.test(s)))];
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: ORG_TZ });

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function stat(key: string, list: IdeaVideo[], overall: number): FeatureStat {
  const judged = list.filter((v) => v.multiple !== null);
  const med = median(judged.map((v) => v.multiple!));
  return {
    key,
    count: judged.length,
    median: med,
    lift: med / overall,
    best: judged.reduce<IdeaVideo | null>((b, v) => (!b || v.multiple! > b.multiple! ? v : b), null),
    lastUsed: new Date(Math.max(...list.map((v) => v.publishedAt.getTime()))),
  };
}

function group(videos: IdeaVideo[], keysOf: (v: IdeaVideo) => string[]): Map<string, IdeaVideo[]> {
  const out = new Map<string, IdeaVideo[]>();
  for (const v of videos) for (const k of keysOf(v)) {
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(v);
  }
  return out;
}

/** Title shapes to write a pairing in, by format. */
const TEMPLATE: Record<string, (s: string) => string> = {
  "What If": (s) => `What If ${s} …?`,
  "Could … Survive": (s) => `Could ${s} Survive …?`,
  "Could … Beat / Kill": (s) => `Could ${s} Beat …?`,
  "Could / Would …": (s) => `Could ${s} …?`,
  Ranked: (s) => `Every ${s} …, Ranked`,
  Versus: (s) => `${s} vs …`,
  "How …": (s) => `How ${s} …`,
  "Why …": (s) => `Why ${s} …`,
  "Explained / Theory": (s) => `${s} … Explained`,
  "Top / Best": (s) => `Top 10 ${s} …`,
};

export function analyzeIdeas(videos: IdeaVideo[], now: Date = new Date()): IdeaAnalysis {
  const judged = videos.filter((v) => v.multiple !== null);
  const empty: IdeaAnalysis = { judged: judged.length, overall: 1, formats: [], subjects: [], days: [], length: { short: null, long: null }, suggestions: [] };
  if (judged.length < 6) return empty;
  const overall = median(judged.map((v) => v.multiple!));
  if (overall <= 0) return empty;

  const keep = (min: number) => (s: FeatureStat) => s.count >= min;
  const byLift = (a: FeatureStat, b: FeatureStat) => b.lift - a.lift || b.count - a.count;

  const formats = [...group(videos, (v) => [formatOf(v.title)])]
    .map(([k, l]) => stat(k, l, overall)).filter(keep(3)).sort(byLift);
  const subjects = [...group(videos, (v) => subjectsOf(v.title))]
    .map(([k, l]) => stat(k, l, overall)).filter(keep(2)).sort(byLift);
  const days = [...group(videos, (v) => [WEEKDAY.format(v.publishedAt)])]
    .map(([k, l]) => stat(k, l, overall)).filter(keep(3)).sort(byLift);

  const words = (v: IdeaVideo) => v.title.split(/\s+/).length;
  const medWords = median(videos.map(words));
  const shortL = videos.filter((v) => words(v) <= medWords);
  const longL = videos.filter((v) => words(v) > medWords);
  const length = {
    short: shortL.filter((v) => v.multiple !== null).length >= 3 ? stat(`${Math.round(medWords)} words or fewer`, shortL, overall) : null,
    long: longL.filter((v) => v.multiple !== null).length >= 3 ? stat(`over ${Math.round(medWords)} words`, longL, overall) : null,
  };

  const suggestions: Suggestion[] = [];
  const daysSince = (d: Date) => Math.round((now.getTime() - d.getTime()) / 86_400_000);
  const pct = (lift: number) => `${lift >= 1 ? "+" : ""}${Math.round((lift - 1) * 100)}%`;

  // Strong formats × strong subjects not used lately.
  const topFormats = formats.filter((f) => f.lift > 1.05 && f.key !== "Other").slice(0, 3);
  const topSubjects = subjects.filter((s) => s.lift > 1.1 && daysSince(s.lastUsed) >= 7).slice(0, 6);
  // When each format-and-subject pairing was last used; one done in the last
  // sixty days isn't suggested again.
  const lastPair = new Map<string, number>();
  for (const v of videos) {
    for (const subj of subjectsOf(v.title)) {
      const k = `${formatOf(v.title)}|${subj}`;
      lastPair.set(k, Math.max(lastPair.get(k) ?? 0, v.publishedAt.getTime()));
    }
  }
  for (const s of topSubjects) {
    for (const f of topFormats) {
      const last = lastPair.get(`${f.key}|${s.key}`);
      if (last && daysSince(new Date(last)) < 60) continue;
      const template = TEMPLATE[f.key];
      if (!template) continue;
      suggestions.push({
        kind: "pairing",
        idea: template(s.key),
        why: `${f.key} titles run ${pct(f.lift)} and ${s.key} ${pct(s.lift)}; ${
          last ? `this pairing was last done ${daysSince(new Date(last))} days ago` : "they've never been paired"
        }.`,
        lift: Math.sqrt(f.lift * s.lift),
      });
      break;
    }
  }

  // Follow-ups to past hits: a breakout two months back is a proven premise.
  const sequels = new Set<string>();
  for (const v of judged
    .filter((v) => v.multiple! >= 2 && daysSince(v.publishedAt) >= 60)
    .sort((a, b) => b.multiple! - a.multiple!)) {
    // The same premise on several channels is one idea, not several.
    const key = v.title.trim().toLowerCase();
    if (sequels.has(key) || sequels.size >= 3) continue;
    sequels.add(key);
    suggestions.push({
      kind: "sequel",
      idea: `A follow-up to “${v.title}”`,
      why: `It did ${v.multiple!.toFixed(1)}× ${v.channel}'s usual, ${daysSince(v.publishedAt)} days ago — the premise is proven and it's been long enough.`,
      lift: v.multiple!,
    });
  }

  // Subjects that did well but have gone quiet.
  for (const s of subjects.filter((s) => s.lift >= 1.3 && daysSince(s.lastUsed) >= 45).slice(0, 3)) {
    if (suggestions.some((x) => x.idea.includes(s.key))) continue;
    suggestions.push({
      kind: "revisit",
      idea: `Bring back ${s.key}`,
      why: `${s.count} videos at ${pct(s.lift)}, but none in ${daysSince(s.lastUsed)} days.`,
      lift: s.lift,
    });
  }

  suggestions.sort((a, b) => b.lift - a.lift);
  return { judged: judged.length, overall, formats, subjects, days, length, suggestions: suggestions.slice(0, 8) };
}

export interface IdeaCheck {
  predicted: number;
  reasons: Array<{ label: string; lift: number; count: number }>;
  format: string;
  subjects: string[];
  confidence: "low" | "medium" | "high";
}

/**
 * Score a title idea against what the category's numbers say: each known
 * format and subject moves the estimate by its lift, shrunk toward no effect
 * when it rests on few videos. 1.0× is "a typical video".
 */
export function checkIdea(title: string, a: IdeaAnalysis): IdeaCheck {
  const format = formatOf(title);
  const subjects = subjectsOf(title);
  const reasons: IdeaCheck["reasons"] = [];
  const shrink = (s: FeatureStat) => Math.pow(s.lift, s.count / (s.count + 4));
  let predicted = 1;
  let evidence = 0;
  const f = a.formats.find((x) => x.key === format);
  if (f) {
    predicted *= shrink(f);
    evidence += f.count;
    reasons.push({ label: `${f.key} format`, lift: f.lift, count: f.count });
  }
  const known = subjects
    .map((s) => a.subjects.find((x) => x.key.toLowerCase() === s.toLowerCase()))
    .filter((x): x is FeatureStat => Boolean(x));
  if (known.length) {
    // Several subjects: their average effect, not their product.
    const avg = Math.exp(known.reduce((n, s) => n + Math.log(shrink(s)), 0) / known.length);
    predicted *= avg;
    for (const s of known) {
      evidence += s.count;
      reasons.push({ label: s.key, lift: s.lift, count: s.count });
    }
  }
  const confidence = evidence >= 12 ? "high" : evidence >= 5 ? "medium" : "low";
  return { predicted, reasons, format, subjects, confidence };
}
