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
import { CATEGORIES, CHANNELS, channelInk, type CategoryId } from "../catalog.js";
import { ORG_TZ, TEAM_TZ, VO_BUFFER_DAYS, dateIn, daysUntil, relativeDay, renderIn, usDate } from "../parse/derive.js";
import type { CalendarEntry, CalendarMode, DayBucket, Notice, NoticeKind, Stats, StoredRecord } from "../db/records.js";

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

/** A channel's own colour, falling back to its category's for an unknown name. */
function channelColour(name: string | null): string {
  const ch = CHANNELS.find((c) => c.name === name);
  return ch ? ch.color : "#8A8A93";
}

function colourOf(category: string): string {
  return COLOURS[category] ?? "#8A8F98";
}

const CSS = `
/* ──────────────────────────────────────────────────────────────────────────
   A dark shell holding blocks of flat colour.

   Each card is a solid field with a big radius, and the loud ones — salmon,
   yellow — carry black text, which is what keeps a bright block from turning
   into decoration. Everything else is dark: charcoal cards on a near-black
   shell, light text, and every colour checked for contrast against them.

   Bricolage Grotesque states the facts: the title, the counts, the names of
   things. Archivo does the working text under it.
   ────────────────────────────────────────────────────────────────────────── */
:root {
  color-scheme: dark;
  --shell: #0B0B0D; --rail: #151518; --card: #18181C; --dark: #222228;
  --sunk: #222227; --raised: #2C2C33; --line: #34343B;
  --ink: #F3F3F5; --ink2: #BDBDC6; --ink3: #94949E; --dim: #82828C;
  /* A pale ring keeps a dark channel dot (Verse's navy) visible on dark. */
  --ring: rgba(255,255,255,.3);
  --salmon: #F2A79C; --yellow: #F3E96C; --late: #F2685E; --warn: #EE9A55; --ok: #56C990;
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
  font-variant-numeric: tabular-nums;
}
aside h3 {
  font-family: var(--ui); font-size: 10px; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: #7E7E88; margin: 30px 0 10px; padding: 0 14px;
}
aside .cat {
  display: flex; align-items: center; gap: 11px; padding: 10px 14px; border-radius: 16px;
  font-size: 14px; color: #9A9AA3; letter-spacing: -0.012em;
}
aside .cat:hover { background: #222225; color: #fff; }
aside .cat .dot { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
aside .cat .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 13px;
  font-variant-numeric: tabular-nums;
}
aside .live {
  margin-top: 28px; padding: 13px 14px; border-radius: 18px; background: #222225;
  font-size: 12px; color: #9A9AA3; display: flex; align-items: center; gap: 9px;
}
aside .removed-link {
  display: block; margin-top: 10px; padding: 8px 14px; border-radius: 14px;
  font-size: 12px; color: var(--dim);
}
aside .removed-link:hover, aside .removed-link.on { color: #fff; background: #222225; }
aside .live .pulse {
  width: 7px; height: 7px; border-radius: 50%; background: #35D399; flex: none;
  box-shadow: 0 0 0 3px rgba(53,211,153,.16);
}

main { padding: 28px 28px 80px 8px; }

/* The rail can be put away for the whole width — the calendar especially.
   The class is set on <html> before the page paints, so it never flashes. */
@media (min-width: 761px) {
  html.rail-closed .shell { grid-template-columns: minmax(0, 1fr); }
  html.rail-closed .shell > aside { display: none; }
  html.rail-closed main { padding-left: 28px; }
}
.railtoggle {
  width: 40px; height: 40px; border-radius: 12px; border: 0; cursor: pointer; flex: none;
  background: var(--rail); color: #9A9AA3; display: grid; place-items: center;
  align-self: center; margin-right: 4px;
}
.railtoggle:hover { background: #26262A; color: #fff; }
.railtoggle svg { width: 20px; height: 20px; }
header.page { display: flex; align-items: flex-end; gap: 14px; margin-bottom: 22px; padding: 6px 4px 0; }
header.page h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.042em; margin: 0; line-height: 1; }
header.page .when { color: var(--dim); font-size: 13px; margin-left: auto; padding-bottom: 4px; }

aside .search { margin-bottom: 14px; }
aside .search input {
  width: 100%; padding: 11px 13px; border-radius: 14px; background: #222225;
  border: 1px solid transparent; color: #fff; font: inherit; font-size: 13.5px;
}
aside .search input::placeholder { color: var(--dim); }
aside .search input:focus { outline: 0; border-color: var(--salmon); background: #26262A; }

/* ── the blocks ────────────────────────────────────────────────────────── */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.stat { border-radius: var(--r); padding: 22px 24px 24px; background: var(--card); color: var(--ink); }
.stat:nth-child(1) { background: var(--salmon); color: #101012; }
.stat:nth-child(2) { background: var(--yellow); color: #101012; }
.stat:nth-child(4) { background: var(--dark); color: #fff; }
.stat .n {
  font-family: var(--display); font-size: 46px; font-weight: 800; letter-spacing: -0.05em;
  line-height: 1; font-variant-numeric: tabular-nums;
}
.stat .l {
  font-size: 11px; margin-top: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  font-weight: 700; opacity: .8;
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

.chart .col { cursor: pointer; }
.chart .col .track { transition: fill .12s ease; }
.chart .col:hover .track { fill: #34343B; }
.chart .col:hover text.lab.dn, .chart .col:hover text.lab.wd { fill: var(--ink); }
.chart .col:focus-visible { outline: none; }
.chart .col:focus-visible .track { stroke: var(--ink); stroke-width: 2; }
/* Rises into the pill on load, each column a beat after the last. */
.chart .liquid { animation: rise 1.1s cubic-bezier(.2,.8,.2,1) var(--d, 0ms) both; }
@keyframes rise { from { transform: translateY(var(--rise)); } to { transform: none; } }
.chart text.total { animation: fadein .5s ease calc(var(--d, 0ms) + .55s) both; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
/* The surface drifts one wavelength at a time: seamless, never done. */
.chart .wave { animation: drift 2.6s linear infinite; }
.chart .wave.back { animation: driftback 3.4s linear infinite; }
@keyframes drift { from { transform: translateX(0); } to { transform: translateX(var(--lambda)); } }
@keyframes driftback { from { transform: translateX(var(--lambda)); } to { transform: translateX(0); } }
.chart .col:hover .wave { animation-duration: 1.2s; }
.chart .col:hover .wave.back { animation-duration: 1.6s; }
@media (prefers-reduced-motion: reduce) {
  .chart .liquid, .chart text.total, .chart .wave { animation: none; }
}
.chart text.total {
  font-family: var(--display); font-size: 13px; font-weight: 700; fill: var(--ink);
  font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
}
.chart text.lab { font-family: var(--ui); font-size: 11px; fill: var(--ink3); }
.chart text.lab.wd { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.chart text.lab.wd.weekend { fill: #8A8A94; }
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
  color: #C9C9D0; letter-spacing: -0.012em; background: var(--raised); border-radius: 16px; margin-bottom: 8px;
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
.group > .head .sub { color: var(--dim); font-size: 12.5px; }
.group > .head .n {
  margin-left: auto; font-family: var(--display); font-weight: 700; font-size: 15px;
  color: var(--dim); font-variant-numeric: tabular-nums;
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
.row .meta .chan { color: var(--ink, var(--ch)); font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
/* Every dot is the channel's exact colour. The hairline ring keeps a pale one
   (FNAF's yellow) visible and a dark one (Verse's navy) against the dark. */
.row .meta .chan i { width: 9px; height: 9px; border-radius: 50%; background: var(--ch); display: block;
  box-shadow: 0 0 0 1px var(--ring); }
.row .when { grid-row: span 2; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row .when .d { font-family: var(--display); font-size: 14.5px; font-weight: 600; letter-spacing: -0.022em; }
.row .when .z { color: var(--ink3); font-size: 11.5px; }
.row .when .derived { color: var(--ink3); font-size: 11.5px; }
.airs.soon { color: var(--warn); font-weight: 650; }
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
.links a.frameio { background: rgba(74,92,212,.22); color: #AEB8F5; }
.links a:hover { background: var(--line); color: var(--ink); }
.warn { color: var(--warn); font-size: 12px; font-weight: 600; }

.chanlist { display: flex; flex-wrap: wrap; gap: 9px; }
.chanlist a {
  background: var(--rail); border-radius: 999px; padding: 10px 17px; font-size: 13.5px;
  display: flex; align-items: center; gap: 10px; color: #9A9AA3; font-weight: 500;
  letter-spacing: -0.012em;
}
.chanlist a:hover { background: #26262A; color: #fff; }
.chanlist a .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 1px rgba(255,255,255,.28); }
.chanlist .n { font-family: var(--display); font-weight: 700; font-variant-numeric: tabular-nums; font-size: 12.5px; }
.back { color: var(--dim); font-size: 13px; }
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
  /* Five weeks fill the screen below the toolbar; never smaller than a cell
     that fits five chips, so a short window scrolls instead of crushing. */
  background: var(--sunk); border-radius: 18px; padding: 11px 11px 12px;
  min-height: max(172px, calc((100vh - 290px) / 5));
  display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--ink);
}
.cal .cell.outside { background: #1C1C21; }
.cal .cell.outside .num { color: #8E8E98; }
.cal .cell.today { background: var(--salmon); }
.cal .num {
  font-family: var(--display); font-size: 17px; font-weight: 700; color: var(--ink2);
  font-variant-numeric: tabular-nums; display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 5px; border-radius: 8px; align-self: flex-start; letter-spacing: -0.03em;
}
.cal .num:hover { background: rgba(255,255,255,.08); color: var(--ink); }
.cal .cell.today .num { color: #101012; }
.cal .num .tag { font-family: var(--ui); font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; }
.cal .chip {
  display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 10px;
  background: var(--raised); font-size: 12.5px; color: var(--ink2); min-width: 0; font-weight: 600;
}
.cal .chip:hover { background: var(--line); color: var(--ink); }
.cal .cell.today .chip { background: #FBE3DF; color: #3A2A28; }
.cal .cell.today .chip:hover { background: #fff; color: #101012; }
.cal .cell.today .more, .cal .cell.today .num .tag { color: #3A2A28; }
.cal .chip[draggable] { cursor: grab; }
.cal .chip.dragging { opacity: .35; }
.cal .chip.saving { opacity: .6; }
.cal .cell.over { box-shadow: inset 0 0 0 2px var(--ink); }
.cattoggles { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 4px 14px; }
.cattoggle {
  display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px;
  background: var(--rail); color: #D8D8DE; font-size: 13px; font-weight: 600;
}
.cattoggle i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); display: block; }
.cattoggle:hover { background: #26262A; }
.cattoggle.off { color: #85858F; }
.cattoggle.off i { background: transparent; box-shadow: inset 0 0 0 1.5px var(--c); }
.cattoggle.all { background: transparent; color: #9A9AA3; }
.draghint { color: var(--dim); font-size: 12px; margin-left: auto; }
.cal .chip { box-shadow: inset 3px 0 0 var(--c); }
.cal .chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ch, var(--c)); flex: none; box-shadow: 0 0 0 1px var(--ring); }
.cal .chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.01em; }
.cal .more { font-size: 12px; color: var(--ink3); padding: 2px 9px; font-weight: 700; margin-top: auto; }
.cal .more:hover { color: var(--ink); }

/* ── day strip ─────────────────────────────────────────────────────────── */
button.nav { border: 0; cursor: pointer; font-family: var(--ui); }
.daystrip {
  display: flex; gap: 12px; overflow-x: auto; overscroll-behavior-x: contain; position: relative;
  scroll-snap-type: x proximity; padding: 2px 2px 14px; scrollbar-width: thin;
  scrollbar-color: #3A3A40 transparent;
}
.daycol {
  flex: 0 0 clamp(290px, 23vw, 380px); scroll-snap-align: center;
  background: var(--card); color: var(--ink); border-radius: var(--r); padding: 12px;
  display: flex; flex-direction: column; height: max(460px, calc(100vh - 250px));
  transition: box-shadow .15s ease;
}
.daycol > header {
  display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; flex-wrap: wrap;
}
.daycol .dname { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.daycol .wk { font-family: var(--display); font-weight: 800; font-size: 22px; letter-spacing: -0.04em; line-height: 1.05; }
.daycol .dt { color: var(--ink3); font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.daycol .rel { margin-left: auto; color: var(--ink3); font-size: 12px; }
.daycol .cnt {
  font-family: var(--display); font-weight: 700; font-size: 13px; min-width: 28px; height: 28px;
  border-radius: 999px; background: var(--sunk); display: grid; place-items: center; padding: 0 8px;
}
.daycol.today > header { background: var(--salmon); color: #101012; border-radius: 16px; padding: 10px 12px 12px; margin-bottom: 8px; }
.daycol.today .dt, .daycol.today .rel { color: #3A2A28; }
.daycol.today .cnt { background: rgba(0,0,0,.1); }
.daycol.focus { box-shadow: 0 0 0 3px var(--yellow); }
.daycol.over { box-shadow: 0 0 0 3px var(--ink), inset 0 0 0 2px var(--ink); }
.daybody { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; flex: 1; padding: 2px; }
.dayempty { color: var(--ink3); font-size: 13px; text-align: center; padding: 40px 10px; }
.dayedge {
  flex: 0 0 120px; border-radius: var(--r); background: var(--rail); color: #9A9AA3;
  display: grid; place-items: center; font-weight: 700; font-size: 13px; scroll-snap-align: center;
}
.dayedge:hover { background: #26262A; color: #fff; }
.dcard {
  background: var(--sunk); border-radius: 16px; padding: 12px 12px 10px 14px;
  box-shadow: inset 4px 0 0 var(--c); display: flex; flex-direction: column; gap: 6px; cursor: grab;
}
.dcard.dragging { opacity: .35; }
.dcard.saving { opacity: .6; }
.dcard .top { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 11.5px; color: var(--ink3); }
.dcard .swatch { width: 10px; height: 10px; border-radius: 4px; background: var(--c); flex: none; }
.dcard .code { font-weight: 700; color: var(--ink2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dcard .bits { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcard .t {
  font-family: var(--display); font-weight: 700; font-size: 16px; letter-spacing: -0.025em;
  line-height: 1.2; overflow-wrap: anywhere;
}
.dcard .t:hover { text-decoration: underline; }
.dcard .t .chdot {
  display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--ch);
  margin-right: 7px; vertical-align: 1px; box-shadow: 0 0 0 1px var(--ring);
}
.dcard .chan {
  color: var(--ink, var(--ch)); font-weight: 700; font-size: 12.5px;
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
}
.dcard .chan i { width: 9px; height: 9px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.dcard .pill { align-self: flex-start; background: var(--raised); }
.dcard .foot { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.dcard .at { font-size: 12px; color: var(--ink2); font-variant-numeric: tabular-nums; flex: 1; min-width: 0; }
.dcard .at.over { color: var(--late); font-weight: 700; }
.dcard .tick button { width: 28px; height: 28px; background: var(--card); }
/* Finished work is muted and struck through — never faded, so it stays readable. */
.dcard.cleared .t, .dcard.cleared .top, .dcard.cleared .code, .dcard.cleared .chan, .dcard.cleared .at { color: var(--ink3); }
.dcard.cleared .t { text-decoration: line-through; text-decoration-color: #6E6E78; }

/* ── week ──────────────────────────────────────────────────────────────── */
.weekgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.weekgrid .daycol {
  height: auto; min-height: max(460px, calc(100vh - 290px)); padding: 10px; border-radius: 20px;
}
.weekgrid .daybody { overflow: visible; }
.weekgrid .daycol > header { padding: 6px 6px 10px; gap: 6px; flex-wrap: nowrap; }
.weekgrid .daycol .dname { flex: 1; }
.weekgrid .daycol .wk { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.weekgrid .daycol.today > header { padding: 8px 10px 10px; }
.weekgrid .daycol .wk { font-size: 18px; }
.weekgrid .daycol .rel { display: none; }
.weekgrid .daycol .cnt { margin-left: auto; }
.weekgrid .dcard { padding: 10px 10px 9px 12px; border-radius: 14px; }
.weekgrid .dcard .t { font-size: 14px; }
.weekgrid .dcard .foot { flex-wrap: wrap; }
.weekgrid .dcard .at { flex-basis: 100%; }
.weekgrid .dcard .acts { margin-left: auto; }

/* status toggles sit after the categories, behind a hairline */
.tsep { width: 1px; height: 22px; background: #2A2A2F; margin: 0 4px; }
.cattoggle.st i { border-radius: 50%; }
.cal .chip.done .t { text-decoration: line-through; text-decoration-color: #6E6E78; color: var(--ink3); }
.cal .cell.today .chip.done .t { color: #6A5552; text-decoration-color: #9A8581; }
.calbar .tabs.views { margin-left: auto; }
.calbar .tabs.views + .tabs { margin-left: 0; }

@media (min-width: 761px) and (max-width: 1100px) {
  .weekgrid { grid-template-columns: repeat(7, minmax(220px, 1fr)); overflow-x: auto; padding-bottom: 12px; }
}

/* ── pins ──────────────────────────────────────────────────────────────── */
.pinform { display: inline-flex; margin: 0; flex: none; }
.pinform button { border: 0; cursor: pointer; font-family: var(--ui); }
.pin-ghost {
  width: 26px; height: 26px; border-radius: 8px; background: transparent; color: var(--ink3);
  display: grid; place-items: center; opacity: 0; transition: opacity .12s ease, background .12s ease;
}
.pin-ghost svg, .pinned-tag svg { width: 13px; height: 13px; }
.row:hover .pin-ghost, .dcard:hover .pin-ghost, .pin-ghost:focus-visible { opacity: 1; }
.pin-ghost:hover { background: var(--line); color: var(--ink); }
@media (hover: none) { .pin-ghost { opacity: .45; } }
.pinned-tag {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px 3px 7px; border-radius: 999px;
  background: var(--yellow); color: #101012; font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
}
.pinned-tag:hover { background: #FFF6A8; }
.pinned-tag:hover span { display: none; }
.pinned-tag:hover::after { content: "Unpin"; }
.row.pinned { background: #27251A; box-shadow: inset 0 0 0 1px rgba(243,233,108,.22); }
.row.pinned + .row:not(.pinned) { margin-top: 6px; }
.dcard .pinform { margin-left: auto; }
/* In a card the tag is the pin alone; the cream card already says pinned. */
.dcard .pinned-tag { padding: 5px; }
.dcard .pinned-tag span, .dcard .pinned-tag:hover::after { display: none; }
.dcard.pinned { background: #2A2819; }

/* ── bell ──────────────────────────────────────────────────────────────── */
.bellwrap { position: relative; align-self: center; flex: none; }
.bell {
  width: 44px; height: 44px; border-radius: 14px; border: 0; cursor: pointer; position: relative;
  background: var(--rail); color: #D8D8DE; display: grid; place-items: center;
}
.bell:hover, .bell[aria-expanded="true"] { background: #26262A; color: #fff; }
.bell svg { width: 21px; height: 21px; }
.bell .badge {
  position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 999px; background: #C8352B; color: #fff; font-size: 11px; font-weight: 700;
  display: grid; place-items: center; box-shadow: 0 0 0 3px var(--shell); font-variant-numeric: tabular-nums;
}
.bell .badge[hidden] { display: none; }
.notices {
  position: absolute; right: 0; top: calc(100% + 10px); width: 400px; max-height: min(560px, 72vh);
  overflow-y: auto; background: var(--card); color: var(--ink); border-radius: 22px; padding: 8px;
  box-shadow: 0 24px 60px rgba(0,0,0,.6), 0 0 0 1px #2E2E35; z-index: 20;
}
.notices[hidden] { display: none; }
.nhead { display: flex; align-items: center; gap: 10px; padding: 10px 10px 12px; }
.nhead b { font-family: var(--display); font-size: 17px; letter-spacing: -0.03em; }
.nhead .alerts {
  margin-left: auto; border: 0; cursor: pointer; border-radius: 999px; padding: 7px 12px;
  background: var(--sunk); color: var(--ink2); font: 600 12px var(--ui);
}
.nhead .alerts.on { background: var(--gm); color: #fff; }
.notice { display: flex; align-items: center; gap: 12px; padding: 11px 10px; border-radius: 14px; }
.notice:hover { background: var(--sunk); }
.notice[hidden] { display: none; }
.notice .ico {
  width: 34px; height: 34px; border-radius: 11px; flex: none; display: grid; place-items: center;
  color: #fff; background: var(--nc);
}
.notice .ico svg { width: 19px; height: 19px; }
.nfilters { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 8px 10px; }
.nf {
  display: inline-flex; align-items: center; gap: 6px; border: 0; cursor: pointer; border-radius: 999px;
  padding: 6px 11px; background: var(--sunk); color: var(--ink2); font: 600 12px var(--ui);
}
.nf i { width: 8px; height: 8px; border-radius: 3px; background: var(--nc); }
.nf span { color: var(--ink3); font-variant-numeric: tabular-nums; }
.nf:hover { background: var(--line); color: var(--ink); }
.nf.on { background: var(--ink); color: #101012; }
.nf.on span { color: #55555E; }
.nf:disabled, .nf:disabled span { color: #8E8E98; cursor: default; }
.nf:disabled i { background: transparent; box-shadow: inset 0 0 0 1.5px var(--nc); }
.nf:disabled:hover { background: var(--sunk); }
.nempty[hidden] { display: none; }
.notice .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.notice .nt { font-weight: 700; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice .ns { color: var(--ink3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice .ago { color: var(--ink3); font-size: 11.5px; flex: none; }
.notice.new-item .ago { color: var(--late); font-weight: 700; }
.notice.new-item .ago::before { content: "● "; }
.notice.new-item.airing .ago::before { content: "●"; }
.nempty { color: var(--ink3); font-size: 13px; padding: 24px 12px 28px; text-align: center; }

/* ── sign in ───────────────────────────────────────────────────────────── */
.login { max-width: 380px; margin: 15vh auto; padding: 0 20px; }
.login h1 { font-size: 44px; font-weight: 800; letter-spacing: -0.05em; margin: 0 0 6px; line-height: 1; }
.login p { color: var(--dim); font-size: 13.5px; margin: 0 0 22px; }
.login form { background: var(--card); border-radius: var(--r); padding: 24px; }
.login input {
  width: 100%; padding: 14px 16px; border-radius: 16px; background: var(--sunk);
  border: 1px solid transparent; color: var(--ink); font: inherit; margin-bottom: 11px;
}
.login input:focus { outline: 0; border-color: var(--salmon); background: var(--raised); }
.login button {
  width: 100%; padding: 14px; border-radius: 16px; border: 0; cursor: pointer;
  background: var(--salmon); color: #101012; font-family: var(--ui); font-size: 14px; font-weight: 700;
}
.login button:hover { filter: brightness(1.06); }
.err { color: var(--late); font-size: 13px; margin-bottom: 10px; }

.row .when { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.row .when > .stack { display: block; }
.row .when .stack { text-align: right; }
.acts { display: flex; gap: 6px; align-items: center; flex: none; }
.tick { display: flex; }
.tick button {
  width: 30px; height: 30px; border-radius: 999px; border: 1.5px solid #45454D;
  background: transparent; color: #A6A6B0; cursor: pointer; font-size: 13px; line-height: 1;
  font-family: var(--ui); flex: none; transition: all .12s ease;
}
.tick button:hover { border-color: var(--ok); color: var(--ok); }
.tick button.on { background: #26805A; border-color: #26805A; color: #fff; }
.row.cleared .title, .row.cleared .title .code { color: var(--ink3); }
.row.cleared .title a { text-decoration: line-through; text-decoration-color: #6E6E78; }
.row.cleared .meta, .row.cleared .meta .chan, .row.cleared .meta .airs, .row.cleared .meta .count { color: var(--ink3); }
.tick.remove button { font-size: 16px; }
.tick.remove button:hover { border-color: var(--late); color: var(--late); }
.tick.restore button:hover { border-color: #8D9BF2; color: #8D9BF2; }

/* ── sorting ─────────────────────────────────────────────────────────────── */
.sortbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 4px 14px; }
.sortlabel { color: var(--dim); font-size: 12px; font-weight: 600; margin-right: 4px; }
.sortpill {
  padding: 7px 13px; border-radius: 999px; background: var(--rail); color: #9A9AA3;
  font-size: 12.5px; font-weight: 600;
}
.sortpill:hover { color: #fff; background: #26262A; }
.sortpill.on { background: var(--yellow); color: #101012; }

/* ── recurring ─────────────────────────────────────────────────────────── */
.batches { display: flex; flex-direction: column; gap: 8px; }
.batch {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px;
  background: var(--sunk); color: var(--ink); font-size: 14px; letter-spacing: -0.012em;
}
.batch:hover { background: var(--line); }
.batch .who { display: flex; align-items: center; gap: 12px; min-width: 250px; }
.batch .tick button { width: 26px; height: 26px; font-size: 12px; }
.tick-space { width: 26px; flex: none; }
.batch .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ch, var(--c)); flex: none; box-shadow: 0 0 0 1px var(--ring); }
.batch .name { font-weight: 600; min-width: 160px; }
.batch .bar {
  flex: 1; height: 7px; border-radius: 999px; background: #3A3A42; overflow: hidden; min-width: 60px;
}
.pips { flex: 1; display: flex; gap: 5px; min-width: 120px; }
.pips form { flex: 1; display: flex; }
.pip {
  flex: 1; height: 26px; border-radius: 8px; border: 0; cursor: pointer; padding: 0;
  background: #3A3A42; transition: background .12s ease;
}
.pip:hover { background: #4A4A53; }
.pip.on { background: var(--c); }
.pip.on:hover { filter: brightness(1.08); }
.batch.done .pip.on { background: var(--gm); }
.row .meta .count { color: var(--ink2); font-weight: 600; }
.batch .bar > span { display: block; height: 100%; background: var(--c); border-radius: 999px; }
.batch .state {
  font-family: var(--display); font-weight: 700; font-size: 13px; color: var(--ink2);
  font-variant-numeric: tabular-nums; min-width: 58px; text-align: right;
}
.batch.done .state { color: var(--ok); }
.batch.done .bar > span { background: var(--gm); }
.airform { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.airform label { font-family: var(--display); font-weight: 700; color: #fff; font-size: 15px; }
.airform input {
  padding: 10px 14px; border-radius: 12px; border: 0; background: var(--raised); color: var(--ink);
  font: inherit; font-size: 14px; color-scheme: dark;
}
.airform .hint { margin: 0; }
.batch-group + .batch-group { margin-top: 18px; }
.batch-head {
  display: flex; align-items: center; gap: 9px; margin: 0 0 9px 4px;
  font-family: var(--display); font-weight: 700; font-size: 14px; letter-spacing: -0.02em;
}
.batch-head .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
.batch-head .n { margin-left: auto; font-family: var(--ui); font-weight: 600; font-size: 12px; color: var(--ink3); padding-right: 4px; }
.hint { color: var(--ink3); font-size: 12.5px; margin: 14px 0 0; max-width: 560px; line-height: 1.6; }
.panel form { margin-top: 14px; }
/* ...but not the buttons inside a batch row, which sit on its centre line. */
.panel .batch form { margin-top: 0; }
@media (max-width: 760px) {
  .batch { flex-wrap: wrap; gap: 8px 10px; }
  .batch .name { min-width: 0; flex: 1; }
  .batch .bar, .batch .pips { order: 3; flex-basis: 100%; }
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

  .railtoggle { display: none; }
  .daystrip { gap: 8px; scroll-snap-type: x mandatory; margin: 0 -10px; padding: 2px 10px 12px; scroll-padding: 0 10px; }
  .daycol { flex-basis: calc(100vw - 44px); height: max(420px, calc(100vh - 230px)); border-radius: 20px; padding: 10px; }
  .dayedge { flex-basis: 90px; border-radius: 20px; }
  .calbar button.nav, .calbar .nav { flex: none; }
  #dayname { font-size: 17px; }
  .draghint { display: none; }
  header.page { position: relative; }
  .bellwrap { position: absolute; top: 4px; right: 4px; }
  .notices { position: fixed; left: 10px; right: 10px; top: 70px; width: auto; }
  .weekgrid { grid-template-columns: minmax(0, 1fr); }
  .weekgrid .daycol { min-height: 0; }
  .weekgrid .daycol .rel { display: inline; margin-left: auto; }
  .weekgrid .daycol .cnt { margin-left: 0; }
  .calbar .tabs.views { margin-left: 0; }
  .tsep { display: none; }

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
  .cal .cell { min-height: 110px; border-radius: 14px; }
  .cal .chip .t { display: none; }
}
`;

