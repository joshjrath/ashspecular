/**
 * The Stories scripts the Story Lab learns from (corpus.json, built by
 * scripts/build-story-corpus.py), read once at start-up: each script split
 * into its sections, classified by format, hero and world, and measured.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatOfTitle, type FormatId } from "./formats.js";
import { WORLD_BY_ID, readTitle, type Hero, type Power, type World } from "./lore.js";

export interface Section {
  name: string; // INTRO, PART 3, OUTRO
  label: string;
  paras: string[];
  words: number;
  names: Record<string, number>;
}

export interface Script {
  title: string;
  file: string;
  words: number;
  sections: Section[];
  format: FormatId;
  heroes: Hero[];
  worlds: World[];
  powers: Power[];
  metrics: Metrics;
}

export interface Metrics {
  words: number;
  parts: number;
  introWords: number;
  hasOutro: boolean;
  partWords: number[];
  /** Words a sentence, median. */
  sentence: number;
  /** Sentences a paragraph, median. */
  paragraph: number;
  /** "would"/"could"/"might"/"probably" per thousand words. */
  conditional: number;
  /** Parts ending on a line that points forward ("…once", "…next", "Then …"). */
  forwardClosers: number;
  /** "That doesn't mean…", "canon never shows…" and the like. */
  caveats: number;
  /** Section index (0 = intro) where each name is first said. */
  firstSaid: Record<string, number>;
}

const here = dirname(fileURLToPath(import.meta.url));

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/).map((s) => s.trim()).filter(Boolean);
}

const CONDITIONAL = /\b(would|could|might|probably|wouldn['’]t|couldn['’]t|he['’]d|she['’]d|they['’]d|you['’]d)\b/gi;
const CAVEAT = /(that (doesn['’]t|wouldn['’]t) (mean|automatically)|doesn['’]t automatically|never (shows|establishes|gives us|confirms)|canon (never|doesn['’]t)|hasn['’]t (shown|been shown|demonstrated)|isn['’]t guaranteed|not guaranteed|we can['’]t assume|no (demonstrated|established|clean) (answer|feat|defense|way))/gi;
const FORWARD = /\b(next|until|once|then|now|about to|eventually|would become|before|after that|that['’]s when|that['’]s where)\b/i;

export function measure(sections: Section[]): Metrics {
  const all = sections.map((s) => s.paras.join(" ")).join(" ");
  const words = all.split(/\s+/).filter(Boolean).length || 1;
  const parts = sections.filter((s) => s.name.startsWith("PART"));
  const paras = sections.flatMap((s) => s.paras);
  const firstSaid: Record<string, number> = {};
  sections.forEach((s, i) => {
    for (const n of Object.keys(s.names)) if (!(n in firstSaid)) firstSaid[n] = i;
  });
  return {
    words,
    parts: parts.length,
    introWords: sections[0]?.name === "INTRO" ? sections[0].words : 0,
    hasOutro: sections.some((s) => s.name === "OUTRO"),
    partWords: parts.map((p) => p.words),
    sentence: median(sentencesOf(all).map((s) => s.split(/\s+/).length)),
    paragraph: median(paras.map((p) => sentencesOf(p).length)),
    conditional: Math.round(((all.match(CONDITIONAL)?.length ?? 0) / words) * 1000 * 10) / 10,
    forwardClosers: parts.length ? parts.filter((p) => FORWARD.test(sentencesOf(p.paras.join(" ")).at(-1) ?? "")).length / parts.length : 0,
    caveats: all.match(CAVEAT)?.length ?? 0,
    firstSaid,
  };
}

// ── splitting a script the way the writers do ──────────────────────────────

const PLAIN = /^\s*(INTRO|OUTRO|VERDICT\/OUTRO|FINAL CASE|PAR[TR]\s*-?\s*(\d+)\s*:?)\s*\.?\s*$/i;
const BRACK = /^\s*\[(?:SECTION\s*[—-]\s*)?(INTRO|OUTRO|PART\s*(\d+))\s*(?:[—-]\s*([^\]]*))?\]\s*(.*)$/i;
const NOT_NAMES = new Set(
  ("A An The This That These Those It Its He She They We You I If When Once By At In On For From With Without After Before During Instead Even Still But And Or So Then Now There Here What Why How Who Which Nothing None Some Most Every Each Another Other One Two First Second Third Part Intro Outro Maybe Probably Eventually Because Although While Until Since Unless As Not No Yes Up Out Over Under Into Onto Both Either Neither All Any More Less Much Many Few Several Everyone Someone Anyone Nobody Somebody Everything Something Anything His Her Their Our My Your Them Him Us Me People Others Just Only Also Yet Too Very Really Almost Perhaps Later Soon Meanwhile Sometimes")
    .split(" "),
);

