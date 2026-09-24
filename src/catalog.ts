/**
 * The four categories and the channels inside them.
 *
 * This is the single source of truth the parser matches against. Adding a
 * channel here is all that's needed for the bot to start recognising it.
 */

export type CategoryId = "long_form" | "reading" | "gaming" | "bits";

export interface Category {
  id: CategoryId;
  label: string;
  /** Hex used on the board. Validated for dark-mode contrast and CVD separation. */
  color: string;
  /** Prefix for codes the bot generates in this category. */
  codePrefix: string;
  hint: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "long_form",
    label: "Long Form",
    color: "#4A5CD4",
    codePrefix: "VIDEO",
    hint: "Full-length YouTube videos. Assignment posts with an air date, a script stage and a word count are always long form.",
  },
  {
    id: "reading",
    label: "Reading",
    color: "#CE7118",
    codePrefix: "READ",
    hint: "The five reading channels, roughly 25 short uploads a day across all of them combined.",
  },
  {
    id: "gaming",
    label: "Gaming",
    color: "#35986A",
    codePrefix: "GAME",
    hint: "Gameplay series episodes — Minecraft, Roblox and anything else episodic.",
  },
  {
    id: "bits",
    label: "Bits",
    color: "#AC63C8",
    codePrefix: "BITS",
    hint: "Daily bits uploads. Each bits channel runs its own numbered batch every day, opened automatically — an incoming message about bits is usually a link for today's batch, not a new project.",
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
}

export const CHANNELS: Channel[] = [
  // ── Long form ───────────────────────────────────────────────────────────
  { id: "studios", name: "Specular Studios", category: "long_form", aliases: ["studios", "specular studio"] },
  { id: "fnaf", name: "Specular FNAF", category: "long_form", aliases: ["fnaf", "five nights"] },

  // ── Reading ─────────────────────────────────────────────────────────────
  { id: "dc", name: "Specular DC", category: "reading", aliases: ["dc"] },
  { id: "torch", name: "Specular Torch", category: "reading", aliases: ["torch"] },
  { id: "action", name: "Specular Action", category: "reading", aliases: ["action"] },
  { id: "balls", name: "Specular Balls", category: "reading", aliases: ["balls"] },
  { id: "nove", name: "Specular Nove", category: "reading", aliases: ["nove"] },

  // ── Gaming ──────────────────────────────────────────────────────────────
  { id: "gaming", name: "Specular Gaming", category: "gaming", aliases: ["gaming", "minecraft", "roblox", "smp"] },

  // ── Bits (each opens a numbered batch daily) ────────────────────────────
  { id: "studios_bits", name: "Studios Bits", category: "bits", codePrefix: "SSB", aliases: ["studios bits", "specular studios bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "fnaf_bits", name: "FNAF Bits", category: "bits", codePrefix: "SFB", aliases: ["fnaf bits", "specular fnaf bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "animation_bits", name: "Animation Bits", category: "bits", codePrefix: "SAB", aliases: ["animation bits", "specular animation bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "anime_bits", name: "Anime Bits", category: "bits", codePrefix: "SNB", aliases: ["anime bits", "specular anime bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "nk_bits", name: "Specular & Kay Bits", category: "bits", codePrefix: "SKB", aliases: ["nk bits", "specular nk bits", "nk", "kay bits", "specular and kay bits", "specular & kay"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "undertale_bits", name: "Undertale Bits", category: "bits", codePrefix: "SUB", aliases: ["undertale bits", "specular undertale bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
  { id: "gaming_bits", name: "Gaming Bits", category: "bits", codePrefix: "SGB", aliases: ["gaming bits", "specular gaming bits"], recurring: { perDay: 1, opensAt: "06:00", dueAt: "18:00" } },
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
  const byLength = [...CHANNELS].sort((a, b) => b.name.length - a.name.length);
  const contained = byLength.find((c) => hay.includes(c.name.toLowerCase()));
  if (contained) return contained;

  const byAlias = byLength.find((c) =>
    c.aliases?.some((a) => a.length >= 3 && hay.includes(a)),
  );
  return byAlias;
}

export const BITS_CHANNELS = CHANNELS.filter((c) => c.recurring);