export interface Shell {
  /** Which sidebar entry is lit. */
  active: string;
  counts: Record<string, number>;
  nav: { reviews: number; queue: number; recurring: number; calendar: number };
  lastIntake: Date | null;
  /** How many records are removed; the rail links to them when there are any. */
  removed?: number;
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
<script>try{if(localStorage.getItem("rail")==="closed")document.documentElement.classList.add("rail-closed")}catch(e){}</script>
</head><body>${
    shell
      ? `<div class="shell">${sidebar(shell)}<main>${body}</main></div>`
      : `<main style="max-width:none">${body}</main>`
  }<script>
  // The sidebar button: remembered per browser. "[" does the same.
  function toggleRail() {
    var closed = document.documentElement.classList.toggle("rail-closed");
    try { localStorage.setItem("rail", closed ? "closed" : "open"); } catch (e) {}
    document.querySelectorAll(".railtoggle").forEach(function (b) {
      b.setAttribute("aria-label", closed ? "Show the sidebar" : "Hide the sidebar");
      b.setAttribute("title", (closed ? "Show the sidebar" : "Hide the sidebar") + " ( [ )");
    });
  }
  document.addEventListener("keydown", function (e) {
    var t = e.target && e.target.tagName;
    if (e.key === "[" && t !== "INPUT" && t !== "TEXTAREA" && !e.metaKey && !e.ctrlKey) toggleRail();
  });
  </script></body></html>`;
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
    ${
      s.removed
        ? `<a class="removed-link${s.active === "removed" ? " on" : ""}" href="/removed">Removed · ${s.removed}</a>`
        : ""
    }
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

function pageHeader(title: string, extra = ""): string {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TZ, weekday: "long", day: "numeric", month: "long",
  }).format(now);
  return `<header class="page">
    <button class="railtoggle" type="button" onclick="toggleRail()"
      aria-label="Hide or show the sidebar" title="Hide or show the sidebar ( [ )">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <rect x="2.5" y="3.5" width="15" height="13" rx="3"/><path d="M7.5 3.5v13"/>
      </svg>
    </button>
    <h1>${esc(title)}</h1>
    <span class="when">${esc(day)} · ${esc(renderIn(now, ORG_TZ, "ET").split("@")[1]?.trim() ?? "")}</span>
    ${extra}
  </header>`;
}

/** A record's name as the bell and desktop alerts show it. */
export function noticeTitle(r: StoredRecord): string {
  return displayTitle(r);
}

const BELL_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8.5a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12.5 5 8.5z"/><path d="M8.3 16.5a1.9 1.9 0 0 0 3.4 0"/></svg>`;

/**
 * The dashboard's bell: revisions that have come in and work past its time,
 * newest first. The badge counts what arrived since you last opened it.
 * Opening it marks everything read. "Desktop alerts" asks the browser for
 * permission, then the open dashboard checks every minute and pops a system
 * notification for anything new.
 */
/** Each kind of notification: its filter label, its icon and its colour. */
const NOTICE_KINDS: Array<{ kind: NoticeKind; label: string; colour: string; icon: string }> = [
  {
    kind: "revision", label: "Revisions", colour: "#5B6CF0",
    icon: `<path d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/><path d="M8.5 7.5v5l4-2.5z" fill="currentColor"/>`,
  },
  {
    kind: "overdue", label: "Overdue", colour: "#E5534B",
    icon: `<path d="M10 3.2 17.4 16H2.6z"/><path d="M10 8v3.6"/><circle cx="10" cy="13.9" r=".6" fill="currentColor"/>`,
  },
  {
    kind: "upcoming", label: "Due soon", colour: "#D9822B",
    icon: `<circle cx="10" cy="10" r="6.8"/><path d="M10 6.2V10l2.6 1.8"/>`,
  },
  {
    kind: "airing", label: "Airing", colour: "#2F9E6A",
    icon: `<rect x="3" y="6.5" width="14" height="9.5" rx="2"/><path d="m7 3.5 3 3 3-3"/>`,
  },
  {
    kind: "new", label: "New", colour: "#A35BC4",
    icon: `<path d="M5 3.5h6.5L15 7v9.5H5z"/><path d="M10 9.5v4.5M7.8 11.8h4.4"/>`,
  },
];

const noticeIcon = (kind: NoticeKind) => {
  const k = NOTICE_KINDS.find((n) => n.kind === kind)!;
  return `<span class="ico" style="--nc:${k.colour}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${k.icon}</svg></span>`;
};

/**
 * The dashboard's bell. Five kinds, each with its own icon and colour, and a
 * filter row to see one kind at a time. The badge counts what arrived since
 * you last opened it; opening it marks everything read. "Desktop alerts"
 * asks the browser for permission, then an open dashboard checks every minute
 * and pops a system notification for anything new.
 */
function bell(notices: Notice[], seen: number): string {
  const unread = notices.filter((n) => n.at.getTime() > seen).length;
  const what = (n: Notice): string => {
    const r = n.record;
    switch (n.kind) {
      case "revision": return `Revision ready${r.version ? ` · v${r.version}` : ""}`;
      case "overdue": return `Overdue · was due ${esc(renderIn(n.at, ORG_TZ, "ET"))}`;
      case "upcoming": {
        const due = r.voDue ?? r.deadline ?? r.scriptDue;
        return `Due ${due ? esc(renderIn(due, ORG_TZ, "ET")) : "soon"}`;
      }
      case "airing": return `Airs ${esc(relativeDay(r.airDate!))} · ${esc(usDate(r.airDate!))}`;
      case "new": return `New ${esc(r.stage ?? "assignment")}${r.code ? ` · ${esc(r.code)}` : ""}`;
    }
  };
  const items = notices
    .map((n) => {
      const r = n.record;
      const isNew = n.at.getTime() > seen;
      return `<a class="notice ${n.kind}${isNew ? " new-item" : ""}" data-kind="${n.kind}" href="/r/${r.id}">
        ${noticeIcon(n.kind)}
        <span class="body">
          <span class="nt">${esc(displayTitle(r))}</span>
          <span class="ns">${what(n)}${r.channel ? ` · ${esc(r.channel)}` : ""}</span>
        </span>
        <span class="ago">${esc(n.kind === "airing" ? "" : timeAgo(n.at))}</span>
      </a>`;
    })
    .join("");

  const counts = new Map<string, number>();
  for (const n of notices) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const filters = `<div class="nfilters" role="tablist" aria-label="Show">
    <button type="button" class="nf on" data-f="all" style="--nc:var(--ink)">All<span>${notices.length}</span></button>
    ${NOTICE_KINDS.map(
      (k) => `<button type="button" class="nf" data-f="${k.kind}" style="--nc:${k.colour}"${
        counts.get(k.kind) ? "" : " disabled"
      }><i></i>${k.label}<span>${counts.get(k.kind) ?? 0}</span></button>`,
    ).join("")}
  </div>`;

  return `<div class="bellwrap">
    <button class="bell" type="button" id="bell" aria-haspopup="true" aria-expanded="false"
      aria-label="Notifications${unread ? `, ${unread} new` : ""}" title="Notifications">
      ${BELL_ICON}<span class="badge" id="bellcount"${unread ? "" : " hidden"}>${unread > 9 ? "9+" : unread}</span>
    </button>
    <div class="notices" id="notices" hidden>
      <div class="nhead">
        <b>Notifications</b>
        <button type="button" class="alerts" id="alerts">Desktop alerts</button>
      </div>
      ${filters}
      <div class="nlist">${items || `<div class="nempty">Nothing yet. Revisions, deadlines and air dates show up here.</div>`}</div>
      <div class="nempty nfiltered" hidden>Nothing of this kind right now.</div>
    </div>
  </div>
  <script>
  (function () {
    var bell = document.getElementById("bell"), panel = document.getElementById("notices");
    var count = document.getElementById("bellcount"), alerts = document.getElementById("alerts");
    function markRead() {
      document.cookie = "notices_seen=" + Date.now() + "; path=/; max-age=31536000; samesite=lax";
      count.hidden = true;
    }
    bell.addEventListener("click", function (e) {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      bell.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) markRead();
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target)) { panel.hidden = true; bell.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") panel.hidden = true; });

    // One kind at a time, remembered in this browser.
    function filter(f) {
      var shown = 0;
      panel.querySelectorAll(".nf").forEach(function (b) { b.classList.toggle("on", b.dataset.f === f); });
      panel.querySelectorAll(".notice").forEach(function (n) {
        var show = f === "all" || n.dataset.kind === f;
        n.hidden = !show;
        if (show) shown += 1;
      });
      panel.querySelector(".nfiltered").hidden = shown > 0 || !panel.querySelector(".notice");
      try { localStorage.setItem("noticeFilter", f); } catch (x) {}
    }
    panel.querySelectorAll(".nf").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); filter(b.dataset.f); });
    });
    try {
      var saved = localStorage.getItem("noticeFilter");
      var btn = saved && panel.querySelector('.nf[data-f="' + saved + '"]');
      if (btn && !btn.disabled) filter(saved);
    } catch (x) {}

    // Desktop alerts: remembered per browser, and only for what arrives after
    // they were turned on, so switching them on never fires a backlog.
    var canAlert = "Notification" in window;
    function on() {
      try { return canAlert && Notification.permission === "granted" && localStorage.getItem("alerts") === "on"; } catch (e) { return false; }
    }
    function label() {
      alerts.textContent = !canAlert ? "Alerts not supported" : on() ? "Desktop alerts: on" : "Desktop alerts: off";
      alerts.classList.toggle("on", on());
    }
    label();
    alerts.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!canAlert) return;
      if (on()) { try { localStorage.setItem("alerts", "off"); } catch (x) {} label(); return; }
      Notification.requestPermission().then(function (p) {
        if (p === "granted") {
          try { localStorage.setItem("alerts", "on"); localStorage.setItem("alertedTo", String(Date.now())); } catch (x) {}
        }
        label();
      });
    });

    function poll() {
      fetch("/notifications.json", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          if (panel.hidden) {
            count.hidden = data.unread === 0;
            count.textContent = data.unread > 9 ? "9+" : String(data.unread);
          }
          if (!on()) return;
          var since = 0;
          try { since = Number(localStorage.getItem("alertedTo")) || Date.now(); } catch (x) {}
          var now = Date.now(), fresh = data.items.filter(function (n) { return n.at > since && n.at <= now; });
          fresh.slice(0, 5).forEach(function (n) {
            var heads = { revision: "Revision ready", overdue: "Overdue", upcoming: "Due soon", airing: "Airing soon", "new": "New assignment" };
            var note = new Notification(heads[n.kind] || "Specular", {
              body: n.title + (n.channel ? " — " + n.channel : ""), tag: n.kind + ":" + n.id,
            });
            note.onclick = function () { window.focus(); location.href = "/r/" + n.id; };
          });
          try { localStorage.setItem("alertedTo", String(now)); } catch (x) {}
        })
        .catch(function () {});
    }
    setInterval(poll, 60000);
  })();
  </script>`;
}

/** Where the date is already the column — a calendar cell, a day card. */
function titleOnDay(r: StoredRecord): string {
  return r.batchNo && r.channel ? r.channel : displayTitle(r);
}

/**
 * A row with no title of its own shows its own first line, not the parser's
 * note about it — "need 2 more before 6" is what you wrote and what you will
 * recognise; "Filed by the channel name only" is bookkeeping.
 */
function displayTitle(r: StoredRecord): string {
  // A recurring batch is its channel and its day, and nothing else.
  if (r.batchNo && r.channel) return r.airDate ? `${r.channel} · ${usDate(r.airDate)}` : r.channel;
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
    meta.push(
      `<a class="chan" style="--ch:${channelColour(r.channel)};--ink:${channelInk(channelColour(r.channel))}" href="/channel/${encodeURIComponent(r.channel)}"><i></i>${esc(r.channel)}</a>`,
    );
  } else {
    meta.push(`<span class="pill">${esc(LABELS[r.category] ?? "unsorted")}</span>`);
  }
  if (r.stage) meta.push(esc(r.stage));
  if (r.version) meta.push(`v${r.version}`);
  if (r.wordCount) meta.push(`${r.wordCount.toLocaleString()} words`);
  if (r.airDate) meta.push(airs(r));
  if (r.batchTarget && r.batchTarget > 1) {
    meta.push(`<span class="count">${r.status === "done" ? r.batchTarget : r.batchDone}/${r.batchTarget} uploaded</span>`);
  }
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

