/**
 * The board, rendered on the server.
 *
 * No client framework and no build step: every page is one HTML document with
 * its own CSS. The thing being shown is a list of short records, and a list of
 * short records does not need a bundler.
 *
 * The layout follows the agreed design: no columns to drag things between,
 * one spine per row — Title · Channel · Needs VO · Deadline — and colour
 * carried by category so a glance tells you which side of the business a row
 * belongs to.
 */
import { CATEGORIES, CHANNELS, type CategoryId } from "../catalog.js";
import { ORG_TZ, TEAM_TZ, dateIn, renderIn } from "../parse/derive.js";
import type { CalendarEntry, CalendarMode, DayBucket, Stats, StoredRecord } from "../db/records.js";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COLOURS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color]),
);
const LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

function colourOf(category: string): string {
  return COLOURS[category] ?? "#8A8F98";
}

const CSS = `
/* ──────────────────────────────────────────────────────────────────────────
   Light surface, navy rail, white cards — the shape of a working dashboard
   rather than a dark template.

   Bricolage Grotesque sets everything that states a fact: the page title, the
   counts, the names of things. Archivo does the working text underneath it.
   Weight and scale carry the hierarchy so the cards can stay quiet.

   Category colours are the same four hues throughout, deepened for a white
   ground and checked against it — lightness band, chroma, colour-blind
   separation and contrast all pass.
   ────────────────────────────────────────────────────────────────────────── */
:root {
  --bg: #EDF0F6; --card: #FFFFFF; --sunk: #F5F7FB; --line: #E4E8F0;
  --ink: #101728; --ink2: #5C6578; --ink3: #949DB1;
  --rail: #151A33; --rail2: #1F2648; --rail-ink: #A9B0CC;
  --accent: #EE6C5C; --late: #D4453A; --warn: #C2611F;
  --lf: #3B6FD4; --rd: #C2611F; --gm: #1E8F5E; --bt: #7F4FC9;
  --shadow: 0 1px 2px rgba(16,24,40,.05), 0 10px 26px -12px rgba(16,24,40,.14);
  --display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --ui: "Archivo", ui-sans-serif, -apple-system, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 400 14px/1.55 var(--ui);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
a { color: inherit; text-decoration: none; }
h1, h2, h3 { font-family: var(--display); }

/* ── shell ─────────────────────────────────────────────────────────────── */
/* The rail is painted on the grid itself: a sticky aside is only as tall as
   the viewport, so on a long page its column would run out of navy. */
.shell { display: grid; grid-template-columns: 244px 1fr; min-height: 100vh; background: var(--rail); }
aside {
  background: var(--rail); color: var(--rail-ink); padding: 30px 16px;
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
}
aside .mark {
  font-family: var(--display); font-size: 26px; font-weight: 800; letter-spacing: -0.045em;
  display: block; padding: 0 12px 32px; line-height: 1; color: #fff;
}
aside nav a {
  display: flex; align-items: center; gap: 11px; padding: 11px 13px; border-radius: 11px;
  color: var(--rail-ink); font-size: 14.5px; font-weight: 500; letter-spacing: -0.012em;
  margin-bottom: 3px;
}
aside nav a:hover { background: var(--rail2); color: #fff; }
aside nav a.on { background: var(--accent); color: #fff; font-weight: 650; }
aside nav a .n {
  margin-left: auto; font-family: var(--display); font-size: 13px; font-weight: 700;
  font-variant-numeric: tabular-nums; opacity: .72;
}
aside h3 {
  font-family: var(--ui); font-size: 10.5px; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: #656E96; margin: 34px 0 10px; padding: 0 13px;
}
aside .cat {
  display: flex; align-items: center; gap: 11px; padding: 9px 13px; border-radius: 11px;
  font-size: 14px; color: var(--rail-ink); letter-spacing: -0.012em;
}
aside .cat:hover { background: var(--rail2); color: #fff; }
aside .cat .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); flex: none;
  box-shadow: 0 0 0 3px rgba(255,255,255,.07); }
aside .cat .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 13px;
  font-variant-numeric: tabular-nums; opacity: .72;
}
aside .live {
  margin-top: 32px; padding: 12px 13px; border-radius: 12px; background: var(--rail2);
  font-size: 12px; color: var(--rail-ink); display: flex; align-items: center; gap: 9px;
}
aside .live .pulse {
  width: 7px; height: 7px; border-radius: 50%; background: #35D399; flex: none;
  box-shadow: 0 0 0 3px rgba(53,211,153,.18);
}

main { padding: 34px 40px 90px; background: var(--bg); }
main > * { max-width: 1280px; }
header.page { display: flex; align-items: flex-end; gap: 18px; margin-bottom: 26px; }
header.page h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.042em; margin: 0; line-height: 1; }
header.page .when { color: var(--ink3); font-size: 13px; margin-left: auto; padding-bottom: 4px; }

/* ── cards ─────────────────────────────────────────────────────────────── */
.card { background: var(--card); border-radius: 18px; box-shadow: var(--shadow); padding: 24px 26px; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.stat {
  background: var(--card); border-radius: 18px; box-shadow: var(--shadow); padding: 20px 22px 21px;
}
.stat .n {
  font-family: var(--display); font-size: 40px; font-weight: 800; letter-spacing: -0.045em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.stat .l {
  color: var(--ink3); font-size: 11px; margin-top: 10px; letter-spacing: 0.11em;
  text-transform: uppercase; font-weight: 700;
}
.stat.alert .n { color: var(--late); }
.stat.zero .n { color: #C3CAD8; }

.split { display: grid; grid-template-columns: 1fr 312px; gap: 16px; margin-bottom: 20px; }
.panel { background: var(--card); border-radius: 18px; box-shadow: var(--shadow); padding: 22px 24px 24px; }
.panel > h2, .group > .head .name, .section-title {
  font-family: var(--display); font-size: 18px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 16px;
}
.legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 14px; font-size: 12px; color: var(--ink2); }
.legend span { display: flex; align-items: center; gap: 7px; }
.legend i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); display: block; }

.today .date { font-family: var(--display); font-size: 18px; font-weight: 700; letter-spacing: -0.03em; }
.today .due { color: var(--ink3); font-size: 12.5px; margin-bottom: 14px; }
.today .line {
  display: flex; align-items: center; gap: 11px; padding: 12px 0; font-size: 14px;
  border-top: 1px solid var(--line); color: var(--ink2); letter-spacing: -0.012em;
}
.today .line .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); flex: none; }
.today .line .n {
  margin-left: auto; font-family: var(--display); font-variant-numeric: tabular-nums;
  font-weight: 700; font-size: 17px; color: var(--ink);
}

/* ── rows ──────────────────────────────────────────────────────────────── */
.group { margin-bottom: 20px; }
.group > .head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 12px; padding: 0 4px; }
.group > .head .dot { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.group > .head .sub { color: var(--ink3); font-size: 12.5px; }
.group > .head .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 15px;
  color: var(--ink3); font-variant-numeric: tabular-nums;
}
.rows { background: var(--card); border-radius: 18px; box-shadow: var(--shadow); overflow: hidden; }
.row {
  display: grid; grid-template-columns: 1fr auto; gap: 5px 24px; align-items: center;
  padding: 16px 24px 17px; border-bottom: 1px solid var(--line);
}
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--sunk); }
.row .title {
  font-family: var(--display); font-weight: 600; font-size: 16px; letter-spacing: -0.028em;
  display: flex; align-items: baseline; gap: 10px;
}
.row .title .swatch {
  width: 9px; height: 9px; border-radius: 3px; background: var(--c); flex: none;
  transform: translateY(-1px);
}
.row .title .code {
  color: var(--ink3); font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums;
}
.row .meta {
  grid-column: 1; color: var(--ink3); font-size: 12.5px; display: flex; gap: 10px;
  flex-wrap: wrap; align-items: center; padding-left: 19px; letter-spacing: -0.005em;
}
.row .meta .chan { color: var(--c); font-weight: 650; }
.row .when { grid-row: span 2; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row .when .d { font-family: var(--display); font-size: 14.5px; font-weight: 600; letter-spacing: -0.022em; }
.row .when .z { color: var(--ink3); font-size: 11.5px; }
.row .when .derived { color: var(--warn); font-size: 11.5px; }
.row .when .over { color: var(--late); font-size: 11.5px; font-weight: 700; }
.pill {
  display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px;
  background: var(--sunk); color: var(--ink2); font-weight: 600;
}
.empty {
  background: var(--card); border-radius: 18px; box-shadow: var(--shadow); padding: 40px 20px;
  color: var(--ink3); text-align: center; font-size: 14px;
}
.links { display: flex; gap: 7px; flex-wrap: wrap; }
.links a {
  font-size: 11.5px; padding: 3px 10px; border-radius: 999px; background: var(--sunk);
  color: var(--ink2); font-weight: 600;
}
.links a.frameio { background: rgba(59,111,212,.1); color: #2F5CB3; }
.links a:hover { background: var(--line); color: var(--ink); }
.warn { color: var(--warn); font-size: 12px; font-weight: 600; }

.chanlist { display: flex; flex-wrap: wrap; gap: 9px; }
.chanlist a {
  background: var(--card); border-radius: 999px; padding: 9px 16px; font-size: 13.5px;
  display: flex; align-items: center; gap: 9px; color: var(--ink2); box-shadow: var(--shadow);
  letter-spacing: -0.012em; font-weight: 500;
}
.chanlist a:hover { color: var(--ink); }
.chanlist a .dot { width: 8px; height: 8px; border-radius: 3px; background: var(--c); }
.chanlist .n {
  font-family: var(--display); font-weight: 700; color: var(--ink3);
  font-variant-numeric: tabular-nums; font-size: 12.5px;
}
.back { color: var(--ink3); font-size: 13px; }
.brief {
  background: var(--card); border-radius: 18px; box-shadow: var(--shadow); padding: 24px 26px;
  white-space: pre-wrap; line-height: 1.68; font-size: 14.5px; color: var(--ink2); max-width: 780px;
}
form.inline { display: inline; }
button.clear {
  background: var(--accent); border: 0; color: #fff; font-family: var(--ui);
  border-radius: 999px; padding: 10px 20px; font-size: 13px; cursor: pointer; font-weight: 650;
}
button.clear:hover { filter: brightness(1.06); }

/* ── calendar ──────────────────────────────────────────────────────────── */
.calbar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
.calbar .month {
  font-family: var(--display); font-size: 23px; font-weight: 700; letter-spacing: -0.04em;
  min-width: 210px;
}
.calbar .nav {
  background: var(--card); border-radius: 999px; padding: 9px 15px; font-size: 13px;
  color: var(--ink2); font-weight: 600; box-shadow: var(--shadow);
}
.calbar .nav:hover { color: var(--ink); }
.calbar .tabs {
  margin-left: auto; display: flex; gap: 3px; background: var(--card);
  border-radius: 999px; padding: 4px; box-shadow: var(--shadow);
}
.calbar .tab { padding: 7px 18px; border-radius: 999px; font-size: 13px; color: var(--ink3); font-weight: 600; }
.calbar .tab.on { background: var(--rail); color: #fff; }
.calbar .tab:hover { color: var(--ink); }
.calbar .tab.on:hover { color: #fff; }

.cal {
  /* minmax(0,1fr), not 1fr: a long title must not widen its column and throw
     the week out of square. The chip ellipsises instead. */
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 1px;
  background: var(--line); border-radius: 18px; overflow: hidden; box-shadow: var(--shadow);
}
.cal .wd {
  background: var(--card); padding: 13px 14px; font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); text-align: left;
}
.cal .cell {
  background: var(--card); min-height: 122px; padding: 10px 9px 11px;
  display: flex; flex-direction: column; gap: 4px; min-width: 0;
}
.cal .cell.outside { background: var(--sunk); }
.cal .cell.outside .num { color: #C3CAD8; }
.cal .cell.today { background: #FFF4F2; }
.cal .num {
  font-family: var(--display); font-size: 15px; font-weight: 700; color: var(--ink2);
  font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 4px; border-radius: 7px; align-self: flex-start; letter-spacing: -0.03em;
}
.cal .num:hover { background: var(--sunk); color: var(--ink); }
.cal .cell.today .num {
  background: var(--accent); color: #fff; padding: 3px 9px; border-radius: 999px;
}
.cal .cell.today .num:hover { background: var(--late); color: #fff; }
.cal .num .tag {
  font-family: var(--ui); font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em;
  font-weight: 700;
}
.cal .chip {
  display: flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 8px;
  background: var(--sunk); font-size: 11px; color: var(--ink2); min-width: 0; font-weight: 550;
}
.cal .chip:hover { background: var(--line); color: var(--ink); }
.cal .chip .dot { width: 6px; height: 6px; border-radius: 2px; background: var(--c); flex: none; }
.cal .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.01em; }
.cal .more { font-size: 11px; color: var(--ink3); padding: 2px 7px; font-weight: 600; }
.cal .more:hover { color: var(--ink); }

/* ── sign in ───────────────────────────────────────────────────────────── */
.login { max-width: 360px; margin: 16vh auto; padding: 0 20px; }
.login h1 { font-size: 42px; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 6px; line-height: 1; }
.login p { color: var(--ink3); font-size: 13.5px; margin: 0 0 24px; }
.login form { background: var(--card); border-radius: 18px; box-shadow: var(--shadow); padding: 22px; }
.login input {
  width: 100%; padding: 13px 15px; border-radius: 11px; background: var(--sunk);
  border: 1px solid var(--line); color: var(--ink); font: inherit; margin-bottom: 11px;
}
.login input:focus { outline: 0; border-color: var(--accent); background: #fff; }
.login button {
  width: 100%; padding: 13px; border-radius: 11px; border: 0; cursor: pointer;
  background: var(--accent); color: #fff; font-family: var(--ui); font-size: 14px; font-weight: 700;
}
.login button:hover { filter: brightness(1.06); }
.err { color: var(--late); font-size: 13px; margin-bottom: 10px; }

@media (max-width: 1000px) {
  .shell { grid-template-columns: 1fr; }
  aside { position: static; height: auto; }
  .split { grid-template-columns: 1fr; }
  main { padding: 24px 18px 70px; }
  header.page h1 { font-size: 31px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stat .n { font-size: 33px; }
  .cal .cell { min-height: 92px; }
  .cal .chip .t { display: none; }
}
`;

