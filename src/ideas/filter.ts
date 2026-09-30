/**
 * The first, cheap look at a new post, before any AI: obvious junk is marked
 * "filtered" with the reason — ads, giveaways, shops, empty posts, a feed's
 * excluded words. Nothing is deleted: a filtered post stays in the feed's New
 * tab, where "Analyze anyway" sends it on. It's deliberately gentle — a
 * questionable post given a low score beats a good one silently lost.
 */
import type { RawSource } from "./types.js";

export interface FilterResult {
  keep: boolean;
  reason: string | null;
}

/** Phrases that on their own mean selling or promoting, not a fandom observation. */
const PROMO_STRONG = [
  /\bgiveaway\b/i, /\bpromo code\b/i, /\buse (my )?code\b/i, /\bonlyfans\b/i, /\bcrypto(currency)?\b/i, /\bnfts?\b/i,
  /\bfree shipping\b/i, /\b\d{1,2}% off\b/i, /\bbuy now\b/i, /\bshop now\b/i, /\bdiscount code\b/i,
];
/** Weaker signals: two or more together read as a promotional post. */
const PROMO_WEAK = [
  /\bcommissions? (are )?open\b/i, /\betsy\b/i, /\bredbubble\b/i, /\bpatreon\b/i, /\bko-?fi\b/i, /\bstore\b/i,
  /\blink in (my )?bio\b/i, /\bpre-?orders?\b/i, /\bmerch\b/i, /\bsale\b/i, /\bsubscribe\b/i, /\bdm me\b/i,
];

/** A word or phrase on its own, not inside another word: "art" doesn't match "heart". */
const hasWords = (hay: string, words: string) => new RegExp(`(^|[^a-z0-9])${words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`).test(hay);

export function basicFilter(
  s: Pick<RawSource, "body" | "title" | "media" | "tags" | "notes">,
  feed: { exclusions: string[]; minNotes: number } | null,
): FilterResult {
  const text = `${s.title ?? ""}\n${s.body}`.trim();
  if (!text && !s.media.length) return { keep: false, reason: "Empty post" };
  const hay = `${text}\n${s.tags.join(" ")}`;
  if (PROMO_STRONG.some((r) => r.test(hay))) return { keep: false, reason: "Looks like an ad or giveaway" };
  if (PROMO_WEAK.filter((r) => r.test(hay)).length >= 2) return { keep: false, reason: "Looks promotional" };
  // Dozens of unrelated tags on a few words: tag spam.
  if (s.tags.length > 30 && text.length < 200) return { keep: false, reason: `Tag spam (${s.tags.length} tags)` };
  if (feed) {
    const lower = hay.toLowerCase();
    const hit = feed.exclusions.map((e) => e.trim().toLowerCase()).find((e) => e && hasWords(lower, e));
    if (hit) return { keep: false, reason: `Excluded word: ${hit}` };
    if (feed.minNotes > 0 && (s.notes ?? 0) < feed.minNotes) return { keep: false, reason: `Under ${feed.minNotes} notes when found` };
  }
  return { keep: true, reason: null };
}

/**
 * A reblog that adds nothing of its own is the same source as the post it
 * reblogs; one with commentary may carry the joke, so it stands on its own.
 */
export const addsCommentary = (s: Pick<RawSource, "isReblog" | "addedText">) => !s.isReblog || (s.addedText?.trim().length ?? 0) >= 20;
