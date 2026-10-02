/**
 * The Specular compilation picker.
 *
 *   Specular Movie — one a day, 4 source videos (5 when four run short),
 *   roughly 60-90+ minutes, under one umbrella concept every source truly
 *   fits: one hero with four powers, four heroes in one world, one hero in
 *   four worlds, one world gone differently.
 *
 *   Specular Sleep — one every 4 days, ~4 hours of one character, franchise
 *   or theme, as many sources as that takes.
 *
 * The whole long-form catalog is eligible forever. A source can be reused,
 * but a new compilation never shares more than two sources with an earlier
 * one of its kind, and the same concept twice in a short span is marked
 * down. Movie use never affects Sleep, or the other way round. Excluded
 * videos are never picked.
 *
 * Picks are scored on concept, fit, clickability (views), freshness (one or
 * two recent uploads as anchors), catalog depth, and novelty — never simply
 * the newest. Everything here is pure; the board loads the catalog.
 */
import { formatOfTitle } from "../web/stories/formats.js";
import { readTitle } from "../web/stories/lore.js";
import { shiftDate } from "../parse/derive.js";

export type Kind = "movie" | "sleep";

export interface Source {
  id: string;
  title: string;
  channel: string;
  /** YYYY-MM-DD */
  published: string;
  /** Seconds, and where it came from; null runtime means unknown. */
  runtime: number | null;
  runtimeFrom: "youtube" | "script" | "manual" | null;
  views: number | null;
  movieUses: number;
  sleepUses: number;
}

export interface PastCompilation {
  kind: Kind;
  concept: string;
  /** YYYY-MM-DD it posted, or is planned for. */
  date: string;
  sources: string[];
}

export interface Pick {
  kind: Kind;
  concept: string;
  title: string;
  sources: Source[];
  /** Seconds; runtimes not known count as the catalog's typical length. */
  runtime: number;
  /** How many sources' runtimes are estimates. */
  estimated: number;
  score: number;
  /** Why it scored as it did, a line each. */
  why: string[];
  /** Sorted source ids — the same set is the same pick. */
  combo: string;
  /** The most sources shared with any one earlier compilation of this kind. */
  overlap: number;
}

// ── reading sources ────────────────────────────────────────────────────────

interface Read {
  s: Source;
  lead: { id: string; name: string; home: string | null } | null;
  heroes: Array<{ id: string; name: string; home: string | null; from: string }>;
  worlds: Array<{ id: string; name: string }>;
  powers: Array<{ id: string; name: string }>;
  format: string;
}

const readCache = new Map<string, Omit<Read, "s">>();
function read(s: Source): Read {
  let r = readCache.get(s.title);
  if (!r) {
    const t = readTitle(s.title);
    const heroes = t.heroes.map((h) => ({ id: h.id, name: h.name, home: (h as { home?: string }).home ?? null, from: h.from }));
    r = { lead: heroes[0] ?? null, heroes, worlds: t.worlds.map((w) => ({ id: w.id, name: w.name })), powers: t.powers.map((p) => ({ id: p.id, name: p.name })), format: formatOfTitle(s.title) };
    readCache.set(s.title, r);
  }
  return { s, ...r };
}

/** "the Sharingan" → "The Sharingan", for a title. */
const cap = (x: string) => x.replace(/^the /, "The ");
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" & ") : `${xs.slice(0, -1).join(", ")}, & ${xs[xs.length - 1]}`);

/** The catalog's typical runtime, for sources whose own isn't known yet. */
export function typicalRuntime(sources: Source[]): number {
  const known = sources.map((s) => s.runtime).filter((r): r is number => r !== null && r > 120).sort((a, b) => a - b);
  return known.length ? known[Math.floor(known.length / 2)]! : 18 * 60;
}

/**
 * One source per story: a video re-uploaded (or posted on two channels) under
 * the same title is the same story, so the most-viewed copy stands for it,
 * carrying every copy's uses.
 */
export function oneEach(sources: Source[]): Source[] {
  const by = new Map<string, Source>();
  for (const s of sources) {
    const key = s.title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const had = by.get(key);
    if (!had) { by.set(key, { ...s }); continue; }
    const keep = (s.views ?? -1) > (had.views ?? -1) ? { ...s } : had;
    const other = keep === had ? s : had;
    keep.movieUses += other.movieUses;
    keep.sleepUses += other.sleepUses;
    if (keep.runtime === null && other.runtime !== null) { keep.runtime = other.runtime; keep.runtimeFrom = other.runtimeFrom; }
    by.set(key, keep);
  }
  return [...by.values()];
}