  return `<div class="row${r.status === "done" ? " cleared" : ""}${r.pinnedAt ? " pinned" : ""}" style="--c:${c}">
    <div class="title"><span class="swatch"></span>${code}<a href="/r/${r.id}">${esc(title)}</a>${pinControl(r)}</div>
    <div class="meta">${meta.join("<span>·</span>")}${links}</div>
    <div class="when">${when(r)}${actions(r)}</div>
  </div>`;
}

/**
 * The buttons at the end of a row, one tap each from wherever you are looking.
 *
 * ✓ clears, and counts toward "cleared this week". × removes, and counts
 * toward nothing — it is for things that were never real work, like a
 * duplicate or a message filed by mistake. A removed row gets a single ↺ to
 * put it back.
 */
/**
 * The pin. Pinned, a row carries a yellow "Pinned" tab that is itself the
 * unpin button, and sits at the top of its category. Unpinned, it is a quiet
 * icon beside the title that shows itself when you point at the row.
 */
function pinControl(r: StoredRecord): string {
  if (r.status === "removed") return "";
  const on = Boolean(r.pinnedAt);
  return `<form class="pinform" method="post" action="/r/${r.id}/${on ? "unpin" : "pin"}">
    <button class="${on ? "pinned-tag" : "pin-ghost"}" aria-label="${on ? "Unpin" : "Pin to the top of its category"}"
      title="${on ? "Unpin" : "Pin to the top of its category"}">${PIN_ICON}${on ? "<span>Pinned</span>" : ""}</button>
  </form>`;
}

