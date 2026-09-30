/**
 * The Idea Feed's background work, once a minute:
 *
 *   read    each feed that's due: its tag's newest posts, paged back until
 *           it reaches posts it has seen (at most three pages). Every post is
 *           stored before anything judges it. A tag that turns up nothing new
 *           is read less often (up to every four hours); one that fills every
 *           page is read more (down to every five minutes). Calls stay under
 *           the day's budget, spread across the day (pace.ts), and 900 an
 *           hour (Tumblr allows 1,000); a 429 pauses all reading for half an
 *           hour. A failed read keeps the feed's place and tries again in
 *           fifteen minutes.
 *   judge   new posts get the basic filter (duplicates and obvious junk are
 *           kept, marked), then the AI's quick look in batches, then the full
 *           read for the promising ones — within the day's caps. Anything
 *           over the cap waits for tomorrow; a pasted-in post is read even
 *           when the cap is reached.
 */
import { CHANNELS } from "../catalog.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import {
  addUsage, claimPending, dueFeeds, failAnalysis, feedRead, findDuplicate, getSettings, listFeeds, loadHistory, queueSources,
  releaseClaim, saveAnalysis, setDuplicate, setEngagement, setFiltered, setSourceChannels, textHash, upsertSource, usageOn, usedIdeaFor,
  type Feed, type IdeaSettings, type SourceRow,
} from "../db/ideas.js";
import { AnalysisError, analyzeFull, canAnalyze, triageBatch, type ChannelHint, type TriageItem } from "../ideas/analyze.js";
import { addsCommentary, basicFilter } from "../ideas/filter.js";
import { nearestHistory } from "../ideas/similar.js";
import { recencyWeight, scoreIdea, triageScore, type SimilarMatch } from "../ideas/score.js";
import { minutesIntoDay, nextPollMinutes, pacedAllowance } from "../ideas/pace.js";
import { TumblrError, fetchNoteCounts, fetchPost, fetchTagged, fromLegacy, fromNpf, oldestStamp, parseTumblrUrl, tumblrKey } from "../ideas/tumblr.js";
import { createHash } from "node:crypto";
import { bitsChannels, type RawSource } from "../ideas/types.js";

const HOURLY_CAP = 900;
let running = false;
let pausedUntil = 0;
let pauseReason = "";
const callTimes: number[] = [];

function countCall(): void {
  const now = Date.now();
  callTimes.push(now);
  while (callTimes.length && now - callTimes[0]! > 3_600_000) callTimes.shift();
}
const callsThisHour = () => callTimes.filter((t) => Date.now() - t < 3_600_000).length;

/** The reader's state, for the Sources page. */
export function readerState(): { pausedUntil: Date | null; reason: string; callsThisHour: number } {
  return { pausedUntil: pausedUntil > Date.now() ? new Date(pausedUntil) : null, reason: pauseReason, callsThisHour: callsThisHour() };
}

// ── reading ───────────────────────────────────────────────────────────────

/** What a fresh post goes through before any AI: duplicate, filtered, or queued for a look. */
export async function afterIngest(id: number, raw: RawSource, feed: Feed | null): Promise<"duplicate" | "filtered" | "queued"> {
  // A plain reblog is its original; a reblog with its own commentary stands on its own.
  const dupOf = await findDuplicate(id, raw.isReblog && addsCommentary(raw) ? null : raw.rootKey, textHash(raw.body));
  if (dupOf) {
    await setDuplicate(id, dupOf);
    return "duplicate";
  }
  if (feed) {
    const f = basicFilter(raw, { exclusions: feed.exclusions, minNotes: feed.minNotes });
    if (!f.keep) {
      await setFiltered(id, f.reason ?? "Filtered");
      return "filtered";
    }
  }
  // A post pasted in by hand skips the quick look: someone already thought it worth a full read.
  await queueSources([id], feed ? "triage" : "full");
  return "queued";
}

