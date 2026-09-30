/**
 * What each Stories channel is about, so an idea only goes where it belongs.
 *
 * A channel's focus is read from its own videos (uploads and videos on the
 * board): the one thing most of them share —
 *
 *   lead       the medium its leads come from: anime, comics, animation…
 *              ("What If Gojo…", "Could Sukuna…" — anime characters)
 *   hero       one character in most of them (Spider-Man)
 *   franchise  one franchise in most of them, anywhere in the title (FNAF)
 *   format     one format for most of them (survival tests, versus)
 *   genre      settings of one genre (horror)
 *
 * Of those, the one that most sets it apart from the network's other
 * channels is its focus. A name that says what the channel is (Specular
 * Anime: anime characters; Specular FNAF; Specular Survives) is taken at its
 * word, and a focus set by hand in Story Lab wins over both. An idea must
 * match its channel's focus: "What If Invincible Had A Green Lantern Ring?"
 * isn't an anime video.
 */
import { formatOfTitle, type FormatId } from "./formats.js";
import { HERO_BY_ID, POWER_BY_ID, WORLD_BY_ID, readTitle, type Hero, type Power, type World } from "./lore.js";

export type Medium = "anime" | "comics" | "animation" | "games" | "film" | "tv" | "real";
export type Genre = "horror";

export const MEDIUM_LABEL: Record<Medium, string> = {
  anime: "Anime & manga characters",
  comics: "Comic book characters",
  animation: "Animated-series characters",
  games: "Video game characters",
  film: "Film characters",
  tv: "TV characters",
  real: "Real-world",
};
export const GENRE_LABEL: Record<Genre, string> = { horror: "Horror" };

interface Franchise {
  media: Medium[];
  genres?: Genre[];
}
const F = (media: Medium[], genres?: Genre[]): Franchise => ({ media, genres });

/** Every franchise the lore and the dice know, by the name they use (lowercase, without a leading "the"). */
const FRANCHISES: Record<string, Franchise> = {
  "attack on titan": F(["anime"]),
  berserk: F(["anime"]),
  bleach: F(["anime"]),
  "chainsaw man": F(["anime"]),
  "death note": F(["anime"]),
  "demon slayer": F(["anime"]),
  "dragon ball": F(["anime"]),
  "jojo's bizarre adventure": F(["anime"]),
  "jujutsu kaisen": F(["anime"]),
  monster: F(["anime"]),
  "my hero academia": F(["anime"]),
  naruto: F(["anime"]),
  "one piece": F(["anime"]),
  "one punch man": F(["anime"]),
  "solo leveling": F(["anime"]),
  "avatar: the last airbender": F(["animation"]),
  "ben 10": F(["animation"]),
  invincible: F(["comics", "animation"]),
  dc: F(["comics"]),
  marvel: F(["comics"]),
  "x-men": F(["comics"]),
  mcu: F(["comics", "film"]),
  boys: F(["comics", "tv"]),
  doom: F(["games"]),
  fnaf: F(["games"], ["horror"]),
  "god of war": F(["games"]),
  halo: F(["games"]),
  "resident evil": F(["games", "film"], ["horror"]),
  "silent hill": F(["games"], ["horror"]),
  "last of us": F(["games", "tv"], ["horror"]),
  witcher: F(["games", "tv"]),
  "star wars": F(["film"]),
  "john wick": F(["film"]),
  halloween: F(["film"], ["horror"]),
  scream: F(["film"], ["horror"]),
  "silence of the lambs": F(["film"], ["horror"]),
  "sherlock holmes": F(["film"]),
  "a quiet place": F(["film"], ["horror"]),
  alien: F(["film"], ["horror"]),
  "final destination": F(["film"], ["horror"]),
  "harry potter": F(["film"]),
  "jurassic park": F(["film"]),
  saw: F(["film"], ["horror"]),
  "hunger games": F(["film"]),
  purge: F(["film"], ["horror"]),
  "world war z": F(["film"], ["horror"]),
  "breaking bad": F(["tv"]),
  dexter: F(["tv"]),
  "stranger things": F(["tv"], ["horror"]),
  "game of thrones": F(["tv"]),
  "squid game": F(["tv"]),
  "walking dead": F(["tv"], ["horror"]),
  "us military": F(["real"]),
};