// ── scoring ────────────────────────────────────────────────────────────────

interface Ctx {
  kind: Kind;
  today: string;
  typical: number;
  /** Views percentile per source, 0-1. */
  pct: Map<string, number>;
  past: PastCompilation[];
  skipped: Set<string>;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

function percentiles(sources: Source[]): Map<string, number> {
  const withViews = sources.filter((s) => s.views !== null).sort((a, b) => a.views! - b.views!);
  const out = new Map<string, number>();
  withViews.forEach((s, i) => out.set(s.id, withViews.length > 1 ? i / (withViews.length - 1) : 0.5));
  for (const s of sources) if (!out.has(s.id)) out.set(s.id, 0.4);
  return out;
}

/** The most sources a set shares with any one earlier compilation of the kind. */
export function maxOverlap(ids: string[], past: PastCompilation[], kind: Kind): number {
  const set = new Set(ids);
  let most = 0;
  for (const p of past) if (p.kind === kind) most = Math.max(most, p.sources.filter((x) => set.has(x)).length);
  return most;
}

const runtimeOf = (s: Source, typical: number) => s.runtime ?? typical;

function score(kind: Kind, concept: string, coherence: number, members: Read[], ctx: Ctx): { score: number; why: string[]; runtime: number; overlap: number } {
  const why: string[] = [];
  const ids = members.map((m) => m.s.id);
  const runtime = members.reduce((a, m) => a + runtimeOf(m.s, ctx.typical), 0);
  let pts = coherence;
  const clicks = members.reduce((a, m) => a + (ctx.pct.get(m.s.id) ?? 0.4), 0) / members.length;
  pts += clicks * 30;
  why.push(`sources run ${Math.round(clicks * 100)}th percentile on views`);
  const fresh = members.filter((m) => daysBetween(m.s.published, ctx.today) <= 21).length;
  if (kind === "movie") {
    pts += fresh === 1 || fresh === 2 ? 14 : fresh === 0 ? 4 : 8;
    if (fresh) why.push(`${fresh} recent upload${fresh === 1 ? "" : "s"} as ${fresh === 1 ? "the anchor" : "anchors"}`);
    const mins = runtime / 60;
    pts += mins >= 60 && mins <= 100 ? 14 : mins >= 50 && mins <= 120 ? 7 : 0;
  } else {
    pts += fresh ? 6 : 3;
    const hrs = runtime / 3600;
    pts += hrs >= 3.9 && hrs <= 4.6 ? 16 : hrs >= 3.5 && hrs <= 5 ? 8 : 0;
    // Variety within the theme: different leads and formats.
    const leads = new Set(members.map((m) => m.lead?.id ?? m.s.id)).size;
    const formats = new Set(members.map((m) => m.format)).size;
    pts += Math.min(10, (leads / members.length) * 6 + formats);
  }
  const uses = members.reduce((a, m) => a + (kind === "movie" ? m.s.movieUses : m.s.sleepUses), 0);
  if (uses) {
    pts -= Math.min(16, uses * (kind === "movie" ? 3 : 1));
    why.push(`${uses} earlier ${kind === "movie" ? "Movie" : "Sleep"} use${uses === 1 ? "" : "s"} among the sources`);
  }
  // Same concept recently: the compilation itself would feel repeated.
  const sameConcept = ctx.past.filter((p) => p.kind === kind && p.concept === concept).map((p) => daysBetween(p.date, ctx.today));
  const recent = Math.min(...sameConcept.map((d) => Math.abs(d)), Infinity);
  const window = kind === "movie" ? 30 : 40;
  if (recent <= window) {
    pts -= recent <= window / 3 ? 24 : 10;
    why.push(`same concept ${recent === 0 ? "today" : `${recent} days ${sameConcept.some((d) => d < 0) ? "away" : "ago"}`}`);
  }
  const overlap = maxOverlap(ids, ctx.past, kind);
  return { score: Math.max(0, Math.min(100, Math.round(pts))), why, runtime, overlap };
}

// ── Movies ─────────────────────────────────────────────────────────────────

interface Group {
  concept: string;
  coherence: number;
  /** Each candidate and the item it contributes to the title (a power, a world, a hero). */
  members: Array<{ r: Read; item: string }>;
  title: (items: string[]) => string;
}

/**
 * A title's shape, read from its words: who (subject), what happens (verb),
 * and to what (object) — "What If Spider-Man | Had | Mahoraga", "Could Goku |
 * Survive | The Hunger Games". The phrases are kept as the titles write
 * them, so a compilation's title uses its sources' own words.
 */
export interface Shape {
  shape: "power" | "insert" | "survive" | "hunt" | "versus" | "reborn" | "divergence";
  subject: string;
  verb: string;
  object: string;
}

const SHAPES: Array<[Shape["shape"], RegExp]> = [
  ["reborn", /^what if (.+?) (?:was|were|got) reborn(.*)$/i],
  ["power", /^what if (.+?) (had|got|bonded with|was trained by|trained with|ate|became|was a|were a|awakened) (.+)$/i],
  ["insert", /^what if (.+?) (was in|were in|joined|entered|went to|was born in|was sent to|lived in|visited|was isekaied into) (.+)$/i],
  ["hunt", /^could (.+?) (catch|outsmart|find|expose|track down) (.+)$/i],
  ["survive", /^could (.+?) (survive|stop|escape|beat|save|win|defeat|last in) (.+)$/i],
  ["versus", /^(.+?) (vs\.?|versus) (.+)$/i],
];

export function shapeOf(title: string): Shape | null {
  const t = title.replace(/\s*\((?:full movie|full story|animated|[^)]*)\)\s*$/i, "").replace(/[?!.]+$/, "").trim();
  for (const [shape, re] of SHAPES) {
    const m = re.exec(t);
    if (!m) continue;
    if (shape === "reborn") return { shape, subject: m[1]!.trim(), verb: "reborn", object: (m[2] ?? "").trim() };
    return { shape, subject: m[1]!.trim(), verb: m[2]!.toLowerCase(), object: m[3]!.trim() };
  }
  if (/^what if /i.test(t) && formatOfTitle(title) === "divergence") return { shape: "divergence", subject: t.replace(/^what if /i, ""), verb: "", object: "" };
  return null;
}