/** Read one feed: its newest posts, back to where it was last time. */
export async function readFeed(feed: Feed, budget: () => boolean): Promise<{ fresh: number; calls: number }> {
  const newest = feed.cursor.newest ?? 0;
  const maxPages = newest ? 3 : 2;
  let before: number | null = null;
  let pages = 0;
  let fresh = 0;
  let newestSeen = newest;
  let lastPostAt: Date | null = null;
  let filled = false;
  try {
    while (pages < maxPages && budget()) {
      const posts = await fetchTagged(feed.query, before);
      pages++;
      countCall();
      await addUsage("tumblr", { calls: 1 });
      if (!posts.length) break;
      let pageNew = 0;
      let reachedOld = false;
      for (const p of posts) {
        const raw = fromLegacy(p);
        if (!raw) continue;
        const ts = raw.postedAt ? Math.floor(raw.postedAt.getTime() / 1000) : 0;
        if (ts > newestSeen) newestSeen = ts;
        if (raw.postedAt && (!lastPostAt || raw.postedAt > lastPostAt)) lastPostAt = raw.postedAt;
        if (ts && newest && ts <= newest) reachedOld = true;
        const { id, isNew } = await upsertSource(raw, { feed });
        if (isNew) {
          pageNew++;
          await afterIngest(id, raw, feed);
        }
      }
      fresh += pageNew;
      if (reachedOld || pageNew === 0) break;
      before = oldestStamp(posts);
      if (!before) break;
      // More new posts than the pages read, since the last read: a busy tag. (A first read always fills its pages.)
      if (pages === maxPages && newest) filled = true;
    }
    // Read a busy tag more often and a quiet one less, drifting back to its weight's pace.
    await feedRead(feed.id, { ok: true, cursor: { newest: newestSeen }, lastPostAt, pollMinutes: nextPollMinutes(feed.weight, feed.pollMinutes, { filled, fresh }) });
    return { fresh, calls: pages };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof TumblrError && err.status === 429) {
      pausedUntil = Date.now() + (err.retryAfterSec ?? 1800) * 1000;
      pauseReason = "Tumblr's rate limit was reached";
    }
    if (err instanceof TumblrError && (err.status === 401 || err.status === 403)) {
      pausedUntil = Date.now() + 30 * 60_000;
      pauseReason = message;
    }
    await feedRead(feed.id, { ok: false, error: message, retryMinutes: err instanceof TumblrError && err.status === 429 ? 30 : 15 });
    return { fresh, calls: pages };
  }
}

async function pollFeeds(settings: IdeaSettings): Promise<void> {
  if (Date.now() < pausedUntil) return;
  const usage = await usageOn();
  let today = usage.get("tumblr")?.calls ?? 0;
  // The day's calls spread across the day, so busy tags can't spend it all by the afternoon.
  const allowed = pacedAllowance(settings.tumblrDailyCap, minutesIntoDay(ORG_TZ));
  const budget = () => today < allowed && callsThisHour() < HOURLY_CAP && Date.now() >= pausedUntil;
  for (const feed of await dueFeeds(6)) {
    if (!budget()) break;
    const r = await readFeed(feed, budget);
    today += r.calls;
  }
}

// ── judging ───────────────────────────────────────────────────────────────

const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/** Each Bits channel and the tags watched for it: what the AI chooses between. */
async function channelHints(): Promise<ChannelHint[]> {
  const feeds = await listFeeds();
  return bitsChannels().map((channel) => ({ channel, tags: feeds.filter((f) => f.channels.includes(channel)).map((f) => f.query) }));
}

/** The first real Bits channel the AI named, else the channel of the feed that found it. */
function pickChannel(named: string[], feedChannels: string[]): string | null {
  const real = new Set(bitsChannels());
  const byName = (n: string) => CHANNELS.find((c) => c.name.toLowerCase() === n.trim().toLowerCase())?.name;
  for (const n of named) {
    const c = byName(n);
    if (c && real.has(c)) return c;
  }
  return feedChannels.find((c) => real.has(c)) ?? null;
}

async function runTriage(batch: SourceRow[], settings: IdeaSettings): Promise<void> {
  const channels = await channelHints();
  let pictures = 0;
  const posts = batch.map((s) => {
    const image = s.body.length < 120 && s.media[0] && pictures < 5 ? (pictures++, s.media[0].url) : null;
    return { id: String(s.id), body: s.body, tags: s.tags, notes: s.notes, postType: s.postType ?? "text", image };
  });
  try {
    const { items, model, usage } = await triageBatch(posts, channels);
    await addUsage("ai-triage", { calls: 1, items: batch.length, input: usage.input, output: usage.output, cacheRead: usage.cacheRead });
    for (const s of batch) {
      const t = items.get(String(s.id));
      if (!t) {
        await failAnalysis(s.id, "The quick look skipped this post.", true);
        continue;
      }
      const potential = clamp01(t.potential);
      await saveAnalysis(s.id, {
        depth: "triage", model, result: t, score: triageScore(potential), breakdown: null, similarity: null, similarityStatus: "none",
        channel: pickChannel(t.channels, s.channels), classification: null, canonCheck: false,
        next: !t.spam && potential >= settings.fullThreshold ? "full" : null,
      });
    }
  } catch (err) {
    const retryable = !(err instanceof AnalysisError) || err.retryable;
    for (const s of batch) await failAnalysis(s.id, err instanceof Error ? err.message : String(err), retryable);
  }
}