/** A franchise's key: "The MCU" and "the MCU" are "mcu". */
export const franchiseKey = (name: string) => name.trim().toLowerCase().replace(/^the\s+/, "");
const franchise = (name: string): Franchise | null => FRANCHISES[franchiseKey(name)] ?? null;

/** The franchise names as the lore writes them, by key, for labels. */
function franchiseName(key: string): string {
  const w = [...WORLD_BY_ID.values()].find((x) => franchiseKey(x.name) === key);
  if (w) return w.name.replace(/^the /, "The ");
  const h = [...HERO_BY_ID.values()].find((x) => franchiseKey(x.from) === key);
  if (h) return h.from.replace(/^the /, "The ");
  const p = [...POWER_BY_ID.values()].find((x) => franchiseKey(x.from) === key);
  return p ? p.from.replace(/^the /, "The ") : key;
}

/** The pieces of an idea (or a title read into one). */
export interface Pieces {
  format: FormatId | null;
  hero: Hero | null;
  target?: Hero | null;
  world: World | null;
  power: Power | null;
}

const heroFranchise = (h: Hero) => franchiseKey(h.from);
const worldFranchise = (w: World) => franchiseKey(w.name);
const powerFranchise = (p: Power) => franchiseKey(p.from);

/** Every franchise an idea touches: its lead's, its target's, its world's and its power's. */
function franchisesOf(x: Pieces): string[] {
  return [
    x.hero && heroFranchise(x.hero),
    x.target && heroFranchise(x.target),
    x.world && worldFranchise(x.world),
    x.power && powerFranchise(x.power),
  ].filter((k): k is string => Boolean(k));
}

/** The media of the idea's lead — or, with no character leading ("What If YOU…"), of its world or power. */
function leadMedia(x: Pieces): Medium[] {
  if (x.hero) return franchise(x.hero.from)?.media ?? [];
  const k = x.world ? worldFranchise(x.world) : x.power ? powerFranchise(x.power) : null;
  return k ? FRANCHISES[k]?.media ?? [] : [];
}

function genresOf(x: Pieces): Genre[] {
  return [...new Set(franchisesOf(x).flatMap((k) => FRANCHISES[k]?.genres ?? []))];
}

/** A title read into the same pieces an idea has. Its format only when the title really has that shape. */
export function piecesOfTitle(title: string): Pieces & { heroes: Hero[] } {
  const r = readTitle(title);
  const f = formatOfTitle(title);
  // The format reader falls back to a crossover for any title it can't place ("Every Batman Villain, Ranked"): that's no evidence.
  const known = f !== "insert" || /\b(was|were|is) in\b|\bjoined\b|\bin the\b/i.test(title);
  const hunt = f === "hunt" || f === "versus";
  return {
    format: known ? f : null,
    hero: r.heroes[0] ?? null,
    target: hunt ? r.heroes[1] ?? null : null,
    world: r.worlds[0] ?? null,
    power: r.powers[0] ?? null,
    heroes: r.heroes,
  };
}

// ── a channel's focus ─────────────────────────────────────────────────────

export type FocusKind = "lead" | "hero" | "franchise" | "format" | "genre";

export interface Focus {
  kind: FocusKind;
  /** The medium, hero id, franchise key, format id or genre. */
  value: string;
  /** Said as a label: "Anime & manga characters", "Spider-Man", "FNAF", "Survival tests", "Horror". */
  label: string;
  /** Where it came from: its videos, its name, or set by hand in Story Lab. */
  from: "videos" | "name" | "set";
  /** How many of its readable videos share it, of how many. */
  shared: number;
  of: number;
}

/** A focus set by hand in Story Lab: one thing to hold to, or none ("any"). */
export interface SetFocus {
  /** Null: read from its videos (a note can still be set). */
  kind: FocusKind | "any" | null;
  value: string | null;
  note: string | null;
}

export interface ChannelProfile {
  channel: string;
  focus: Focus[];
  /** Its videos, and how many of them Story Lab could read. */
  videos: number;
  readable: number;
  /** A note set by hand: what the channel makes, in your words (for Claude's ideas). */
  note: string | null;
  /** Set by hand to anything at all. */
  open: boolean;
}

const FORMAT_LABEL: Record<FormatId, string> = {
  insert: "Crossover insertions",
  power: "Power swaps",
  survive: "Survival tests",
  hunt: "Detective duels",
  versus: "Versus battles",
  reborn: "Reborn with memories",
  divergence: "Alternate histories",
  you: "Second person (YOU)",
  explainer: "Explainers",
  game: "Game videos",
};

