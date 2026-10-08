/**
 * The board against a real Postgres: every migration on an empty database
 * (and again, to show they're safe to re-run), then every page signed in and
 * the main form actions — on an empty board, and again once there's a little
 * of everything in it. Nothing may answer 500.
 *
 * It writes to the database it's given, so it only runs on one whose name
 * says it's for tests (specular_test, ci_test…). CI starts one for it:
 *
 *   DATABASE_URL=postgres://…/specular_test npm run test:db
 */
import { config, hasDatabase } from "../src/config.js";

// The last part of the path, before any ?query (a socket address like postgres://u@/db?host=… has no host for URL to parse).
const dbName = config.databaseUrl.split("?")[0]!.split("/").pop() ?? "";
if (!hasDatabase || !/test/i.test(dbName)) {
  console.error(`test:db needs DATABASE_URL pointing at a database named for tests (got "${dbName || "none"}"). It writes to it.`);
  process.exit(1);
}

const { migrate } = await import("../src/db/migrate.js");
const { prepareDatabase } = await import("../src/db/prepare.js");
const { pool } = await import("../src/db/pool.js");
const { buildApp } = await import("../src/web/server.js");
const { COOKIE_NAME, issueToken } = await import("../src/web/auth.js");
const { saveRecord } = await import("../src/db/records.js");
const { derive } = await import("../src/parse/derive.js");
const { dateIn, ORG_TZ, shiftDate } = await import("../src/parse/derive.js");

