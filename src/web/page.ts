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
   A dark shell holding blocks of flat colour.

   Each card is a solid field with a big radius, and the loud ones — salmon,
   yellow — carry black text, which is what keeps a bright block from turning
   into decoration. The chart and the lists sit on white, because four
   categories need a neutral ground to stay separable.

   Bricolage Grotesque states the facts: the title, the counts, the names of
   things. Archivo does the working text under it.
   ────────────────────────────────────────────────────────────────────────── */
:root {
  --shell: #0F0F11; --rail: #161618; --card: #FFFFFF; --dark: #1B1B1E;
  --sunk: #F4F4F5; --line: #E8E8EA;
  --ink: #101012; --ink2: #5F5F68; --ink3: #9A9AA3;
  --salmon: #F2A79C; --yellow: #F3E96C; --late: #D4453A; --warn: #C2611F;
  --lf: #4A5CD4; --rd: #CE7118; --gm: #35986A; --bt: #AC63C8;
  --r: 26px;
  --display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --ui: "Archivo", ui-sans-serif, -apple-system, system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--shell); color: #fff;
  font: 400 14px/1.55 var(--ui);
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
a { color: inherit; text-decoration: none; }
h1, h2, h3 { font-family: var(--display); }

/* ── shell ─────────────────────────────────────────────────────────────── */
/* minmax(0,…), not 1fr: a grid item defaults to min-width:auto, so a wide
   scrolling row inside would size its own column and push the page sideways. */
