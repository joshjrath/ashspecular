/**
 * Write next, channel by channel: two ideas for every Stories channel, each
 * with a score out of 100, a warning when it's too close to something already
 * made or planned (on any channel), and the ideas rerolled away or saved for
 * later kept out of the cards.
 *
 * The score is a prediction: 50 is an idea expected to do the channel's
 * usual. It moves with the idea's own lift (how videos with its hero, world,
 * power and format did against their channel's usual, the world's fit for the
 * hero, what's been done), with how well it fits the channel, and down when
 * it's too close to another video.
 */
import { channelLab, keyOfTitle, norm, type LabIdea } from "./lab.js";
import { readTitle } from "./lore.js";

/** Something an idea could be too close to. */
export interface Neighbour {
  title: string;
  channel: string | null;
  /** Where it is: public on YouTube, assigned on the board, a written script, saved, or another card. */
  source: "uploaded" | "assigned" | "script" | "saved" | "card";
}

export interface Similar extends Neighbour {
  /** Why: the same pairing, or nearly the same words. */
  why: string;
}

export interface Card {
  channel: string;
  idea: LabIdea;
  fit: string[];
  /** 1–99: the predicted result, for sorting and at a glance. */
  score: number;
  /** The same idea's result against the channel's usual, e.g. 1.3 for 1.3×. */
  predicted: number;
  similar: Similar | null;
}

/** An idea rerolled away, saved for later, or showing as a card, per channel. */
export interface IdeaMark {
  channel: string;
  key: string;
  mark: "skip" | "save" | "show";
  title: string;
  format: string;
  hero: string | null;
  world: string | null;
  power: string | null;
  target: string | null;
  shape: string | null;
  score: number;
  markedAt: Date;
}

const FILLER = new Set("what if could would how the a an in of to vs was were is be had has got with his her their you your survive catch join joined".split(" "));
const wordsOf = (t: string) => new Set(norm(t).split(" ").filter((w) => w && !FILLER.has(w)));

/** A title's pairings — a character with a world, a power's world or an opponent's world — as keyOfTitle reads them. */
function pairsOf(title: string): string[] {
  // A character in his own world (a reborn or divergence story) isn't a pairing with anyone.
  const own = new Set(readTitle(title).heroes.filter((h) => h.home).map((h) => `${h.id}|${h.home}`));
  const out = keyOfTitle(title).pairs.filter((p) => !p.startsWith("|") && !p.endsWith("|") && !own.has(p));
  if (/^what if you\b|^how i'?d/i.test(title.trim())) {
    const r = readTitle(title);
    for (const x of [...r.worlds.map((w) => w.id), ...r.powers.map((pw) => pw.id)]) out.push(`you|${x}`);
  }
  return out;
}

/** Everything ideas get compared with, indexed by pairing and by word. */
export class NeighbourIndex {
  private pairs = new Map<string, Neighbour>();
  private words: Array<{ words: Set<string>; n: Neighbour }> = [];
  private postings = new Map<string, number[]>();

  constructor(list: Neighbour[] = []) {
    for (const n of list) this.add(n);
  }

  add(n: Neighbour): void {
    for (const p of pairsOf(n.title)) if (!this.pairs.has(p)) this.pairs.set(p, n);
    const i = this.words.length;
    const words = wordsOf(n.title);
    this.words.push({ words, n });
    for (const w of words) {
      const list = this.postings.get(w);
      if (list) list.push(i);
      else this.postings.set(w, [i]);
    }
  }