let pass = 0;
let fail = 0;
function t(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

// ── the schema ──────────────────────────────────────────────────────────────
await migrate();
await migrate();
await prepareDatabase();
const { rows: applied } = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
const { readdirSync } = await import("node:fs");
const files = readdirSync(new URL("../src/db/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql"));
t("every migration applies to an empty database, and running them again changes nothing", applied[0]?.n, files.length);

// ── every page, and the main actions ────────────────────────────────────────
const routes: Array<[string, string]> = [];
const app = await buildApp({ onRoute: (m, u) => routes.push([m, u]) });
await app.ready();
let cookie = `${COOKIE_NAME}=${issueToken()}`;
const today = dateIn(ORG_TZ);
const fill = (url: string) =>
  url.replace(/:(\w+)\??/g, (_, p: string) => (p === "date" ? today : p === "ym" ? today.slice(0, 7) : p === "name" ? encodeURIComponent("Specular Anime") : p === "cid" || p === "gid" ? "1" : "1"));
const pages = routes.filter(([m, u]) => m === "GET" && !["/calendar.ics", "/healthz"].includes(u)).map(([, u]) => fill(u));

async function crawl(): Promise<string[]> {
  const failed: string[] = [];
  for (const url of [...new Set(pages)]) {
    const res = await app.inject({ method: "GET", url, headers: { cookie } });
    if (res.statusCode >= 500) failed.push(`GET ${url} → ${res.statusCode}`);
    // Sent to sign in means the page was never looked at: as good as a failure here.
    if (res.headers.location === "/login") failed.push(`GET ${url} → signed out`);
  }
  return failed;
}

async function post(url: string, body: Record<string, string>): Promise<{ status: number; location?: string }> {
  const res = await app.inject({
    method: "POST", url, headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, payload: new URLSearchParams(body).toString(),
  });
  return { status: res.statusCode, location: res.headers.location as string | undefined };
}

t(`every page opens on an empty board (${new Set(pages).size} pages)`, await crawl(), []);

// A little of everything: videos from Discord, a task, money in and out, a script, a niche, a day off.
const filed = new Date();
for (const [i, title] of ["What If Goku Was In The Boys?", "What If Batman Was In Naruto?", "Undertale Bits #12"].entries()) {
  const record = derive({
    kind: "assignment", code: `video-${100 + i}`, title, category: i === 2 ? "bits" : "stories", channel: i === 2 ? "Undertale Bits" : "Specular Anime", tag: null,
    air_date: shiftDate(today, 3 + i), stage: "script", word_count: 4000, assignee: "@ash", script_due: null, vo_due: null, deadline: null, version: null,
    links: [], brief: "A brief.", note: null, confidence: 0.9,
  } as never, title, filed);
  await saveRecord(record, { messageId: `m${i}`, channelId: "c", guildId: null, author: "ash", url: `https://discord.com/channels/1/2/${i}`, raw: title, parsedBy: "pattern" });
}
const { rows: recs } = await pool.query("SELECT id FROM records ORDER BY id");
const firstId = String(recs[0]?.id ?? 1);

const actions: Array<[string, Record<string, string>]> = [
  ["/tasks", { text: "Email the editor about the thumbnail tomorrow", notes: "n" }],
  ["/finance/expenses", { date: today, amount: "120.50", payee: "=cmd", type: "production", ch: "Specular Anime", notes: "editing" }],
  ["/finance/income", { month: today.slice(0, 7), stream: "adsense", channel: "Specular Anime", amount: "800" }],
  ["/story-lab/scripts", { title: "What If Superman Was In One Piece?", text: "INTRO\nSuperman meets Luffy." }],
  [`/r/${firstId}/scripts`, { text: "A pasted script." }],
  [`/r/${firstId}/pin`, {}],
  [`/r/${firstId}/air`, { air: shiftDate(today, 9), rest: "1" }],
  [`/r/${firstId}/move`, { date: shiftDate(today, 10), mode: "posting" }],
  ["/timer/start", { id: firstId, kind: "record", back: "/vo/record" }],
  ["/timer/stop", { back: "/my-day" }],
  ["/days-off", { date: shiftDate(today, 5) }],
  ["/gaps/dismiss", { channel: "Specular Anime", days: shiftDate(today, 6) }],
  ["/channels/pause", { channel: "Specular Law" }],
  ["/settings/estimates", { "e:type:vo": "40" }],
  ["/settings/channels/add", { name: "Test Bits", category: "bits", units: "3", colour: "#334455" }],
  ["/competitors/groups", { name: "Anime what-ifs" }],
  ["/story-lab/focus", { channel: "Specular Comics", focus: "any", note: "keep it dark" }],
  ["/recurring/progress", { channel: "Specular DC", date: today, done: "2" }],
];
const broken: string[] = [];
for (const [url, body] of actions) {
  const res = await post(url, body);
  if (res.status >= 500) broken.push(`POST ${url} → ${res.status}`);
}
t("the main actions go through", broken, []);
// Last, as it signs this cookie out: the old one stops working, the one handed back works.
const ended = await app.inject({ method: "POST", url: "/settings/sessions/end", headers: { cookie } });
const oldCookie = await app.inject({ method: "GET", url: "/", headers: { cookie } });
cookie = String(ended.headers["set-cookie"]).split(";")[0]!;
const newCookie = await app.inject({ method: "GET", url: "/", headers: { cookie } });
t("Sign out everywhere else: the other sign-ins end, this browser stays in", [ended.statusCode, oldCookie.headers.location, newCookie.statusCode], [302, "/login", 200]);
const { rows: counts } = await pool.query(
  `SELECT (SELECT count(*) FROM tasks)::int AS tasks, (SELECT count(*) FROM fin_expenses)::int AS expenses, (SELECT count(*) FROM scripts)::int AS scripts,
          (SELECT count(*) FROM comp_groups)::int AS niches, (SELECT count(*) FROM days_off)::int AS days_off`,
);
t("…and what they saved is there", counts[0], { tasks: 1, expenses: 1, scripts: 2, niches: 1, days_off: 1 });
t("every page opens with a little of everything in it", await crawl(), []);

// ── a pushed video takes its channel's deadlines with it ────────────────────
// Three Specular Comics videos in 2030 (always ahead of today): the first two
// with VO times stated in their posts and script dues, the third with a VO
// worked out from its air date. Pushing the first three days pushes every
// deadline three days, at the same time of day, across the November clock change.
{
  const { moveWithRest, takeUndo } = await import("../src/web/moves.js");
  const { getRecord, restoreMoves } = await import("../src/db/records.js");
  const ids: number[] = [];
  for (const [i, air] of ["2030-10-30", "2030-11-02", "2030-11-05"].entries()) {
    const record = derive({
      kind: "assignment", code: `push-${i}`, title: `Pushed video ${i}`, category: "stories", channel: "Specular Comics", tag: null,
      air_date: air, stage: "script", word_count: 4000, assignee: null, script_due: null, vo_due: null, deadline: null, version: null,
      links: [], brief: null, note: null, confidence: 0.9,
    } as never, "", new Date());
    ids.push(Number(await saveRecord(record, { messageId: `push${i}`, channelId: "c", guildId: null, author: "ash", url: "", raw: "", parsedBy: "pattern" })));
  }
  const at = (day: string, hhmm: string) => `${day} ${hhmm}`;
  await pool.query(
    `UPDATE records SET vo_due = ($2 || ':00')::timestamp AT TIME ZONE $4, vo_source = 'stated', script_due = ($3 || ':00')::timestamp AT TIME ZONE $4 WHERE id = $1`,
    [ids[0], at("2030-10-28", "14:00"), at("2030-10-26", "23:59"), ORG_TZ],
  );
  await pool.query(
    `UPDATE records SET vo_due = ($2 || ':00')::timestamp AT TIME ZONE $4, vo_source = 'stated', script_due = ($3 || ':00')::timestamp AT TIME ZONE $4 WHERE id = $1`,
    [ids[1], at("2030-10-31", "14:00"), at("2030-10-29", "23:59"), ORG_TZ],
  );
  const state = async () =>
    (await pool.query(
      `SELECT to_char(air_date, 'YYYY-MM-DD') AS air, to_char(vo_due AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS vo, vo_source AS src,
              to_char(script_due AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI') AS script
       FROM records WHERE id = ANY($1::bigint[]) ORDER BY air_date`,
      [ids, ORG_TZ],
    )).rows;
  const before = await state();
  const moved = await moveWithRest((await getRecord(ids[0]!))!, "2030-11-02", "posting", false);
  const after = await state();
  t("pushed 3 days: its stated VO and script due go 3 days later, same time of day", after[0], { air: "2030-11-02", vo: "2030-10-31 14:00", src: "stated", script: "2030-10-29 23:59" });
  t("…and so do the channel's next videos' (one across the clock change, still 2 PM)", after[1], { air: "2030-11-05", vo: "2030-11-03 14:00", src: "stated", script: "2030-11-01 23:59" });
  t("…a VO worked out from the air date is worked out again", [after[2]!.air, after[2]!.src, after[2]!.vo?.slice(0, 10) < after[2]!.air], ["2030-11-08", "calculated", true]);
  const kept = moved.undo ? takeUndo(moved.undo) : undefined;
  if (kept) await restoreMoves(kept.snaps);
  t("…the note says the deadlines went too", moved.text.endsWith("Their VO and script deadlines moved with them."), true);
  t("…and Undo puts every date back", await state(), before);
}

// ── the posting check: yesterday, and days it couldn't read, never history ──
{
  const { checkPosts, repairCatchUpPushes } = await import("../src/jobs/postcheck.js");
  const { moveWithRest, voFor } = await import("../src/web/moves.js");
  const { instantIn } = await import("../src/parse/derive.js");
  const { getRecord, restoreMoves, snapshotMoves } = await import("../src/db/records.js");
  const day = (n: number) => shiftDate(today, n);
  const make = async (channel: string, code: string, title: string, air: string) => {
    const record = derive({
      kind: "assignment", code, title, category: "stories", channel, tag: null, air_date: air, stage: "script",
      word_count: 3000, assignee: null, script_due: null, vo_due: null, deadline: null, version: null, links: [], brief: null, note: null, confidence: 0.9,
    } as never, "", new Date());
    return Number(await saveRecord(record, { messageId: `pc-${code}`, channelId: "c", guildId: null, author: "ash", url: "", raw: "", parsedBy: "pattern" }));
  };
  const link = (channel: string, readAt: Date) =>
    pool.query(
      `INSERT INTO youtube_channels (channel, input, youtube_id, checked_at) VALUES ($1, $1, $2, $3)
       ON CONFLICT (channel) DO UPDATE SET youtube_id = $2, error = NULL, checked_at = $3`,
      [channel, `UC-${channel}`, readAt],
    );
  const airs = async (ids: number[]) =>
    (await pool.query("SELECT to_char(air_date, 'YYYY-MM-DD') AS air FROM records WHERE id = ANY($1::bigint[]) ORDER BY id", [ids])).rows.map((r) => r.air);
  const now = instantIn(today, "12:00", ORG_TZ)!;
  const readToday = instantIn(today, "01:30", ORG_TZ)!;
  const push = async (record: Parameters<typeof moveWithRest>[0], to: string, alone: boolean, from: string) => {
    const m = await moveWithRest(record, to, "posting", alone, from);
    return { ok: m.ok, moved: m.plan.moves.length };
  };

  // The first catch-up's damage, put back once at start: a push of days that
  // nothing has touched since is restored; one changed since is left alone.
  const pushLikeBefore = async (channel: string, ids: number[], from: string) => {
    const snaps = await snapshotMoves(ids);
    await moveWithRest((await getRecord(ids[0]!))!, today, "posting", false, from);
    await pool.query(
      `INSERT INTO missed_posts (record_id, channel, day, pushed_to, moved, snapshot, at) VALUES ($1, $2, $3, $4, $5, $6, now() + interval '1 second')`,
      [ids[0], channel, from, today, ids.length - 1, JSON.stringify(snaps)],
    );
  };
  const v = [await make("Specular Documentaries", "rv-1", "An Old One That Went Up Retitled", day(-5)), await make("Specular Documentaries", "rv-2", "Next Week's", day(4)), await make("Specular Documentaries", "rv-3", "The One After", day(8))];
  await pushLikeBefore("Specular Documentaries", v, day(-5));
  const w = [await make("Specular YOU", "rw-1", "Old Miss", day(-6)), await make("Specular YOU", "rw-2", "Soon", day(2))];
  await pushLikeBefore("Specular YOU", w, day(-6));
  t("(the old catch-up pushed a channel five days on)", await airs(v), [today, day(9), day(13)]);
  await pool.query("UPDATE records SET updated_at = now() + interval '1 minute' WHERE id = $1", [w[1]]);
  const repaired = await repairCatchUpPushes(restoreMoves);
  t("repair: an untouched catch-up push is put back exactly", await airs(v), [day(-5), day(4), day(8)]);
  t("…one changed since is left for It was posted, and it's said which", [await airs(w), repaired?.restored.length, repaired?.left.length], [[today, day(8)], 1, 1]);
  t("…and it only ever runs once", await repairCatchUpPushes(restoreMoves), null);

  // The Verse case: an old video never judged (it had gone up under another
  // title, been dropped or been paused) is history now — nothing is pushed.
  const old = [await make("Specular Verse", "vv-1", "Could The Death Note Kill Deadpool?", day(-5)), await make("Specular Verse", "vv-2", "Next Verse", day(4)), await make("Specular Verse", "vv-3", "Verse After", day(8))];
  await link("Specular Verse", readToday);
  const first = await checkPosts(push, now);
  t("an old day the check never tried isn't judged after the fact: the channel stays put", [await airs(old), first.missed.length], [[day(-5), day(4), day(8)], 0]);

  // A day it couldn't read the channel on is remembered, and caught up later.
  const sleep = await make("Specular Sleep", "ss-1", "Yesterday's Sleep Video", day(-1));
  await link("Specular Sleep", instantIn(day(-2), "12:00", ORG_TZ)!);
  const blocked = await checkPosts(push, now);
  const waits = (await pool.query("SELECT to_char(day, 'YYYY-MM-DD') AS d FROM post_check_waits WHERE channel = 'Specular Sleep'")).rows.map((r) => r.d);
  t("a channel it can't read yet: left alone, and yesterday kept to judge later", [await airs([sleep]), blocked.waiting.includes("Specular Sleep"), waits], [[day(-1)], true, [day(-1)]]);

  // Specular Horror couldn't be read four and two days ago; now it can. The
  // video missed four days ago goes to today, the one that went up two days
  // ago is cleared and stays, yesterday's and next week's move four days.
  const a = await make("Specular Horror", "h-a", "The Backrooms Level 0 Explained", day(-4));
  const b = await make("Specular Horror", "h-b", "Every SCP Keter Ranked", day(-2));
  const c = await make("Specular Horror", "h-c", "The Mimic Is Watching", day(-1));
  const d = await make("Specular Horror", "h-d", "Skinwalker Ranch Files", day(3));
  await link("Specular Horror", readToday);
  await pool.query("INSERT INTO post_check_waits (channel, day) VALUES ('Specular Horror', $1), ('Specular Horror', $2)", [day(-4), day(-2)]);
  await pool.query(
    `INSERT INTO uploads (video_id, channel, title, published_at, url) VALUES ('vid-scp', 'Specular Horror', 'Every SCP Keter Ranked (Part 1)', $1, 'https://www.youtube.com/watch?v=vid-scp')`,
    [instantIn(day(-2), "15:00", ORG_TZ)],
  );
  const result = await checkPosts(push, now);
  const rows = async () =>
    (await pool.query(
      `SELECT code, to_char(air_date, 'YYYY-MM-DD') AS air, to_char(vo_due AT TIME ZONE $2, 'YYYY-MM-DD') AS vo, uploaded_at IS NOT NULL AS up
         FROM records WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [[a, b, c, d], ORG_TZ],
    )).rows;
  const after = await rows();
  const vo = (air: string) => dateIn(ORG_TZ, voFor(air)!);
  t("catch-up of days it couldn't read: the video missed four days ago goes to today, its VO with it", after[0], { code: "H-A", air: today, vo: vo(today), up: false });
  t("…the one that went up two days ago is cleared and stays put", after[1], { code: "H-B", air: day(-2), vo: vo(day(-2)), up: true });
  t("…the one missed yesterday moves the same four days, in order behind it", after[2], { code: "H-C", air: day(3), vo: vo(day(3)), up: false });
  t("…and next week's moves four days too", after[3], { code: "H-D", air: day(7), vo: vo(day(7)), up: false });
  t("…told once: one push, three days judged", [result.missed.filter((m) => m.channel === "Specular Horror").length, result.missed.find((m) => m.channel === "Specular Horror")?.moved,
    Number((await pool.query("SELECT count(*) FROM post_checks WHERE channel = 'Specular Horror'")).rows[0].count)], [1, 2, 3]);
  const again = await checkPosts(push, now);
  t("…and running it again changes nothing", [again.missed.length, await rows(), await airs(old)], [0, after, [day(-5), day(4), day(8)]]);
}

// ── Network Overview: readings in, figures out ──────────────────────────────
{
  const { recordViewReadings, saveChannelDay, listNetChannels } = await import("../src/db/network.js");
  const { listUploads } = await import("../src/jobs/youtube.js");
  const yesterdayNoon = new Date(Date.now() - 86_400_000);
  // Specular Anime: one long-form video (the board's format) and one Short (Network Overview's only).
  await pool.query("INSERT INTO youtube_channels (channel, input, youtube_id, checked_at) VALUES ('Specular Anime', '@specularanime', 'UCanime0000000000000000', now()) ON CONFLICT (channel) DO UPDATE SET youtube_id = 'UCanime0000000000000000'");
  await pool.query(
    `INSERT INTO uploads (video_id, channel, title, published_at, url, format, board) VALUES
       ('netlong0001', 'Specular Anime', 'What If Naruto Was In Bleach?', now() - interval '20 days', 'https://www.youtube.com/watch?v=netlong0001', 'long', true),
       ('netshort001', 'Specular Anime', 'Naruto vs Ichigo #shorts', now() - interval '20 days', 'https://www.youtube.com/shorts/netshort001', 'short', false)`,
  );
  t("the board's own pages never see a channel's other format", (await listUploads(new Date(Date.now() - 30 * 86_400_000))).filter((u) => u.channel === "Specular Anime").map((u) => u.videoId), ["netlong0001"]);
  // Yesterday's readings, then today's: 10,000 → 13,000 total; the long-form video +2,000, the Short +600.
  await saveChannelDay("Specular Anime", { views: 10_000, subscribers: 5_000, subsHidden: false, videos: 2 }, yesterdayNoon);
  await recordViewReadings([{ videoId: "netlong0001", views: 50_000 }, { videoId: "netshort001", views: 9_000 }], { now: new Date(Date.now() - 3_600_000) });
  await saveChannelDay("Specular Anime", { views: 13_000, subscribers: 5_100, subsHidden: false, videos: 2 });
  await recordViewReadings([{ videoId: "netlong0001", views: 52_000 }, { videoId: "netshort001", views: 9_600 }]);
  const gains = (await pool.query("SELECT format, gained FROM network_format_days WHERE channel = 'Specular Anime' ORDER BY format")).rows.map((r) => `${r.format}:${r.gained}`);
  t("view gains are counted by format, once each (the first reading only sets a baseline)", gains, ["long:2000", "short:600"]);

  // An RPM through Settings: $4 long-form, $0.10 Shorts, $2 blended.
  const anime = (await listNetChannels()).find((c) => c.name === "Specular Anime")!;
  const saved = await post("/settings/network/rpm", { channel: anime.id, from: shiftDate(today, -30), long: "4", short: "0.10", blended: "2", currency: "USD", notes: "test" });
  const bad = await post("/settings/network/rpm", { channel: anime.id, from: shiftDate(today, -30), long: "abc", short: "", blended: "" });
  t("RPM settings: saved from a date; a non-number is refused with a reason", [saved.status, /saved=/.test(saved.location ?? ""), /error=/.test(bad.location ?? "")], [302, true, true]);
  const page = await app.inject({ method: "GET", url: `/network?ch=${anime.id}&range=today`, headers: { cookie } });
  // 2,000 × $4 + 600 × $0.10 + (3,000 − 2,600) × $2, per 1,000 = $8 + $0.06 + $0.80 = $8.86.
  t("the page: today's views, and the estimate worked out by hand ($8.86), marked ESTIMATED", [page.statusCode, page.body.includes("3,000"), page.body.includes("$8.86"), page.body.includes("ESTIMATED")], [200, true, true, true]);
  // A channel first read today, twice: it counts from its first reading, and the page opens on everything since.
  await pool.query("INSERT INTO youtube_channels (channel, input, youtube_id, checked_at) VALUES ('Specular Comics', '@specularcomics', 'UCcomics000000000000000', now()) ON CONFLICT (channel) DO UPDATE SET youtube_id = 'UCcomics000000000000000'");
  await saveChannelDay("Specular Comics", { views: 70_000, subscribers: 900, subsHidden: false, videos: 10 }, new Date(Date.now() - 1_000));
  await saveChannelDay("Specular Comics", { views: 71_234, subscribers: 912, subsHidden: false, videos: 10 });
  const kept = (await pool.query("SELECT first_views, views FROM network_channel_days WHERE channel = 'Specular Comics'")).rows.map((r) => [Number(r.first_views), Number(r.views)]);
  const comics = (await listNetChannels()).find((c) => c.name === "Specular Comics")!;
  const opened = await app.inject({ method: "GET", url: `/network?ch=${comics.id}`, headers: { cookie } });
  t("first day of readings: the first reading is kept, and the page opens on Since the first reading with its views", [kept, opened.body.includes("Since the first reading"), opened.body.includes("1,234"), opened.body.includes("+12"), opened.body.includes("count from the first reading")], [[[70_000, 71_234]], true, true, true, true]);
  const short = await app.inject({ method: "GET", url: `/network?ch=${anime.id}&range=today&fmt=short`, headers: { cookie } });
  t("…Shorts only: the Short's 600 views at $0.10 ($0.06), and subscribers marked as not format-specific", [short.body.includes("$0.06"), short.body.includes("not format-specific")], [true, true]);

  // Divisions: a new one, a channel moved into it, and the page filtered to it.
  await post("/settings/network/divisions/add", { name: "Anime <Group>", colour: "#123456" });
  const divId = String((await pool.query("SELECT id FROM network_divisions WHERE name = 'Anime <Group>'")).rows[0]?.id ?? "");
  const form: Record<string, string> = {};
  for (const c of await listNetChannels()) { form[`div_${c.id}`] = c.name === "Specular Anime" ? divId : c.divisionId ?? ""; if (c.active) form[`on_${c.id}`] = "1"; }
  await post("/settings/network/channels", form);
  const byDiv = await app.inject({ method: "GET", url: `/network?div=${divId}&range=today`, headers: { cookie } });
  t("a division made in Settings filters the page, its name escaped", [byDiv.statusCode, byDiv.body.includes("Anime &lt;Group&gt;"), byDiv.body.includes("Anime <Group>"), byDiv.body.includes("$8.86")], [200, true, false, true]);
  const blocked = await post(`/settings/network/divisions/${divId}/delete`, {});
  t("…and it can't be deleted while a channel is in it", /error=/.test(blocked.location ?? ""), true);

  // Exports: every kind, with the method stated.
  const kinds = ["channels", "divisions", "daily", "revenue", "uploads"];
  const csvs = await Promise.all(kinds.map((k) => app.inject({ method: "GET", url: `/network/export.csv?ch=${anime.id}&range=today&kind=${k}`, headers: { cookie } })));
  t("CSV exports: each kind downloads, saying it's estimated and for which period", csvs.map((r) => [r.statusCode, String(r.headers["content-type"]).startsWith("text/csv"), r.body.includes("ESTIMATED"), r.body.includes(today)]), kinds.map(() => [200, true, true, true]));
  t("…the revenue export carries the day's estimate", csvs[3]!.body.includes("8.86"), true);
}

await app.close();
await pool.end().catch(() => undefined);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
