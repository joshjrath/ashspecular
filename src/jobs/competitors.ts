/**
 * Competitors' background work, every ten minutes:
 *
 *   read      channels that are due (every 3 hours): with YOUTUBE_API_KEY a
 *             new channel's last 500 uploads once, then its newest page and
 *             the views of its last 60 days; without a key, its free feed
 *             (latest 15). Never past the day's quota budget (6,000 of
 *             YouTube's 10,000 units by default).
 *   concepts  what each new video is about — competitors' last 120 days, my
 *             channels' whole history, what's planned — read once and kept.
 *             Claude when there's a key (within the day's calls), else rules.
 *   alerts    hourly: a major outlier (4× by default) in its first week, a
 *             new strong concept gap, a topic three channels picked up in two
 *             weeks that's doing above their normal.
 *             Each raised once.
 *   read      once a day per niche: Claude's interpretation of the facts,
 *             every note citing the facts it rests on.
 */
import { z } from "zod";
import { askClaude, canUseClaude, modelFor } from "../ai/claude.js";
import {
  addUsage, dueChannels, getCompSettings, hasReadToday, listGroups, raiseAlert, recentVideoIds, saveChannelRead, saveConcepts, saveRead, saveVideos,
  conceptsToRead, usageToday, type CompChannel,
} from "../db/competitors.js";
import { pool } from "../db/pool.js";
import { channelInfo, feedVideos, findChannel, uploadIds, videoDetails, ytKey } from "../competitors/youtube.js";
import { CONCEPT_VERSION, readConcepts, ruleConcept } from "../competitors/concepts.js";
import { loadNiche } from "../competitors/niche.js";
import { conceptGaps, emergingTopics, whatsWorking } from "../competitors/analysis.js";

let running = false;
let lastAlerts = 0;

/** Read one channel. */
export async function readChannel(c: CompChannel): Promise<void> {
  const key = ytKey();
  const spend = { units: 0 };
  try {
    let id = c.youtubeId;
    if (!id) {
      const found = await findChannel(c.input);
      if ("error" in found) throw new Error(found.error);
      id = found.id;
      await pool.query("UPDATE comp_channels SET youtube_id = $2 WHERE id = $1", [c.id, id]);
    }
    if (key) {
      const info = await channelInfo(id, key, fetch, spend);
      const backfill = !c.backfilledAt;
      const ids = await uploadIds(id, key, fetch, spend, backfill ? 10 : 1);
      const want = new Set([...ids.map((x) => x.videoId), ...(backfill ? [] : await recentVideoIds(id, 60))]);
      await saveVideos(id, await videoDetails([...want], key, fetch, spend));
      await saveChannelRead(c.id, { youtubeId: id, info, ok: true, backfilled: backfill, nextHours: 3 });
    } else {
      const feed = await feedVideos(id);
      await saveVideos(id, feed.videos);
      await saveChannelRead(c.id, { youtubeId: id, title: feed.title, ok: true, nextHours: 3 });
    }
  } catch (err) {
    await saveChannelRead(c.id, { ok: false, error: err instanceof Error ? err.message : String(err), nextHours: 1 });
  } finally {
    await addUsage("youtube", spend.units);
  }
}

async function readDue(): Promise<void> {
  const settings = await getCompSettings();
  for (const c of await dueChannels(8)) {
    // A backfill costs about 20 units; stop well short of the day's budget.
    if ((await usageToday()).youtube + 25 > settings.quota) break;
    await readChannel(c);
  }
}

/** Every concept the niches need that hasn't been read (or only by rules while Claude could). */
async function readMissingConcepts(): Promise<void> {
  const settings = await getCompSettings();
  const ai = canUseClaude();
  for (const g of await listGroups()) {
    const n = await loadNiche(g.id);
    if (!n) continue;
    const wanted = [
      ...n.rows.filter((r) => r.channel.mine || r.ageDays <= 120).map((r) => ({ ref: r.video.videoId, title: r.video.title })),
      ...n.planned.map((p) => ({ ref: p.ref, title: p.title })),
    ];
    const missing = await conceptsToRead(wanted.map((w) => w.ref), CONCEPT_VERSION, ai);
    let todo = wanted.filter((w) => missing.has(w.ref));
    // Outliers and the newest first: they matter most if the day's calls run out.
    const rank = new Map(n.rows.map((r) => [r.video.videoId, (r.multiple ?? 0) * 10 - r.ageDays / 30]));
    todo = todo.sort((a, b) => (rank.get(b.ref) ?? 50) - (rank.get(a.ref) ?? 50));
    if (!todo.length) continue;
    if (!ai) {
      await saveConcepts(todo.map((t) => ruleConcept(t.ref, t.title)), CONCEPT_VERSION);
      continue;
    }
    const { rows: names } = await pool.query(
      "SELECT name FROM (SELECT lead AS name FROM comp_concepts WHERE source = 'ai' AND lead IS NOT NULL UNION ALL SELECT other FROM comp_concepts WHERE source = 'ai' AND other IS NOT NULL) x GROUP BY name ORDER BY COUNT(*) DESC LIMIT 200",
    );
    for (let i = 0; i < todo.length; i += 50) {
      if ((await usageToday()).ai >= settings.aiCalls) {
        // Out of calls today: the rest read by rules for now, and by Claude tomorrow.
        await saveConcepts(todo.slice(i).map((t) => ruleConcept(t.ref, t.title)), CONCEPT_VERSION);
        return;
      }
      try {
        const { concepts } = await readConcepts(todo.slice(i, i + 50), names.map((r) => String(r.name)));
        await saveConcepts(concepts, CONCEPT_VERSION);
      } catch (err) {
        console.error("[competitors] concepts failed:", err instanceof Error ? err.message : err);
        await saveConcepts(todo.slice(i, i + 50).map((t) => ruleConcept(t.ref, t.title)), CONCEPT_VERSION);
      } finally {
        await addUsage("ai", 1);
      }
    }
  }
}