/** Pinned first — newest pin on top — and everything else in its order. */
export function pinnedFirst(list: StoredRecord[]): StoredRecord[] {
  const pinned = list
    .filter((r) => r.pinnedAt)
    .sort((a, b) => b.pinnedAt!.getTime() - a.pinnedAt!.getTime());
  return pinned.length ? [...pinned, ...list.filter((r) => !r.pinnedAt)] : list;
}

const PIN_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 1.75h5l-.75 4.5 2.5 2.5v1.25h-8.5V8.75l2.5-2.5z" fill="currentColor"/><path d="M8 10v4.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function actions(r: StoredRecord): string {
  const button = (action: string, label: string, glyph: string, cls = "") =>
    `<form class="tick${cls ? ` ${cls}` : ""}" method="post" action="/r/${r.id}/${action}">
      <button aria-label="${label}" title="${label}"${
        cls === "on" ? ' class="on"' : ""
      }>${glyph}</button>
    </form>`;

  if (r.status === "removed") return `<div class="acts">${button("open", "Restore", "↺", "restore")}</div>`;

  return `<div class="acts">
    ${r.status === "done" ? button("open", "Reopen", "✓", "on") : button("done", "Clear", "✓")}
    ${button("remove", "Remove — doesn't count as cleared", "×", "remove")}
  </div>`;
}

