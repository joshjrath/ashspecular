/**
 * Specular compilations, stored: the catalog they're built from (every
 * long-form Stories upload, with its runtime and use so far), the
 * compilations planned and posted, exclusions, and picks rerolled away.
 * See compilations/engine.ts for how picks are made.
 */
import { pool } from "./pool.js";
import { CHANNELS } from "../catalog.js";
import { DEADLINE_TIME, ORG_TZ, dateIn, instantIn } from "../parse/derive.js";
import { inferMovieConcept, inferMovieSources, inferSleepConcept, oneEach, type Kind, type PastCompilation, type Pick, type Source } from "../compilations/engine.js";
import { corpus } from "../web/stories/corpus.js";
import { norm } from "../web/stories/lab.js";
import { openBatchesFor } from "../jobs/batches.js";
import { VO_WPM } from "../web/work.js";

/** Where each kind posts. */
/** The channel each kind posts on, by id: whatever it's called now. */
const COMPILATION_CHANNEL_ID: Record<Kind, string> = { movie: "main", sleep: "sleep" };
export const compilationChannel = (kind: Kind): string => CHANNELS.find((c) => c.id === COMPILATION_CHANNEL_ID[kind])?.name ?? (kind === "movie" ? "Specular" : "Specular Sleep");
/** The channels whose long-form uploads are sources: every Stories channel. */
export const sourceChannels = () => CHANNELS.filter((c) => c.category === "stories").map((c) => c.name);

const D = (col: string, as: string) => `to_char(${col}, 'YYYY-MM-DD') AS ${as}`;

export interface Exclusion { id: number; videoId: string | null; title: string | null; reason: string }

export async function listExclusions(): Promise<Exclusion[]> {
  const { rows } = await pool.query("SELECT id, video_id, title, reason FROM compilation_exclusions ORDER BY created_at DESC");
  return rows.map((r) => ({ id: Number(r.id), videoId: r.video_id, title: r.title, reason: r.reason }));
}
export async function addExclusion(e: { videoId: string | null; title: string | null; reason: string }): Promise<void> {
  await pool.query("INSERT INTO compilation_exclusions (video_id, title, reason) VALUES ($1, $2, $3)", [e.videoId, e.title, e.reason]);
}
export async function removeExclusion(id: number): Promise<void> {
  await pool.query("DELETE FROM compilation_exclusions WHERE id = $1", [id]);
}

/** A runtime typed in by hand wins over any estimate, and YouTube's own. */
export async function setRuntime(videoId: string, seconds: number | null): Promise<void> {
  await pool.query(
    "UPDATE uploads SET duration_s = $2, duration_source = CASE WHEN $2::int IS NULL THEN NULL ELSE 'manual' END WHERE video_id = $1",
    [videoId, seconds],
  );
}

/**
 * The catalog: every long-form Stories upload ever read, minus exclusions,
 * with its runtime (YouTube's, its script's word count at
 * reading pace, or typed in) and how often each kind has used it.
 */
export async function loadCatalog(): Promise<{ sources: Source[]; excluded: Array<Source & { reason: string }> }> {
  const [ups, uses, excl] = await Promise.all([
    pool.query(
      `SELECT video_id, title, channel, ${D("published_at AT TIME ZONE 'UTC'", "day")}, views, duration_s, duration_source
         FROM uploads WHERE channel = ANY($1) AND url NOT LIKE '%/shorts/%'`,
      [sourceChannels()],
    ),
    pool.query(
      `SELECT s.video_id, c.kind, COUNT(*) AS n FROM compilation_sources s JOIN compilations c ON c.id = s.compilation_id
        WHERE c.status <> 'discarded' GROUP BY 1, 2`,
    ),
    listExclusions(),
  ]);
  const scriptWords = new Map(corpus().map((s) => [norm(s.title), s.words]));
  const use = new Map<string, { movie: number; sleep: number }>();
  for (const r of uses.rows) {
    const u = use.get(r.video_id) ?? { movie: 0, sleep: 0 };
    u[r.kind as Kind] = Number(r.n);
    use.set(r.video_id, u);
  }
  const exIds = new Map(excl.filter((e) => e.videoId).map((e) => [e.videoId!, e.reason]));
  const exTitles = new Map(excl.filter((e) => e.title).map((e) => [norm(e.title!), e.reason]));
  const sources: Source[] = [];
  const excluded: Array<Source & { reason: string }> = [];
  for (const r of ups.rows) {
    let runtime: number | null = r.duration_s === null ? null : Number(r.duration_s);
    let from = (r.duration_source as Source["runtimeFrom"]) ?? null;
    if (runtime === null && scriptWords.get(norm(r.title))) { runtime = Math.round((scriptWords.get(norm(r.title))! / VO_WPM) * 60); from = "script"; }
    const s: Source = {
      id: r.video_id, title: r.title, channel: r.channel, published: r.day, runtime, runtimeFrom: runtime === null ? null : from,
      views: r.views === null ? null : Number(r.views), movieUses: use.get(r.video_id)?.movie ?? 0, sleepUses: use.get(r.video_id)?.sleep ?? 0,
    };
    const reason = exIds.get(s.id) ?? exTitles.get(norm(s.title));
    if (reason !== undefined) excluded.push({ ...s, reason });
    else sources.push(s);
  }
  return { sources: oneEach(sources), excluded };
}