/** Alerts that matter: never one per upload. */
async function raiseAlerts(): Promise<void> {
  for (const g of await listGroups()) {
    const n = await loadNiche(g.id);
    if (!n) continue;
    const s = n.settings;
    for (const r of n.rows) {
      if (r.channel.mine || r.multiple === null || r.multiple < s.major || r.ageDays > 7) continue;
      await raiseAlert({ groupId: g.id, kind: "outlier", key: r.video.videoId, text: `${r.multiple.toFixed(1)}× outlier in ${g.name}: “${r.video.title}” (${r.channel.title ?? "a competitor"})`, href: r.video.url });
    }
    for (const gap of conceptGaps(n.rows, n.planned, { days: 30, outlier: s.outlier, staleMonths: s.staleMonths, now: n.now }).filter((x) => x.strong).slice(0, 5)) {
      await raiseAlert({ groupId: g.id, kind: "gap", key: gap.key, text: `New concept gap in ${g.name}: ${gap.label} — ${gap.channels} competitors with outliers, highest ${gap.maxMultiple.toFixed(1)}×`, href: `/competitors/${g.id}/gaps?c=${encodeURIComponent(gap.key)}` });
    }
    // Spreading and doing well: three channels, and above their normal where it can be told — never mere volume.
    for (const e of emergingTopics(n.rows).filter((x) => x.channels >= 3 && (x.medianMultiple ?? 0) >= 1.5).slice(0, 2)) {
      await raiseAlert({ groupId: g.id, kind: "spread", key: `${e.kind}:${e.label.toLowerCase()}:${new Date().toISOString().slice(0, 7)}`, text: `${e.channels} ${g.name} competitors picked up ${e.label} in the last 14 days`, href: `/competitors/${g.id}#emerging` });
    }
  }
}

const ReadSchema = z.object({ notes: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })) });

/** Once a day per niche: Claude's reading of the facts, each note tied to the facts it cites. */
async function dailyReads(): Promise<void> {
  if (!canUseClaude()) return;
  const settings = await getCompSettings();
  for (const g of await listGroups()) {
    if (await hasReadToday(g.id)) continue;
    if ((await usageToday()).ai >= settings.aiCalls) return;
    const n = await loadNiche(g.id);
    if (!n || n.rows.length < 10) continue;
    const s = n.settings;
    const facts: Array<{ id: string; text: string }> = [];
    const add = (text: string) => facts.push({ id: `F${facts.length + 1}`, text });
    for (const gap of conceptGaps(n.rows, n.planned, { days: 30, outlier: s.outlier, staleMonths: s.staleMonths, now: n.now }).slice(0, 6)) add(`Concept gap — ${gap.why}`);
    for (const p of whatsWorking(n.rows, { days: 30, outlier: s.outlier }).slice(0, 8)) add(`Working — ${p.fact}`);
    for (const e of emergingTopics(n.rows).slice(0, 5)) add(`Emerging — ${e.fact}`);
    if (facts.length < 2) continue;
    try {
      const { parsed, model } = await askClaude({
        model: modelFor("competitors"),
        system: `You read a YouTube niche's competitive facts for a studio that makes videos in it, and say what they mean: patterns worth acting on, what might explain them, what to be careful about. Write at most five short notes. Every note must cite the fact ids it rests on, and must not state any number, video or channel that isn't in the facts. Interpret; never invent performance. Don't recommend copying any one video; point at the repeatable pattern.`,
        schema: ReadSchema, effort: "medium", maxTokens: 8000, what: "interpret these facts",
        content: [{ type: "text", text: `NICHE: ${g.name}\n\nFACTS:\n${facts.map((f) => `${f.id}: ${f.text}`).join("\n")}` }],
      });
      const ids = new Set(facts.map((f) => f.id));
      const notes = parsed.notes.map((x) => ({ text: x.text.trim().slice(0, 600), cites: x.cites.filter((c) => ids.has(c)) })).filter((x) => x.text && x.cites.length).slice(0, 5);
      await saveRead(g.id, facts, notes, model);
    } catch (err) {
      console.error("[competitors] daily read failed:", err instanceof Error ? err.message : err);
    } finally {
      await addUsage("ai", 1);
    }
  }
}

export async function competitorTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await readDue();
    await readMissingConcepts();
    if (Date.now() - lastAlerts > 55 * 60_000) {
      lastAlerts = Date.now();
      await raiseAlerts();
      await dailyReads();
    }
  } catch (err) {
    console.error("[competitors] tick failed:", err);
  } finally {
    running = false;
  }
}

export function startCompetitorJobs(): void {
  const every = Math.max(5_000, Number(process.env.COMPETITORS_TICK_MS) || 10 * 60_000);
  setInterval(() => void competitorTick(), every).unref();
  setTimeout(() => void competitorTick(), Math.min(20_000, every)).unref();
}