/**
 * "airs 9/28/2026 · in 3 days". The countdown is computed on every page load,
 * so it is always today's answer — and it turns warm inside three days.
 */
function airs(r: StoredRecord): string {
  if (!r.airDate) return "";
  const n = daysUntil(r.airDate);
  const soon = r.status === "open" && n >= 0 && n <= 3;
  return `<span class="airs${soon ? " soon" : ""}">airs ${esc(usDate(r.airDate))} · ${esc(
    relativeDay(r.airDate),
  )}</span>`;
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
    ${r.voDue && r.voSource === "calculated" ? `<div class="derived">VO set ${VO_BUFFER_DAYS} days before air</div>` : ""}
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
/**
 * A filled shape whose top edge is a sine-like wave: from x0 to x1 at level
 * y, down to the floor. One wavelength per `lambda`, amplitude 3px.
 */
function wavePath(x0: number, x1: number, y: number, floor: number, lambda: number): string {
  const amp = 3;
  const half = lambda / 2;
  let d = `M${x0.toFixed(1)} ${floor.toFixed(1)} L${x0.toFixed(1)} ${y.toFixed(1)} q${(half / 2).toFixed(1)} ${-amp} ${half.toFixed(1)} 0`;
  for (let x = x0 + half; x < x1; x += half) d += ` t${half.toFixed(1)} 0`;
  return `${d} L${(x1 + half).toFixed(1)} ${floor.toFixed(1)} Z`;
}

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
          isToday ? "#3A3721" : isLate ? "#3B2426" : "#26262C"
        }"/>`;

      // The work is liquid poured into the pill: clipped to the track's own
      // shape, so the bottom is always the pill's round end and the level is
      // a surface, never a shrunken capsule of its own. It rises into place
      // when the page loads; a pill that isn't full keeps a slow wave on top.
      const total = b.total;
      const level = (total / max) * plotH;
      const full = total >= max;
      const clipId = `pill${i}`;
      const clip = `<clipPath id="${clipId}"><rect x="${x.toFixed(1)}" y="${PAD_T}" width="${barW}"
        height="${plotH}" rx="${r}"/></clipPath>`;

      const layers = order.filter((id) => (b.counts[id] ?? 0) > 0);
      let y = base;
      const segs = layers
        .map((id, n) => {
          const count = b.counts[id] ?? 0;
          const h = (count / max) * plotH;
          y -= h;
          // A 2px seam of track shows between one layer and the one below.
          const floor = n === 0 ? base + 2 : y + h - 2;
          const tip = `<title>${esc(`${LABELS[id]}: ${count}`)}</title>`;
          const top = n === layers.length - 1;
          if (top && !full) {
            // The surface: a wave twice the pill's width, slid sideways by
            // one wavelength forever — seamless because it repeats.
            // A paler wave behind, half a wavelength out and drifting the
            // other way, gives the surface depth.
            return `<path class="wave back" d="${wavePath(x - barW * 1.5, x + barW * 2, y - 1.5, floor, barW)}"
              fill="${COLOURS[id]}" opacity=".4"/>
              <path class="wave" d="${wavePath(x - barW, x + barW * 2, y, floor, barW)}"
              fill="${COLOURS[id]}">${tip}</path>`;
          }
          // Full to the brim, the top layer runs past the rim and the clip
          // rounds it; below the surface, layers are flat.
          const yTop = top ? PAD_T - 2 : y;
          return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW}"
            height="${Math.max(1, floor - yTop).toFixed(1)}" fill="${COLOURS[id]}">${tip}</rect>`;
        })
        .join("");

      const liquid = total
        ? `${clip}<g clip-path="url(#${clipId})"><g class="liquid" style="--rise:${level.toFixed(1)}px;--d:${(
            i * 45
          ).toFixed(0)}ms">${segs}</g></g>`
        : "";

      // The count sits above its own level. No y-axis: the number is the
      // value, and a tick scale would only ask you to read one off the other.
      const count = total
        ? `<text class="total" x="${(x + barW / 2).toFixed(1)}" y="${(base - level - 11).toFixed(1)}"
            text-anchor="middle" style="--d:${(i * 45).toFixed(0)}ms">${total}</text>`
        : "";

      const at = b.date ? new Date(`${b.date}T12:00:00Z`) : null;
      const weekday = at
        ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(at)
        : "";
      const dayNum = at
        ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(at)
        : "";
      const weekend = at ? [0, 6].includes(at.getUTCDay()) : false;

      const labels = isLate
        ? `<text class="lab late" x="${(x + barW / 2).toFixed(1)}" y="${base + 22}"
             text-anchor="middle">LATE</text>`
        : `<text class="lab wd${weekend ? " weekend" : ""}${isToday ? " on" : ""}"
             x="${(x + barW / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle">${esc(weekday)}</text>
           <text class="lab dn${isToday ? " on" : ""}" x="${(x + barW / 2).toFixed(1)}"
             y="${base + 38}" text-anchor="middle">${esc(dayNum)}</text>`;

      // The whole column — pill, count and date — opens that day's work.
      // The hit area is the full slot, so a thin empty pill is still easy
      // to press.
      const href = isLate ? "/late" : `/day/${b.date}?mode=deadlines&amp;st=done`;
      const label = isLate
        ? `${total} late — open the list`
        : `${weekday} ${usDate(b.date!)}: ${total} due — open the day`;
      return `<a class="col" href="${href}" aria-label="${esc(label)}">
        <title>${esc(label)}</title>
        <rect class="hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent"/>
        ${track}${liquid}${count}${labels}</a>`;
    })
    .join("");

  // A rule after the overdue slot: what is late is a different kind of thing
  // from what is merely scheduled.
  const dividerX = slot;
  const divider = `<line x1="${dividerX.toFixed(1)}" x2="${dividerX.toFixed(1)}" y1="${PAD_T - 10}"
    y2="${(PAD_T + plotH + 44).toFixed(1)}" stroke="#3A3A42" stroke-width="1" stroke-dasharray="3 4"/>`;

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
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="--lambda:${barW}px"
        aria-label="Work due by day, stacked by category. Press a day to open it.">${divider}${columns}</svg>
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
    notices?: Notice[];
    seen?: number;
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
    return group(c.id, pinnedFirst(list).slice(0, 8), channels > 1 ? `${channels} channels` : "");
  }).join("");

  const unsorted = pinnedFirst(data.grouped.get("unknown") ?? []);

  const chanList = CHANNELS.map((ch) => {
    const n = data.channels[ch.name] ?? 0;
    return `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${ch.color}">
      <span class="dot"></span>${esc(ch.name)}<span class="n">${n}</span></a>`;
  }).join("");

  return layout(
    "Dashboard",
    shell,
    `${pageHeader("Dashboard", bell(data.notices ?? [], data.seen ?? 0))}
    <div class="stats">${tiles}</div>

    <div class="split">
      <div class="panel">
        <h2>Work due by day</h2>
        ${dueChart(data.byDay)}
      </div>
      <div class="panel today">
        <div class="date">${esc(
          new Intl.DateTimeFormat("en-US", {
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
  sort?: SortState,
): string {
  const shown = sort ? sortRecords(list, sort.key, sort.dir) : list;
  return layout(
    title,
    shell,
    `${pageHeader(title)}${list.length > 1 ? sortBar(sort) : ""}${rows(shown, subtitle)}`,
  );
}

/** A category page leads with its channels, then its open work. */
export function renderCategory(
  shell: Shell,
  label: string,
  id: string,
  list: StoredRecord[],
  channels: Record<string, number>,
  sort?: SortState,
): string {
  const chans = CHANNELS.filter((c) => c.category === id);
  const chips = chans.length
    ? `<div class="chanlist" style="margin-bottom:18px">${chans
        .map(
          (ch) =>
            `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${ch.color}">
              <span class="dot"></span>${esc(ch.name)}<span class="n">${channels[ch.name] ?? 0}</span></a>`,
        )
        .join("")}</div>`
    : "";

  return layout(
    label,
    shell,
    `${pageHeader(label)}${chips}${list.length > 1 ? sortBar(sort) : ""}${rows(
      sort ? sortRecords(list, sort.key, sort.dir) : list,
      `Nothing open in ${label}.`,
    )}`,
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
  if (r.airDate) facts.push(["Airs", `${usDate(r.airDate)} · ${relativeDay(r.airDate)}`]);
  if (r.scriptDue) facts.push(["Script due", renderIn(r.scriptDue, ORG_TZ, "ET")]);
  if (r.voDue) {
    facts.push([
      "VO due",
      `${renderIn(r.voDue, ORG_TZ, "ET")}${r.voSource === "calculated" ? `  (set ${VO_BUFFER_DAYS} days before air)` : "  (stated)"}`,
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
      <h2>${esc(r.kind)}${r.status === "done" ? " · cleared" : r.status === "removed" ? " · removed" : ""}</h2>
      <h1 style="font-size:34px;font-weight:800;letter-spacing:-0.04em;margin:0 0 12px;line-height:1.02">${esc(displayTitle(r))}</h1>
      ${r.note && r.title ? `<p style="color:var(--dim);margin:-8px 0 14px;font-size:13.5px">${esc(r.note)}</p>` : ""}
      <div class="rows">${table}</div>
    </section>
    <section>
      <form class="airform" method="post" action="/r/${r.id}/air">
        <label for="air">Air date</label>
        <input type="date" id="air" name="air" value="${esc(r.airDate ?? "")}">
        <button class="clear">Save</button>
        <span class="hint">${
          r.voSource === "stated"
            ? "The VO time was stated, so it stays where it is."
            : r.batchNo
              ? "Moves this batch's day."
              : `The VO deadline follows it, ${VO_BUFFER_DAYS} days before.`
        }</span>
      </form>
    </section>
    ${links}
    ${r.brief ? `<section><h2>Story brief</h2><div class="brief">${esc(r.brief)}</div></section>` : ""}
    ${r.warnings.length ? `<section><h2>Warnings</h2><div class="empty warn">${esc(r.warnings.join(" · "))}</div></section>` : ""}
    <section>
      ${
        r.status === "removed"
          ? ""
          : `<form class="inline" method="post" action="/r/${r.id}/${r.pinnedAt ? "unpin" : "pin"}" style="margin-right:8px">
               <button class="clear secondary">${r.pinnedAt ? "Unpin" : "Pin to top of category"}</button>
             </form>`
      }
      <form class="inline" method="post" action="/r/${r.id}/${r.status === "open" ? "done" : "open"}">
        <button class="clear" style="--c:${c}">${
          r.status === "open" ? "Clear this" : r.status === "removed" ? "Restore" : "Reopen"
        }</button>
      </form>
      ${
        r.status === "open"
          ? `<form class="inline" method="post" action="/r/${r.id}/remove" style="margin-left:8px">
               <button class="clear secondary" title="Take it off the board without counting it as cleared">Remove</button>
             </form>`
          : ""
      }
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


// ── sorting lists ───────────────────────────────────────────────────────────

export type SortKey = "air" | "code" | "due" | "channel" | "title" | "filed";
export type SortDir = "asc" | "desc";

export const SORTS: Array<{ key: SortKey; label: string; defaultDir: SortDir }> = [
  { key: "air", label: "Air date", defaultDir: "asc" },
  { key: "code", label: "Video #", defaultDir: "asc" },
  { key: "due", label: "Deadline", defaultDir: "asc" },
  { key: "channel", label: "Channel", defaultDir: "asc" },
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "filed", label: "Newest", defaultDir: "desc" },
];

/** "VIDEO-011" → ["VIDEO", 11], so VIDEO-9 sorts before VIDEO-10. */
function codeParts(code: string | null): [string, number] | null {
  const m = code?.match(/^([A-Z]+)-?(\d+)$/i);
  return m ? [m[1]!.toUpperCase(), Number(m[2])] : null;
}

/**
 * Sort a list by one key. Records without that value — no air date, no code —
 * always go to the bottom whichever way it runs, so flipping the direction
 * reorders the real values instead of burying them under the blanks.
 */
export function sortRecords(list: StoredRecord[], key: SortKey, dir: SortDir): StoredRecord[] {
  const sign = dir === "asc" ? 1 : -1;
  const due = (r: StoredRecord) => (r.voDue ?? r.deadline ?? r.scriptDue)?.getTime() ?? null;

  const value = (r: StoredRecord): string | number | [string, number] | null => {
    switch (key) {
      case "air": return r.airDate;
      case "code": return codeParts(r.code);
      case "due": return due(r);
      case "channel": return r.channel?.toLowerCase() ?? null;
      case "title": return displayTitle(r).toLowerCase();
      case "filed": return r.createdAt.getTime();
    }
  };

  const cmp = (a: unknown, b: unknown): number => {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a[0] === b[0] ? (a[1] as number) - (b[1] as number) : String(a[0]).localeCompare(String(b[0]));
    }
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "en", { numeric: true });
  };

  return pinnedFirst([...list].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (a === null && b === null) return y.createdAt.getTime() - x.createdAt.getTime();
    if (a === null) return 1;
    if (b === null) return -1;
    const c = cmp(a, b) * sign;
    // Ties fall back to the air date, then the newest filed.
    if (c !== 0) return c;
    if (key !== "air" && x.airDate && y.airDate && x.airDate !== y.airDate) return x.airDate < y.airDate ? -1 : 1;
    return y.createdAt.getTime() - x.createdAt.getTime();
  }));
}

export interface SortState {
  key: SortKey;
  dir: SortDir;
  /** The page's own path and query, ending in ? or &, for the sort links. */
  base: string;
}

/** The pills above a list. The active one shows its direction; pressing it again reverses. */
function sortBar(sort: SortState | undefined): string {
  if (!sort) return "";
  const pills = SORTS.map((o) => {
    const on = o.key === sort.key;
    const dir = on ? (sort.dir === "asc" ? "desc" : "asc") : o.defaultDir;
    const arrow = on ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
    return `<a class="sortpill${on ? " on" : ""}" href="${esc(sort.base)}sort=${o.key}&amp;dir=${dir}"
      aria-pressed="${on}">${esc(o.label)}${arrow}</a>`;
  }).join("");
  return `<div class="sortbar"><span class="sortlabel">Sort</span>${pills}</div>`;
}

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
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, 1, 12)));
}

const CHIPS_PER_CELL = 5;

/**
 * Each category is a toggle, and doubles as the legend. The choice is
 * remembered, so the calendar and the day view open the way they were left.
 */
function categoryToggles(hide: string[], href: (hide: string) => string, attrs = "") {
  const toggles = CATEGORIES.map((c) => {
    const off = hide.includes(c.id);
    const next = off ? hide.filter((id) => id !== c.id) : [...hide, c.id];
    return `<a class="cattoggle${off ? " off" : ""}" style="--c:${c.color}" aria-pressed="${!off}"
      title="${off ? "Show" : "Hide"} ${esc(c.label)}" ${attrs}
      href="${href(next.join(","))}"><i></i>${esc(c.label)}</a>`;
  }).join("");
  const showAll = hide.length ? `<a class="cattoggle all" ${attrs} href="${href("")}">Show all</a>` : "";
  return { toggles, showAll };
}

/**
 * Which statuses a calendar view hides: "done" hides complete work, "open"
 * hides incomplete. Empty — both shown — is the default, and it lives in the
 * address rather than a cookie, so the calendar always opens showing both.
 */
export type StatusHide = Array<"open" | "done">;

/** The query every calendar link carries: its mode, and any status filter. */
function calQuery(mode: CalendarMode, st: StatusHide): string {
  return `?mode=${mode}${st.length ? `&amp;st=${st.join(",")}` : ""}`;
}

/** Complete / Incomplete, beside the category toggles and styled like them. */
function statusToggles(st: StatusHide, href: (st: string) => string, attrs = ""): string {
  const items: Array<{ id: "done" | "open"; label: string; colour: string }> = [
    { id: "done", label: "Complete", colour: "var(--gm)" },
    { id: "open", label: "Incomplete", colour: "#9A9AA3" },
  ];
  return `<span class="tsep" aria-hidden="true"></span>${items
    .map(({ id, label, colour }) => {
      const off = st.includes(id);
      const next = off ? st.filter((x) => x !== id) : [...st, id];
      return `<a class="cattoggle st${off ? " off" : ""}" style="--c:${colour}" aria-pressed="${!off}"
        title="${off ? "Show" : "Hide"} ${label.toLowerCase()} work" ${attrs}
        href="${href(next.join(","))}"><i></i>${label}</a>`;
    })
    .join("")}`;
}

/** Month · Week · Day, each opening on the same stretch of time. */
function viewTabs(active: "month" | "week" | "day", date: string, q: string, attrs = ""): string {
  const tab = (key: typeof active, href: string, label: string) =>
    `<a class="tab${active === key ? " on" : ""}" ${attrs} href="${href}${q}">${label}</a>`;
  return `<div class="tabs views">${tab("month", `/calendar/${date.slice(0, 7)}`, "Month")}${tab(
    "week",
    `/week/${date}`,
    "Week",
  )}${tab("day", `/day/${date}`, "Day")}</div>`;
}

/** The Sunday a week starts on — the month grid starts on Sunday too. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDay(date, -dow);
}

/** One day as a column of cards: the day view's strip and the week's grid. */
function dayColumn(
  d: string,
  list: StoredRecord[],
  mode: CalendarMode,
  q: string,
  cls: string,
): string {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
  return `<section class="daycol${cls}" data-date="${d}" data-pretty="${esc(`${weekday} ${usDate(d)}`)}">
    <header>
      <a class="dname" href="/day/${d}${q}" title="Open ${esc(weekday)} in the day view">
        <span class="wk">${esc(weekday)}</span>
        <span class="dt">${esc(usDate(d))}</span>
      </a>
      <span class="rel">${esc(relativeDay(d))}</span>
      <span class="cnt">${list.length}</span>
    </header>
    <div class="daybody">${
      list.map((r) => dayCard(r, mode)).join("") ||
      `<div class="dayempty">Nothing ${mode === "posting" ? "airing" : "due"}.</div>`
    }</div>
  </section>`;
}

/**
 * Drag a card onto another day's column. Saved at once, then the page
 * reloads — onto the same day, since the address follows the view.
 */
function columnDragScript(mode: CalendarMode): string {
  return `<script>
    (function () {
      var mode = ${JSON.stringify(mode)};
      var dragging = null;
      document.querySelectorAll(".dcard[draggable]").forEach(function (card) {
        card.addEventListener("dragstart", function (e) {
          dragging = card;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", card.dataset.id);
        });
        card.addEventListener("dragend", function () {
          card.classList.remove("dragging");
          dragging = null;
          document.querySelectorAll(".daycol.over").forEach(function (c) { c.classList.remove("over"); });
        });
      });
      document.querySelectorAll(".daycol[data-date]").forEach(function (col) {
        col.addEventListener("dragover", function (e) {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          col.classList.add("over");
        });
        col.addEventListener("dragleave", function (e) {
          if (!col.contains(e.relatedTarget)) col.classList.remove("over");
        });
        col.addEventListener("drop", function (e) {
          e.preventDefault();
          col.classList.remove("over");
          var card = dragging;
          if (!card || card.closest(".daycol") === col) return;
          var body = col.querySelector(".daybody");
          var empty = body.querySelector(".dayempty");
          if (empty) empty.remove();
          body.appendChild(card);
          card.classList.add("saving");
          fetch("/r/" + card.dataset.id + "/move", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
            body: new URLSearchParams({ date: col.dataset.date, mode: mode }),
          }).then(function (res) {
            if (!res.ok) alert("Couldn't move that — nothing was changed.");
            location.reload();
          }, function () {
            alert("Couldn't reach the board — nothing was changed.");
            location.reload();
          });
        });
      });
    })();
    </script>`;
}

export function renderCalendar(
  shell: Shell,
  ym: string,
  mode: CalendarMode,
  entries: CalendarEntry[],
  hide: string[] = [],
  st: StatusHide = [],
): string {
  const q = calQuery(mode, st);
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

      // Five fit a cell; the rest are one click away, in the day view, rather
      // than crushed into unreadable slivers. Each chip can be dragged to
      // another day.
      const chips = list
        .slice(0, CHIPS_PER_CELL)
        .map(
          (e) => `<a class="chip${e.record.status === "done" ? " done" : ""}" draggable="true" data-id="${e.record.id}"
            style="--c:${colourOf(e.record.category)};--ch:${channelColour(e.record.channel)}"
            href="/r/${e.record.id}" title="${esc(displayTitle(e.record))} — drag to move">
            <span class="dot"></span><span class="t">${esc(titleOnDay(e.record))}</span>
          </a>`,
        )
        .join("");

      const more =
        list.length > CHIPS_PER_CELL
          ? `<a class="more" href="/day/${day}${q}">+${list.length - CHIPS_PER_CELL} more</a>`
          : "";

      return `<div class="cell${outside ? " outside" : ""}${isToday ? " today" : ""}" data-date="${day}">
        <a class="num" href="/day/${day}${q}">${num}${
          isToday ? `<span class="tag">today</span>` : ""
        }</a>
        ${chips}${more}
      </div>`;
    })
    .join("");

  const heads = WEEKDAYS.map((d) => `<div class="wd">${d}</div>`).join("");

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" href="/calendar/${ym}${calQuery(value, st)}">${label}</a>`;

  const { toggles, showAll } = categoryToggles(hide, (h) => `/calendar/${ym}${q}&amp;hide=${h}`);
  const statuses = statusToggles(st, (x) => `/calendar/${ym}?mode=${mode}&amp;st=${x}`);
  const today0 = dateIn(ORG_TZ);
  const anchor = today0.startsWith(ym) ? today0 : `${ym}-01`;

  return layout(
    "Calendar",
    shell,
    `${pageHeader("Calendar")}
    <div class="calbar">
      <a class="nav" href="/calendar/${shiftMonth(ym, -1)}${q}" aria-label="Previous month">←</a>
      <span class="month">${esc(monthName(ym))}</span>
      <a class="nav" href="/calendar/${shiftMonth(ym, 1)}${q}" aria-label="Next month">→</a>
      <a class="nav today" href="/calendar${q}">Today</a>
      ${viewTabs("month", anchor, q)}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}
      <span class="draghint">Drag anything to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      }.</span>
    </div>
    <div class="cal">${heads}${cells}</div>
    ${
      entries.length
        ? ""
        : `<div class="empty" style="margin-top:16px">Nothing ${
            mode === "posting" ? "airing" : "due"
          } this month${hide.length || st.length ? " in what's shown" : ""}.</div>`
    }
    <script>
    // Drag a chip onto another day: it moves there at once, the change is
    // saved, and the page reloads so every count on it agrees.
    (function () {
      var mode = ${JSON.stringify(mode)};
      var dragging = null;
      document.querySelectorAll(".cal .chip[draggable]").forEach(function (chip) {
        chip.addEventListener("dragstart", function (e) {
          dragging = chip;
          chip.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", chip.dataset.id);
        });
        chip.addEventListener("dragend", function () {
          chip.classList.remove("dragging");
          dragging = null;
          document.querySelectorAll(".cal .cell.over").forEach(function (c) { c.classList.remove("over"); });
        });
      });
      document.querySelectorAll(".cal .cell[data-date]").forEach(function (cell) {
        cell.addEventListener("dragover", function (e) {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          cell.classList.add("over");
        });
        cell.addEventListener("dragleave", function (e) {
          if (!cell.contains(e.relatedTarget)) cell.classList.remove("over");
        });
        cell.addEventListener("drop", function (e) {
          e.preventDefault();
          cell.classList.remove("over");
          var chip = dragging;
          if (!chip) return;
          var from = chip.closest(".cell");
          if (from && from.dataset.date === cell.dataset.date) return;
          cell.insertBefore(chip, cell.querySelector(".more"));
          chip.classList.add("saving");
          fetch("/r/" + chip.dataset.id + "/move", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
            body: new URLSearchParams({ date: cell.dataset.date, mode: mode }),
          }).then(function (res) {
            if (!res.ok) alert("Couldn't move that — nothing was changed.");
            location.reload();
          }, function () {
            alert("Couldn't reach the board — nothing was changed.");
            location.reload();
          });
        });
      });
    })();
    </script>`,
  );
}

