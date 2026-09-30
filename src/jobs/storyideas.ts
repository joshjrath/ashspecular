/**
 * Keeps a few of Claude's ideas in play for every Stories channel.
 *
 * Every five minutes, the channels with the fewest left (under four) get six
 * more — at most three channels a run, and never more than the day's cap of
 * calls (STORYLAB_AI_DAILY, 30 by default) across them all. A reroll or a
 * save that uses one up tops that channel up straight away. A channel is
 * asked at most every ten minutes; after a failed try it waits half an hour,
 * and after a batch that was all repeats, six hours. Nothing here holds up a
 * page: Story Lab shows what's in the pool, and the lore's own ideas when
 * it's empty.
 */
import { canUseClaude } from "../ai/claude.js";
import { CHANNELS } from "../catalog.js";
import { listIdeaMarks } from "../db/lab.js";
import { addAiIdeas, aiRunSummary, listAiIdeas, recordAiRun, type AiRunSummary } from "../db/storylab.js";
import { dailyCap, vetIdeas, writeIdeasFor, type ChannelBrief } from "../web/stories/brainstorm.js";
import type { PublicVideo } from "../web/stories/lab.js";

export interface StoryContext {
  /** Every Stories channel, with its focus, videos, planned and turned-down ideas. */
  briefs: ChannelBrief[];
  /** Every video public on any channel, and every video on the board not uploaded yet. */
  published: PublicVideo[];
  planned: PublicVideo[];
  /** Claude's ideas still in play for each channel id. */
  available: Map<string, number>;
}

/** Ideas in play per channel before it asks for more, and how many it asks for. */
export const WANT = 4;
const BATCH = 6;

let context: (() => Promise<StoryContext>) | null = null;
let running = false;

/** Whether a channel can be asked again yet, from how its last ask went. */
function ready(id: string, runs: AiRunSummary, now: boolean): boolean {
  const last = runs.last.get(id);
  if (!last) return true;
  const since = Date.now() - last.at.getTime();
  // A failed try waits half an hour; a batch that came back all repeats, six hours; any channel, ten minutes between asks.
  if (!last.ok) return since > 30 * 60_000;
  if (!last.kept) return since > 6 * 3_600_000;
  return now || since > 10 * 60_000;
}

/** Claude's ideas still in play for each Stories channel id, counted cheaply: not rerolled away or saved. */
async function inPlay(): Promise<Map<string, number>> {
  const [ideas, marks] = await Promise.all([listAiIdeas(), listIdeaMarks()]);
  const idOf = new Map(CHANNELS.map((c) => [c.name, c.id]));
  const gone = new Set(marks.filter((m) => m.mark !== "show").map((m) => `${idOf.get(m.channel) ?? m.channel}|${m.key}`));
  const out = new Map<string, number>();
  for (const i of ideas) if (!gone.has(`${i.channelId}|ai:${i.id}`)) out.set(i.channelId, (out.get(i.channelId) ?? 0) + 1);
  return out;
}

export async function refillStoryIdeas(opts: { only?: string; max?: number } = {}): Promise<number> {
  if (running || !context || !canUseClaude()) return 0;
  running = true;
  try {
    const runs = await aiRunSummary();
    let calls = runs.calls;
    const cap = dailyCap();
    if (calls >= cap) return 0;
    // Only read every video and its results when a channel actually needs ideas.
    const counts = await inPlay();
    const stories = CHANNELS.filter((c) => c.category === "stories" && (!opts.only || c.id === opts.only));
    if (!stories.some((c) => (counts.get(c.id) ?? 0) < WANT && ready(c.id, runs, Boolean(opts.only)))) return 0;
    const ctx = await context();
    const due = ctx.briefs
      .filter((b) => !opts.only || b.id === opts.only)
      .filter((b) => (ctx.available.get(b.id) ?? 0) < WANT && ready(b.id, runs, Boolean(opts.only)))
      .sort((a, b) => (ctx.available.get(a.id) ?? 0) - (ctx.available.get(b.id) ?? 0));
    let asked = 0;
    for (const b of due.slice(0, opts.max ?? 3)) {
      if (calls >= cap) break;
      calls++;
      asked++;
      // What the rest of the network made lately, so its ideas don't repeat another channel's.
      const elsewhere = ctx.published.filter((v) => v.channel !== b.name && ctx.briefs.some((x) => x.name === v.channel)).slice(0, 80).map((v) => v.title);
      try {
        const { ideas, model, usage } = await writeIdeasFor(b, ctx.briefs, elsewhere, BATCH);
        const { kept, dropped } = vetIdeas(ideas, b, ctx.published, ctx.planned);
        await addAiIdeas(b.id, kept, model);
        await recordAiRun({ channelId: b.id, ok: true, kept: kept.length, dropped: dropped.length, ...usage });
        if (dropped.length) console.log(`[story ideas] ${b.name}: kept ${kept.length}, dropped ${dropped.map((d) => `“${d.title}” (${d.why})`).join("; ")}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[story ideas] ${b.name}: ${error}`);
        await recordAiRun({ channelId: b.id, ok: false, error, kept: 0, dropped: 0, input: 0, output: 0, cacheRead: 0 }).catch(() => undefined);
      }
    }
    return asked;
  } finally {
    running = false;
  }
}

/** Start topping up, with the board's own view of the channels (server.ts builds it). */
export function startStoryIdeas(build: () => Promise<StoryContext>): void {
  context = build;
  const every = Math.max(15_000, Number(process.env.STORYLAB_AI_TICK_MS) || 5 * 60_000);
  setInterval(() => void refillStoryIdeas().catch((err) => console.error("[story ideas] refill failed:", err)), every).unref();
  setTimeout(() => void refillStoryIdeas().catch((err) => console.error("[story ideas] refill failed:", err)), Math.min(45_000, every)).unref();
}

/** One of a channel's ideas was used up (rerolled or saved): top it up now, without holding the page. */
export function refillSoon(channelId: string): void {
  setTimeout(() => void refillStoryIdeas({ only: channelId, max: 1 }).catch((err) => console.error("[story ideas] refill failed:", err)), 1_000).unref();
}
