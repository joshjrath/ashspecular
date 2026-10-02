/**
 * The categories and the channels inside them.
 *
 * This is the single source of truth the parser matches against. Adding a
 * channel here — or in Settings, which keeps it in the database and applies
 * it here at startup (applyChannelSettings) — is all that's needed for the
 * bot to start recognising it. A channel renamed in Settings keeps its id.
 */

export type CategoryId = "gaming" | "stories" | "reading" | "bits" | "movies";

export interface Category {
  id: CategoryId;
  label: string;
  /**
   * Hex used on the board, the chart and the Discord cards. The five are
   * validated together in this order — lightness, chroma, colour-blind
   * separation between neighbours, normal-vision separation between every
   * pair, and contrast on both the white cards and the dark rail.
   */
  color: string;
  /** Prefix for codes the bot generates in this category. */
  codePrefix: string;
  hint: string;
}

/** In the studio's own order, from the master channel list. */
/** In the studio's order — Stories first, everywhere they're listed. */
export const CATEGORIES: Category[] = [
  {
    id: "stories",
    label: "Stories",
    color: "#4A5CD4",
    codePrefix: "VIDEO",
    hint: "Long-form story videos across the Stories channels. The studio's assignment posts (air date, script stage, word count, an @ tag) are stories; the @ tag names the channel.",
  },
  {
    id: "gaming",
    label: "Gaming",
    color: "#35986A",
    codePrefix: "GAME",
    hint: "Gameplay series on Specular Minecraft and Specular Roblox — episodic, numbered.",
  },
  {
    id: "reading",
    label: "Reading",
    color: "#CE7118",
    codePrefix: "READ",
    hint: "The five reading channels, roughly 25 short uploads a day across all of them combined. Each opens its day's batch automatically — a message about one is usually about today's batch.",
  },
  {
    id: "bits",
    label: "Bits",
    color: "#AC63C8",
    codePrefix: "BITS",
    hint: "Daily bits uploads. Each bits channel opens its day's batch automatically — an incoming message about bits is usually a link for today's batch, not a new project.",
  },
  {
    id: "movies",
    label: "Movies",
    color: "#A63F66",
    codePrefix: "MOVIE",
    hint: "Feature-length uploads on the Specular main channel and Specular Sleep.",
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export interface Channel {
  id: string;
  name: string;
  /**
   * The channel's own colour, distinct from every other channel's. Its
   * category keeps its colour for category-level things — the chart, the
   * tiles, the toggles — and the channel's dot and name wear this one.
   *
   * The Stories channels use their YouTube avatar colours, sampled from the
   * avatars themselves. The rest were generated to sit apart from each other.
   * This is the exact colour, and every dot shows it exactly; channelInk()
   * gives the shade its name is written in, which is this colour whenever
   * that can be read and a darker shade of it when it can't.
   */
  color: string;
  category: CategoryId;
  /** Extra strings the parser should treat as naming this channel. */
  aliases?: string[];
  /**
   * Channels that open a batch every day, known by channel and air date. perDay is how many batches;
   * units is how many uploads one batch holds, ticked off one at a time — five
   * for a reading channel, and per channel for bits (five each, Specular & Kay
   * one).
   */
  recurring?: {
    perDay: number;
    opensAt: string;
    dueAt: string;
    units?: number;
    /**
     * "long" for a long-form channel on a daily schedule (Specular, one
     * video a day). Its day runs midnight to midnight like every other
     * long-form thing; Shorts batches run 3 AM to 3 AM.
     */
    format?: "long";
  };
  /** Names it had before a rename in Settings, as they were written. */
  formerly?: string[];
  /**
   * Matched only by its exact name or an alias, never by appearing inside a
   * longer message. The main channel is called just "Specular", which is in
   * nearly every message the studio sends.
   */
  exactOnly?: boolean;
}

/**
 * Every channel, from the studio's master list.
 *
 * Aliases are kept to words that only ever mean that channel. "Specular Law"
 * gets no "law" alias, because "law" turns up in video titles; a wrong channel
 * costs more than an unset one, which is one dropdown away.
 */
export const CHANNELS: Channel[] = [
  // ── Stories ─────────────────────────────────────────────────────────────
  { id: "studios", name: "Specular Studios", color: "#D21B20", category: "stories", aliases: ["studios", "specular studio"] },
  { id: "anime", name: "Specular Anime", color: "#360D7B", category: "stories" },
  { id: "comics", name: "Specular Comics", color: "#1BC0D2", category: "stories" },
  { id: "animation", name: "Specular Animation", color: "#D39B7C", category: "stories" },
  { id: "law", name: "Specular Law", color: "#327780", category: "stories" },
  { id: "manga", name: "Specular Manga", color: "#959B9D", category: "stories" },
  { id: "fnaf", name: "Specular FNAF", color: "#D2BD1B", category: "stories", aliases: ["fnaf", "five nights"] },
  { id: "force", name: "Specular Force", color: "#E26570", category: "stories" },
  { id: "verse", name: "Specular Verse", color: "#05157D", category: "stories" },
  { id: "horror", name: "Specular Horror", color: "#7AC0D1", category: "stories" },
  { id: "you", name: "Specular YOU", color: "#F17949", category: "stories" },
  { id: "battles", name: "Specular Battles", color: "#A20E82", category: "stories" },
  { id: "survives", name: "Specular Survives", color: "#885AAA", category: "stories" },
  { id: "documentaries", name: "Specular Documentaries", color: "#1BD058", category: "stories", aliases: ["specular docs"] },

  // ── Gaming ──────────────────────────────────────────────────────────────
  { id: "minecraft", name: "Specular Minecraft", color: "#A35E16", category: "gaming", aliases: ["minecraft", "smp"] },
  { id: "roblox", name: "Specular Roblox", color: "#047E67", category: "gaming", aliases: ["roblox"] },

  // ── Reading (each opens its day's batch automatically, like bits) ───────
  { id: "dc", name: "Specular DC", color: "#B75015", category: "reading", aliases: ["dc"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "torch", name: "Specular Torch", color: "#047A40", category: "reading", aliases: ["torch"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "action", name: "Specular Action", color: "#7A6894", category: "reading", aliases: ["action"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "balls", name: "Specular Balls", color: "#A54881", category: "reading", aliases: ["balls"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "nove", name: "Specular Nove", color: "#6D7504", category: "reading", aliases: ["nove"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },

  // ── Bits (each opens its day's batch automatically) ────────────────────────────
  // Ids are unchanged from before the rename: batch keys are built from them.
  { id: "studios_bits", name: "Specular Studios Bits", color: "#954BC7", category: "bits", aliases: ["studios bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "anime_bits", name: "Specular Anime Bits", color: "#4B781A", category: "bits", aliases: ["anime bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "fnaf_bits", name: "Specular FNAF Bits", color: "#BD404D", category: "bits", aliases: ["fnaf bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "animation_bits", name: "Specular Animation Bits", color: "#406D94", category: "bits", aliases: ["animation bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "gaming_bits", name: "Specular Gaming Bits", color: "#8B6143", category: "bits", aliases: ["gaming bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "undertale_bits", name: "Specular Undertale Bits", color: "#BB3B95", category: "bits", aliases: ["undertale bits", "undertale"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "pokemon_bits", name: "Specular Pokemon Bits", color: "#F2A900", category: "bits", aliases: ["pokemon bits", "pokémon bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 5 } },
  { id: "nk_bits", name: "Specular & Kay Bits", color: "#5566CD", category: "bits", aliases: ["nk bits", "specular nk bits", "kay bits", "specular and kay bits", "specular & kay"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: 1 } },

  // ── Movies ──────────────────────────────────────────────────────────────
  // One long-form video a day, opened just after midnight.
  { id: "main", name: "Specular", color: "#A75464", category: "movies", exactOnly: true, aliases: ["specular main", "main channel"], recurring: { perDay: 1, opensAt: "00:05", dueAt: "23:59", units: 1, format: "long" } },
  { id: "sleep", name: "Specular Sleep", color: "#955890", category: "movies" },
];

/** Each catalog channel as written above, before any rename, addition or colour set on the board. */
const ORIGINAL = new Map(CHANNELS.map((c) => [c.id, { name: c.name, aliases: c.aliases ? [...c.aliases] : undefined, color: c.color }]));

/** An added channel's own colour, picked when it was added. */
const addedColours = new Map<string, string>();

/** A channel's colour before any sampled or hand-set one: the catalog's, or the one an added channel was given. */
export function catalogColour(name: string): string {
  const c = CHANNELS.find((ch) => ch.name === name);
  return (c && (ORIGINAL.get(c.id)?.color ?? addedColours.get(c.id))) ?? "#8A8A93";
}

/** Whether a channel is one of the catalog's own (not added on the board). */
export const isCatalogChannel = (id: string) => ORIGINAL.has(id);

/**
 * A channel added on the board, or one of the catalog's renamed there. Kept
 * in the database (db/channels.ts) and applied to CHANNELS in memory, so
 * every page, the bot and the jobs see the same list.
 */
export interface ChannelSetting {
  id: string;
  name: string;
  /** Added on the board, rather than one of the catalog's. */
  added: boolean;
  category: CategoryId | null;
  /** An added channel's own colour (a hand-set one still wins). */
  colour: string | null;
  /** An added Bits or Reading channel's uploads a day: its daily batch. Null or 0: no batch. */
  units: number | null;
  /** Names it had before: a message that uses one still finds it. */
  previous: string[];
}

/**
 * Wear the names and channels set on the board. A renamed channel keeps its
 * id — and with it its batches, links and history — and its earlier names
 * still find it in a message. An added channel joins the end of its
 * category. Starts from the catalog every time, so applying the same list
 * twice is the same as once, and a channel taken off the list is gone.
 */
export function applyChannelSettings(settings: ChannelSetting[]): void {
  for (let i = CHANNELS.length - 1; i >= 0; i--) if (!ORIGINAL.has(CHANNELS[i]!.id)) CHANNELS.splice(i, 1);
  for (const c of CHANNELS) {
    const o = ORIGINAL.get(c.id)!;
    c.name = o.name;
    c.aliases = o.aliases ? [...o.aliases] : undefined;
    c.formerly = undefined;
  }
  addedColours.clear();
  for (const s of settings) {
    const name = s.name.trim();
    if (!name) continue;
    const known = CHANNELS.find((c) => c.id === s.id);
    if (known) {
      if (s.added) continue;
      known.name = name;
      continue;
    }
    if (!s.added || !s.category || !CATEGORY_IDS.includes(s.category)) continue;
    const colour = s.colour && /^#[0-9a-f]{6}$/i.test(s.colour) ? s.colour.toUpperCase() : "#8A8A93";
    addedColours.set(s.id, colour);
    const ch: Channel = {
      id: s.id,
      name,
      color: colour,
      category: s.category,
      ...(s.units && s.units > 0 ? { recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00", units: Math.min(50, Math.round(s.units)) } } : {}),
    };
    const last = CHANNELS.map((c) => c.category).lastIndexOf(s.category);
    if (last >= 0) CHANNELS.splice(last + 1, 0, ch);
    else CHANNELS.push(ch);
  }
  // Earlier names find the channel in a message, unless another channel is called that now.
  const current = new Set(CHANNELS.map((c) => c.name.toLowerCase()));
  for (const s of settings) {
    const c = CHANNELS.find((ch) => ch.id === s.id);
    if (!c) continue;
    const before = [...new Set([...s.previous, ...(s.added ? [] : [ORIGINAL.get(c.id)!.name])].map((n) => n.trim()))].filter(
      (n) => n && n.toLowerCase() !== c.name.toLowerCase() && !current.has(n.toLowerCase()),
    );
    if (before.length) c.formerly = before;
    const extra = before.map((n) => n.toLowerCase()).filter((n) => !(c.aliases ?? []).includes(n));
    if (extra.length) c.aliases = [...(c.aliases ?? []), ...extra];
  }
}

/** A name a channel could be given: trimmed, and why not when it can't. */
export function checkChannelName(raw: string, forId: string | null): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2) return { error: "A channel needs a name." };
  if (name.length > 60) return { error: "That name is too long (60 characters at most)." };
  if (!/^[\p{L}\p{N} &'’.!?:,()+\/-]+$/u.test(name)) return { error: `“${name}” has characters a channel name can't use.` };
  const taken = CHANNELS.find((c) => c.id !== forId && c.name.toLowerCase() === name.toLowerCase());
  if (taken) return { error: `There's already a channel called ${taken.name}.` };
  return { name };
}

/** An id for a channel added on the board, from its name: never one the catalog uses. */
export function newChannelId(name: string): string {
  const base = `u_${name.toLowerCase().replace(/^specular\s+/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "channel"}`;
  let id = base;
  for (let n = 2; CHANNELS.some((c) => c.id === id); n++) id = `${base}${n}`;
  return id;
}

/**
 * Wear these colours from now on (channel name → #RRGGBB): a Shorts channel's
 * avatar colour, or one set by hand in Settings. Any channel not named goes
 * back to its catalog colour.
 */
export function applyChannelColours(colours: Map<string, string>): void {
  for (const c of CHANNELS) c.color = colours.get(c.name) ?? catalogColour(c.name);
}

export function category(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** The phrase as a whole word run: "torch" matches "torch is at 3", never "torchlight". */
function containsPhrase(hay: string, phrase: string): boolean {
  const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(hay);
}

/**
 * Best-effort channel match for text the model returned or a raw message.
 * Exact name first, then alias, then a containment check — deliberately
 * conservative, because guessing the wrong channel is worse than leaving it
 * unset for one click.
 */
export function matchChannel(text: string | null): Channel | undefined {
  if (!text) return undefined;
  const hay = text.trim().toLowerCase();
  if (!hay) return undefined;

  const exact = CHANNELS.find((c) => c.name.toLowerCase() === hay);
  if (exact) return exact;

  const aliased = CHANNELS.find((c) => c.aliases?.some((a) => a === hay));
  if (aliased) return aliased;

  // "specular fnaf bits" must beat "specular fnaf", so try longest names first.
  // exactOnly channels sit out: "Specular" is inside nearly every message.
  const byLength = [...CHANNELS]
    .filter((c) => !c.exactOnly)
    .sort((a, b) => b.name.length - a.name.length);
  const contained = byLength.find((c) => containsPhrase(hay, c.name));
  if (contained) return contained;

  // Aliases of three characters or more count inside a sentence; shorter ones
  // ("dc") only on their own, where they cannot be part of something else.
  return byLength.find((c) =>
    c.aliases?.some((a) => a.length >= 3 && containsPhrase(hay, a)),
  );
}

/** Whether a channel's recurring batch is long form (a midnight day) rather than Shorts (a 3 AM day). */
export function isLongFormRecurring(channel: Pick<Channel, "recurring"> | undefined): boolean {
  return channel?.recurring?.format === "long";
}

// ── channel colours as text ─────────────────────────────────────────────────

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The dark surfaces a channel's name is written on: card, row hover, chip, pinned. */
export const DARK_SURFACES = ["#18181C", "#222227", "#2C2C33", "#2A2819"];

/**
 * The shade a channel's name is written in on the dark cards. Its own colour
 * when that reads at 4.5:1 on every dark surface, and otherwise the same hue
 * taken lighter, step by step, only as far as it needs to go. Verse's navy
 * can't be read as text on charcoal; its name is written in a lighter blue,
 * and its dot stays the exact navy.
 */
export function channelInk(hex: string): string {
  const readable = (h: string) => DARK_SURFACES.every((bg) => contrastRatio(h, bg) >= 4.5);
  if (readable(hex)) return hex.toUpperCase();
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let t = 0.02; t < 1; t += 0.02) {
    const h = "#" + rgb.map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
    if (readable(h)) return h;
  }
  return "#E4E4E8";
}