/** How far either side of the clicked day the day view reaches. */
export const DAY_SPAN = 21;

/**
 * One day, and the days either side of it, as columns you scroll through
 * sideways. The clicked day is centred on arrival; scrolling moves the
 * address with you, so a reload, a ✓ or a shared link lands where you were.
 */
export function renderDay(
  shell: Shell,
  date: string,
  mode: CalendarMode,
  days: Array<{ date: string; list: StoredRecord[] }>,
  hide: string[] = [],
  st: StatusHide = [],
): string {
  const q = calQuery(mode, st);
  const today = dateIn(ORG_TZ);
  const first = days[0]?.date ?? date;
  const last = days[days.length - 1]?.date ?? date;

  const columns = days
    .map(({ date: d, list }) =>
      dayColumn(d, list, mode, q, `${d === today ? " today" : ""}${d === date ? " focus" : ""}`),
    )
    .join("");

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" data-dayhref href="/day/${date}${calQuery(value, st)}">${label}</a>`;
  const { toggles, showAll } = categoryToggles(
    hide,
    (h) => `/day/${date}${q}&amp;hide=${h}`,
    "data-dayhref",
  );
  const statuses = statusToggles(st, (x) => `/day/${date}?mode=${mode}&amp;st=${x}`, "data-dayhref");

  return layout(
    usDate(date),
    shell,
    `${pageHeader("Days")}
    <div class="calbar">
      <button class="nav" type="button" data-step="-1" aria-label="Previous day">←</button>
      <span class="month" id="dayname">${esc(
        new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)),
      )} ${esc(usDate(date))}</span>
      <button class="nav" type="button" data-step="1" aria-label="Next day">→</button>
      <a class="nav" href="/day/${today}${q}">Today</a>
      ${viewTabs("day", date, q, "data-dayhref")}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}
      <span class="draghint">Scroll sideways, or ← → keys. Drag a card to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      }.</span>
    </div>
    <div class="daystrip" id="daystrip">
      <a class="dayedge" href="/day/${shiftDay(first, -1)}${q}">← Earlier</a>
      ${columns}
      <a class="dayedge" href="/day/${shiftDay(last, 1)}${q}">Later →</a>
    </div>
    <script>
    (function () {
      var mode = ${JSON.stringify(mode)};
      var strip = document.getElementById("daystrip");
      var cols = Array.prototype.slice.call(strip.querySelectorAll(".daycol"));
      var focus = strip.querySelector(".daycol.focus") || cols[0];

      function centre(col, smooth) {
        var left = col.offsetLeft - (strip.clientWidth - col.offsetWidth) / 2;
        strip.scrollTo({ left: left, behavior: smooth ? "smooth" : "auto" });
      }

      // Whichever column sits in the middle is "the day": it names the page,
      // and the address follows it.
      function settle() {
        var mid = strip.scrollLeft + strip.clientWidth / 2, best = focus, gap = Infinity;
        cols.forEach(function (c) {
          var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < gap) { gap = d; best = c; }
        });
        if (best !== focus) setFocus(best);
      }

      function setFocus(col) {
        focus.classList.remove("focus");
        col.classList.add("focus");
        focus = col;
        var d = col.dataset.date;
        document.getElementById("dayname").textContent = col.dataset.pretty;
        document.querySelectorAll("[data-dayhref]").forEach(function (a) {
          a.href = a.getAttribute("href")
            .replace(new RegExp("/(day|week)/[0-9]{4}-[0-9]{2}-[0-9]{2}"), "/$1/" + d)
            .replace(new RegExp("/calendar/[0-9]{4}-[0-9]{2}"), "/calendar/" + d.slice(0, 7));
        });
        try { history.replaceState(null, "", "/day/" + d + location.search); } catch (e) {}
      }

      centre(focus, false);
      var timer;
      strip.addEventListener("scroll", function () {
        clearTimeout(timer);
        timer = setTimeout(settle, 90);
      }, { passive: true });

      function step(by) {
        var i = cols.indexOf(focus) + by;
        if (i < 0 || i >= cols.length) {
          var edge = strip.querySelectorAll(".dayedge")[by < 0 ? 0 : 1];
          if (edge) location.href = edge.href;
          return;
        }
        setFocus(cols[i]);
        centre(focus, true);
      }
      document.querySelectorAll("[data-step]").forEach(function (b) {
        b.addEventListener("click", function () { step(Number(b.dataset.step)); });
      });
      document.addEventListener("keydown", function (e) {
        var t = e.target && e.target.tagName;
        if (t === "INPUT" || t === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      });

    })();
    </script>
    ${columnDragScript(mode)}`,
  );
}