/** The full read of one post, the history check, and the score. */
export async function runFull(s: SourceRow, opts: { tumblrBudget: () => boolean } = { tumblrBudget: () => false }): Promise<void> {
  try {
    const [channels, history] = await Promise.all([channelHints(), loadHistory()]);
    const triage = s.analysis?.depth === "triage" ? (s.analysis.result as unknown as TriageItem) : null;
    const near = nearestHistory(
      { characters: triage?.characters ?? [], franchises: triage?.franchises ?? [], text: `${triage?.hook ?? ""} ${s.body.slice(0, 2500)}`, channel: s.channel },
      history,
      12,
    );
    // Likes and reblogs apart, for a Tumblr post worth a full read (one call).
    if (s.provider === "tumblr" && s.author && s.likes === null && tumblrKey() && opts.tumblrBudget()) {
      try {
        const counts = await fetchNoteCounts(s.author, s.externalId);
        countCall();
        await addUsage("tumblr", { calls: 1 });
        await setEngagement(s.id, counts);
      } catch {
        // Counts are a nice-to-have; the analysis goes on without them.
      }
    }
    const { result, model, usage, history: listed, imagesRead } = await analyzeFull(
      {
        provider: s.provider, author: s.author, postedAt: s.postedAt, foundAt: s.ingestedAt, notes: s.notes, tags: s.tags,
        postType: s.postType ?? "text", isReblog: s.isReblog, body: s.body, images: s.media.map((m) => m.url),
      },
      channels,
      near,
    );
    await addUsage("ai-full", { calls: 1, items: 1, input: usage.input, output: usage.output, cacheRead: usage.cacheRead });

    const today = dateIn(ORG_TZ);
    let matches: SimilarMatch[] | null = null;
    let status: "ok" | "unavailable" = "ok";
    let note = "";
    if (!history.length) {
      // Nothing to compare with isn't the same as "no match": say it couldn't be checked.
      status = "unavailable";
      note = "no Bits uploads or ideas on record yet";
    } else {
      matches = result.similar
        .map((m): SimilarMatch | null => {
          const h = listed.find((x) => x.id === m.ref.trim());
          if (!h) return null;
          const similarity = clamp01(m.similarity);
          const recency = recencyWeight(h.kind, h.date, today);
          return {
            kind: h.kind, ref: h.ref, title: h.title, channel: h.channel, date: h.date, similarity, sameMechanism: m.same_mechanism,
            reason: m.reason, recency, effective: Math.round(similarity * recency * 100) / 100, href: h.href,
          };
        })
        .filter((m): m is SimilarMatch => m !== null)
        .sort((a, b) => b.effective - a.effective);
    }
    const canonish = result.classification === "CANON" || result.classification === "CANON_INSPIRED";
    const breakdown = scoreIdea({
      scores: result.scores,
      whyItWorks: result.why_it_works,
      warnings: [...result.warnings, ...(!imagesRead && s.media.length ? ["The post's pictures couldn't be loaded — judged from its words"] : [])],
      classification: result.classification,
      canonConfidence: clamp01(result.canon_confidence),
      canonCheckRequired: result.canon_verification_required,
      canonChecks: result.canon_checks,
      engines: result.comedy_engines,
      notes: s.notes,
      postedAt: s.postedAt,
      readAt: s.engagementAt ?? s.ingestedAt,
      matches,
      similarityNote: note,
      usedSource: await usedIdeaFor(s.id, s.rootKey),
    });
    if (!result.viable) {
      breakdown.score = Math.min(breakdown.score, 35);
      breakdown.problems.unshift("No viable Short found in this post");
    }
    const channel = pickChannel(
      [...result.recommended_channels].sort((a, b) => clamp01(b.confidence) - clamp01(a.confidence)).map((c) => c.channel),
      s.channels,
    );
    await saveAnalysis(s.id, {
      depth: "full", model, result, score: breakdown.score, breakdown, similarity: matches, similarityStatus: status, channel,
      classification: result.classification,
      canonCheck: result.canon_verification_required || (canonish && clamp01(result.canon_confidence) < 0.6),
      next: null,
    });
  } catch (err) {
    const retryable = !(err instanceof AnalysisError) || err.retryable;
    await failAnalysis(s.id, err instanceof Error ? err.message : String(err), retryable);
  }
}

