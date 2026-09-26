/**
 * What each category is measured against on the Uploads page.
 *
 *   Stories         long form, one upload every four days per channel
 *   Movies          long form; Specular one a day (its daily long-form batch
 *                   on the Recurring page), Specular Sleep tracked with no target
 *   Gaming          long form, tracked with no target (set one here)
 *   Bits, Reading   Shorts only, against each channel's daily number — the same `units` the Recurring
 *                   page ticks off: five for most, three or one for a few
 */
import { CATEGORIES, CHANNELS, isLongFormRecurring, type CategoryId } from "../catalog.js";

export type Target =
  | { kind: "every"; days: number }
  | { kind: "daily" }
  | { kind: "none" };

export const UPLOAD_TARGETS: Record<CategoryId, Target> = {
  stories: { kind: "every", days: 4 },
  gaming: { kind: "none" },
  movies: { kind: "none" },
  bits: { kind: "daily" },
  reading: { kind: "daily" },
};

/** Long form only (Stories, Gaming, Movies), or Shorts only (Bits, Reading). */
export function formatFor(category: CategoryId): "long" | "short" {
  return UPLOAD_TARGETS[category].kind === "daily" ? "short" : "long";
}

/**
 * A long-form channel's own target, in days between uploads, or null for
 * none: a channel with a daily long-form batch (Specular) is one a day;
 * otherwise its category's target.
 */
export function everyFor(channel: string): number | null {
  const ch = CHANNELS.find((c) => c.name === channel);
  if (!ch) return null;
  if (isLongFormRecurring(ch)) return 1;
  const t = UPLOAD_TARGETS[ch.category];
  return t.kind === "every" ? t.days : null;
}

/** A channel's uploads a day, for the daily categories. */
export function perDayFor(channel: string): number {
  return CHANNELS.find((c) => c.name === channel)?.recurring?.units ?? 1;
}

export function channelsIn(category: CategoryId): string[] {
  return CHANNELS.filter((c) => c.category === category).map((c) => c.name);
}

export function categoryOfChannel(channel: string): CategoryId | null {
  return CHANNELS.find((c) => c.name === channel)?.category ?? null;
}

/** The categories, in the studio's order, for the page's switch. */
export const UPLOAD_CATEGORIES = CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color }));

export function describeTarget(category: CategoryId): string {
  const t = UPLOAD_TARGETS[category];
  if (t.kind === "every") return `one long-form upload every ${t.days} days per channel`;
  if (t.kind === "daily") return "Shorts per channel per day (days run 3 AM to 3 AM ET), against each channel's daily number";
  const daily = CHANNELS.filter((c) => c.category === category && isLongFormRecurring(c));
  if (daily.length)
    return `long form · ${daily.map((c) => c.name).join(", ")}: one a day (midnight to midnight) · the rest tracked with no target`;
  return "long-form uploads per channel · no posting target set";
}