/** Seven days, Sunday to Saturday, every item as a card you can drag. */
export function renderWeek(
  shell: Shell,
  start: string,
  mode: CalendarMode,
  days: Array<{ date: string; list: StoredRecord[] }>,
  hide: string[] = [],
  st: StatusHide = [],
): string {
  const q = calQuery(mode, st);
  const today = dateIn(ORG_TZ);
  const end = shiftDay(start, 6);
  const anchor = today >= start && today <= end ? today : start;

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" href="/week/${start}${calQuery(value, st)}">${label}</a>`;
  const { toggles, showAll } = categoryToggles(hide, (h) => `/week/${start}${q}&amp;hide=${h}`);
  const statuses = statusToggles(st, (x) => `/week/${start}?mode=${mode}&amp;st=${x}`);
  const total = days.reduce((n, d) => n + d.list.length, 0);

  return layout(
    `Week of ${usDate(start)}`,
    shell,
    `${pageHeader("Week")}
    <div class="calbar">
      <a class="nav" href="/week/${shiftDay(start, -7)}${q}" aria-label="Previous week">←</a>
      <span class="month">${esc(usDate(start))} – ${esc(usDate(end))}</span>
      <a class="nav" href="/week/${shiftDay(start, 7)}${q}" aria-label="Next week">→</a>
      <a class="nav" href="/week/${today}${q}">This week</a>
      ${viewTabs("week", anchor, q)}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}
      <span class="draghint">${total} this week · drag a card to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      }.</span>
    </div>
    <div class="weekgrid">${days
      .map(({ date: d, list }) => dayColumn(d, list, mode, q, d === today ? " today" : ""))
      .join("")}</div>
    ${columnDragScript(mode)}`,
  );
}