  /** The closest thing to this title, if it's too close. */
  match(title: string): Similar | null {
    for (const p of pairsOf(title)) {
      const hit = this.pairs.get(p);
      if (hit && norm(hit.title) !== norm(title)) return { ...hit, why: "the same pairing" };
      if (hit) return { ...hit, why: "the same title" };
    }
    const mine = wordsOf(title);
    if (mine.size < 2) return null;
    const shared = new Map<number, number>();
    for (const w of mine) for (const i of this.postings.get(w) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
    let best: { i: number; j: number } | null = null;
    for (const [i, k] of shared) {
      const j = k / (mine.size + this.words[i]!.words.size - k);
      // Two words at least, and two-thirds of them shared: "Iron Man In The Boys" and "Iron Man In Invincible" aren't the same video.
      if (k >= 2 && j >= 0.67 && (!best || j > best.j)) best = { i, j };
    }
    return best ? { ...this.words[best.i]!.n, why: "nearly the same words" } : null;
  }
}

/** The score out of 100, and the predicted result against the channel's usual. */
export function scoreIdea(idea: LabIdea, fitScore: number, similar: Similar | null): { score: number; predicted: number } {
  // A channel's own kind of video does better there: up to +30% for a close fit.
  const predicted = idea.score * (1 + Math.min(0.3, fitScore * 0.25)) * (similar ? 0.85 : 1);
  // 50 is the channel's usual; 1.5× is about 70, 2× about 80, 0.7× about 35.
  const score = Math.round(50 + 30 * Math.log2(Math.max(predicted, 0.01)));
  return { score: Math.max(1, Math.min(99, score)), predicted: Math.round(predicted * 100) / 100 };
}

/**
 * Two cards for each channel. An idea is on the page once; a channel's cards
 * never share a lead; what the channel rerolled away or saved stays out.
 */
export function writeNext(opts: {
  channels: Array<{ channel: string; titles: string[] }>;
  ideas: LabIdea[];
  marks: IdeaMark[];
  neighbours: Neighbour[];
  perChannel?: number;
}): Map<string, Card[]> {
  const per = opts.perChannel ?? 2;
  const index = new NeighbourIndex(opts.neighbours);
  // What's saved is planned: an idea close to it says so.
  for (const m of opts.marks) if (m.mark === "save") index.add({ title: m.title, channel: m.channel, source: "saved" });
  const used = new Set<string>();
  // A spread across the page: no world, power or lead more than twice, so it isn't one universe.
  const onPage = new Map<string, number>();
  const tags = (i: LabIdea) =>
    [i.hero && `h:${i.hero.id}`, i.target && `h:${i.target.id}`, i.world && `w:${i.world.id}`, i.power && `p:${i.power.id}`].filter((x): x is string => Boolean(x));
  const out = new Map<string, Card[]>();
  // Every channel's showing cards are its own: no other channel takes one.
  const showingAnywhere = new Map(opts.marks.filter((m) => m.mark === "show").map((m) => [m.key, m.channel] as const));
  for (const { channel, titles } of opts.channels) {
    const gone = new Set(opts.marks.filter((m) => m.channel === channel && m.mark !== "show").map((m) => m.key));
    const ranked = channelLab(channel, titles, opts.ideas, 5000, Infinity)
      .filter((r) => !used.has(r.idea.key) && !gone.has(r.idea.key))
      .map((r) => {
        const similar = index.match(r.idea.title);
        return { ...r, similar, ...scoreIdea(r.idea, r.fitScore, similar) };
      })
      .sort((a, b) => b.score - a.score || b.predicted - a.predicted);
    const cards: Card[] = [];
    const mine = new Set<string>();
    const pick = (strict: boolean) => {
      for (const r of ranked) {
        if (cards.length >= per) return;
        if (used.has(r.idea.key)) continue;
        const owner = showingAnywhere.get(r.idea.key);
        if (owner && owner !== channel) continue;
        const t = tags(r.idea);
        // A channel's two cards share no hero, world or power.
        if (t.some((x) => mine.has(x))) continue;
        if (strict && t.some((x) => (onPage.get(x) ?? 0) >= 2)) continue;
        take(r, t);
      }
    };
    const take = (r: (typeof ranked)[number], t: string[]) => {
      // Checked again: an earlier card on the page may be close to it now.
      const similar = r.similar ?? index.match(r.idea.title);
      for (const x of t) {
        mine.add(x);
        onPage.set(x, (onPage.get(x) ?? 0) + 1);
      }
      used.add(r.idea.key);
      cards.push({ channel, idea: r.idea, fit: r.fit, score: similar === r.similar ? r.score : scoreIdea(r.idea, r.fitScore, similar).score, predicted: r.predicted, similar });
      index.add({ title: r.idea.title, channel, source: "card" });
    };
    // The cards already showing stay, while they're still ideas to write: a reroll changes only its own card.
    const showing = new Set(opts.marks.filter((m) => m.channel === channel && m.mark === "show").map((m) => m.key));
    for (const r of ranked) if (showing.has(r.idea.key) && cards.length < per && !used.has(r.idea.key)) take(r, tags(r.idea));
    pick(true);
    // A channel with nothing left under the page's spread still gets its cards.
    pick(false);
    cards.sort((a, b) => b.score - a.score);
    out.set(channel, cards);
  }
  return out;
}
