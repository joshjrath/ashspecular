/**
 * What to write next for Stories — ranked, with the evidence.
 *
 * Every combination the lore allows (a hero dropped into a world, put
 * through a survival setting, handed another franchise's power, set against
 * a target) is scored on three things, each shown on the page:
 *
 *   performance  how the channel's own uploads with this hero, this world
 *                and this format did against their channel's usual — pulled
 *                toward "no effect" when there are only a few of them
 *   fit          whether the world rewards this kind of hero (The Boys
 *                rewards outsiders whose power Vought can't classify; a
 *                survival setting rewards heroes whose strengths it can get
 *                around) — from lore.ts
 *   freshness    anything already written or uploaded is out; the same
 *                pairing in another format, or a hero used a lot lately,
 *                counts against it
 *
 * The corpus supplies the proof that a structure works: a world with several
 * scripts already has a tested shape to follow.
 */
import { FORMAT_BY_ID, formatOfTitle, type FormatId } from "./formats.js";
import { HEROES, POWERS, WORLDS, readTitle, type Hero, type Power, type World } from "./lore.js";
import { corpus, measure, type Script } from "./corpus.js";
import { SHAPES, fillShape } from "./added.js";

export interface LabVideo {
  title: string;
  multiple: number | null;
  publishedAt: Date;
}

export interface LabIdea {
  key: string;
  format: FormatId;
  hero: Hero | null;
  world: World | null;
  power: Power | null;
  target: Hero | null;
  title: string;
  score: number;
  reasons: Array<{ text: string; lift: number }>;
  /** A title shape added from the dice, on this format's structure. */
  shape?: string;
}

const TARGET_ONLY = new Set(["light", "joker", "walter", "avengers"]);
const DETECTIVES = ["l", "dexter", "batman", "otto"];
const TARGETS = ["light", "joker", "walter", "dexter", "batman", "afton", "homelander", "doom"];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : 0;
}

export function keyOf(format: FormatId, hero?: string | null, world?: string | null, power?: string | null, target?: string | null): string {
  return [format, hero ?? "", world ?? "", power ?? "", target ?? ""].join("|");
}

/** Read a title into the same key the ideas use. */
export function keyOfTitle(title: string): { key: string; pair: string; pairs: string[] } {
  const f = formatOfTitle(title);
  const r = readTitle(title);
  const hero = r.heroes[0]?.id ?? null;
  const other = r.heroes[1]?.id ?? null;
  const world = r.worlds[0]?.id ?? (f === "reborn" || f === "divergence" ? r.heroes[0]?.home ?? null : null);
  const power = r.powers[0]?.id ?? null;
  const target = f === "hunt" || f === "versus" ? other : null;
  // Two characters from different worlds pair each with the other's world:
  // "Springtrap Ate Homelander" is Afton in The Boys.
  const pairs = [[hero, world ?? power ?? target].join("|")];
  for (const a of r.heroes) for (const b of r.heroes) if (a !== b && b.home) pairs.push(`${a.id}|${b.home}`);
  for (const a of r.heroes) for (const w of r.worlds) pairs.push(`${a.id}|${w.id}`);
  for (const a of r.heroes) for (const p of r.powers) {
    const home = WORLDS.find((w) => w.name === p.from);
    if (home) pairs.push(`${a.id}|${home.id}`);
  }
  return { key: keyOf(f, hero, world, power, target), pair: pairs[0]!, pairs: [...new Set(pairs)] };
}

/** Normalised title, for matching a script to its upload. */
export const norm = (t: string) => t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

interface Stat { n: number; lift: number; median: number }