async function processQueue(settings: IdeaSettings): Promise<void> {
  const usage = await usageOn();
  const triaged = usage.get("ai-triage")?.items ?? 0;
  const full = usage.get("ai-full")?.items ?? 0;
  const tumblrToday = usage.get("tumblr")?.calls ?? 0;
  const tumblrBudget = () => tumblrToday < settings.tumblrDailyCap && callsThisHour() < HOURLY_CAP && Date.now() >= pausedUntil;

  const room = settings.triageCap - triaged;
  if (room > 0) {
    const batch = await claimPending("triage", Math.min(20, room));
    if (batch.length) await runTriage(batch, settings);
  }
  // Up to three full reads at once; past the day's cap, only posts pasted in by hand.
  const fullRoom = settings.fullCap - full;
  const list = await claimPending("full", fullRoom > 0 ? Math.min(3, fullRoom) : 3);
  const go = fullRoom > 0 ? list : list.filter((s) => s.discoveredVia === "manual");
  await releaseClaim(list.filter((s) => !go.includes(s)).map((s) => s.id));
  await Promise.all(go.map((s) => runFull(s, { tumblrBudget })));
}

/** One minute's work: read what's due, then judge what's waiting. */
export async function ideaTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const settings = await getSettings();
    if (settings.polling && tumblrKey()) await pollFeeds(settings);
    if (settings.ai && canAnalyze()) await processQueue(settings);
  } catch (err) {
    console.error("[ideas] tick failed:", err);
  } finally {
    running = false;
  }
}

export function startIdeaJobs(): void {
  // Once a minute (IDEAS_TICK_MS shortens it, for testing against a stand-in API).
  const every = Math.max(2_000, Number(process.env.IDEAS_TICK_MS) || 60_000);
  setInterval(() => void ideaTick(), every).unref();
  setTimeout(() => void ideaTick(), Math.min(30_000, every)).unref();
  console.log(`[ideas] feed ${tumblrKey() ? "reading Tumblr" : "waiting for TUMBLR_API_KEY"} · ${canAnalyze() ? "analysis on" : "analysis waiting for ANTHROPIC_API_KEY"}`);
}

/**
 * A post pasted in by hand: a Tumblr link is read through the API (when
 * there's a key); anything else — or a link that can't be read — needs its
 * text pasted too. Either way it goes through the same analysis, straight to
 * the full read, and keeps the link to the original.
 */
export async function addManualSource(input: { url: string; text: string; channel: string | null }): Promise<{ id: number; existed: boolean } | { error: string }> {
  const url = input.url.trim().slice(0, 2000);
  const text = input.text.trim().slice(0, 20_000);
  if (url && !/^https?:\/\//i.test(url) && !/^[\w.-]+\.[a-z]{2,}\//i.test(url)) return { error: "That link doesn't look right." };
  const link = url && !/^https?:\/\//i.test(url) ? `https://${url}` : url;
  const tumblr = link ? parseTumblrUrl(link) : null;
  let raw: RawSource | null = null;
  let readError = "";
  if (tumblr && tumblrKey()) {
    try {
      const post = await fetchPost(tumblr.blog, tumblr.id);
      countCall();
      await addUsage("tumblr", { calls: 1 });
      raw = post ? fromNpf(post) : null;
    } catch (err) {
      readError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!raw) {
    if (!text) {
      if (readError) return { error: `${readError} Paste the post's text as well and it'll be used instead.` };
      return { error: tumblr ? "Reading Tumblr links needs TUMBLR_API_KEY — paste the post's text as well for now." : "Paste the post's text (or a Tumblr link)." };
    }
    raw = {
      provider: tumblr ? "tumblr" : "manual",
      externalId: tumblr ? tumblr.id : `m${createHash("sha1").update(link || text).digest("hex").slice(0, 16)}`,
      url: link || "",
      author: tumblr?.blog ?? null,
      authorUrl: tumblr ? `https://www.tumblr.com/${tumblr.blog}` : null,
      postedAt: null,
      postType: "manual",
      title: null,
      body: text,
      media: [],
      tags: [],
      notes: null,
      rootKey: tumblr ? `tumblr:${tumblr.id}` : null,
      isReblog: false,
      addedText: null,
      raw: { pasted: true },
    };
  }
  const { id, isNew } = await upsertSource(raw, { manual: true });
  if (input.channel && bitsChannels().includes(input.channel)) await setSourceChannels(id, input.channel);
  if (isNew) await afterIngest(id, raw, null);
  else await queueSources([id], "full");
  return { id, existed: !isNew };
}
