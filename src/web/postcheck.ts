/**
 * The daily posting check, the part that decides: which of the videos a
 * channel had scheduled for a day went up, judged against what the channel
 * actually uploaded around then.
 *
 * A title that clearly matches (most of its words shared) claims its upload
 * first. Then any upload nobody claimed stands in for a scheduled video
 * nobody matched — titles often change at upload — earliest scheduled first.
 * Whatever is left had nothing go up: missed.
 */
const FILLER = new Set("a an the of to in on and or vs x is was were be what if could would how full movie".split(" "));
const words = (t: string) =>
  new Set(
    t.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w && !FILLER.has(w)),
  );

/** Shared words over all words: 1 is the same title, 0 nothing in common. */
export function titleOverlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / (x.size + y.size - n);
}

export interface Scheduled { id: number; title: string }
export interface Uploaded { videoId: string; title: string }

export function matchPosts(scheduled: Scheduled[], uploads: Uploaded[], strong = 0.5): { posted: Map<number, string>; missed: number[] } {
  const posted = new Map<number, string>();
  const used = new Set<string>();
  // Clear title matches, best first.
  const pairs = scheduled
    .flatMap((s) => uploads.map((u) => ({ s, u, o: titleOverlap(s.title, u.title) })))
    .filter((p) => p.o >= strong)
    .sort((a, b) => b.o - a.o);
  for (const p of pairs) {
    if (posted.has(p.s.id) || used.has(p.u.videoId)) continue;
    posted.set(p.s.id, p.u.videoId);
    used.add(p.u.videoId);
  }
  // Retitled at upload: an unclaimed upload counts for an unmatched video.
  const spare = uploads.filter((u) => !used.has(u.videoId));
  for (const s of scheduled) {
    if (posted.has(s.id) || !spare.length) continue;
    posted.set(s.id, spare.shift()!.videoId);
  }
  return { posted, missed: scheduled.filter((s) => !posted.has(s.id)).map((s) => s.id) };
}