export function perfStats(videos: LabVideo[]): { overall: number; hero: Map<string, Stat>; world: Map<string, Stat>; format: Map<string, Stat>; power: Map<string, Stat> } {
  const judged = videos.filter((v) => v.multiple !== null && v.multiple > 0);
  const overall = median(judged.map((v) => v.multiple!)) || 1;
  const buckets = { hero: new Map<string, number[]>(), world: new Map<string, number[]>(), format: new Map<string, number[]>(), power: new Map<string, number[]>() };
  const push = (m: Map<string, number[]>, k: string | undefined | null, x: number) => {
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  };
  for (const v of judged) {
    const r = readTitle(v.title);
    const f = formatOfTitle(v.title);
    push(buckets.format, f, v.multiple!);
    for (const h of r.heroes.slice(0, 2)) push(buckets.hero, h.id, v.multiple!);
    for (const w of r.worlds.slice(0, 1)) push(buckets.world, w.id, v.multiple!);
    for (const p of r.powers.slice(0, 1)) push(buckets.power, p.id, v.multiple!);
  }
  const toStats = (m: Map<string, number[]>) =>
    new Map(
      [...m].map(([k, xs]) => {
        const med = median(xs);
        // Pulled toward "no effect": three videos can't carry a rule.
        const k0 = 3;
        return [k, { n: xs.length, median: med, lift: (xs.length * (med / overall) + k0) / (xs.length + k0) }];
      }),
    );
  return { overall, hero: toStats(buckets.hero), world: toStats(buckets.world), format: toStats(buckets.format), power: toStats(buckets.power) };
}

const FORMAT_NAME: Record<FormatId, string> = {
  insert: "crossover insertions",
  power: "power swaps",
  survive: "survival tests",
  hunt: "detective duels",
  versus: "versus breakdowns",
  reborn: "reborn-with-memories",
  divergence: "alternate histories",
  you: "second-person stories",
  explainer: "explainers",
  game: "game videos",
};

/** A video already on YouTube, on any channel. */
export interface PublicVideo {
  title: string;
  url: string;
  channel: string;
}

const FILLER = new Set("what if could would how the a an in of to vs was were is be had has got with his her their you your survive catch join joined".split(" "));
const wordsOf = (t: string) => new Set(norm(t).split(" ").filter((w) => w && !FILLER.has(w)));

/**
 * The public video an idea would repeat, if any: the same character with
 * the same world, power or opponent in any format ("Could Spider-Man Survive
 * World War Z" rules out every Spider-Man × World War Z idea), or a title
 * that's nearly the same words.
 */
