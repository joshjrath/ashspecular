/**
 * The Bits Idea Feed's shared words: what a source post is once any provider
 * has read it, the classifications a Short can carry, why an idea gets
 * rejected, and where an approved idea is in production.
 *
 * Providers (Tumblr first) turn their own posts into a RawSource; everything
 * after that — filtering, analysis, the feed — never needs to know which
 * provider a post came from.
 */
import { CHANNELS } from "../catalog.js";

/** One post as a provider found it, in one shape for every provider. */
export interface RawSource {
  provider: string;
  externalId: string;
  url: string;
  author: string | null;
  authorUrl: string | null;
  postedAt: Date | null;
  postType: string;
  title: string | null;
  /** The words as plain text; a reblog's trail in order, one voice per paragraph. */
  body: string;
  media: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  tags: string[];
  notes: number | null;
  likes?: number | null;
  reblogs?: number | null;
  replies?: number | null;
  /** Every reblog of one post shares it: "tumblr:<root id>". */
  rootKey: string | null;
  isReblog: boolean;
  /** What a reblog added of its own, if anything. */
  addedText: string | null;
  raw: unknown;
}

/**
 * Whether an idea is canon, and if not, what kind of not. Everything but
 * canon (and canon-inspired) carries a clarification tag on the Short.
 */
export const CLASSIFICATIONS = [
  { id: "CANON", label: "Canon", tag: null },
  { id: "CANON_INSPIRED", label: "Canon-inspired", tag: null },
  { id: "FAN_THEORY", label: "Fan theory", tag: "FAN THEORY" },
  { id: "HEADCANON", label: "Headcanon", tag: "HEADCANON" },
  { id: "AU", label: "AU", tag: "AU" },
  { id: "WHAT_IF", label: "What if?", tag: "WHAT IF?" },
  { id: "CROSSOVER", label: "Crossover", tag: "CROSSOVER" },
  { id: "META", label: "Meta", tag: "META" },
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number]["id"];
export const CLASSIFICATION_IDS = CLASSIFICATIONS.map((c) => c.id) as unknown as [Classification, ...Classification[]];
export const CLASSIFICATION_BY_ID = new Map<string, (typeof CLASSIFICATIONS)[number]>(CLASSIFICATIONS.map((c) => [c.id, c]));
export const isClassification = (s: unknown): s is Classification => typeof s === "string" && CLASSIFICATION_BY_ID.has(s);

/** What makes a Short funny or interesting — the mechanism, not the characters. */
export const COMEDY_ENGINES = [
  "lore_implication", "power_interaction", "mundane_supernatural", "misunderstanding", "role_reversal",
  "dramatic_irony", "relationship_dynamic", "character_interaction", "visual_gag", "escalation",
  "counterpart_meeting", "absurd_logic", "emotional_twist", "parody", "fourth_wall_meta", "other",
] as const;
export type ComedyEngine = (typeof COMEDY_ENGINES)[number];
export const engineLabel = (e: string) => e.replace(/_/g, " ");

/** Why an idea was turned down — kept, so recommendations can learn from it later. */
export const REJECT_REASONS = [
  { id: "too_similar", label: "Too similar" },
  { id: "weak_joke", label: "Weak joke" },
  { id: "too_generic", label: "Too generic" },
  { id: "too_much_context", label: "Too much context" },
  { id: "lore_problem", label: "Lore problem" },
  { id: "wrong_channel", label: "Wrong channel" },
  { id: "not_visual", label: "Not visual" },
  { id: "already_used", label: "Already used" },
  { id: "dont_like", label: "Don't like it" },
  { id: "other", label: "Other" },
] as const;
export const REJECT_BY_ID = new Map<string, string>(REJECT_REASONS.map((r) => [r.id, r.label]));

/** Where an approved idea is, from approval to the published Short. */
export const IDEA_STATUSES = [
  { id: "approved", label: "Approved" },
  { id: "assigned", label: "Assigned" },
  { id: "scripting", label: "Scripting" },
  { id: "illustration", label: "Illustration" },
  { id: "editing", label: "Editing" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "cancelled", label: "Cancelled" },
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number]["id"] | "draft";

/** The Bits channels, from the catalog: the feed's channel filter and the AI's choices. */
export const bitsChannels = (): string[] => CHANNELS.filter((c) => c.category === "bits").map((c) => c.name);
export const shortChannel = (name: string) => name.replace(/^Specular /, "").replace(/ Bits$/, "");

/** The analysis logic's version: bump it when the instructions or the score change, and re-score. */
export const ANALYSIS_VERSION = "bits-feed-1";