export function namesIn(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z'’-]+(?:\s+(?:of\s+)?[A-Z][a-zA-Z'’-]*){0,3})/g)) {
    const words = m[1]!.split(/\s+/).filter((w) => !NOT_NAMES.has(w) && !/^(He|She|They|We|You|I|It|That|There|Who|What)['’]/.test(w));
    if (!words.length) continue;
    const name = words.join(" ").replace(/['’]s$/, "");
    if (name.length < 3) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/** A pasted script, split into INTRO / PART n / OUTRO like the corpus. */
export function splitScript(text: string, title = ""): Section[] {
  const sections: Section[] = [];
  let cur = { name: "INTRO", label: "", paras: [] as string[] };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim().replace(/^\*+|\*+$/g, "").trim();
    const plain = line.length < 30 ? PLAIN.exec(line) : null;
    const brack = BRACK.exec(line);
    if (plain || brack) {
      if (cur.paras.length) sections.push({ ...cur, words: 0, names: {} });
      const kind = (brack?.[1] ?? plain![1]!).toUpperCase();
      const num = brack?.[2] ?? plain?.[2];
      const rest = brack?.[4]?.trim() ?? "";
      cur = {
        name: num ? `PART ${Number(num)}` : kind.includes("OUTRO") || kind.includes("FINAL") ? "OUTRO" : "INTRO",
        label: brack?.[3]?.trim() ?? "",
        paras: rest ? [rest] : [],
      };
    } else if (line && line.toLowerCase().replace(/\?$/, "") !== title.toLowerCase().replace(/\?$/, "")) {
      cur.paras.push(line.replace(/^\[CLIP NOTE:[^\]]*\]\s*/, ""));
    }
  }
  if (cur.paras.length) sections.push({ ...cur, words: 0, names: {} });
  return sections.map((s) => {
    const t = s.paras.join(" ");
    return { ...s, words: t.split(/\s+/).filter(Boolean).length, names: namesIn(t) };
  });
}

// ── the corpus ─────────────────────────────────────────────────────────────

let loaded: Script[] | null = null;

/** Read the scripts again next time — after the lore changes, so new names are recognised in their titles. */
export function resetCorpus(): void {
  loaded = null;
}

export function corpus(): Script[] {
  if (loaded) return loaded;
  let raw: { scripts: Array<{ title: string; file: string; words: number; sections: Section[] }> } = { scripts: [] };
  for (const p of [join(here, "corpus.json"), join(process.cwd(), "src", "web", "stories", "corpus.json")]) {
    try {
      raw = JSON.parse(readFileSync(p, "utf8"));
      break;
    } catch {
      /* try the next place */
    }
  }
  loaded = raw.scripts.map((s) => {
    const read = readTitle(s.title);
    const format = formatOfTitle(s.title);
    // A story that stays in the lead's own world (a divergence, a rebirth)
    // belongs to that world even when the title doesn't name it.
    const home = read.heroes[0]?.home;
    const worlds = read.worlds.length || !home ? read.worlds : [WORLD_BY_ID.get(home)!].filter(Boolean);
    return { ...s, format, ...read, worlds, metrics: measure(s.sections) };
  });
  return loaded;
}

/** Norms for a format (or every script): medians and a typical range. */
export interface Norms {
  scripts: number;
  words: number;
  parts: number;
  partWords: [number, number, number];
  introWords: [number, number];
  sentence: number;
  paragraph: number;
  conditional: [number, number];
  forwardClosers: number;
  caveats: number;
  outroShare: number;
}

export function normsFor(scripts: Script[]): Norms {
  const q = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0;
  };
  const m = scripts.map((s) => s.metrics);
  const pw = m.flatMap((x) => x.partWords);
  const cond = m.map((x) => x.conditional);
  const intro = m.map((x) => x.introWords).filter((n) => n > 0);
  return {
    scripts: scripts.length,
    words: median(m.map((x) => x.words)),
    parts: median(m.map((x) => x.parts)),
    partWords: [q(pw, 0.1), median(pw), q(pw, 0.9)],
    introWords: [q(intro, 0.1), q(intro, 0.9)],
    sentence: median(m.map((x) => x.sentence)),
    paragraph: median(m.map((x) => x.paragraph)),
    conditional: [q(cond, 0.1), q(cond, 0.9)],
    forwardClosers: median(m.map((x) => x.forwardClosers)),
    caveats: median(m.map((x) => x.caveats)),
    outroShare: m.filter((x) => x.hasOutro).length / (m.length || 1),
  };
}

/** Scripts closest to an idea: same world and format first, then same world, then same hero, then same format. */
export function referencesFor(format: FormatId, hero?: Hero | null, world?: World | null, power?: Power | null, n = 3): Script[] {
  const score = (s: Script) =>
    (world && s.worlds.some((w) => w.id === world.id) ? 4 : 0) +
    (s.format === format ? 3 : 0) +
    (hero && s.heroes.some((h) => h.id === hero.id) ? 2 : 0) +
    (power && s.powers.some((p) => p.id === power.id) ? 2 : 0);
  return corpus()
    .map((s) => ({ s, k: score(s) }))
    .filter((x) => x.k > 0)
    .sort((a, b) => b.k - a.k || b.s.metrics.parts - a.s.metrics.parts)
    .slice(0, n)
    .map((x) => x.s);
}

/** The part of a script whose names or position best match a beat. */
export function partFor(script: Script, at: number[], names: string[] = []): Section | null {
  const parts = script.sections.filter((s) => s.name.startsWith("PART"));
  if (!parts.length) return null;
  const scale = parts.length / 10;
  const wanted = at.map((a) => Math.max(1, Math.round(a * scale)));
  const byName = names.length
    ? parts.find((p, i) => wanted.some((w) => Math.abs(w - (i + 1)) <= 1) && names.some((n) => n in p.names))
    : undefined;
  return byName ?? parts[Math.min(parts.length - 1, wanted[0]! - 1)] ?? null;
}

export function firstSentence(section: Section): string {
  return sentencesOf(section.paras.join(" "))[0] ?? "";
}
export function lastSentence(section: Section): string {
  return sentencesOf(section.paras.join(" ")).at(-1) ?? "";
}
