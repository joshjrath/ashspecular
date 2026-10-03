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

await app.close();
await pool.end().catch(() => undefined);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