export function publicMatch(
  idea: { hero?: Hero | null; world?: World | null; power?: Power | null; target?: Hero | null; title: string },
  published: PublicVideo[],
  index = indexPublic(published),
): PublicVideo | null {
  const other = idea.world?.id ?? idea.power?.id ?? idea.target?.id;
  const pairs = [idea.hero && other ? `${idea.hero.id}|${other}` : null, !idea.hero && other ? `you|${other}` : null].filter(Boolean) as string[];
  for (const p of pairs) {
    const hit = index.pairs.get(p);
    if (hit) return hit;
  }
  const mine = wordsOf(idea.title);
  if (mine.size >= 2) {
    // Only the videos sharing a word can match: counted through each word's list.
    const shared = new Map<number, number>();
    for (const w of mine) for (const i of index.postings.get(w) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
    let best: number | null = null;
    for (const [i, n] of shared) {
      const theirs = index.words[i]!.words.size;
      if (n / (mine.size + theirs - n) >= 0.75 && (best === null || i < best)) best = i;
    }
    if (best !== null) return index.words[best]!.video;
  }
  return null;
}

export interface PublicIndex {
  pairs: Map<string, PublicVideo>;
  words: Array<{ words: Set<string>; video: PublicVideo }>;
  /** Each word, and the videos (by position in `words`) whose titles have it. */
  postings: Map<string, number[]>;
}

/** The last index built, reused while the list of public videos is the same. */
let lastIndex: { sig: string; index: PublicIndex } | null = null;
const sigOf = (published: PublicVideo[]) =>
  // The lore's size too: an added hero or world reads the same titles differently.
  `${HEROES.length}.${WORLDS.length}.${POWERS.length}|${published.length}|${published[0]?.url ?? ""}|${published.at(-1)?.url ?? ""}|${published[published.length >> 1]?.url ?? ""}`;

export function indexPublic(published: PublicVideo[]): PublicIndex {
  const sig = sigOf(published);
  if (lastIndex?.sig === sig) return lastIndex.index;
  const index = buildIndex(published);
  lastIndex = { sig, index };
  return index;
}

function buildIndex(published: PublicVideo[]): PublicIndex {
  const pairs = new Map<string, PublicVideo>();
  for (const v of published) {
    const k = keyOfTitle(v.title);
    for (const p of k.pairs) if (!p.startsWith("|") && !p.endsWith("|") && !pairs.has(p)) pairs.set(p, v);
    // "What If YOU …" titles pair the viewer with the world or power.
    if (/^what if you\b|^how i'?d/i.test(v.title.trim())) {
      const r = readTitle(v.title);
      for (const x of [...r.worlds.map((w) => w.id), ...r.powers.map((pw) => pw.id)]) if (!pairs.has(`you|${x}`)) pairs.set(`you|${x}`, v);
    }
  }
  const words = published.map((v) => ({ words: wordsOf(v.title), video: v }));
  const postings = new Map<string, number[]>();
  words.forEach((x, i) => {
    for (const w of x.words) {
      const list = postings.get(w);
      if (list) list.push(i);
      else postings.set(w, [i]);
    }
  });
  return { pairs, words, postings };
}

export function labIdeas(
  videos: LabVideo[],
  now: Date = new Date(),
  limit = 24,
  published: PublicVideo[] = [],
  held: PublicVideo[] = [],
  /** Spread the list across heroes, worlds, powers and formats; off, every idea best first (for a channel to pick from). */
  spread = true,
  /** Items just added from the dice ("hero:gojo", "shape:hundreddays"): brought forward, so they come up. */
  fresh: Set<string> = new Set(),
): LabIdea[] {
  const pub = indexPublic(published);
  const perf = perfStats(videos);
  const scripts = corpus();

  // Done: every script written and every title uploaded.
  const doneKeys = new Set<string>();
  const donePairs = new Map<string, number>();
  for (const t of [...scripts.map((s) => s.title), ...videos.map((v) => v.title)]) {
    const k = keyOfTitle(t);
    doneKeys.add(k.key);
    for (const p of k.pairs) donePairs.set(p, (donePairs.get(p) ?? 0) + 1);
  }
  // How much each hero was used lately.
  const recentHero = new Map<string, number>();
  for (const v of videos) {
    if (now.getTime() - v.publishedAt.getTime() > 60 * 86_400_000) continue;
    for (const h of readTitle(v.title).heroes.slice(0, 1)) recentHero.set(h.id, (recentHero.get(h.id) ?? 0) + 1);
  }
  const scriptsInWorld = (id: string) => scripts.filter((s) => s.worlds.some((w) => w.id === id));

  const out: LabIdea[] = [];
  const consider = (format: FormatId, hero: Hero | null, world: World | null, power: Power | null, target: Hero | null, title: string) => {
    const key = keyOf(format, hero?.id, world?.id, power?.id, target?.id);
    if (doneKeys.has(key)) return;
    // Already on YouTube in any shape, on any channel: never suggested.
    const already = publicMatch({ hero, world, power, target, title }, published, pub);
    if (already) {
      if (!held.some((h) => h.url === already.url)) held.push(already);
      return;
    }
    const reasons: LabIdea["reasons"] = [];
    let score = 1;

    const use = (stat: Stat | undefined, what: string) => {
      if (!stat || stat.n < 2) return;
      score *= stat.lift;
      reasons.push({ text: `${what}: ${stat.n} uploads at a median ${stat.median.toFixed(1)}× their channel's usual`, lift: stat.lift });
    };
    if (hero) use(perf.hero.get(hero.id), hero.name);
    if (target) use(perf.hero.get(target.id), target.name);
    if (world) use(perf.world.get(world.id), world.name);
    if (power) use(perf.power.get(power.id), power.name);
    use(perf.format.get(format), cap(FORMAT_NAME[format]));

    // Fit: does this world reward this kind of hero?
    if (world && hero) {
      const shared = hero.tags.filter((t) => world.wants.includes(t));
      const f = shared.length >= 3 ? 1.12 : shared.length === 2 ? 1.08 : shared.length === 1 ? 1.0 : 0.9;
      score *= f;
      reasons.push({
        text: shared.length ? `${world.name} rewards ${shared.join(", ")} heroes — ${hero.name} is ${shared.length > 1 ? "all of that" : "that"}` : `${hero.name} isn't the kind of hero ${world.name} usually rewards`,
        lift: f,
      });
    }
    if (power && hero) {
      // A power that pushes on the hero's own flaw makes the richer script.
      const f = hero.tags.includes("moral") ? 1.06 : 1.0;
      score *= f;
      if (f > 1) reasons.push({ text: `The catch — ${power.cost} — tests exactly what ${hero.name} stands for: ${hero.code}`, lift: f });
    }

    // The writers' own repeated choices: a world or hero they keep coming
    // back to has earned it, and has a tested structure to follow.
    if (world) {
      const n = scriptsInWorld(world.id).length;
      if (n >= 2) {
        const f = 1 + 0.02 * Math.min(n, 12);
        score *= f;
        reasons.push({ text: `${n} scripts already set in ${world.name} — the writers keep coming back to it, and the structure is tested`, lift: f });
      } else if (world.fresh) {
        reasons.push({ text: `${world.name} is new for the channel — fresh audience, untested structure`, lift: 1 });
      }
    }
    if (hero) {
      const n = scripts.filter((s) => s.heroes[0]?.id === hero.id).length;
      if (n >= 2) {
        const f = 1 + 0.015 * Math.min(n, 10);
        score *= f;
        reasons.push({ text: `${hero.name} leads ${n} scripts — a proven lead`, lift: f });
      }
    }

    // Just added from the dice: brought forward so it comes up in the cards and rerolls.
    const newItem = [hero && `hero:${hero.id}`, target && `target:${target.id}`, target && `hero:${target.id}`, world && `world:${world.id}`, power && `power:${power.id}`]
      .filter((k): k is string => Boolean(k))
      .find((k) => fresh.has(k));
    if (newItem) {
      score *= 1.15;
      reasons.push({ text: `${[hero, target, world, power].find((x) => x && newItem.endsWith(`:${x.id}`))?.name ?? "This"} was just added from the dice`, lift: 1.15 });
    }

    // Freshness.
    const pair = [hero?.id ?? null, world?.id ?? power?.id ?? target?.id ?? null].join("|");
    const seen = donePairs.get(pair) ?? 0;
    if (seen) {
      const f = 0.85 ** seen;
      score *= f;
      reasons.push({ text: `${hero?.name ?? "This"} with ${world?.name ?? power?.name ?? target?.name} has been done in another format`, lift: f });
    }
    const recent = hero ? recentHero.get(hero.id) ?? 0 : 0;
    if (recent >= 2) {
      const f = 0.97 ** recent;
      score *= f;
      reasons.push({ text: `${hero!.name} led ${recent} uploads in the last 60 days`, lift: f });
    }
    const sorted = reasons.sort((a, b) => Math.abs(b.lift - 1) - Math.abs(a.lift - 1));
    out.push({ key, format, hero, world, power, target, title, score, reasons: sorted });
    // Title shapes added from the dice: the same idea, titled the new way,
    // built on this format's structure — a touch below the tested title.
    for (const shape of SHAPES.filter((x) => x.base === format)) {
      const t = fillShape(shape, { hero: hero?.name, world: world?.name, power: power ? titleCase(power.name) : null, target: target?.name });
      if (!t) continue;
      const lift = fresh.has(`shape:${shape.id}`) ? 0.97 * 1.15 : 0.97;
      const note = { text: `A new title shape — ${shape.name}${lift > 1 ? ", just added from the dice" : ""} — on the ${FORMAT_NAME[format]} structure the scripts use`, lift };
      out.push({ key: `${key}|${shape.id}`, format, hero, world, power, target, title: t, score: score * lift, reasons: [note, ...sorted], shape: shape.id });
    }
  };

  // Leads, detectives and targets — the lore's own, and any added from the dice.
  const heroes = HEROES.filter((h) => !TARGET_ONLY.has(h.id) && h.role !== "target");
  const detectives = [...DETECTIVES, ...HEROES.filter((h) => h.role === "detective").map((h) => h.id)];
  const targets = [...TARGETS, ...HEROES.filter((h) => h.role === "target").map((h) => h.id)];
  // Never a character dropped into his own story.
  const ownWorld = (hero: Hero, world: World) =>
    hero.home === world.id || [world.name, ...world.aliases].some((n) => n.toLowerCase() === hero.from.toLowerCase());
  for (const hero of heroes) {
    for (const world of WORLDS) {
      if (ownWorld(hero, world)) continue;
      if (world.kind === "universe") consider("insert", hero, world, null, null, `What If ${hero.name} Was In ${world.name}?`);
      else if (!hero.tags.every((t) => t === "villain")) consider("survive", hero, world, null, null, `Could ${hero.name} Survive ${world.name}?`);
    }
    for (const power of POWERS) {
      if (power.from === hero.from) continue;
      consider("power", hero, null, power, null, `What If ${hero.name} Had ${titleCase(power.name)}?`);
    }
    if (hero.home && !hero.tags.includes("villain")) consider("reborn", hero, hero.home ? WORLDS.find((w) => w.id === hero.home) ?? null : null, null, null, `What If ${hero.name} Was Reborn With ${hero.pronoun === "she" ? "Her" : "His"} Memories?`);
  }
  for (const d of detectives) {
    for (const t of targets) {
      if (d === t) continue;
      const hero = HEROES.find((h) => h.id === d)!;
      const target = HEROES.find((h) => h.id === t)!;
      if (hero.from === target.from) continue;
      consider("hunt", hero, null, null, target, `Could ${hero.name} Catch ${target.name}?`);
    }
  }
  for (const w of WORLDS.filter((x) => x.kind === "universe")) consider("you", null, w, null, null, `What If YOU Were In ${w.name}?`);
  for (const p of POWERS) consider("you", null, null, p, null, `What If YOU Had ${titleCase(p.name)}?`);

  // Best first, but a spread: no hero, world or power more than twice.
  out.sort((a, b) => b.score - a.score);
  if (!spread) return out.slice(0, limit);
  const picked: LabIdea[] = [];
  const count = new Map<string, number>();
  for (const i of out) {
    const ks = [i.hero && `h:${i.hero.id}`, i.world && `w:${i.world.id}`, i.power && `p:${i.power.id}`, `f:${i.format}`].filter(Boolean) as string[];
    const caps: Record<string, number> = { h: 2, w: 3, p: 2, f: 8 };
    if (ks.some((k) => (count.get(k) ?? 0) >= caps[k[0]!]!)) continue;
    for (const k of ks) count.set(k, (count.get(k) ?? 0) + 1);
    picked.push(i);
    if (picked.length >= limit) break;
  }
  return picked;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "the Infinity Gauntlet" → "The Infinity Gauntlet", for a title. */
function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

// ── what the channel's best scripts did differently ────────────────────────

export interface ScriptResult {
  script: Script;
  multiple: number;
}

/** Scripts matched to their uploads by title. */
export function matchScripts(videos: LabVideo[]): ScriptResult[] {
  const byTitle = new Map(videos.filter((v) => v.multiple !== null).map((v) => [norm(v.title), v.multiple!]));
  return corpus()
    .map((s) => ({ script: s, multiple: byTitle.get(norm(s.title)) ?? null }))
    .filter((x): x is ScriptResult => x.multiple !== null);
}

export interface Contrast {
  label: string;
  hits: string;
  misses: string;
}

/** Top third against bottom third, on the measures a writer controls. */
export function contrast(results: ScriptResult[]): Contrast[] | null {
  if (results.length < 6) return null;
  const sorted = [...results].sort((a, b) => b.multiple - a.multiple);
  const third = Math.max(2, Math.floor(sorted.length / 3));
  const hits = sorted.slice(0, third).map((r) => r.script.metrics);
  const misses = sorted.slice(-third).map((r) => r.script.metrics);
  const med = (xs: number[]) => median(xs);
  const row = (label: string, pick: (m: ReturnType<typeof measure>) => number, fmt: (n: number) => string) => ({
    label,
    hits: fmt(med(hits.map(pick))),
    misses: fmt(med(misses.map(pick))),
  });
  return [
    row("Length", (m) => m.words, (n) => `${Math.round(n).toLocaleString("en-US")} words`),
    row("Parts", (m) => m.parts, (n) => String(Math.round(n))),
    row("Words a part", (m) => med(m.partWords), (n) => String(Math.round(n))),
    row("Intro", (m) => m.introWords, (n) => `${Math.round(n)} words`),
    row("Sentence length", (m) => m.sentence, (n) => `${Math.round(n)} words`),
    row("“Would / could” a thousand words", (m) => m.conditional, (n) => n.toFixed(0)),
    row("Parts ending on a forward hook", (m) => m.forwardClosers, (n) => `${Math.round(n * 100)}%`),
  ];
}

/**
 * Story Lab's ideas for one channel. The ones that share a world, a hero or a
 * format with what the channel already makes come first, each saying why; a
 * channel with too few videos to read gets the overall best. No hero more
 * than twice, so the list isn't one character.
 */
export function channelLab(channel: string, titles: string[], ideas: LabIdea[], limit = 8, perHeroCap = 2): Array<{ idea: LabIdea; fit: string[]; fitScore: number }> {
  // A channel named for a world (Specular FNAF) leans to it before its titles say so.
  const namedFor = new Set(readTitle(channel.replace(/^Specular\s+/i, "")).worlds.map((w) => w.id));
  const n = titles.length;
  const worlds = new Map<string, number>();
  const heroes = new Map<string, number>();
  const formats = new Map<string, number>();
  const bump = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  for (const t of titles) {
    const r = readTitle(t);
    for (const w of new Set(r.worlds.map((x) => x.id))) bump(worlds, w);
    for (const h of new Set(r.heroes.map((x) => x.id))) bump(heroes, h);
    bump(formats, formatOfTitle(t));
  }
  const share = (m: Map<string, number>, id: string | undefined) => (id && n ? (m.get(id) ?? 0) / n : 0);
  const ranked = ideas.map((idea) => {
    const named = Boolean(idea.world && namedFor.has(idea.world.id));
    const w = Math.max(share(worlds, idea.world?.id), named ? 0.5 : 0);
    const who = [idea.hero, idea.target].filter((h): h is Hero => Boolean(h)).sort((a, b) => share(heroes, b.id) - share(heroes, a.id))[0];
    const h = share(heroes, who?.id);
    const f = share(formats, idea.format);
    const fit: string[] = [];
    if (worlds.get(idea.world?.id ?? "")) fit.push(`${idea.world!.name} is in ${worlds.get(idea.world!.id)} of its ${n} videos`);
    else if (named) fit.push(`the channel is named for ${idea.world!.name}`);
    if (h > 0 && who) fit.push(`${who.name} is in ${heroes.get(who.id)} of them`);
    if (f >= 0.25) fit.push(`${FORMAT_BY_ID.get(idea.format)?.name ?? idea.format} is ${Math.round(f * 100)}% of what it makes`);
    const fitScore = 1.5 * w + h + 0.6 * f;
    return { idea, fit, fitScore, rank: idea.score * (1 + 3 * fitScore) };
  });
  const fitting = ranked.filter((r) => r.fitScore > 0);
  const pool = ((n >= 5 || namedFor.size) && fitting.length >= 3 ? fitting : ranked).sort((a, b) => b.rank - a.rank);
  const out: Array<{ idea: LabIdea; fit: string[]; fitScore: number }> = [];
  const perHero = new Map<string, number>();
  for (const r of pool) {
    if (out.length >= limit) break;
    const hid = r.idea.hero?.id ?? "";
    if ((perHero.get(hid) ?? 0) >= perHeroCap) continue;
    perHero.set(hid, (perHero.get(hid) ?? 0) + 1);
    out.push({ idea: r.idea, fit: r.fit, fitScore: r.fitScore });
  }
  return out;
}