export interface Compilation {
  id: number;
  kind: Kind;
  number: number | null;
  title: string;
  concept: string;
  slotDate: string | null;
  status: "planned" | "posted" | "discarded";
  recordId: number | null;
  uploadVideoId: string | null;
  inferred: boolean;
  sources: Array<{ id: string; title: string; channel: string; runtime: number | null; runtimeFrom: string | null; published: string }>;
  playOrder: string[] | null;
  intro: string | null;
  transitions: string[] | null;
  packageNote: string | null;
  packagedAt: Date | null;
}

export async function listCompilations(opts: { kind?: Kind; statuses?: string[]; limit?: number; id?: number } = {}): Promise<Compilation[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => (args.push(v), `$${args.length}`);
  if (opts.id) where.push(`c.id = ${arg(opts.id)}`);
  if (opts.kind) where.push(`c.kind = ${arg(opts.kind)}`);
  if (opts.statuses) where.push(`c.status = ANY(${arg(opts.statuses)})`);
  const { rows } = await pool.query(
    `SELECT c.*, ${D("c.slot_date", "slot")},
       COALESCE((SELECT json_agg(json_build_object('id', u.video_id, 'title', u.title, 'channel', u.channel, 'runtime', u.duration_s,
                  'runtimeFrom', u.duration_source, 'published', to_char(u.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')) ORDER BY s.position)
                 FROM compilation_sources s JOIN uploads u ON u.video_id = s.video_id WHERE s.compilation_id = c.id), '[]') AS sources
     FROM compilations c ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY c.slot_date DESC NULLS LAST, c.id DESC LIMIT ${Math.max(1, Math.min(2000, opts.limit ?? 500))}`,
    args,
  );
  return rows.map((r) => ({
    id: Number(r.id), kind: r.kind, number: r.number === null ? null : Number(r.number), title: r.title, concept: r.concept, slotDate: r.slot ?? null,
    status: r.status, recordId: r.record_id === null ? null : Number(r.record_id), uploadVideoId: r.upload_video_id, inferred: r.inferred,
    sources: r.sources, playOrder: r.play_order, intro: r.intro, transitions: r.transitions, packageNote: r.package_note, packagedAt: r.packaged_at,
  }));
}

/** What the picker checks new picks against: every compilation not discarded. */
export async function loadPast(): Promise<PastCompilation[]> {
  return (await listCompilations({ statuses: ["planned", "posted"], limit: 2000 })).map((c) => ({
    kind: c.kind, concept: c.concept, date: c.slotDate ?? "1970-01-01", sources: c.sources.map((s) => s.id),
  }));
}

/**
 * Older uploads on Specular and Specular Sleep, read back as compilations:
 * their concept from the title, and for a Movie its likely sources. A
 * planned compilation whose upload has now appeared becomes posted.
 */