/** "The Avengers", "the avengers", "Avengers" are the same group. */
const keyOfPhrase = (p: string) => p.toLowerCase().replace(/['’]/g, "").replace(/^the /, "").replace(/[^a-z0-9]+/g, " ").trim();

function movieGroups(reads: Read[]): Group[] {
  const groups: Group[] = [];
  const buckets = new Map<string, { shape: Shape["shape"]; by: "subject" | "object"; label: string; members: Array<{ r: Read; sh: Shape }> }>();
  const put = (key: string, shape: Shape["shape"], by: "subject" | "object", label: string, r: Read, sh: Shape) => {
    const b = buckets.get(key) ?? { shape, by, label, members: [] };
    b.members.push({ r, sh });
    buckets.set(key, b);
  };
  for (const r of reads) {
    const sh = shapeOf(r.s.title);
    if (!sh) continue;
    // A character is known by its lore id where Story Lab knows it ("Spider-Man" = "Spiderman").
    const subjKey = r.lead && keyOfPhrase(sh.subject).includes(keyOfPhrase(r.lead.name).split(" ")[0]!) ? r.lead.id : keyOfPhrase(sh.subject);
    const objKey = keyOfPhrase(sh.object);
    if (sh.shape === "power" || sh.shape === "versus") put(`${sh.shape}:s:${subjKey}`, sh.shape, "subject", sh.subject, r, sh);
    if (sh.shape === "insert") {
      put(`insert:o:${objKey}`, "insert", "object", sh.object, r, sh);
      put(`insert:s:${subjKey}`, "insert", "subject", sh.subject, r, sh);
    }
    if (sh.shape === "survive" || sh.shape === "hunt") {
      put(`${sh.shape}:o:${objKey}`, sh.shape, "object", sh.object, r, sh);
      put(`${sh.shape}:s:${subjKey}`, sh.shape, "subject", sh.subject, r, sh);
    }
    if (sh.shape === "reborn" || sh.shape === "divergence") {
      const franchise = r.heroes[0]?.from ?? r.worlds[0]?.name;
      if (franchise) put(`${sh.shape}:f:${keyOfPhrase(franchise)}`, sh.shape, "subject", franchise, r, sh);
    }
  }
  const commonVerb = (members: Array<{ sh: Shape }>, fallback: string) => {
    const verbs = new Set(members.map((m) => m.sh.verb));
    return verbs.size === 1 ? [...verbs][0]! : fallback;
  };
  const titleVerb = (v: string) => v.replace(/\b\w/g, (c) => c.toUpperCase());
  for (const [key, b] of buckets) {
    if (b.members.length < 4) continue;
    const concept = key;
    const label = b.label;
    const m = b.members;
    if (b.shape === "power") {
      // One character, a different power in each.
      groups.push({ concept, coherence: 24, members: m.map(({ r, sh }) => ({ r, item: cap(sh.object) })), title: (items) => `What If ${label} Had ${list(items)}? (Full Movie)` });
    } else if (b.shape === "insert" && b.by === "object") {
      // Different characters, one universe or team.
      const verb = commonVerb(m, "were in");
      const v = verb === "joined" ? "Joined" : verb === "entered" ? "Entered" : "Were In";
      groups.push({ concept, coherence: 24, members: m.map(({ r, sh }) => ({ r, item: sh.subject })), title: (items) => `What If ${list(items)} ${v} ${cap(label)}? (Full Movie)` });
    } else if (b.shape === "insert") {
      // One character, a different universe in each.
      groups.push({ concept, coherence: 19, members: m.map(({ r, sh }) => ({ r, item: cap(sh.object) })), title: (items) => `What If ${label} Was In ${list(items)}? (Full Movie)` });
    } else if ((b.shape === "survive" || b.shape === "hunt") && b.by === "object") {
      // Different characters, one survival or chase.
      const verb = titleVerb(commonVerb(m, b.shape === "survive" ? "survive" : "catch"));
      groups.push({ concept, coherence: 22, members: m.map(({ r, sh }) => ({ r, item: sh.subject })), title: (items) => `Could ${list(items)} ${verb} ${cap(label)}? (Full Movie)` });
    } else if (b.shape === "survive" || b.shape === "hunt") {
      // One character, a different survival or chase in each.
      const verb = titleVerb(commonVerb(m, b.shape === "survive" ? "survive" : "catch"));
      groups.push({ concept, coherence: 18, members: m.map(({ r, sh }) => ({ r, item: cap(sh.object) })), title: (items) => `Could ${label} ${verb} ${list(items)}? (Full Movie)` });
    } else if (b.shape === "versus") {
      groups.push({ concept, coherence: 16, members: m.map(({ r, sh }) => ({ r, item: sh.object })), title: (items) => `${label} vs ${list(items)} (Full Movie)` });
    } else if (b.shape === "reborn") {
      groups.push({ concept, coherence: 17, members: m.map(({ r, sh }) => ({ r, item: sh.subject })), title: (items) => `What If ${list(items)} Were Reborn With Their Memories? (Full Movie)` });
    } else if (b.shape === "divergence") {
      // Alternate versions of one franchise's events.
      groups.push({ concept, coherence: 18, members: m.map(({ r }) => ({ r, item: r.s.id })), title: () => `What If ${label} Went Completely Differently? (Full Movie)` });
    }
  }
  return groups;
}

/** Combinations from a group: the best four with distinct title items, and variations of it. */
function combosOf(g: Group, ctx: Ctx, size: number): Array<Array<{ r: Read; item: string }>> {
  const value = (m: { r: Read }) =>
    (ctx.pct.get(m.r.s.id) ?? 0.4) * 2 + (daysBetween(m.r.s.published, ctx.today) <= 21 ? 0.8 : 0) - m.r.s.movieUses * 0.35;
  const ranked = [...g.members].sort((a, b) => value(b) - value(a));
  // One source per title item: "Had The Sharingan, The Sharingan" isn't a title.
  const unique: typeof ranked = [];
  const seen = new Set<string>();
  for (const m of ranked) if (!seen.has(m.item)) { seen.add(m.item); unique.push(m); }
  if (unique.length < size) return [];
  const out: Array<typeof unique> = [unique.slice(0, size)];
  // Variations: swap each of the top picks for the next one down.
  for (let drop = 0; drop < size && out.length < 8; drop++) {
    for (let add = size; add < Math.min(unique.length, size + 4) && out.length < 8; add++) {
      out.push([...unique.slice(0, size).filter((_, i) => i !== drop), unique[add]!]);
    }
  }
  return out;
}

/** Every Movie worth considering, best first. */
export function moviePicks(sources: Source[], past: PastCompilation[], opts: { today: string; skipped?: Set<string>; limit?: number }): Pick[] {
  const ctx: Ctx = { kind: "movie", today: opts.today, typical: typicalRuntime(sources), pct: percentiles(sources), past, skipped: opts.skipped ?? new Set() };
  const reads = sources.map(read);
  const out: Pick[] = [];
  for (const g of movieGroups(reads)) {
    for (const size of [4, 5]) {
      for (const combo of combosOf(g, ctx, size)) {
        // Four whose sources run short take a fifth; five only when four fall short.
        const secs = combo.reduce((a, m) => a + runtimeOf(m.r.s, ctx.typical), 0);
        if (size === 5 && combo.slice(0, 4).reduce((a, m) => a + runtimeOf(m.r.s, ctx.typical), 0) >= 55 * 60) continue;
        if (size === 4 && secs < 45 * 60) continue;
        // Most recent first reads naturally in a title; the editor package settles the play order.
        const ordered = [...combo].sort((a, b) => b.r.s.published.localeCompare(a.r.s.published));
        const ids = ordered.map((m) => m.r.s.id);
        const key = [...ids].sort().join(",");
        if (ctx.skipped.has(key)) continue;
        const sc = score("movie", g.concept, g.coherence, ordered.map((m) => m.r), ctx);
        if (sc.overlap > 2) continue;
        out.push({
          kind: "movie", concept: g.concept, title: g.title(ordered.map((m) => m.item)), sources: ordered.map((m) => m.r.s), runtime: sc.runtime,
          estimated: ordered.filter((m) => m.r.s.runtime === null).length, score: sc.score, why: sc.why, combo: key, overlap: sc.overlap,
        });
      }
    }
  }
  return dedupe(out).slice(0, opts.limit ?? 40);
}

// ── Sleep ──────────────────────────────────────────────────────────────────

const SLEEP_TARGET = 4 * 3600;

/** Every Sleep marathon worth considering, best first. */
export function sleepPicks(sources: Source[], past: PastCompilation[], opts: { today: string; skipped?: Set<string>; limit?: number }): Pick[] {
  const ctx: Ctx = { kind: "sleep", today: opts.today, typical: typicalRuntime(sources), pct: percentiles(sources), past, skipped: opts.skipped ?? new Set() };
  const reads = sources.map(read);
  // Themes: a franchise (the world a story is set in or its lead comes from) or a character.
  const themes = new Map<string, { name: string; members: Read[]; coherence: number }>();
  const add = (key: string, name: string, r: Read, coherence: number) => {
    const t = themes.get(key) ?? { name, members: [], coherence };
    if (!t.members.includes(r)) t.members.push(r);
    themes.set(key, t);
  };
  for (const r of reads) {
    if (r.lead) add(`sleep:hero:${r.lead.id}`, r.lead.name, r, 22);
    for (const w of r.worlds) add(`sleep:world:${w.id}`, w.name, r, 20);
    if (r.lead?.home && !r.worlds.some((w) => w.id === r.lead!.home)) {
      const home = r.heroes[0]!;
      add(`sleep:world:${r.lead.home}`, home.from, r, 20);
    }
  }
  const out: Pick[] = [];
  for (const [concept, t] of themes) {
    const pool = t.members;
    if (pool.reduce((a, r) => a + runtimeOf(r.s, ctx.typical), 0) < SLEEP_TARGET * 0.85) continue;
    const value = (r: Read) => (ctx.pct.get(r.s.id) ?? 0.4) * 2 - r.s.sleepUses * 0.4 + (daysBetween(r.s.published, ctx.today) <= 30 ? 0.3 : 0);
    const ranked = [...pool].sort((a, b) => value(b) - value(a));
    // A few different fills per theme, each starting further down the list.
    for (let start = 0; start < Math.min(4, ranked.length); start++) {
      const order = [...ranked.slice(start), ...ranked.slice(0, start)];
      const chosen: Read[] = [];
      let secs = 0;
      const leads = new Map<string, number>();
      for (const r of order) {
        if (secs >= SLEEP_TARGET) break;
        // Variety: no one lead more than a third of the marathon.
        const lead = r.lead?.id ?? r.s.id;
        // (A character's own marathon is all theirs, so it only applies to a franchise.)
        if (!concept.startsWith("sleep:hero:") && (leads.get(lead) ?? 0) >= Math.max(2, Math.ceil(pool.length / 3)) && order.length > 8) continue;
        const trial = [...chosen, r];
        if (maxOverlap(trial.map((x) => x.s.id), past, "sleep") > 2) continue;
        chosen.push(r);
        leads.set(lead, (leads.get(lead) ?? 0) + 1);
        secs += runtimeOf(r.s, ctx.typical);
      }
      if (secs < SLEEP_TARGET * 0.9) continue;
      const ids = chosen.map((r) => r.s.id);
      const key = [...ids].sort().join(",");
      if (ctx.skipped.has(key)) continue;
      const sc = score("sleep", concept, t.coherence, chosen, ctx);
      const hours = Math.round(secs / 3600);
      out.push({
        kind: "sleep", concept, title: `${hours} Hours of Custom ${t.name} Lore To Fall Asleep To`,
        sources: [...chosen].sort((a, b) => a.s.published.localeCompare(b.s.published)).map((r) => r.s),
        runtime: secs, estimated: chosen.filter((r) => r.s.runtime === null).length, score: sc.score, why: sc.why, combo: key, overlap: sc.overlap,
      });
    }
  }
  return dedupe(out).slice(0, opts.limit ?? 30);
}

/** Best first, one pick per source set, and no more than two of any one concept near the top. */
function dedupe(picks: Pick[]): Pick[] {
  const seen = new Set<string>();
  const perConcept = new Map<string, number>();
  const sorted = [...picks].sort((a, b) => b.score - a.score || a.combo.localeCompare(b.combo));
  const first: Pick[] = [];
  const rest: Pick[] = [];
  for (const p of sorted) {
    if (seen.has(p.combo)) continue;
    seen.add(p.combo);
    const n = perConcept.get(p.concept) ?? 0;
    perConcept.set(p.concept, n + 1);
    (n < 2 ? first : rest).push(p);
  }
  return [...first, ...rest];
}

// ── earlier compilations, read back from their titles ─────────────────────

/**
 * An older Movie's likely sources, read from its title: the catalog videos
 * published before it whose lead and power/world both appear in it. Only
 * trusted when it finds as many as the title lists (or 3-5 for a concept
 * title); otherwise it returns nothing rather than a guess.
 */
export function inferMovieSources(compTitle: string, compDate: string, catalog: Source[]): string[] {
  const t = readTitle(compTitle);
  const heroes = new Set(t.heroes.map((h) => h.id));
  const worlds = new Set(t.worlds.map((w) => w.id));
  const powers = new Set(t.powers.map((p) => p.id));
  const found: Array<{ id: string; strength: number }> = [];
  for (const s of catalog) {
    if (s.published > compDate) continue;
    const r = read(s);
    if (!r.lead) continue;
    const leadIn = heroes.has(r.lead.id);
    const powerIn = r.powers.some((p) => powers.has(p.id));
    const worldIn = r.worlds.some((w) => worlds.has(w.id));
    const otherIn = r.heroes.slice(1).some((h) => heroes.has(h.id));
    if (leadIn && (powerIn || worldIn || otherIn)) found.push({ id: s.id, strength: 2 + Number(powerIn) + Number(worldIn) });
  }
  const listed = Math.max(t.powers.length, t.worlds.length, t.heroes.length);
  if (found.length < 3 || found.length > 6 || found.length > Math.max(listed, 4) + 1) return [];
  return found.sort((a, b) => b.strength - a.strength).map((f) => f.id);
}

/** An older Sleep's theme, read from its title — its sources can't be known from the title alone. */
export function inferSleepConcept(compTitle: string): string {
  const t = readTitle(compTitle);
  if (t.worlds[0]) return `sleep:world:${t.worlds[0].id}`;
  if (t.heroes[0]) return `sleep:hero:${t.heroes[0].id}`;
  return "";
}

/** An older Movie's concept key, read from its title, for the repeat check. */
export function inferMovieConcept(compTitle: string): string {
  const t = readTitle(compTitle);
  if (t.heroes.length === 1 && t.powers.length >= 2) return `hero-powers:${t.heroes[0]!.id}`;
  if (t.heroes.length === 1 && t.worlds.length >= 2) return `hero-worlds:${t.heroes[0]!.id}`;
  if (t.heroes.length >= 2 && t.worlds.length === 1) return `world-crossover:${t.worlds[0]!.id}`;
  return "";
}

// ── slots ──────────────────────────────────────────────────────────────────

/** The next day from today with no Movie on it (and not a day off). */
export function nextMovieSlot(today: string, taken: Set<string>, daysOff: Set<string> = new Set()): string {
  let d = today;
  for (let i = 0; i < 400 && (taken.has(d) || daysOff.has(d)); i++) d = shiftDate(d, 1);
  return d;
}

/** Sleep every 4 days from the last one posted or planned; never before today. */
export function nextSleepSlot(today: string, lastSleep: string | null, taken: Set<string>): string {
  let d = lastSleep ? shiftDate(lastSleep, 4) : today;
  if (d < today) d = today;
  for (let i = 0; i < 200 && taken.has(d); i++) d = shiftDate(d, 4);
  return d;
}
