/**
 * What each category is measured against on the Uploads page.
 *
 *   Stories         long form, one upload every four days per channel
 *   Gaming, Movies  long form, tracked with no target (set one here)
 *   Bits, Reading   Shorts only, against each channel's daily number — the same `units` the Recurring
 *                   page ticks off: five for most, three or one for a few
 */
import { CATEGORIES, CHANNELS, type CategoryId } from "../catalog.js";

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
  if (t.kind === "daily") return "Shorts per channel per day, against each channel's daily number";
  return "long-form uploads per channel · no posting target set";
}