export async function syncPosted(catalog: Source[]): Promise<number> {
  const { rows } = await pool.query(
    `SELECT u.video_id, u.title, u.channel, ${D("u.published_at AT TIME ZONE 'UTC'", "day")}
       FROM uploads u WHERE u.channel = ANY($1) AND u.url NOT LIKE '%/shorts/%'
        AND NOT EXISTS (SELECT 1 FROM compilations c WHERE c.upload_video_id = u.video_id)`,
    [[compilationChannel("movie"), compilationChannel("sleep")]],
  );
  let added = 0;
  for (const r of rows) {
    const kind: Kind = r.channel === compilationChannel("movie") ? "movie" : "sleep";
    // One this board planned, now uploaded: same title, planned for on or before the day it went up.
    const planned = await pool.query(
      `SELECT id FROM compilations WHERE kind = $1 AND status = 'planned' AND upload_video_id IS NULL
         AND lower(regexp_replace(title, '[^a-zA-Z0-9]+', '', 'g')) = lower(regexp_replace($2, '[^a-zA-Z0-9]+', '', 'g')) LIMIT 1`,
      [kind, r.title],
    );
    if (planned.rows[0]) {
      await pool.query("UPDATE compilations SET status = 'posted', upload_video_id = $2 WHERE id = $1", [planned.rows[0].id, r.video_id]);
      continue;
    }
    const concept = kind === "movie" ? inferMovieConcept(r.title) : inferSleepConcept(r.title);
    const sources = kind === "movie" ? inferMovieSources(r.title, r.day, catalog) : [];
    const ins = await pool.query(
      `INSERT INTO compilations (kind, title, concept, slot_date, status, upload_video_id, inferred) VALUES ($1, $2, $3, $4, 'posted', $5, true)
       ON CONFLICT (upload_video_id) DO NOTHING RETURNING id`,
      [kind, r.title, concept, r.day, r.video_id],
    );
    const id = ins.rows[0]?.id;
    if (!id) continue;
    added++;
    for (const [i, v] of sources.entries()) await pool.query("INSERT INTO compilation_sources (compilation_id, video_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, v, i]);
  }
  // Numbers: each kind counted in the order they posted or are planned.
  await pool.query(
    `UPDATE compilations c SET number = n.rn FROM (
       SELECT id, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY slot_date NULLS LAST, id) AS rn FROM compilations WHERE status <> 'discarded'
     ) n WHERE n.id = c.id AND c.number IS DISTINCT FROM n.rn`,
  );
  return added;
}

/** Fix an older compilation's sources by hand, when reading its title got them wrong. */
export async function setSources(id: number, videoIds: string[]): Promise<void> {
  await pool.query("DELETE FROM compilation_sources WHERE compilation_id = $1", [id]);
  for (const [i, v] of videoIds.entries()) await pool.query("INSERT INTO compilation_sources (compilation_id, video_id, position) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, v, i]);
}

export async function listSkips(kind: Kind): Promise<Set<string>> {
  await pool.query("DELETE FROM compilation_skips WHERE skipped_at < now() - interval '21 days'");
  const { rows } = await pool.query("SELECT combo FROM compilation_skips WHERE kind = $1", [kind]);
  return new Set(rows.map((r) => r.combo as string));
}
export async function addSkip(kind: Kind, combo: string): Promise<void> {
  await pool.query("INSERT INTO compilation_skips (kind, combo) VALUES ($1, $2) ON CONFLICT DO NOTHING", [kind, combo]);
}
export async function clearSkips(kind: Kind): Promise<void> {
  await pool.query("DELETE FROM compilation_skips WHERE kind = $1", [kind]);
}

/** Days already holding a compilation of this kind (planned or posted), and days off. */
export async function takenDays(kind: Kind): Promise<{ taken: Set<string>; last: string | null; daysOff: Set<string> }> {
  const [c, off] = await Promise.all([
    pool.query(`SELECT ${D("slot_date", "d")} FROM compilations WHERE kind = $1 AND status <> 'discarded' AND slot_date IS NOT NULL`, [kind]),
    pool.query(`SELECT ${D("day", "d")} FROM days_off`).catch(() => ({ rows: [] as Array<{ d: string }> })),
  ]);
  const days = c.rows.map((r) => r.d as string).sort();
  return { taken: new Set(days), last: days[days.length - 1] ?? null, daysOff: new Set(off.rows.map((r) => r.d as string)) };
}

/**
 * "Use": keep the pick as a planned compilation on its slot, and put it on
 * the calendar — a Movie on that day's Specular batch (opened early if it
 * isn't yet), a Sleep as a Specular Sleep video on its day.
 */
export async function planCompilation(pick: Pick, slot: string): Promise<number> {
  const client = await pool.connect();
  let id: number;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO compilations (kind, title, concept, slot_date, status) VALUES ($1, $2, $3, $4, 'planned') RETURNING id",
      [pick.kind, pick.title, pick.concept, slot],
    );
    id = Number(rows[0].id);
    for (const [i, s] of pick.sources.entries()) {
      await client.query("INSERT INTO compilation_sources (compilation_id, video_id, position) VALUES ($1, $2, $3)", [id, s.id, i]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  let recordId: number | null = null;
  if (pick.kind === "movie") {
    await openBatchesFor(slot, (c) => c.id === COMPILATION_CHANNEL_ID.movie).catch(() => null);
    const { rows } = await pool.query(
      "UPDATE records SET title = $2, updated_at = now() WHERE channel = $1 AND batch_no IS NOT NULL AND air_date = $3::date RETURNING id",
      [compilationChannel("movie"), pick.title, slot],
    );
    recordId = rows[0] ? Number(rows[0].id) : null;
  } else {
    const { rows } = await pool.query(
      `INSERT INTO records (kind, category, channel, title, air_date, deadline, vo_source, status, parsed_by, confidence, source_message_id, raw_content, note)
       VALUES ('assignment', 'movies', $1, $2, $3, $4, 'none', 'open', 'compilation', 1, $5, '', $6) RETURNING id`,
      [compilationChannel("sleep"), pick.title, slot, instantIn(slot, DEADLINE_TIME, ORG_TZ), `compilation:${id}`, `Sleep compilation — ${pick.sources.length} sources, from Story Lab`],
    );
    recordId = Number(rows[0].id);
  }
  await pool.query("UPDATE compilations SET record_id = $2 WHERE id = $1", [id, recordId]);
  await syncNumbers();
  return id;
}

async function syncNumbers(): Promise<void> {
  await pool.query(
    `UPDATE compilations c SET number = n.rn FROM (
       SELECT id, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY slot_date NULLS LAST, id) AS rn FROM compilations WHERE status <> 'discarded'
     ) n WHERE n.id = c.id AND c.number IS DISTINCT FROM n.rn`,
  );
}

/** Take a planned compilation back: its slot opens again, and the calendar with it. */
export async function discardCompilation(id: number): Promise<void> {
  const [c] = await listCompilations({ id });
  if (!c || c.status !== "planned") return;
  await pool.query("UPDATE compilations SET status = 'discarded' WHERE id = $1", [id]);
  if (c.recordId && c.kind === "movie") await pool.query("UPDATE records SET title = channel WHERE id = $1 AND batch_no IS NOT NULL", [c.recordId]);
  if (c.recordId && c.kind === "sleep") await pool.query("UPDATE records SET status = 'removed' WHERE id = $1 AND source_message_id = $2 AND status = 'open'", [c.recordId, `compilation:${id}`]);
  await syncNumbers();
}

export async function renameCompilation(id: number, title: string): Promise<void> {
  const { rows } = await pool.query("UPDATE compilations SET title = $2 WHERE id = $1 RETURNING record_id", [id, title]);
  if (rows[0]?.record_id) await pool.query("UPDATE records SET title = $2 WHERE id = $1", [rows[0].record_id, title]);
}

export async function savePackage(id: number, p: { order: string[]; intro: string | null; transitions: string[]; note: string | null }): Promise<void> {
  await pool.query(
    "UPDATE compilations SET play_order = $2, intro = $3, transitions = $4, package_note = $5, packaged_at = now() WHERE id = $1",
    [id, JSON.stringify(p.order), p.intro, JSON.stringify(p.transitions), p.note],
  );
}

/** The text of each source, for the editor package: its script, by title. */
export async function sourceTexts(videoIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!videoIds.length) return out;
  const { rows } = await pool.query("SELECT video_id, title FROM uploads WHERE video_id = ANY($1)", [videoIds]);
  const scripts = new Map(corpus().map((s) => [norm(s.title), s.sections.map((x) => x.paras.join("\n\n")).join("\n\n")]));
  for (const r of rows) {
    const script = scripts.get(norm(r.title));
    if (script) out.set(r.video_id, script);
  }
  return out;
}

export const todayOrg = () => dateIn(ORG_TZ);

/**
 * How the channel's scripts open, for the package's voice: a few intros from
 * the scripts Story Lab learns from, the most recent-sounding first.
 */
export function voiceSamples(n = 4): string[] {
  const intros = corpus()
    .map((s) => s.sections.find((x) => x.name === "INTRO")?.paras.join("\n\n") ?? "")
    .filter((t) => t.split(/\s+/).length >= 60);
  const step = Math.max(1, Math.floor(intros.length / n));
  return intros.filter((_, i) => i % step === 0).slice(0, n).map((t) => t.split(/\s+/).slice(0, 220).join(" "));
}
