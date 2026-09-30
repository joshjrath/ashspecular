/**
 * Duplicate detection, step one: from everything the network has made or
 * decided — published Bits, approved ideas, ideas turned down — find the few
 * that could be the same idea as a new source, cheaply, by the characters and
 * words they share. Step two (in the analysis) has Claude judge those few by
 * premise and comedy mechanism, not title: "Peter Meets Female Peter" and
 * "Peter Meets Petra Parker" are one idea; "Batman Was In The Boys" doesn't
 * cover "Spider-Man Was In The Boys".
 */
import { normaliseText } from "./html.js";

export interface HistoryItem {
  kind: "bit" | "idea" | "rejected";
  /** "bit:<videoId>", "idea:<id>", "src:<id>". */
  ref: string;
  title: string;
  premise?: string;
  fingerprint?: string;
  channel: string | null;
  /** YYYY-MM-DD it was published, approved or rejected; null for an idea not yet made. */
  date: string | null;
  href?: string;
  words?: Set<string>;
}

const STOP = new Set(
  ("a an the of to in on and or but is was were be been being are am as at by for from with without into onto over under about " +
    "after before if what when why how who whom whose which that this these those it its he she they them their his her him you " +
    "your we our us i me my not no yes so too very can could would should will just than then there here also more most less up " +
    "down out off again only own same such some any each every all both other get gets got has have had do does did make makes " +
    "made full movie part ep episode")
    .split(" "),
);

/** A text's significant words, lightly stemmed ("aliens" and "alien" match). */
export function wordsOf(s: string): string[] {
  return normaliseText(s)
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * The history items most likely to be the same idea, best first: shared
 * characters count most, then shared words, then the same channel.
 */
export function nearestHistory(
  query: { characters: string[]; franchises: string[]; text: string; channel: string | null },
  history: HistoryItem[],
  limit = 12,
): HistoryItem[] {
  const chars = new Set(query.characters.flatMap(wordsOf));
  const fran = new Set(query.franchises.flatMap(wordsOf));
  const words = new Set(wordsOf(query.text));
  const ranked: Array<{ h: HistoryItem; s: number }> = [];
  for (const h of history) {
    const hw = (h.words ??= new Set(wordsOf(`${h.title} ${h.premise ?? ""} ${h.fingerprint ?? ""}`)));
    let charHits = 0;
    for (const w of chars) if (hw.has(w)) charHits++;
    let shared = 0;
    for (const w of words) if (hw.has(w)) shared++;
    let franHits = 0;
    for (const w of fran) if (hw.has(w)) franHits++;
    if (!charHits && shared < 2) continue;
    const jaccard = shared / Math.max(1, words.size + hw.size - shared);
    const s = Math.min(charHits, 3) * 3 + Math.min(franHits, 2) + jaccard * 12 + (query.channel && h.channel === query.channel ? 0.5 : 0);
    ranked.push({ h, s });
  }
  return ranked.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.h);
}