export interface Shell {
  /** Which sidebar entry is lit. */
  active: string;
  counts: Record<string, number>;
  nav: { reviews: number; queue: number; recurring: number; calendar: number };
  lastIntake: Date | null;
}

function layout(title: string, shell: Shell | null, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Specular</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head><body>${
    shell
      ? `<div class="shell">${sidebar(shell)}<main>${body}</main></div>`
      : `<main style="max-width:none">${body}</main>`
  }</body></html>`;
}

function sidebar(s: Shell): string {
  const item = (href: string, label: string, n: number | null, key: string) =>
    `<a class="${s.active === key ? "on" : ""}" href="${href}">${esc(label)}${
      n === null ? "" : `<span class="n">${n}</span>`
    }</a>`;

  const cats = CATEGORIES.map(
    (c) => `<a class="cat" style="--c:${c.color}" href="/category/${c.id}">
      <span class="dot"></span>${esc(c.label)}<span class="n">${s.counts[c.id] ?? 0}</span>
    </a>`,
  ).join("");

  // "Live" is only honest if it says when, so it says when.
  const ago = s.lastIntake ? timeAgo(s.lastIntake) : "nothing yet";

  return `<aside>
    <a class="mark" href="/">Specular</a>
    <nav>
      ${item("/", "Dashboard", null, "dashboard")}
      ${item("/calendar", "Calendar", s.nav.calendar, "calendar")}
      ${item("/reviews", "Reviews", s.nav.reviews, "reviews")}
      ${item("/queue", "Queue", s.nav.queue, "queue")}
      ${item("/recurring", "Recurring", s.nav.recurring, "recurring")}
    </nav>
    <h3>Categories</h3>
    ${cats}
    <div class="live"><span class="pulse"></span>#intake · ${esc(ago)}</div>
  </aside>`;
}

function timeAgo(at: Date): string {
  const mins = Math.round((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function pageHeader(title: string): string {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TZ, weekday: "long", day: "numeric", month: "long",
  }).format(now);
  return `<header class="page">
    <h1>${esc(title)}</h1>
    <span class="when">${esc(day)} · ${esc(renderIn(now, ORG_TZ, "ET").split("@")[1]?.trim() ?? "")}</span>
  </header>`;
}

/**
 * A row with no title of its own shows its own first line, not the parser's
 * note about it — "need 2 more before 6" is what you wrote and what you will
 * recognise; "Filed by the channel name only" is bookkeeping.
 */
function displayTitle(r: StoredRecord): string {
  if (r.title) return r.title;
  const firstLine = r.raw.split("\n").map((l) => l.trim()).find(Boolean);
  if (firstLine) return firstLine.length > 90 ? `${firstLine.slice(0, 88)}…` : firstLine;
  return r.note ?? "(untitled)";
}

/** Title · Channel · Needs VO · Deadline — the spine every record shares. */
function row(r: StoredRecord): string {
  const c = colourOf(r.category);
  const title = displayTitle(r);
  const code = r.code ? `<span class="code">${esc(r.code)}</span>` : "";

  const meta: string[] = [];
  if (r.channel) {
    meta.push(`<a class="chan" href="/channel/${encodeURIComponent(r.channel)}">${esc(r.channel)}</a>`);
  } else {
    meta.push(`<span class="pill">${esc(LABELS[r.category] ?? "unsorted")}</span>`);
  }
  if (r.stage) meta.push(esc(r.stage));
  if (r.version) meta.push(`v${r.version}`);
  if (r.wordCount) meta.push(`${r.wordCount.toLocaleString()} words`);
  if (r.airDate) meta.push(`airs ${esc(r.airDate)}`);
  if (r.confidence < 0.7) meta.push(`<span class="warn">needs a look</span>`);

  const links = r.links.length
    ? `<div class="links">${r.links
        .map(
          (l) =>
            `<a class="${esc(l.kind)}" href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(
              l.kind === "frameio" ? `Frame.io${r.version ? ` v${r.version}` : ""}` : l.label || l.kind,
            )}</a>`,
        )
        .join("")}</div>`
    : "";

  return `<div class="row" style="--c:${c}">
    <div class="title"><span class="swatch"></span>${code}<a href="/r/${r.id}">${esc(title)}</a></div>
    <div class="meta">${meta.join("<span>·</span>")}${links}</div>
    <div class="when">${when(r)}</div>
  </div>`;
}

function when(r: StoredRecord): string {
  const at = r.voDue ?? r.deadline ?? r.scriptDue;
  if (!at) return `<span class="z">—</span>`;

  const label = r.voDue ? "VO" : r.deadline ? "due" : "script";
  return `<div class="d">${esc(renderIn(at, ORG_TZ, "ET"))}</div>
    <div class="z">${esc(label)} · ${esc(renderIn(at, TEAM_TZ, "IST"))}</div>
    ${r.voDue && r.voSource === "calculated" ? `<div class="derived">air date − 6 days</div>` : ""}`;
}

function rows(list: StoredRecord[], emptyText: string): string {
  if (!list.length) return `<div class="empty">${esc(emptyText)}</div>`;
  return `<div class="rows">${list.map(row).join("")}</div>`;
}

/**
 * Work due per day, stacked by category.
 *
 * Inline SVG because the page is server-rendered and this is one small chart:
 * a charting library would be more bytes than the whole board. Segments carry
 * a 2px gap so adjacent categories stay separable for colour-blind readers,
 * the legend is always present, and each bar is directly labelled with its
 * total — colour alone never carries meaning here.
 */
function dueChart(buckets: DayBucket[]): string {
  const W = 700, H = 200, PAD_L = 26, PAD_B = 30, PAD_T = 20;
  const max = Math.max(4, ...buckets.map((b) => b.total));
  const plotH = H - PAD_B - PAD_T;
  const slot = (W - PAD_L) / buckets.length;
  const barW = Math.min(42, slot - 6);

  const order = CATEGORIES.map((c) => c.id);
  const bars = buckets
    .map((b, i) => {
      const x = PAD_L + i * slot + (slot - barW) / 2;
      let y = H - PAD_B;
      const segs = order
        .filter((id) => (b.counts[id] ?? 0) > 0)
        .map((id, n, arr) => {
          const n_ = b.counts[id] ?? 0;
          const h = (n_ / max) * plotH;
          y -= h;
          const top = n === arr.length - 1;
          // 2px surface gap between stacked segments; rounded data-end on top.
          return `<rect x="${x.toFixed(1)}" y="${(y + (n === 0 ? 0 : 1)).toFixed(1)}"
            width="${barW}" height="${Math.max(1, h - (n === 0 ? 0 : 1)).toFixed(1)}"
            fill="${COLOURS[id]}" rx="${top ? 4 : 0}"><title>${esc(
              `${b.date ?? "overdue"} · ${LABELS[id]}: ${n_}`,
            )}</title></rect>`;
        })
        .join("");

      const label = b.date
        ? new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, day: "numeric" }).format(
            new Date(`${b.date}T12:00:00Z`),
          )
        : "late";

      return `${segs}
        ${b.total ? `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}"
          text-anchor="middle" font-size="10.5" fill="#5C6578"
          font-variant-numeric="tabular-nums">${b.total}</text>` : ""}
        <text x="${(x + barW / 2).toFixed(1)}" y="${H - PAD_B + 15}" text-anchor="middle"
          font-size="10.5" fill="${b.date ? "#949DB1" : "#D4453A"}">${esc(label)}</text>`;
    })
    .join("");

  const ticks = [0, Math.ceil(max / 2), max]
    .map((v) => {
      const y = H - PAD_B - (v / max) * plotH;
      return `<line x1="${PAD_L}" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
        stroke="#E4E8F0" stroke-width="1"/>
      <text x="${PAD_L - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10"
        fill="#949DB1" font-variant-numeric="tabular-nums">${v}</text>`;
    })
    .join("");

  const legend = CATEGORIES.map(
    (c) => `<span style="--c:${c.color}"><i></i>${esc(c.label)}</span>`,
  ).join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
      aria-label="Work due by day, stacked by category">${ticks}${bars}</svg>
    <div class="legend">${legend}</div>`;
}

/** One category's slice of the queue, headed and counted. */
function group(id: string, list: StoredRecord[], sub = ""): string {
  const c = colourOf(id);
  return `<div class="group">
    <div class="head" style="--c:${c}">
      <span class="dot"></span>
      <span class="name">${esc(LABELS[id] ?? "Unsorted")}</span>
      ${sub ? `<span class="sub">${esc(sub)}</span>` : ""}
      <span class="n">${list.length}</span>
    </div>
    ${rows(list, "Nothing open here.")}
  </div>`;
}

export function renderDashboard(
  shell: Shell,
  data: {
    stats: Stats;
    byDay: DayBucket[];
    grouped: Map<string, StoredRecord[]>;
    channels: Record<string, number>;
  },
): string {
  const tiles = [
    { n: data.stats.late, l: "late", alert: data.stats.late > 0 },
    { n: data.stats.dueToday, l: "due today", alert: false },
    { n: data.stats.voToRecord, l: "VO to record", alert: false },
    { n: data.stats.shippedThisWeek, l: "cleared this week", alert: false },
  ]
    .map(
      (t) => `<div class="stat${t.alert ? " alert" : t.n === 0 ? " zero" : ""}">
        <div class="n">${t.n}</div><div class="l">${esc(t.l)}</div>
      </div>`,
    )
    .join("");

  const today = data.byDay[1];
  const todayLines = CATEGORIES.map((c) => {
    const n = today?.counts[c.id] ?? 0;
    return `<div class="line" style="--c:${c.color}">
      <span class="dot"></span>${esc(c.label)}<span class="n">${n}</span>
    </div>`;
  }).join("");

  const groups = CATEGORIES.map((c) => {
    const list = data.grouped.get(c.id) ?? [];
    if (!list.length) return "";
    const channels = CHANNELS.filter((ch) => ch.category === c.id).length;
    return group(c.id, list.slice(0, 8), channels > 1 ? `${channels} channels` : "");
  }).join("");

  const unsorted = data.grouped.get("unknown") ?? [];

  const chanList = CHANNELS.map((ch) => {
    const n = data.channels[ch.name] ?? 0;
    return `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${colourOf(ch.category)}">
      <span class="dot"></span>${esc(ch.name)}<span class="n">${n}</span></a>`;
  }).join("");

  return layout(
    "Dashboard",
    shell,
    `${pageHeader("Dashboard")}
    <div class="stats">${tiles}</div>

    <div class="split">
      <div class="panel">
        <h2>Work due by day</h2>
        ${dueChart(data.byDay)}
      </div>
      <div class="panel today">
        <div class="date">${esc(
          new Intl.DateTimeFormat("en-GB", {
            timeZone: ORG_TZ, weekday: "short", day: "numeric", month: "short",
          }).format(new Date()),
        )}</div>
        <div class="due">${today?.total ?? 0} due today</div>
        ${todayLines}
      </div>
    </div>

    ${groups || `<div class="empty">Nothing open. Forward something into the intake channel.</div>`}
    ${unsorted.length ? group("unknown", unsorted.slice(0, 8), "needs a category") : ""}

    <div class="group">
      <h2 class="section-title">Channels</h2>
      <div class="chanlist">${chanList}</div>
    </div>`,
  );
}

export function renderList(
  shell: Shell,
  title: string,
  subtitle: string,
  list: StoredRecord[],
): string {
  return layout(
    title,
    shell,
    `${pageHeader(title)}${rows(list, subtitle)}`,
  );
}

/** A category page leads with its channels, then its open work. */
export function renderCategory(
  shell: Shell,
  label: string,
  id: string,
  list: StoredRecord[],
  channels: Record<string, number>,
): string {
  const chans = CHANNELS.filter((c) => c.category === id);
  const chips = chans.length
    ? `<div class="chanlist" style="margin-bottom:18px">${chans
        .map(
          (ch) =>
            `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${colourOf(id)}">
              <span class="dot"></span>${esc(ch.name)}<span class="n">${channels[ch.name] ?? 0}</span></a>`,
        )
        .join("")}</div>`
    : "";

  return layout(
    label,
    shell,
    `${pageHeader(label)}${chips}${rows(list, `Nothing open in ${label}.`)}`,
  );
}

export function renderRecord(shell: Shell, r: StoredRecord): string {
  const c = colourOf(r.category);
  const facts: Array<[string, string]> = [];
  if (r.code) facts.push(["Code", r.code]);
  if (r.channel) facts.push(["Channel", r.channel]);
  facts.push(["Category", LABELS[r.category] ?? r.category]);
  if (r.tag) facts.push(["Tag", r.tag]);
  if (r.stage) facts.push(["Stage", r.stage]);
  if (r.airDate) facts.push(["Airs", r.airDate]);
  if (r.scriptDue) facts.push(["Script due", renderIn(r.scriptDue, ORG_TZ, "ET")]);
  if (r.voDue) {
    facts.push([
      "VO due",
      `${renderIn(r.voDue, ORG_TZ, "ET")}${r.voSource === "calculated" ? "  (air date − 6 days)" : "  (stated)"}`,
    ]);
  }
  if (r.wordCount) facts.push(["Word count", r.wordCount.toLocaleString()]);
  if (r.assignee) facts.push(["Assigned", r.assignee]);
  if (r.version) facts.push(["Version", `v${r.version}`]);
  facts.push(["Read by", r.parsedBy === "pattern" ? "pattern (no API call)" : r.parsedBy]);

  const table = facts
    .map(
      ([k, v]) =>
        `<div class="row" style="--c:${c}"><div class="title">${esc(v)}</div><div class="meta">${esc(k)}</div></div>`,
    )
    .join("");

  const links = r.links.length
    ? `<section><h2>Links</h2><div class="links">${r.links
        .map(
          (l) =>
            `<a class="${esc(l.kind)}" href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.url)}</a>`,
        )
        .join("")}</div></section>`
    : "";

  return layout(
    displayTitle(r),
    shell,
    `<section>
      <h2>${esc(r.kind)}${r.status === "done" ? " · cleared" : ""}</h2>
      <h1 style="font-size:34px;font-weight:800;letter-spacing:-0.04em;margin:0 0 12px;line-height:1.02">${esc(displayTitle(r))}</h1>
      ${r.note && r.title ? `<p style="color:var(--dim);margin:-8px 0 14px;font-size:13.5px">${esc(r.note)}</p>` : ""}
      <div class="rows">${table}</div>
    </section>
    ${links}
    ${r.brief ? `<section><h2>Story brief</h2><div class="brief">${esc(r.brief)}</div></section>` : ""}
    ${r.warnings.length ? `<section><h2>Warnings</h2><div class="empty warn">${esc(r.warnings.join(" · "))}</div></section>` : ""}
    <section>
      <form class="inline" method="post" action="/r/${r.id}/${r.status === "open" ? "done" : "open"}">
        <button class="clear" style="--c:${c}">${r.status === "open" ? "Clear this" : "Reopen"}</button>
      </form>
      ${r.sourceUrl ? `<a class="back" style="margin-left:10px" href="${esc(r.sourceUrl)}">open in Discord →</a>` : ""}
    </section>
    <a class="back" href="/">← everything</a>`,
  );
}

export function renderLogin(error = ""): string {
  return layout(
    "Sign in",
    null,
    `<div class="login">
      <h1>Specular</h1>
      <p>Everything the studio has going out.</p>
      <form method="post" action="/login">
        ${error ? `<div class="err">${esc(error)}</div>` : ""}
        <input type="password" name="password" placeholder="Password" autofocus>
        <button type="submit">Sign in</button>
      </form>
    </div>`,
  );
}

export function renderEmptyState(): string {
  return layout(
    "Not connected",
    null,
    `<div class="empty" style="padding:40px 22px;line-height:1.7">
      <strong style="color:var(--text)">No database connected.</strong><br>
      The board needs <code>DATABASE_URL</code>. Add a Postgres service in
      Railway and the bot will start filing what it parses.
    </div>`,
  );
}

export type { CategoryId };

// ── the content calendar ──────────────────────────────────────────────────

/** Sunday-first, matching how the studio's week is written. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Adds whole months without the 31st-of-February problem. */
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y! * 12 + (m! - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** YYYY-MM for a date, in the org's zone. */
export function monthOf(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TZ, year: "numeric", month: "2-digit",
  }).format(at);
}

/** Every day the grid shows: whole weeks covering the month, Sunday first. */
export function calendarGrid(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1, 12));
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const last = new Date(Date.UTC(y!, m!, 0, 12));
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, 1, 12)));
}

export function renderCalendar(
  shell: Shell,
  ym: string,
  mode: CalendarMode,
  entries: CalendarEntry[],
): string {
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day)!.push(e);
  }

  const today = dateIn(ORG_TZ);
  const thisMonth = ym;
  const grid = calendarGrid(ym);

  const cells = grid
    .map((day) => {
      const list = byDay.get(day) ?? [];
      const outside = !day.startsWith(thisMonth);
      const isToday = day === today;
      const num = Number(day.slice(8));

      // Three fit before the cell starts scrolling the eye; the rest are one
      // click away rather than crushed into unreadable slivers.
      const chips = list
        .slice(0, 3)
        .map(
          (e) => `<a class="chip" style="--c:${colourOf(e.record.category)}"
            href="/r/${e.record.id}" title="${esc(displayTitle(e.record))}">
            <span class="dot"></span><span class="t">${esc(displayTitle(e.record))}</span>
          </a>`,
        )
        .join("");

      const more =
        list.length > 3
          ? `<a class="more" href="/day/${day}?mode=${mode}">+${list.length - 3} more</a>`
          : "";

      return `<div class="cell${outside ? " outside" : ""}${isToday ? " today" : ""}">
        <a class="num" href="/day/${day}?mode=${mode}">${num}${
          isToday ? `<span class="tag">today</span>` : ""
        }</a>
        ${chips}${more}
      </div>`;
    })
    .join("");

  const heads = WEEKDAYS.map((d) => `<div class="wd">${d}</div>`).join("");

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" href="/calendar/${ym}?mode=${value}">${label}</a>`;

  return layout(
    "Calendar",
    shell,
    `${pageHeader("Calendar")}
    <div class="calbar">
      <a class="nav" href="/calendar/${shiftMonth(ym, -1)}?mode=${mode}" aria-label="Previous month">←</a>
      <span class="month">${esc(monthName(ym))}</span>
      <a class="nav" href="/calendar/${shiftMonth(ym, 1)}?mode=${mode}" aria-label="Next month">→</a>
      <a class="nav today" href="/calendar?mode=${mode}">Today</a>
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cal">${heads}${cells}</div>
    <div class="legend" style="margin-top:14px">${CATEGORIES.map(
      (c) => `<span style="--c:${c.color}"><i></i>${esc(c.label)}</span>`,
    ).join("")}</div>
    ${
      entries.length
        ? ""
        : `<div class="empty" style="margin-top:16px">Nothing ${
            mode === "posting" ? "airing" : "due"
          } this month.</div>`
    }`,
  );
}

export function renderDay(
  shell: Shell,
  date: string,
  mode: CalendarMode,
  list: StoredRecord[],
): string {
  const pretty = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

  const ym = date.slice(0, 7);

  return layout(
    pretty,
    shell,
    `${pageHeader(pretty)}
    <div class="calbar">
      <a class="nav" href="/day/${shiftDay(date, -1)}?mode=${mode}" aria-label="Previous day">←</a>
      <a class="nav" href="/day/${shiftDay(date, 1)}?mode=${mode}" aria-label="Next day">→</a>
      <a class="nav" href="/calendar/${ym}?mode=${mode}">Back to ${esc(monthName(ym))}</a>
      <span class="month" style="font-size:13px;color:var(--dim)">${
        mode === "posting" ? "airing" : "due"
      } this day</span>
    </div>
    ${rows(list, mode === "posting" ? "Nothing airing this day." : "Nothing due this day.")}`,
  );
}

/** Shift a YYYY-MM-DD by whole days, DST-proof via UTC noon. */
function shiftDay(date: string, by: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