export function focusLabel(kind: FocusKind, value: string): string {
  if (kind === "lead") return MEDIUM_LABEL[value as Medium] ?? value;
  if (kind === "hero") return HERO_BY_ID.get(value)?.name ?? value;
  if (kind === "franchise") return franchiseName(value);
  if (kind === "format") return FORMAT_LABEL[value as FormatId] ?? value;
  return GENRE_LABEL[value as Genre] ?? value;
}

/** Whether an idea has a focus's one thing. */
function has(x: Pieces, kind: FocusKind, value: string): boolean {
  if (kind === "lead") return leadMedia(x).includes(value as Medium);
  if (kind === "hero") return x.hero?.id === value || x.target?.id === value;
  if (kind === "franchise") return franchisesOf(x).includes(value);
  if (kind === "format") return x.format === value;
  return genresOf(x).includes(value as Genre);
}

/** What a channel's name says it's about, before its videos do: Specular Anime, Specular FNAF, Specular Survives. */
export function nameFocus(channel: string): Array<{ kind: FocusKind; value: string }> {
  const short = channel.replace(/^specular\s+/i, "").replace(/\s+(bits|shorts)$/i, "").trim();
  const w = short.toLowerCase();
  const out: Array<{ kind: FocusKind; value: string }> = [];
  if (/\b(anime|manga)\b/.test(w)) out.push({ kind: "lead", value: "anime" });
  else if (/\bcomics?\b/.test(w)) out.push({ kind: "lead", value: "comics" });
  else if (/\b(animation|cartoons?)\b/.test(w)) out.push({ kind: "lead", value: "animation" });
  if (/\bhorror\b/.test(w)) out.push({ kind: "genre", value: "horror" });
  if (/^you$/.test(w)) out.push({ kind: "format", value: "you" });
  else if (/\b(battles?|versus|vs)\b/.test(w)) out.push({ kind: "format", value: "versus" });
  else if (/\b(survives?|survival)\b/.test(w)) out.push({ kind: "format", value: "survive" });
  if (!out.length && short) {
    // A franchise or character in the name itself: Specular FNAF, Specular Force (the Force: Star Wars).
    const p = piecesOfTitle(short);
    const k = p.world ? worldFranchise(p.world) : p.power ? powerFranchise(p.power) : null;
    if (k) out.push({ kind: "franchise", value: k });
    else if (p.hero) out.push({ kind: "hero", value: p.hero.id });
  }
  return out;
}

/** Each thing a title can share with others, as "kind|value" keys: its lead's media, characters, franchises, format, genres. */
function traitsOf(p: Pieces & { heroes: Hero[] }): string[] {
  return [
    ...new Set([
      ...leadMedia(p).map((m) => `lead|${m}`),
      ...p.heroes.map((h) => `hero|${h.id}`),
      ...franchisesOf(p).map((f) => `franchise|${f}`),
      ...(p.format ? [`format|${p.format}`] : []),
      ...genresOf(p).map((g) => `genre|${g}`),
    ]),
  ];
}

/** How common each trait is across the network's Stories videos: what's ordinary, so a channel's focus is what sets it apart. */
export function focusBaseline(titles: string[]): Map<string, number> {
  const read = titles.map(piecesOfTitle).filter((p) => p.hero || p.world || p.power || p.format);
  const count = new Map<string, number>();
  for (const p of read) for (const k of traitsOf(p)) count.set(k, (count.get(k) ?? 0) + 1);
  return new Map([...count].map(([k, c]) => [k, c / Math.max(1, read.length)]));
}

/**
 * A channel's focus from its name, its videos' titles, and anything set by
 * hand. A name that says what the channel is wins; otherwise it's the trait
 * more than half its readable videos share (four at least) that most sets
 * it apart from the network's other videos (`baseline`) — Spider-Man over
 * "comic book characters" on a channel of Spider-Man videos.
 */