.shell { display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 100vh; }
.shell > * { min-width: 0; }
aside { padding: 28px 16px; position: sticky; top: 0; height: 100vh; overflow-y: auto; }
aside .inner { background: var(--rail); border-radius: var(--r); padding: 26px 14px; min-height: 100%; }
aside .mark {
  font-family: var(--display); font-size: 25px; font-weight: 800; letter-spacing: -0.045em;
  display: block; padding: 0 12px 30px; line-height: 1; color: #fff;
}
aside nav a {
  display: flex; align-items: center; gap: 11px; padding: 12px 14px; border-radius: 16px;
  color: #9A9AA3; font-size: 14.5px; font-weight: 500; letter-spacing: -0.012em; margin-bottom: 3px;
}
aside nav a:hover { background: #222225; color: #fff; }
aside nav a.on { background: var(--salmon); color: #101012; font-weight: 700; }
aside nav a .n {
  margin-left: auto; font-family: var(--display); font-size: 13px; font-weight: 700;
  font-variant-numeric: tabular-nums; opacity: .7;
}
aside h3 {
  font-family: var(--ui); font-size: 10px; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: #5F5F68; margin: 30px 0 10px; padding: 0 14px;
}
aside .cat {
  display: flex; align-items: center; gap: 11px; padding: 10px 14px; border-radius: 16px;
  font-size: 14px; color: #9A9AA3; letter-spacing: -0.012em;
}
aside .cat:hover { background: #222225; color: #fff; }
aside .cat .dot { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
aside .cat .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 13px;
  font-variant-numeric: tabular-nums; opacity: .7;
}
aside .live {
  margin-top: 28px; padding: 13px 14px; border-radius: 18px; background: #222225;
  font-size: 12px; color: #9A9AA3; display: flex; align-items: center; gap: 9px;
}
aside .live .pulse {
  width: 7px; height: 7px; border-radius: 50%; background: #35D399; flex: none;
  box-shadow: 0 0 0 3px rgba(53,211,153,.16);
}

main { padding: 28px 28px 80px 8px; }
main > * { max-width: 1320px; }
header.page { display: flex; align-items: flex-end; gap: 18px; margin-bottom: 22px; padding: 6px 4px 0; }
header.page h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.042em; margin: 0; line-height: 1; }
header.page .when { color: #6A6A73; font-size: 13px; margin-left: auto; padding-bottom: 4px; }

aside .search { margin-bottom: 14px; }
aside .search input {
  width: 100%; padding: 11px 13px; border-radius: 14px; background: #222225;
  border: 1px solid transparent; color: #fff; font: inherit; font-size: 13.5px;
}
aside .search input::placeholder { color: #6A6A73; }
aside .search input:focus { outline: 0; border-color: var(--salmon); background: #26262A; }

/* ── the blocks ────────────────────────────────────────────────────────── */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.stat { border-radius: var(--r); padding: 22px 24px 24px; background: var(--card); color: var(--ink); }
.stat:nth-child(1) { background: var(--salmon); }
.stat:nth-child(2) { background: var(--yellow); }
.stat:nth-child(4) { background: var(--dark); color: #fff; }
.stat .n {
  font-family: var(--display); font-size: 46px; font-weight: 800; letter-spacing: -0.05em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.stat .l {
  font-size: 11px; margin-top: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  font-weight: 700; opacity: .62;
}
.stat.zero .n { opacity: .4; }

.split { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; margin-bottom: 14px; }
.split > * { min-width: 0; }
.panel { background: var(--card); color: var(--ink); border-radius: var(--r); padding: 24px 26px 26px; }
.panel.today { background: var(--dark); color: #fff; }
.panel > h2, .group > .head .name, .section-title {
  font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -0.032em; margin: 0 0 18px;
}
.panel > h2 { margin-bottom: 14px; }

/* ── the chart ─────────────────────────────────────────────────────────────
   A hero number, then columns that keep their slot whether or not anything is
   due. No y-axis: each bar carries its own count, and a tick scale would only
   ask you to read one number off another.
   ────────────────────────────────────────────────────────────────────────── */
.chart-head { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 2px; flex-wrap: wrap; }
.chart-head .hero .n {
  font-family: var(--display); font-size: 40px; font-weight: 800; letter-spacing: -0.05em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.chart-head .hero .l { color: var(--ink3); font-size: 12.5px; margin-top: 3px; }
.chart-head .hero .l b { color: var(--late); font-weight: 700; }
.chart-head .legend { margin: 6px 0 0 auto; gap: 14px; }

.chartscroll { overflow-x: auto; min-width: 0; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.chartscroll::-webkit-scrollbar { display: none; }
.chartscroll svg { display: block; }

.chart .col .track { transition: fill .12s ease; }
.chart .col:hover .track { fill: #E6E6E9; }
.chart text.total {
  font-family: var(--display); font-size: 13px; font-weight: 700; fill: var(--ink);
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.chart text.lab { font-family: var(--ui); font-size: 11px; fill: var(--ink3); }
.chart text.lab.wd { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.chart text.lab.wd.weekend { fill: #C6C6CD; }
.chart text.lab.dn {
  font-family: var(--display); font-size: 14px; font-weight: 700; fill: var(--ink2);
  font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
}
.chart text.lab.on { fill: var(--ink); font-weight: 700; }
.chart text.lab.late {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; fill: var(--late);
}
.legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 16px; font-size: 12px; color: var(--ink2); }
.legend span { display: flex; align-items: center; gap: 7px; }
.legend i { width: 10px; height: 10px; border-radius: 4px; background: var(--c); display: block; }

.today .date { font-family: var(--display); font-size: 19px; font-weight: 700; letter-spacing: -0.032em; }
.today .due { color: #9A9AA3; font-size: 12.5px; margin-bottom: 16px; }
.today .line {
  display: flex; align-items: center; gap: 11px; padding: 13px 14px; font-size: 14px;
  color: #C9C9D0; letter-spacing: -0.012em; background: #232327; border-radius: 16px; margin-bottom: 8px;
}
.today .line .dot { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
.today .line .n {
  margin-left: auto; font-family: var(--display); font-variant-numeric: tabular-nums;
  font-weight: 700; font-size: 18px; color: #fff;
}

/* ── lists ─────────────────────────────────────────────────────────────── */
.group { margin-bottom: 14px; }
.group > .head { display: flex; align-items: baseline; gap: 12px; margin: 22px 0 12px; padding: 0 8px; color: #fff; }
.group > .head .dot { width: 11px; height: 11px; border-radius: 4px; background: var(--c); }
.group > .head .sub { color: #6A6A73; font-size: 12.5px; }
.group > .head .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 15px;
  color: #6A6A73; font-variant-numeric: tabular-nums;
}
.rows { background: var(--card); border-radius: var(--r); padding: 10px; }
.row {
  display: grid; grid-template-columns: 1fr auto; gap: 4px 24px; align-items: center;
  padding: 15px 18px 16px; border-radius: 18px; color: var(--ink);
}
.row:hover { background: var(--sunk); }
.row .title {
  font-family: var(--display); font-weight: 600; font-size: 16px; letter-spacing: -0.028em;
  display: flex; align-items: baseline; gap: 10px; min-width: 0;
}
/* A forwarded message is often one long unbroken URL, which no amount of
   column sizing will wrap on its own. */
.row .title a { min-width: 0; overflow-wrap: anywhere; }
.row .title .swatch { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; transform: translateY(-1px); }
.row .title .code {
  color: var(--ink3); font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums;
  white-space: nowrap; flex: none;
}
.row .meta {
  grid-column: 1; color: var(--ink3); font-size: 12.5px; display: flex; gap: 10px;
  flex-wrap: wrap; align-items: center; padding-left: 20px; letter-spacing: -0.005em;
}
.row .meta .chan { color: var(--c); font-weight: 700; }
.row .when { grid-row: span 2; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row .when .d { font-family: var(--display); font-size: 14.5px; font-weight: 600; letter-spacing: -0.022em; }
.row .when .z { color: var(--ink3); font-size: 11.5px; }
.row .when .derived { color: var(--warn); font-size: 11.5px; }
.row .when .over { color: var(--late); font-size: 11.5px; font-weight: 700; }
.pill { display: inline-block; padding: 3px 11px; border-radius: 999px; font-size: 11px;
  background: var(--sunk); color: var(--ink2); font-weight: 600; }
.empty {
  background: var(--card); color: var(--ink3); border-radius: var(--r); padding: 44px 20px;
  text-align: center; font-size: 14px;
}
.links { display: flex; gap: 7px; flex-wrap: wrap; }
.links a { font-size: 11.5px; padding: 3px 11px; border-radius: 999px; background: var(--sunk);
  color: var(--ink2); font-weight: 600; }
.links a.frameio { background: #E9ECFA; color: #3D4CB4; }
.links a:hover { background: var(--line); color: var(--ink); }
.warn { color: var(--warn); font-size: 12px; font-weight: 600; }

.chanlist { display: flex; flex-wrap: wrap; gap: 9px; }
.chanlist a {
  background: var(--rail); border-radius: 999px; padding: 10px 17px; font-size: 13.5px;
  display: flex; align-items: center; gap: 10px; color: #9A9AA3; font-weight: 500;
  letter-spacing: -0.012em;
}
.chanlist a:hover { background: #26262A; color: #fff; }
.chanlist a .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
.chanlist .n { font-family: var(--display); font-weight: 700; font-variant-numeric: tabular-nums; font-size: 12.5px; opacity: .7; }
.back { color: #6A6A73; font-size: 13px; }
.brief {
  background: var(--card); color: var(--ink2); border-radius: var(--r); padding: 26px 28px;
  white-space: pre-wrap; line-height: 1.68; font-size: 14.5px; max-width: 800px;
}
form.inline { display: inline; }
button.clear {
  background: var(--salmon); border: 0; color: #101012; font-family: var(--ui);
  border-radius: 999px; padding: 11px 22px; font-size: 13px; cursor: pointer; font-weight: 700;
}
button.clear:hover { filter: brightness(1.05); }
button.clear.secondary { background: var(--sunk); color: var(--ink2); }
button.clear.secondary:hover { background: var(--line); filter: none; }

/* ── calendar ──────────────────────────────────────────────────────────── */
.calbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; padding: 0 4px; }
.calbar .month { font-family: var(--display); font-size: 24px; font-weight: 700; letter-spacing: -0.04em; min-width: 215px; }
.calbar .nav {
  background: var(--rail); border-radius: 999px; padding: 10px 16px; font-size: 13px;
  color: #9A9AA3; font-weight: 600;
}
.calbar .nav:hover { background: #26262A; color: #fff; }
.calbar .tabs { margin-left: auto; display: flex; gap: 3px; background: var(--rail); border-radius: 999px; padding: 4px; }
.calbar .tab { padding: 8px 19px; border-radius: 999px; font-size: 13px; color: #9A9AA3; font-weight: 600; }
.calbar .tab.on { background: var(--yellow); color: #101012; font-weight: 700; }
.calbar .tab:hover { color: #fff; }
.calbar .tab.on:hover { color: #101012; }

.cal {
  /* minmax(0,1fr), not 1fr: a long title must not widen its column and throw
     the week out of square. The chip ellipsises instead. */
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px;
  background: var(--card); border-radius: var(--r); padding: 12px;
}
.cal .wd {
  padding: 6px 10px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink3); text-align: left;
}
.cal .cell {
  background: var(--sunk); border-radius: 18px; min-height: 118px; padding: 10px 10px 11px;
  display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--ink);
}
.cal .cell.outside { background: #FAFAFB; }
.cal .cell.outside .num { color: #C6C6CD; }
.cal .cell.today { background: var(--salmon); }
.cal .num {
  font-family: var(--display); font-size: 15px; font-weight: 700; color: var(--ink2);
  font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 5px; border-radius: 8px; align-self: flex-start; letter-spacing: -0.03em;
}
.cal .num:hover { background: rgba(0,0,0,.06); color: var(--ink); }
.cal .cell.today .num { color: #101012; }
.cal .num .tag { font-family: var(--ui); font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; }
.cal .chip {
  display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 10px;
  background: #fff; font-size: 11px; color: var(--ink2); min-width: 0; font-weight: 600;
}
.cal .chip:hover { background: var(--line); color: var(--ink); }
.cal .chip .dot { width: 6px; height: 6px; border-radius: 2px; background: var(--c); flex: none; }
.cal .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.01em; }
.cal .more { font-size: 11px; color: var(--ink3); padding: 2px 8px; font-weight: 700; }
.cal .more:hover { color: var(--ink); }

/* ── sign in ───────────────────────────────────────────────────────────── */
.login { max-width: 380px; margin: 15vh auto; padding: 0 20px; }
.login h1 { font-size: 44px; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 6px; line-height: 1; }
.login p { color: #6A6A73; font-size: 13.5px; margin: 0 0 22px; }
.login form { background: var(--card); border-radius: var(--r); padding: 24px; }
.login input {
  width: 100%; padding: 14px 16px; border-radius: 16px; background: var(--sunk);
  border: 1px solid transparent; color: var(--ink); font: inherit; margin-bottom: 11px;
}
.login input:focus { outline: 0; border-color: var(--salmon); background: #fff; }
.login button {
  width: 100%; padding: 14px; border-radius: 16px; border: 0; cursor: pointer;
  background: var(--ink); color: #fff; font-family: var(--ui); font-size: 14px; font-weight: 700;
}
.login button:hover { background: #2A2A2E; }
.err { color: var(--late); font-size: 13px; margin-bottom: 10px; }

.row .when { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.row .when > div { display: block; }
.row .when .stack { text-align: right; }
.tick { display: flex; }
.tick button {
  width: 30px; height: 30px; border-radius: 999px; border: 1.5px solid var(--line);
  background: transparent; color: #C9C9CF; cursor: pointer; font-size: 13px; line-height: 1;
  font-family: var(--ui); flex: none; transition: all .12s ease;
}
.tick button:hover { border-color: var(--gm); color: var(--gm); }
.tick button.on { background: var(--gm); border-color: var(--gm); color: #fff; }
.row.cleared .title { text-decoration: line-through; text-decoration-color: #C9C9CF; opacity: .55; }
.row.cleared .meta { opacity: .55; }

/* ── recurring ─────────────────────────────────────────────────────────── */
.batches { display: flex; flex-direction: column; gap: 8px; }
.batch {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px;
  background: var(--sunk); color: var(--ink); font-size: 14px; letter-spacing: -0.012em;
}
.batch:hover { background: var(--line); }
.batch .who { display: flex; align-items: center; gap: 12px; min-width: 180px; }
.batch .tick button { width: 26px; height: 26px; font-size: 12px; }
.tick-space { width: 26px; flex: none; }
.batch .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); flex: none; }
.batch .name { font-weight: 600; min-width: 160px; }
.batch .bar {
  flex: 1; height: 7px; border-radius: 999px; background: #E2E2E5; overflow: hidden; min-width: 60px;
}
.batch .bar > span { display: block; height: 100%; background: var(--c); border-radius: 999px; }
.batch .state {
  font-family: var(--display); font-weight: 700; font-size: 13px; color: var(--ink2);
  font-variant-numeric: tabular-nums; min-width: 58px; text-align: right;
}
.batch.done .state { color: var(--gm); }
.batch.done .bar > span { background: var(--gm); }
.hint { color: var(--ink3); font-size: 12.5px; margin: 14px 0 0; max-width: 560px; line-height: 1.6; }
.panel form { margin-top: 14px; }
@media (max-width: 760px) {
  .batch { flex-wrap: wrap; gap: 8px 10px; }
  .batch .name { min-width: 0; flex: 1; }
  .batch .bar { order: 3; flex-basis: 100%; }
}

/* ── phone ─────────────────────────────────────────────────────────────────
   Not a shrunken desktop. The rail becomes a scrolling strip of pills at the
   top, every row drops to one column so a title has the full width instead of
   wrapping four words deep beside a deadline, and a calendar cell shows its
   work as dots — at this size a truncated title tells you nothing a colour
   doesn't.
   ────────────────────────────────────────────────────────────────────────── */
@media (max-width: 760px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  aside { position: static; height: auto; padding: 10px 10px 0; overflow: visible; }
  aside .inner { padding: 14px 12px; border-radius: 20px; min-height: 0; }
  aside .mark { font-size: 21px; padding: 0 4px 12px; }
  aside nav, aside .cats {
    display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch;
  }
  aside nav::-webkit-scrollbar, aside .cats::-webkit-scrollbar { display: none; }
  aside nav a, aside .cat {
    white-space: nowrap; margin-bottom: 0; padding: 10px 14px; border-radius: 999px;
    background: #1F1F23; font-size: 13.5px; flex: none;
  }
  aside nav a .n, aside .cat .n { margin-left: 8px; }
  aside h3 { margin: 14px 0 8px; padding: 0 4px; }
  aside .live { margin-top: 14px; padding: 11px 13px; }

  main { padding: 14px 10px 60px; }
  header.page { margin-bottom: 14px; padding: 4px 4px 0; display: block; }
  header.page h1 { font-size: 30px; }
  header.page .when { display: block; margin: 4px 0 0; padding: 0; font-size: 12px; }

  .stats { grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 10px; }
  .stat { padding: 16px 18px 17px; border-radius: 20px; }
  .stat .n { font-size: 34px; }
  .stat .l { font-size: 10px; margin-top: 7px; }

  .split { grid-template-columns: minmax(0, 1fr); gap: 10px; margin-bottom: 10px; }
  .panel { padding: 18px 18px 20px; border-radius: 20px; }
  .panel > h2, .group > .head .name, .section-title { font-size: 17px; margin-bottom: 14px; }
  .chart-head .hero .n { font-size: 34px; }
  .chart-head .legend { margin-left: 0; }
  /* Below this width the bars stop being readable, so the chart keeps its size
     and scrolls rather than shrinking into a smear. */
  .chartscroll svg { width: 620px; max-width: none; }
  .legend { gap: 12px; font-size: 11.5px; }

  /* One column: the title gets the whole width, the deadline sits under it. */
  .rows { padding: 8px; border-radius: 20px; }
  .row { grid-template-columns: 1fr; gap: 6px; padding: 13px 14px 14px; border-radius: 16px; }
  .row .title { font-size: 15px; gap: 8px; }
  .row .title .code { font-size: 12px; }
  .row .meta { padding-left: 18px; gap: 8px; font-size: 12px; }
  .row .when {
    grid-row: auto; text-align: left; padding-left: 18px; display: flex;
    gap: 5px 10px; flex-wrap: wrap; align-items: baseline; white-space: normal;
  }
  .row .when .d { font-size: 13.5px; }

  .group > .head { margin: 16px 0 10px; padding: 0 6px; }
  .chanlist a { padding: 9px 14px; font-size: 13px; }
  .brief { padding: 18px 18px; border-radius: 20px; font-size: 14px; }

  .calbar { gap: 8px; padding: 0; }
  .calbar .month { font-size: 19px; min-width: 0; flex: 1; }
  .calbar .nav { padding: 9px 13px; font-size: 12.5px; }
  .calbar .tabs { margin-left: 0; width: 100%; }
  .calbar .tab { flex: 1; text-align: center; padding: 9px 0; }

  .cal { gap: 3px; padding: 7px; border-radius: 20px; }
  .cal .wd { padding: 3px 0 6px; font-size: 8.5px; letter-spacing: 0.06em; text-align: center; }
  .cal .cell {
    min-height: 62px; border-radius: 12px; padding: 5px 4px;
    flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 3px;
  }
  .cal .num { font-size: 12px; width: 100%; padding: 0 2px; }
  .cal .num .tag { display: none; }
  .cal .cell.today .num { width: auto; padding: 1px 7px; border-radius: 999px; background: rgba(0,0,0,.14); }
  /* A chip becomes its own colour dot: a two-word truncation says less. */
  .cal .chip { width: 8px; height: 8px; padding: 0; border-radius: 50%; background: var(--c); gap: 0; }
  .cal .chip .dot, .cal .chip .t { display: none; }
  .cal .more { font-size: 9.5px; padding: 0 2px; white-space: nowrap; }

  .login { margin: 8vh auto; }
  .login h1 { font-size: 36px; }
}

@media (min-width: 761px) and (max-width: 1000px) {
  .shell { grid-template-columns: 1fr; }
  aside { position: static; height: auto; }
  .split { grid-template-columns: 1fr; }
  main { padding: 6px 16px 70px; }
  header.page h1 { font-size: 31px; }
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stat .n { font-size: 35px; }
  .cal { gap: 4px; padding: 8px; }
  .cal .cell { min-height: 90px; border-radius: 14px; }
  .cal .chip .t { display: none; }
}
`;

export interface Shell {
  /** Which sidebar entry is lit. */
  active: string;
  counts: Record<string, number>;
  nav: { reviews: number; queue: number; recurring: number; calendar: number };
  lastIntake: Date | null;
  /** Kept so the box still shows what was searched for. */
  query?: string;
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

  return `<aside><div class="inner">
    <a class="mark" href="/">Specular</a>
    <form class="search" method="get" action="/search" role="search">
      <input type="search" name="q" placeholder="Search…" value="${esc(s.query ?? "")}"
        aria-label="Search everything">
    </form>
    <nav>
      ${item("/", "Dashboard", null, "dashboard")}
      ${item("/calendar", "Calendar", s.nav.calendar, "calendar")}
      ${item("/revisions", "Revisions", s.nav.reviews, "reviews")}
      ${item("/queue", "Queue", s.nav.queue, "queue")}
      ${item("/recurring", "Recurring", s.nav.recurring, "recurring")}
    </nav>
    <h3>Categories</h3>
    <div class="cats">${cats}</div>
    <div class="live"><span class="pulse"></span>#intake · ${esc(ago)}</div>
  </div></aside>`;
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
  // A bare link says nothing the link chip beside it doesn't already say.
  if (firstLine && /^https?:\/\/\S+$/.test(firstLine)) {
    return r.kind === "review" ? "Unnamed revision" : "Link";
  }
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

  // Clearing is one tap from wherever you are looking, not two pages away.
  const tick = `<form class="tick" method="post" action="/r/${r.id}/${
    r.status === "done" ? "open" : "done"
  }">
    <button aria-label="${r.status === "done" ? "Reopen" : "Clear"}"
      title="${r.status === "done" ? "Reopen" : "Clear"}"
      class="${r.status === "done" ? "on" : ""}">✓</button>
  </form>`;

  return `<div class="row${r.status === "done" ? " cleared" : ""}" style="--c:${c}">
    <div class="title"><span class="swatch"></span>${code}<a href="/r/${r.id}">${esc(title)}</a></div>
    <div class="meta">${meta.join("<span>·</span>")}${links}</div>
    <div class="when">${when(r)}${tick}</div>
  </div>`;
}

function when(r: StoredRecord): string {
  const at = r.voDue ?? r.deadline ?? r.scriptDue;
  if (!at) return `<div class="stack"><span class="z">—</span></div>`;

  const label = r.voDue ? "VO" : r.deadline ? "due" : "script";
  const over = r.status === "open" && at.getTime() < Date.now();
  return `<div class="stack">
    <div class="d">${esc(renderIn(at, ORG_TZ, "ET"))}</div>
    <div class="z">${esc(label)} · ${esc(renderIn(at, TEAM_TZ, "IST"))}</div>
    ${over ? `<div class="over">past its time</div>` : ""}
    ${r.voDue && r.voSource === "calculated" ? `<div class="derived">air date − 6 days</div>` : ""}
  </div>`;
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
  const W = 780, H = 236;
  const PAD_T = 30;          // room for the total above the tallest bar
  const PAD_B = 52;          // two lines of label under each column
  const plotH = H - PAD_T - PAD_B;
  const slot = W / buckets.length;
  const barW = Math.min(34, slot - 10);
  const r = barW / 2;

  const max = Math.max(3, ...buckets.map((b) => b.total));
  const order = CATEGORIES.map((c) => c.id);
  const today = dateIn(ORG_TZ);

  const columns = buckets
    .map((b, i) => {
      const x = i * slot + (slot - barW) / 2;
      const base = PAD_T + plotH;
      const isToday = b.date === today;
      const isLate = b.date === null;

      // The track: every day keeps its slot whether or not anything is due,
      // so an empty week reads as empty rather than as missing.
      const track = `<rect class="track" x="${x.toFixed(1)}" y="${PAD_T}" width="${barW}"
        height="${plotH}" rx="${r}" fill="${
          isToday ? "#FCF6C4" : isLate ? "#FCEBE9" : "#F1F1F3"
        }"/>`;

      // The stack is clipped to one rounded pill, so the whole bar has the
      // card's geometry and the 2px gaps between categories sit inside it.
      const total = b.total;
      const stackH = (total / max) * plotH;
      const clipId = `clip${i}`;
      const clip = `<clipPath id="${clipId}"><rect x="${x.toFixed(1)}"
        y="${(base - stackH).toFixed(1)}" width="${barW}" height="${stackH.toFixed(1)}"
        rx="${Math.min(r, stackH / 2).toFixed(1)}"/></clipPath>`;

      let y = base;
      const segs = order
        .filter((id) => (b.counts[id] ?? 0) > 0)
        .map((id, n) => {
          const count = b.counts[id] ?? 0;
          const h = (count / max) * plotH;
          y -= h;
          const gap = n === 0 ? 0 : 2;
          return `<rect x="${x.toFixed(1)}" y="${(y + gap).toFixed(1)}" width="${barW}"
            height="${Math.max(1, h - gap).toFixed(1)}" fill="${COLOURS[id]}"
            ><title>${esc(`${b.date ?? "overdue"} · ${LABELS[id]}: ${count}`)}</title></rect>`;
        })
        .join("");

      const stack = total
        ? `${clip}<g clip-path="url(#${clipId})">${segs}</g>`
        : "";

      // The count sits above its own bar. No y-axis: the number is the value,
      // and a tick scale would only ask you to read one off the other.
      const count = total
        ? `<text class="total" x="${(x + barW / 2).toFixed(1)}" y="${(base - stackH - 11).toFixed(1)}"
            text-anchor="middle">${total}</text>`
        : "";

      const at = b.date ? new Date(`${b.date}T12:00:00Z`) : null;
      const weekday = at
        ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(at)
        : "";
      const dayNum = at
        ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric" }).format(at)
        : "";
      const weekend = at ? [0, 6].includes(at.getUTCDay()) : false;

      const labels = isLate
        ? `<text class="lab late" x="${(x + barW / 2).toFixed(1)}" y="${base + 22}"
             text-anchor="middle">LATE</text>`
        : `<text class="lab wd${weekend ? " weekend" : ""}${isToday ? " on" : ""}"
             x="${(x + barW / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle">${esc(weekday)}</text>
           <text class="lab dn${isToday ? " on" : ""}" x="${(x + barW / 2).toFixed(1)}"
             y="${base + 38}" text-anchor="middle">${esc(dayNum)}</text>`;

      return `<g class="col">${track}${stack}${count}${labels}</g>`;
    })
    .join("");

  // A rule after the overdue slot: what is late is a different kind of thing
  // from what is merely scheduled.
  const dividerX = slot;
  const divider = `<line x1="${dividerX.toFixed(1)}" x2="${dividerX.toFixed(1)}" y1="${PAD_T - 10}"
    y2="${(PAD_T + plotH + 44).toFixed(1)}" stroke="#E8E8EA" stroke-width="1" stroke-dasharray="3 4"/>`;

  const ahead = buckets.reduce((n, b) => (b.date ? n + b.total : n), 0);
  const late = buckets.find((b) => b.date === null)?.total ?? 0;

  const legend = CATEGORIES.map(
    (c) => `<span style="--c:${c.color}"><i></i>${esc(c.label)}</span>`,
  ).join("");

  return `<div class="chart">
    <div class="chart-head">
      <div class="hero">
        <div class="n">${ahead}</div>
        <div class="l">due in the next 14 days${late ? ` · <b>${late} late</b>` : ""}</div>
      </div>
      <div class="legend">${legend}</div>
    </div>
    <div class="chartscroll">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
        aria-label="Work due by day, stacked by category">${divider}${columns}</svg>
    </div>
  </div>`;
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
      ${
        r.parsedBy !== "recurring" && r.raw.trim()
          ? `<form class="inline" method="post" action="/r/${r.id}/reread" style="margin-left:8px">
               <button class="clear secondary" title="Read the original message again with the current parser">Re-read</button>
             </form>`
          : ""
      }
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

/** The Recurring page: today's batches per channel, and working ahead. */
export function renderRecurring(
  shell: Shell,
  today: { date: string; rows: Array<{ channel: string; total: number; done: number }> },
  ahead: { date: string; rows: Array<{ channel: string; total: number; done: number }> },
  list: StoredRecord[],
): string {
  const c = colourOf("bits");

  const line = (r: { channel: string; total: number; done: number }, date?: string) => {
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    const state = r.total === 0 ? "not open" : r.done === r.total ? "cleared" : `${r.done}/${r.total}`;
    const clearAll =
      date && r.total > r.done
        ? `<form class="tick" method="post" action="/recurring/clear">
             <input type="hidden" name="channel" value="${esc(r.channel)}">
             <input type="hidden" name="date" value="${esc(date)}">
             <button aria-label="Clear ${esc(r.channel)}" title="Clear the whole day">✓</button>
           </form>`
        : `<span class="tick-space"></span>`;

    return `<div class="batch${r.total && r.done === r.total ? " done" : ""}" style="--c:${c}">
      <a class="who" href="/channel/${encodeURIComponent(r.channel)}">
        <span class="dot"></span><span class="name">${esc(r.channel)}</span>
      </a>
      <span class="bar"><span style="width:${pct}%"></span></span>
      <span class="state">${esc(state)}</span>
      ${clearAll}
    </div>`;
  };

  const pretty = (d: string) =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  const aheadOpen = ahead.rows.some((r) => r.total > 0);

  return layout(
    "Recurring",
    shell,
    `${pageHeader("Recurring")}
    <div class="panel" style="margin-bottom:14px">
      <h2>Today · ${esc(pretty(today.date))}</h2>
      <div class="batches">${today.rows.map((r) => line(r, today.date)).join("")}</div>
    </div>

    <div class="panel" style="margin-bottom:14px">
      <h2>Tomorrow · ${esc(pretty(ahead.date))}</h2>
      ${
        aheadOpen
          ? `<div class="batches">${ahead.rows.map((r) => line(r, ahead.date)).join("")}</div>
             <p class="hint">Already open. Clear anything you get ahead on and it stays cleared —
             the morning run finds these and leaves them alone.</p>`
          : `<p class="hint">Not open yet. They open by themselves in the morning.</p>
             <form method="post" action="/recurring/ahead">
               <button class="clear">Work ahead — open tomorrow now</button>
             </form>`
      }
    </div>

    <div class="group">
      <div class="head" style="--c:${c}">
        <span class="dot"></span><span class="name">Today's batches</span>
        <span class="sub">${esc(pretty(today.date))}</span>
        <span class="n">${list.length}</span>
      </div>
      ${rows(list, "Nothing open yet today.")}
    </div>`,
  );
}
