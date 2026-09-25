/**
 * The four categories and the channels inside them.
 *
 * This is the single source of truth the parser matches against. Adding a
 * channel here is all that's needed for the bot to start recognising it.
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
export const CATEGORIES: Category[] = [
  {
    id: "gaming",
    label: "Gaming",
    color: "#35986A",
    codePrefix: "GAME",
    hint: "Gameplay series on Specular Minecraft and Specular Roblox — episodic, numbered.",
  },
  {
    id: "stories",
    label: "Stories",
    color: "#4A5CD4",
    codePrefix: "VIDEO",
    hint: "Long-form story videos across the Stories channels. The studio's assignment posts (air date, script stage, word count, an @ tag) are stories; the @ tag names the channel.",
  },
  {
    id: "reading",
    label: "Reading",
    color: "#CE7118",
    codePrefix: "READ",
    hint: "The five reading channels, roughly 25 short uploads a day across all of them combined. Each opens its own numbered batch every day automatically — a message about one is usually about today's batch.",
  },
  {
    id: "bits",
    label: "Bits",
    color: "#AC63C8",
    codePrefix: "BITS",
    hint: "Daily bits uploads. Each bits channel runs its own numbered batch every day, opened automatically — an incoming message about bits is usually a link for today's batch, not a new project.",
  },
  {
    id: "movies",
    label: "Movies",
    color: "#A63F66",
    codePrefix: "MOVIE",
    hint: "Feature-length uploads on the Specular main channel and Specular Sleep.",
  },
];

export interface Channel {
  id: string;
  name: string;
  category: CategoryId;
  /** Code prefix for this channel's own sequence. Bits channels each have one. */
  codePrefix?: string;
  /** Extra strings the parser should treat as naming this channel. */
  aliases?: string[];
  /** Bits channels open a numbered batch every day. perDay is how many. */
  recurring?: { perDay: number; opensAt: string; dueAt: string };
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
  // ── Gaming ──────────────────────────────────────────────────────────────
  { id: "minecraft", name: "Specular Minecraft", category: "gaming", aliases: ["minecraft", "smp"] },
  { id: "roblox", name: "Specular Roblox", category: "gaming", aliases: ["roblox"] },

  // ── Stories ─────────────────────────────────────────────────────────────
  { id: "studios", name: "Specular Studios", category: "stories", aliases: ["studios", "specular studio"] },
  { id: "anime", name: "Specular Anime", category: "stories" },
  { id: "comics", name: "Specular Comics", category: "stories" },
  { id: "animation", name: "Specular Animation", category: "stories" },
  { id: "law", name: "Specular Law", category: "stories" },
  { id: "manga", name: "Specular Manga", category: "stories" },
  { id: "fnaf", name: "Specular FNAF", category: "stories", aliases: ["fnaf", "five nights"] },
  { id: "force", name: "Specular Force", category: "stories" },
  { id: "verse", name: "Specular Verse", category: "stories" },
  { id: "horror", name: "Specular Horror", category: "stories" },
  { id: "you", name: "Specular YOU", category: "stories" },
  { id: "battles", name: "Specular Battles", category: "stories" },
  { id: "survives", name: "Specular Survives", category: "stories" },
  { id: "documentaries", name: "Specular Documentaries", category: "stories", aliases: ["specular docs"] },

  // ── Reading (each opens its day's batch automatically, like bits) ───────
  { id: "dc", name: "Specular DC", category: "reading", codePrefix: "RDC", aliases: ["dc"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "torch", name: "Specular Torch", category: "reading", codePrefix: "RTO", aliases: ["torch"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "action", name: "Specular Action", category: "reading", codePrefix: "RAC", aliases: ["action"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "balls", name: "Specular Balls", category: "reading", codePrefix: "RBA", aliases: ["balls"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "nove", name: "Specular Nove", category: "reading", codePrefix: "RNO", aliases: ["nove"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },

  // ── Bits (each opens a numbered batch daily) ────────────────────────────
  // Ids are unchanged from before the rename: batch keys are built from them.
  { id: "studios_bits", name: "Specular Studios Bits", category: "bits", codePrefix: "SSB", aliases: ["studios bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "anime_bits", name: "Specular Anime Bits", category: "bits", codePrefix: "SNB", aliases: ["anime bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "fnaf_bits", name: "Specular FNAF Bits", category: "bits", codePrefix: "SFB", aliases: ["fnaf bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "animation_bits", name: "Specular Animation Bits", category: "bits", codePrefix: "SAB", aliases: ["animation bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "gaming_bits", name: "Specular Gaming Bits", category: "bits", codePrefix: "SGB", aliases: ["gaming bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "undertale_bits", name: "Specular Undertale Bits", category: "bits", codePrefix: "SUB", aliases: ["undertale bits", "undertale"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "nk_bits", name: "Specular & Kay Bits", category: "bits", codePrefix: "SKB", aliases: ["nk bits", "specular nk bits", "kay bits", "specular and kay bits", "specular & kay"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },

  // ── Movies ──────────────────────────────────────────────────────────────
  { id: "main", name: "Specular", category: "movies", exactOnly: true, aliases: ["specular main", "main channel"] },
  { id: "sleep", name: "Specular Sleep", category: "movies" },
];

export const CHANNEL_NAMES = CHANNELS.map((c) => c.name);
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

export function category(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function channelByName(name: string | null): Channel | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  return CHANNELS.find((c) => c.name.toLowerCase() === needle);
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

export const BITS_CHANNELS = CHANNELS.filter((c) => c.recurring);