export function channelProfile(channel: string, titles: string[], set: SetFocus | null = null, baseline: Map<string, number> | null = null): ChannelProfile {
  const read = titles.map(piecesOfTitle).filter((p) => p.hero || p.world || p.power || p.format);
  const n = read.length;
  const base = { channel, videos: titles.length, readable: n, note: set?.note?.trim() || null };
  if (set?.kind === "any") return { ...base, focus: [], open: true };
  if (set?.kind && set.value) {
    const kind = set.kind;
    const value = set.value;
    return { ...base, focus: [{ kind, value, label: focusLabel(kind, value), from: "set", shared: read.filter((p) => has(p, kind, value)).length, of: n }], open: false };
  }
  const count = new Map<string, number>();
  for (const p of read) for (const k of traitsOf(p)) count.set(k, (count.get(k) ?? 0) + 1);
  const make = (key: string, from: Focus["from"]): Focus => {
    const [kind, value] = key.split("|") as [FocusKind, string];
    return { kind, value, label: focusLabel(kind, value), from, shared: count.get(key) ?? 0, of: n };
  };
  // A name that says what the channel is (Anime, Comics, FNAF, Survives) is taken at its word.
  const named = nameFocus(channel).map((f) => make(`${f.kind}|${f.value}`, "name"));
  if (named.length) return { ...base, focus: named.slice(0, 2), open: false };
  if (n < 4) return { ...base, focus: [], open: false };
  // Broader before narrower when they set it apart as much: a franchise over one of its characters.
  const order: Record<FocusKind, number> = { franchise: 0, genre: 1, format: 2, lead: 3, hero: 4 };
  const apart = (key: string) => (count.get(key)! / n) / (baseline ? Math.max(0.05, baseline.get(key) ?? 0.05) : 1);
  const best = [...count.keys()]
    .filter((k) => count.get(k)! / n > 0.55)
    .sort((a, b) => apart(b) - apart(a) || order[a.split("|")[0] as FocusKind] - order[b.split("|")[0] as FocusKind])[0];
  return { ...base, focus: best ? [make(best, "videos")] : [], open: false };
}

/** Whether an idea belongs on a channel, and if not, why. */
export function fitsChannel(profile: ChannelProfile, idea: Pieces): { ok: boolean; why: string } {
  for (const f of profile.focus) {
    if (!has(idea, f.kind, f.value)) return { ok: false, why: `not ${f.label.toLowerCase()}` };
  }
  return { ok: true, why: profile.focus.map((f) => f.label).join(" · ") };
}

/**
 * The characters, worlds and powers every idea on a focused channel has in
 * common — FNAF's world on Specular FNAF, Spider-Man on a Spider-Man channel —
 * as Write next's tags ("w:fnaf"): a channel's two cards may both have them.
 */
export function sharedByFocus(profile: ChannelProfile): Set<string> {
  const out = new Set<string>();
  for (const f of profile.focus) {
    if (f.kind === "hero") out.add(`h:${f.value}`);
    if (f.kind !== "franchise") continue;
    for (const w of WORLD_BY_ID.values()) if (worldFranchise(w) === f.value) out.add(`w:${w.id}`);
    for (const h of HERO_BY_ID.values()) if (heroFranchise(h) === f.value) out.add(`h:${h.id}`);
    for (const p of POWER_BY_ID.values()) if (powerFranchise(p) === f.value) out.add(`p:${p.id}`);
  }
  return out;
}

/** "31 of 38 videos", "its name", "set by hand". */
export function focusSource(f: Focus): string {
  if (f.from === "set") return "set by hand";
  if (f.from === "name") return f.of ? `its name · ${f.shared} of ${f.of} videos` : "its name";
  return `${f.shared} of ${f.of} videos`;
}

/** Every choice for setting a focus by hand, grouped. */
export function focusChoices(): Array<{ group: string; options: Array<{ kind: FocusKind; value: string; label: string }> }> {
  const fr = Object.keys(FRANCHISES).map((k) => ({ kind: "franchise" as const, value: k, label: franchiseName(k) })).sort((a, b) => a.label.localeCompare(b.label));
  return [
    { group: "Whose story", options: (Object.keys(MEDIUM_LABEL) as Medium[]).filter((m) => m !== "real").map((m) => ({ kind: "lead" as const, value: m, label: MEDIUM_LABEL[m] })) },
    { group: "Format", options: (Object.keys(FORMAT_LABEL) as FormatId[]).filter((f) => f !== "game").map((f) => ({ kind: "format" as const, value: f, label: FORMAT_LABEL[f] })) },
    { group: "Genre", options: [{ kind: "genre" as const, value: "horror", label: "Horror" }] },
    { group: "Franchise", options: fr },
    { group: "Character", options: [...HERO_BY_ID.values()].map((h) => ({ kind: "hero" as const, value: h.id, label: h.name })).sort((a, b) => a.label.localeCompare(b.label)) },
  ];
}