/** A record as a card in a day column: what it is, whose it is, when, and ✓ ×. */
function dayCard(r: StoredRecord, mode: CalendarMode): string {
  const ch = r.channel ? channelColour(r.channel) : null;
  const at = mode === "deadlines" ? r.voDue ?? r.deadline ?? r.scriptDue : r.voDue;
  const label = r.voDue ? "VO" : r.deadline ? "due" : "script";
  const over = at && r.status === "open" && at.getTime() < Date.now();

  const bits: string[] = [];
  if (r.stage) bits.push(esc(r.stage));
  if (r.version) bits.push(`v${r.version}`);
  if (r.batchTarget && r.batchTarget > 1) {
    bits.push(`${r.status === "done" ? r.batchTarget : r.batchDone}/${r.batchTarget}`);
  }

  return `<article class="dcard${r.status === "done" ? " cleared" : ""}${r.pinnedAt ? " pinned" : ""}" draggable="true" data-id="${r.id}"
      style="--c:${colourOf(r.category)}">
    <div class="top">
      <span class="swatch" title="${esc(LABELS[r.category] ?? "unsorted")}"></span>
      ${r.code ? `<span class="code">${esc(r.code)}</span>` : ""}
      ${bits.length ? `<span class="bits">${bits.join(" · ")}</span>` : ""}
      ${pinControl(r)}
    </div>
    <a class="t" href="/r/${r.id}">${
      r.batchNo && ch ? `<i class="chdot" style="--ch:${ch}"></i>` : ""
    }${esc(titleOnDay(r))}</a>
    ${
      r.batchNo
        ? ""
        : r.channel && ch
        ? `<a class="chan" style="--ch:${ch};--ink:${channelInk(ch)}" href="/channel/${encodeURIComponent(r.channel)}"><i></i>${esc(r.channel)}</a>`
        : `<span class="pill">${esc(LABELS[r.category] ?? "unsorted")}</span>`
    }
    <div class="foot">
      <span class="at${over ? " over" : ""}">${
        at ? `${esc(label)} ${esc(renderIn(at, ORG_TZ, "ET"))}` : mode === "posting" ? "airs this day" : ""
      }</span>
      ${actions(r)}
    </div>
  </article>`;
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
  today: { date: string; rows: Array<{ channel: string; total: number; done: number; removed: number }> },
  ahead: { date: string; rows: Array<{ channel: string; total: number; done: number; removed: number }> },
  list: StoredRecord[],
): string {
  const categoryOf = (channel: string) => CHANNELS.find((ch) => ch.name === channel)?.category ?? "bits";

  const line = (
    r: { channel: string; total: number; done: number; removed?: number },
    date?: string,
  ) => {
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    const state =
      r.total === 0 ? (r.removed ? "removed" : "not open") : r.done === r.total ? "cleared" : `${r.done}/${r.total}`;
    const clearAll =
      date && r.total > r.done
        ? `<form class="tick" method="post" action="/recurring/clear">
             <input type="hidden" name="channel" value="${esc(r.channel)}">
             <input type="hidden" name="date" value="${esc(date)}">
             <button aria-label="Clear ${esc(r.channel)}" title="Clear the whole day">✓</button>
           </form>`
        : `<span class="tick-space"></span>`;

    // One segment per upload — five, three, or a single one — so every row
    // reads the same way. Tapping the third marks three done; tapping the
    // last filled one again steps back one, so a mis-tap is one more tap.
    const progress =
      date && r.total > 0
        ? `<span class="pips" role="group" aria-label="${esc(r.channel)} uploads done">${Array.from(
            { length: r.total },
            (_, i) => {
              const n = i + 1;
              const filled = n <= r.done;
              const target = n === r.done ? n - 1 : n;
              return `<form method="post" action="/recurring/progress">
                <input type="hidden" name="channel" value="${esc(r.channel)}">
                <input type="hidden" name="date" value="${esc(date)}">
                <input type="hidden" name="done" value="${target}">
                <button class="pip${filled ? " on" : ""}"
                  aria-label="${n === r.done ? `Undo — back to ${n - 1} of ${r.total}` : `${n} of ${r.total} done`}"
                  title="${n === r.done ? `Back to ${n - 1}` : `${n} of ${r.total} done`}"></button>
              </form>`;
            },
          ).join("")}</span>`
        : `<span class="bar"><span style="width:${pct}%"></span></span>`;

    return `<div class="batch${r.total && r.done === r.total ? " done" : ""}" style="--c:${colourOf(categoryOf(r.channel))};--ch:${channelColour(r.channel)}">
      <a class="who" href="/channel/${encodeURIComponent(r.channel)}">
        <span class="dot"></span><span class="name">${esc(r.channel)}</span>
      </a>
      ${progress}
      <span class="state">${esc(state)}</span>
      ${clearAll}
    </div>`;
  };

  const pretty = (d: string) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  const aheadOpen = ahead.rows.some((r) => r.total > 0);

  // One labelled block per recurring category — Reading, then Bits — so a
  // dozen lines read as two short lists rather than one long one.
  type Row_ = { channel: string; total: number; done: number; removed: number };
  const sections = (list_: Row_[], date: string) =>
    CATEGORIES.filter((cat) => list_.some((r) => categoryOf(r.channel) === cat.id))
      .map((cat) => {
        const mine = list_.filter((r) => categoryOf(r.channel) === cat.id);
        const done = mine.reduce((n, r) => n + r.done, 0);
        const total = mine.reduce((n, r) => n + r.total, 0);
        const unit = mine.some((r) => (CHANNELS.find((ch) => ch.name === r.channel)?.recurring?.units ?? 1) > 1)
          ? "uploads"
          : "cleared";
        return `<div class="batch-group" style="--c:${cat.color}">
          <div class="batch-head"><span class="dot"></span>${esc(cat.label)}
            <span class="n">${done}/${total} ${unit}</span></div>
          <div class="batches">${mine.map((r) => line(r, date)).join("")}</div>
        </div>`;
      })
      .join("");

  return layout(
    "Recurring",
    shell,
    `${pageHeader("Recurring")}
    <div class="panel" style="margin-bottom:14px">
      <h2>Today · ${esc(pretty(today.date))}</h2>
      ${sections(today.rows, today.date)}
    </div>

    <div class="panel" style="margin-bottom:14px">
      <h2>Tomorrow · ${esc(pretty(ahead.date))}</h2>
      ${
        aheadOpen
          ? `${sections(ahead.rows, ahead.date)}
             <p class="hint">Already open. Clear anything you get ahead on and it stays cleared —
             the morning run finds these and leaves them alone.</p>`
          : `<p class="hint">Not open yet. They open by themselves in the morning.</p>
             <form method="post" action="/recurring/ahead">
               <button class="clear">Work ahead — open tomorrow now</button>
             </form>`
      }
    </div>

    <div class="group">
      <div class="head" style="--c:${colourOf("reading")}">
        <span class="dot"></span><span class="name">Today's batches</span>
        <span class="sub">${esc(pretty(today.date))}</span>
        <span class="n">${list.length}</span>
      </div>
      ${rows(list, "Nothing open yet today.")}
    </div>`,
  );
}
