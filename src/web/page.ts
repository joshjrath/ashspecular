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
import { CATEGORIES, CHANNELS, channelInk, contrastRatio, isLongFormRecurring, type CategoryId } from "../catalog.js";
import { ORG_TZ, REVIEW_HOURS, TEAM_TZ, VO_BUFFER_DAYS, dateIn, daysUntil, relativeDay, renderIn, shortsDay, usDate } from "../parse/derive.js";
import type { ScriptReport, ScriptRow, ScriptStatus } from "./scriptcheck.js";
import type { ChannelLink, Upload } from "../jobs/youtube.js";
import { STORIES_EVERY_DAYS, addDays, dayOf, daysBetween, type ChannelCadence, type PaceState } from "./cadence.js";
import { compactViews, formatMultiple, type Performance } from "./performance.js";
import { UPLOAD_CATEGORIES, UPLOAD_TARGETS, describeTarget, everyFor, formatFor } from "./targets.js";
import type { DailyCadence } from "./cadence.js";
import type { ChannelShortHealth, ShortScore, ShortTier, SlotStat } from "./shorts-perf.js";
import type { FeatureStat, IdeaAnalysis, IdeaCheck, IdeaVideo, Suggestion } from "./ideas.js";
import type { Blueprint, PlannedPart } from "./stories/blueprint.js";
import type { LabIdea, Contrast, PublicVideo, ScriptResult } from "./stories/lab.js";
import { DICE_LABELS, type DiceKind, type Shape } from "./stories/dice.js";
import type { DiceCard } from "./stories/roll.js";
import type { DraftCheck } from "./stories/check.js";
import { corpus, learnsFrom, splitScript, type Norms } from "./stories/corpus.js";
import { formatOfTitle } from "./stories/formats.js";
import type { StoredScript } from "../db/scripts.js";
import type { Release } from "./changelog.js";
import type { UploadGap } from "./gaps.js";
import type { Card as IdeaCard, IdeaMark, Neighbour } from "./stories/writenext.js";
import { FORMAT_BY_ID, type Format } from "./stories/formats.js";
import { HEROES, POWERS, WORLDS, type Hero, type World } from "./stories/lore.js";
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
aside .settings-link { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 14px; border-radius: 14px;
  font-size: 12.5px; color: #9A9AA3; }
aside .settings-link svg { width: 15px; height: 15px; flex: none; }
aside .settings-link:hover, aside .settings-link.on { color: #fff; background: #222225; }
.settings { display: grid; gap: 14px; max-width: 980px; }
.setgroup h2 { margin: 0 0 4px; }
.setgroup .sub { color: var(--dim); font-weight: 500; font-size: 13px; font-family: var(--ui); letter-spacing: 0; }
.setgroup p.hint { margin: 10px 0 0; }
.setcols { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 18px; margin-top: 12px; }
.setcols fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.setcols legend { padding: 0 10px 6px; color: var(--ink3); font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.setcols label, .setrow label { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 10px;
  color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; }
.setcols label:hover, .setrow label:hover { background: var(--sunk); }
.setcols input, .setrow input { width: 17px; height: 17px; margin: 0; accent-color: var(--yellow); flex: none; }
.setcols i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); flex: none; }
.setrow { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 10px; }
.setsave { display: flex; align-items: center; gap: 14px; }
.setsave .saved { color: #7EE2B8; font-weight: 700; font-size: 13.5px; }
.settings .offstrip { margin: 12px 0 0; padding: 0; background: none; }
.settings .offstrip .lbl { display: none; }
.colgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px 22px; margin: 12px 0 16px; }
.colgrid fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.colgrid legend { display: flex; align-items: center; gap: 8px; padding: 0 6px 6px; color: var(--ink3); font-size: 11px;
  font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.colgrid legend i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.colrow { display: grid; grid-template-columns: 34px minmax(0, 1fr); column-gap: 10px; align-items: center; padding: 6px;
  border-radius: 10px; }
.colrow:hover { background: var(--sunk); }
.colrow input[type=color] { grid-row: span 2; width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%;
  background: none; cursor: pointer; }
.colrow input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
.colrow input[type=color]::-webkit-color-swatch { border: 1px solid rgba(255,255,255,.28); border-radius: 50%; }
.colrow input[type=color]::-moz-color-swatch { border: 1px solid rgba(255,255,255,.28); border-radius: 50%; }
.colrow .nm { font-weight: 700; font-size: 13.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.colrow .src { color: var(--ink3); font-size: 12px; }
.colrow .src a { color: #9FDDF4; }
.linkbtn { border: 0; background: none; padding: 0; margin-left: 4px; color: #9FDDF4; font: inherit; cursor: pointer; text-decoration: underline; }
.dicebar { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; margin: 10px 0 14px; }
.dgroups { display: flex; gap: 6px; flex-wrap: wrap; }
.dgroups a, .dgroups .none { padding: 7px 12px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 12.5px; font-weight: 600; }
.dgroups a:hover { color: #fff; background: #26262C; }
.dgroups a.on { background: var(--yellow); color: #101012; }
.dgroups small { color: var(--ink3); font-weight: 700; margin-left: 3px; }
.dgroups a.on small { color: #3A3A20; }
.dgroups .none { opacity: .55; }
.dicecard { background: var(--sunk); border-radius: 16px; padding: 16px 18px 18px; margin-bottom: 12px; }
.dchead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.dchead h3 { margin: 0; font-family: var(--display); font-size: 24px; letter-spacing: -0.03em; }
.dcgroup { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #F8E27A; }
.dcfrom { color: var(--ink3); font-size: 13px; }
.dcfacts { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 6px 14px; margin: 0 0 12px; font-size: 13px; }
.dcfacts dt { color: var(--ink3); font-weight: 700; }
.dcfacts dd { margin: 0; color: var(--ink2); line-height: 1.5; }
.dicecard h4 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); margin: 6px 0 8px; }
.dcopens { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.dcopens a { display: flex; gap: 10px; align-items: baseline; padding: 6px 8px; border-radius: 8px; font-weight: 700; font-size: 14px; }
.dcopens a:hover { background: #26262C; }
.dcopens .ikind { min-width: 150px; }
.dcacts { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.dcacts form { margin: 0; }
.dcsaved { margin: 0 0 8px; }
.dcadded h4 { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); margin: 14px 0 8px; }
.dcadded { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dcadded h4 { flex-basis: 100%; }
.dcchip { display: inline-flex; align-items: center; gap: 6px; margin: 0; padding: 4px 4px 4px 12px; border-radius: 999px; background: var(--sunk); font-size: 13px; font-weight: 600; }
.dcchip small { color: var(--ink3); font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: .08em; margin-right: 2px; }
.dcchip button { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--ink3); cursor: pointer; font-size: 15px; }
.dcchip button:hover { background: #2E2E35; color: #fff; }
@media (max-width: 760px) {
  .dcfacts { grid-template-columns: minmax(0, 1fr); }
  .dcfacts dt { margin-top: 4px; }
  .dcopens a { flex-direction: column; gap: 2px; }
}
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
.rows { background: var(--card); border-radius: var(--r); padding: 6px; display: flex; flex-direction: column; gap: 2px; }
/* Two tight lines and a pill: title over whose-and-when, deadline at the right. */
.row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center;
  gap: 4px 14px; padding: 10px 12px 10px 14px; border-radius: 14px; color: var(--ink);
}
.row:hover { background: var(--sunk); }
.row .title {
  grid-column: 1; font-family: var(--display); font-weight: 600; font-size: 15px; letter-spacing: -0.022em;
  display: flex; align-items: center; gap: 9px; min-width: 0; line-height: 1.3;
}
.row .title a { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .title a:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.row .title .swatch { width: 10px; height: 10px; border-radius: 3px; background: var(--c); flex: none; }
.row .meta {
  grid-column: 1; color: var(--ink3); font-size: 12px; display: flex; gap: 4px 12px;
  flex-wrap: wrap; align-items: center; padding-left: 19px; min-width: 0;
}
.row .meta .code { color: var(--ink2); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.row .meta .chan { color: var(--ink, var(--ch)); font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
/* Every dot is the channel's exact colour. The hairline ring keeps a pale one
   (FNAF's yellow) visible and a dark one (Verse's navy) against the dark. */
.row .meta .chan i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); display: block;
  box-shadow: 0 0 0 1px var(--ring); }
.row .meta .lnk {
  padding: 1px 8px; border-radius: 6px; background: var(--sunk); color: var(--ink2); font-weight: 600;
  font-size: 11.5px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row:hover .meta .lnk { background: var(--raised); }
.row .meta .lnk.frameio { background: rgba(91,108,240,.2); color: #B5BEF7; }
.row .meta .lnk:hover { color: var(--ink); }
.row .due {
  grid-column: 2; grid-row: 1 / span 2; display: inline-flex; align-items: baseline; gap: 6px;
  padding: 6px 11px; border-radius: 10px; background: var(--sunk); color: var(--ink2);
  font-size: 12.5px; white-space: nowrap; font-variant-numeric: tabular-nums;
}
.row:hover .due { background: var(--raised); }
.row .due b { color: var(--ink); font-weight: 700; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
.row .due .tm { color: var(--ink3); }
.row .due em { font-style: normal; font-weight: 700; }
.row .due.late { background: rgba(242,104,94,.13); color: #F6B1AB; }
.row .due.late b, .row .due.late em { color: #FF8F86; }
.row .due.late .tm { color: #D99D98; }
.row .due.soon { background: rgba(238,154,85,.13); color: #F4C9A4; }
.row .due.soon b, .row .due.soon em { color: #F8B377; }
.row .due.soon .tm { color: #D9AE8B; }
.row .due.none { color: var(--ink3); background: transparent; font-size: 12px; }
.row .acts { grid-column: 3; grid-row: 1 / span 2; }
.row .tick button { width: 28px; height: 28px; font-size: 12px; }
.airs.soon { color: var(--warn); font-weight: 650; }
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
button.clear, a.clear {
  display: inline-block;
  background: var(--salmon); border: 0; color: #101012; font-family: var(--ui);
  border-radius: 999px; padding: 11px 22px; font-size: 13px; cursor: pointer; font-weight: 700;
}
button.clear:hover, a.clear:hover { filter: brightness(1.05); }
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
/* A day off: striped, with its moon always showing; other days show theirs on hover. */
.cal .cell { position: relative; }
.cal .cell.off { background: repeating-linear-gradient(135deg, rgba(42,169,216,.13) 0 9px, rgba(42,169,216,.04) 9px 18px), var(--sunk); }
.cal .cell.today.off { background: repeating-linear-gradient(135deg, rgba(0,0,0,.08) 0 9px, transparent 9px 18px), var(--salmon); }
.offbtn { margin: 0; }
.cal .offbtn { position: absolute; top: 9px; right: 9px; }
.offbtn button { display: inline-flex; align-items: center; gap: 5px; height: 26px; min-width: 26px; padding: 0 6px;
  border: 0; border-radius: 999px; background: transparent; color: var(--ink3); cursor: pointer;
  font: 700 10.5px/1 var(--ui); letter-spacing: .06em; text-transform: uppercase; opacity: 0; transition: opacity .12s ease; }
.offbtn button svg { width: 14px; height: 14px; flex: none; }
.cal .cell:hover .offbtn button, .daycol:hover .offbtn button, .offbtn button:focus-visible { opacity: 1; }
.offbtn button:hover { background: rgba(42,169,216,.18); color: #9FDDF4; }
.offbtn.on button { opacity: 1; background: rgba(42,169,216,.2); color: #9FDDF4; padding: 0 9px 0 7px; }
.cal .cell.today .offbtn button { color: #3A2A28; }
.cal .cell.today .offbtn.on button { background: rgba(0,0,0,.12); color: #101012; }
@media (hover: none) { .offbtn button { opacity: .6; } }
.daycol.off { background: repeating-linear-gradient(135deg, rgba(42,169,216,.1) 0 9px, transparent 9px 18px), var(--card); }
.daycol.today .offbtn button { color: #3A2A28; }
.off-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px 1px 6px; border-radius: 6px;
  background: rgba(42,169,216,.16); color: #A8E0F5; font-weight: 700; font-size: 11px; white-space: nowrap; }
.off-tag svg { width: 11px; height: 11px; }
.gapstrip { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; margin: 0 0 14px; padding: 12px 16px;
  border-radius: 16px; background: rgba(226,87,76,.10); box-shadow: inset 0 0 0 1.5px rgba(226,87,76,.45); }
.gapstrip .lbl { display: inline-flex; align-items: center; gap: 7px; font-family: var(--display); font-weight: 700; color: #FFB1AA; }
.gapstrip .lbl svg { width: 17px; height: 17px; }
.gapstrip .gapn { background: #E2574C; color: #1B0806; border-radius: 999px; padding: 0 8px; font-size: 12px; }
.gapstrip .gapsub { color: var(--ink3); font-size: 12px; }
.gapchips { display: flex; flex-wrap: wrap; gap: 6px; flex-basis: 100%; }
.gapchip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: var(--sunk);
  border: 1px dashed rgba(226,87,76,.6); font-size: 12.5px; color: var(--ink2); }
.gapchip i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); }
.gapchip b { color: var(--ink); }
.gapchip span { color: var(--ink3); }
.gapchip.soon { border-style: solid; background: rgba(226,87,76,.16); }
.gapchip.soon .first { color: #FF9C94; font-weight: 700; }
.gapchip:hover { background: var(--line); }
.cal .gapslot, .gapcard { display: flex; align-items: center; gap: 6px; border: 1px dashed rgba(226,87,76,.65); border-radius: 8px;
  color: #FFB1AA; font-size: 11.5px; font-weight: 600; padding: 2px 7px; background: rgba(226,87,76,.07); }
.cal .gapslot i, .gapcard i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); flex: none; }
.cal .gapslot .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gapbadge { margin-left: 6px; background: #E2574C; color: #1B0806; border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 800; }
.gapcard { padding: 7px 10px; border-radius: 12px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.gapcard i { display: inline-block; margin-right: 6px; vertical-align: 1px; }
.offstrip { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; margin: 0 0 14px;
  padding: 10px 12px 10px 16px; border-radius: 18px; background: var(--card); color: var(--ink); font-size: 13px; }
.offstrip.today { box-shadow: inset 0 0 0 1.5px rgba(42,169,216,.55); }
.offstrip .lbl { display: inline-flex; align-items: center; gap: 7px; font-family: var(--display); font-weight: 700;
  font-size: 15px; color: #9FDDF4; }
.offstrip .lbl svg { width: 16px; height: 16px; }
.offstrip .none { color: var(--ink3); }
.offstrip ul { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; flex: 1; min-width: 0; }
.offday { display: flex; align-items: center; gap: 8px; padding: 5px 5px 5px 12px; border-radius: 12px;
  background: rgba(42,169,216,.1); min-width: 0; }
.offday.now { background: rgba(42,169,216,.22); }
.offday b { white-space: nowrap; }
.offday span { color: var(--ink2); min-width: 0; }
.offday form, .offadd { margin: 0; }
.offday .x { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--ink3);
  cursor: pointer; font-size: 16px; line-height: 1; }
.offday .x:hover { background: rgba(255,255,255,.1); color: #fff; }
.offadd { display: flex; gap: 6px; margin-left: auto; }
.offadd input { height: 32px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--sunk);
  color: var(--ink); font: inherit; color-scheme: dark; }
.offadd button { height: 32px; padding: 0 14px; border: 0; border-radius: 10px; background: #2AA9D8; color: #06141A;
  font: inherit; font-weight: 800; cursor: pointer; }
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
.mtoast { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 60;
  display: flex; align-items: center; gap: 12px; width: max-content; max-width: min(680px, calc(100vw - 32px));
  padding: 12px 12px 12px 18px; border-radius: 16px; background: #2A2A31; border: 1px solid #3A3A43;
  box-shadow: 0 14px 40px rgba(0,0,0,.55); color: #F2F2F5; font-size: 13.5px; line-height: 1.4; }
.mtoast span { flex: 1; min-width: 0; }
.mtoast small { display: block; color: #A9A9B3; font-size: 12px; margin-top: 2px; }
.mtoast .undo, .mtoast form button { flex: none; border: 0; border-radius: 999px; padding: 8px 16px; background: #F2E86D;
  color: #111; font: inherit; font-weight: 800; cursor: pointer; }
.mtoast .undo:disabled { opacity: .6; cursor: default; }
.mtoast .x { flex: none; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: #C9C9D1;
  font-size: 18px; line-height: 1; cursor: pointer; text-decoration: none; display: grid; place-items: center; }
.mtoast .x:hover { background: #3A3A43; color: #fff; }
.mtoast form { margin: 0; flex: none; }
.restbox { display: flex; align-items: center; gap: 8px; flex-basis: 100%; color: var(--ink2); font-size: 13px; cursor: pointer; }
.restbox input { width: 16px; height: 16px; accent-color: #F2E86D; }
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
.weekgrid.span4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.chanpick { position: relative; }
.chanpick summary { list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-radius: 999px; background: var(--rail); color: #D8D8DE; font-size: 13px; font-weight: 600; }
.chanpick summary::-webkit-details-marker { display: none; }
.chanpick summary::after { content: "▾"; color: var(--ink3); font-size: 11px; }
.chanpick summary b { background: var(--yellow); color: #101012; border-radius: 999px; padding: 1px 8px; font-size: 11.5px; }
.chanpick[open] summary { background: #26262A; color: #fff; }
.chanmenu { position: absolute; left: 0; top: calc(100% + 8px); z-index: 30; width: min(640px, calc(100vw - 32px)); max-height: min(560px, 70vh);
  overflow: auto; padding: 10px 12px 12px; background: var(--card); border-radius: 16px;
  box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 1px #2E2E35; }
.chanbtns { display: flex; gap: 6px; position: sticky; top: -10px; background: var(--card); padding: 4px 0 8px; z-index: 1; }
.chanbtns button, .chcat button { border: 0; border-radius: 999px; background: var(--sunk); color: var(--ink2); font: inherit;
  font-size: 12px; font-weight: 700; padding: 6px 12px; cursor: pointer; }
.chanbtns button:hover, .chcat button:hover { color: #fff; background: #2E2E35; }
.chanbtns .go { margin-left: auto; background: var(--yellow); color: #101012; }
.chanbtns .go:hover { background: #FFF38A; color: #101012; }
.chgroups { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; }
.chgroup { min-width: 0; }
.chcat { display: flex; align-items: center; gap: 7px; padding: 6px 4px 4px; color: var(--ink3); font-size: 11px; font-weight: 700;
  letter-spacing: .1em; text-transform: uppercase; }
.chcat i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
.chcat button { margin-left: auto; padding: 2px 8px; font-size: 10.5px; letter-spacing: 0; text-transform: none; }
.chgroup label { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 8px; font-size: 13px; font-weight: 600;
  color: var(--ink); cursor: pointer; }
.chgroup label:hover { background: var(--sunk); }
.chgroup input { width: 15px; height: 15px; margin: 0; accent-color: var(--yellow); flex: none; }
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
  .weekgrid.span4 { grid-template-columns: repeat(4, minmax(200px, 1fr)); }
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
.notice .ico, .release .ico {
  width: 34px; height: 34px; border-radius: 11px; flex: none; display: grid; place-items: center;
  color: #fff; background: var(--nc);
}
.notice .ico svg, .release .ico svg { width: 19px; height: 19px; }
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

.acts { display: grid; grid-template-columns: repeat(2, auto); gap: 5px 6px; align-items: center; justify-content: end; flex: none; }
.tick svg { width: 12px; height: 12px; display: block; margin: auto; }
.tick.pause button:hover { border-color: #8D9BF2; color: #8D9BF2; }
.tick.resume button, .tick.resume button.on { background: transparent; border-color: #8D9BF2; color: #8D9BF2; }
.tick.noscript button:hover { border-color: #E24FCB; color: #F7A6E9; }
.tick.noscript button.on { background: #E24FCB; border-color: #E24FCB; color: #1E0C1B; }
/* No script: the whole card turns magenta, so a card waiting on its script
   reads at a glance — a colour no other state uses (pinned is yellow, late
   red, due-soon orange, cleared green, Frame.io blue). */
.revpanel { margin: 14px 0 0; padding: 18px 20px 16px; }
.revpanel .revhead { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.revpanel h2 { display: inline-flex; align-items: center; gap: 8px; margin: 0; }
.revpanel h2 svg { width: 13px; height: 13px; color: #8E9BF7; }
.revpanel .sub { color: var(--ink3); font-size: 12.5px; }
.revpanel .sub .late { color: #FF9C94; }
.revpanel .seeall { margin-left: auto; padding: 0; }
.revpanel .rows { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 6px 12px; }
/* Each cell is its own container, so a card stacks like the columns' do. */
.revcell { container-type: inline-size; min-width: 0; }
@media (max-width: 760px) { .revpanel .rows { grid-template-columns: minmax(0, 1fr); } }
.row.revision { background: rgba(91,108,240,.09); box-shadow: inset 3px 0 0 #7D8AF5; }
.row.revision:hover { background: rgba(91,108,240,.14); }
.rev-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px 1px 6px; border-radius: 6px;
  background: rgba(91,108,240,.24); color: #C9CFFB; font-weight: 700; font-size: 11px; white-space: nowrap; }
.rev-tag svg { width: 9px; height: 9px; }
.row.revision .meta .lnk.frameio { background: #5B6CF0; color: #fff; }
.row.revision .meta .lnk.frameio:hover { background: #6E7DF5; }
.dcard.revision { box-shadow: inset 3px 0 0 #7D8AF5; }
.row.noscript { background: rgba(226,79,203,.10); box-shadow: inset 3px 0 0 #E24FCB; }
.row.noscript:hover { background: rgba(226,79,203,.15); }
.noscript-tag { padding: 1px 8px; border-radius: 6px; background: rgba(226,79,203,.2); color: #F7B8EC; font-weight: 700; font-size: 11px; }
.dcard.noscript { background: #2B1A28; box-shadow: inset 0 0 0 1.5px #E24FCB; }
.chip.noscript { box-shadow: inset 3px 0 0 #E24FCB; }
/* Uploaded: live on the channel — solid green, the one state that's finished for good. */
.tick.uploaded button:hover { border-color: #3CCB84; color: #7BE3AE; }
.tick.uploaded button.on { background: #2FB673; border-color: #2FB673; color: #06170E; }
.cal .chip.uploaded { background: #1E7A4C; box-shadow: inset 3px 0 0 #3CCB84; }
.cal .chip.uploaded .t, .cal .cell.today .chip.uploaded .t { color: #E6FFF1; text-decoration: none; }
.dcard.uploaded { background: #133524; box-shadow: inset 0 0 0 1.5px #2FB673; }
.dcard.uploaded .t, .dcard.uploaded .at { color: #CFF5E0; text-decoration: none; }
.uploadbtn svg { width: 12px; height: 12px; vertical-align: -1px; }
.uploadbtn.on { background: #2FB673 !important; color: #06170E !important; }
.row.uploaded { background: rgba(47,182,115,.10); box-shadow: inset 3px 0 0 #2FB673; }
.uploaded-tag { padding: 1px 8px; border-radius: 6px; background: rgba(47,182,115,.22); color: #9BEBC2; font-weight: 700; font-size: 11px; }
.paused-tag { padding: 1px 8px; border-radius: 6px; background: rgba(141,155,242,.18); color: #C3CAF8; font-weight: 700; font-size: 11px; }
.row.paused .title a { color: var(--ink2); }
.row .due.paused { background: rgba(141,155,242,.12); color: #B8C1F7; }
.row .due.paused b { color: #C3CAF8; }
.recacts2 { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 0; }
.pausebtn svg, .noscriptbtn svg { width: 12px; height: 12px; vertical-align: -1px; margin-right: 4px; }
.noscriptbtn.on { background: #E24FCB !important; color: #1E0C1B !important; }
.paused-link { color: #C3CAF8 !important; }
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
.row.cleared .meta, .row.cleared .meta .chan, .row.cleared .meta .airs, .row.cleared .meta .count, .row.cleared .meta .code { color: var(--ink3); }
.row.cleared .due, .row.cleared .due b, .row.cleared .due .tm { color: var(--ink3); }
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
.batch-head .sub { font-family: var(--ui); font-weight: 500; font-size: 12px; color: var(--ink3); letter-spacing: 0; text-transform: none; }
.lfbadge { margin-left: 8px; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 6px; background: #3A2A33; color: #F4B8CB; vertical-align: 1px; }
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

/* ── dashboard columns ─────────────────────────────────────────────────── */
.colbar { display: flex; align-items: center; gap: 12px; margin: 26px 4px 12px; }
.colbar .section-title { margin: 0; }
.colpick { position: relative; margin-left: auto; }
.colpick summary {
  list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; border-radius: 999px; background: var(--rail); color: #D8D8DE; font-size: 13px; font-weight: 600;
}
.colpick summary::-webkit-details-marker { display: none; }
.colpick summary::after { content: "▾"; color: var(--ink3); font-size: 11px; }
.colpick summary b {
  background: var(--yellow); color: #101012; border-radius: 999px; min-width: 20px; height: 20px;
  display: grid; place-items: center; font-size: 11.5px; padding: 0 6px;
}
.colpick[open] summary { background: #26262A; color: #fff; }
.colmenu {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 15; width: 230px; padding: 6px;
  background: var(--card); border-radius: 16px; box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 1px #2E2E35;
}
.colmenu { width: 262px; }
.colmenu label {
  display: flex; align-items: center; gap: 10px; padding: 10px 10px; border-radius: 10px;
  cursor: pointer; color: var(--ink); font-size: 13.5px; font-weight: 600;
}
.colmenu label:hover { background: var(--sunk); }
.colmenu input { width: 16px; height: 16px; accent-color: var(--yellow); margin: 0; }
.colmenu i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.colmenu span { margin-left: auto; color: var(--ink3); font-variant-numeric: tabular-nums; font-weight: 700; }
.colopt { display: flex; align-items: center; gap: 2px; }
.colopt label { flex: 1; min-width: 0; }
.colopt .mv { width: 28px; height: 28px; flex: none; border: 0; border-radius: 8px; background: transparent; color: var(--ink3);
  font-size: 13px; cursor: pointer; }
.colopt .mv:hover { background: var(--sunk); color: #fff; }
.colopt:first-child .mv[data-d="-1"], .colopt:last-child .mv[data-d="1"] { visibility: hidden; }
.colhint { margin: 4px 10px 8px; color: var(--ink3); font-size: 11.5px; }
.colparts { border-top: 1px solid #2E2E35; margin-top: 4px; padding-top: 6px; }
.colparts b { display: block; padding: 6px 10px 2px; color: var(--ink3); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }
.dashpart[hidden] { display: none; }
.colhead .grip { align-self: center; display: grid; place-items: center; width: 18px; height: 24px; margin-left: -6px;
  color: var(--ink3); cursor: grab; border-radius: 6px; opacity: .55; }
.colhead .grip svg { width: 8px; height: 13px; }
.colhead:hover .grip { opacity: 1; }
.colhead .grip:hover { background: var(--sunk); color: #fff; }
.catcol.moving { opacity: .45; }
@media (hover: none) { .colhead .grip { display: none; } }
.catcols { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 14px; align-items: start; margin-bottom: 14px; }
.catcol { min-width: 0; container-type: inline-size; }
.catcol[hidden], .nocols[hidden] { display: none; }
.colhead { display: flex; align-items: baseline; gap: 10px; padding: 0 8px 10px; }
.colhead .dot { width: 11px; height: 11px; border-radius: 4px; background: var(--c); flex: none; }
.colhead .name { font-family: var(--display); font-size: 18px; font-weight: 700; letter-spacing: -0.03em; }
.colhead .name:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.colhead .sub { color: var(--dim); font-size: 12px; }
.colhead .n { margin-left: auto; font-family: var(--display); font-weight: 700; color: var(--dim); font-variant-numeric: tabular-nums; }
.catcol .empty { padding: 28px 16px; font-size: 13px; }
.seeall { display: block; text-align: center; padding: 10px; color: var(--ink3); font-size: 12.5px; font-weight: 600; }
.seeall:hover { color: var(--ink); }
/* In a narrow column a task stacks: title and buttons, whose-and-when, then
   the deadline pill — the same shape as on a phone. */
@container (max-width: 560px) {
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; padding: 10px 8px 11px 12px; }
  .row .title { grid-row: 1; font-size: 14.5px; align-items: flex-start; }
  .row .title .swatch { margin-top: 5px; }
  .row .title a { white-space: normal; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  /* The cream row already says pinned; the tag keeps just its pin. */
  .row .pinned-tag { padding: 4px; }
  .row .pinned-tag span, .row .pinned-tag:hover::after { display: none; }
  .row .acts { grid-column: 2; grid-row: 1; }
  .row .meta { grid-column: 1 / -1; grid-row: 2; }
  .row .due { grid-column: 1 / -1; grid-row: 3; justify-self: start; margin: 3px 0 0 19px; padding: 4px 9px; font-size: 12px;
    white-space: normal; flex-wrap: wrap; column-gap: 6px; max-width: calc(100% - 19px); }
}
@container (max-width: 560px) {
  .row .due.none { display: none; }
}
@container (max-width: 300px) {
  .row .meta { padding-left: 0; }
  .row .due { margin-left: 0; max-width: 100%; }
}
.row .title .chdot {
  display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--ch);
  margin-right: 7px; vertical-align: 1px; box-shadow: 0 0 0 1px var(--ring);
}
@media (max-width: 1100px) {
  .catcols { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .catcols[data-n="1"] { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .catcols { grid-template-columns: minmax(0, 1fr); }
  .colbar { margin: 18px 4px 10px; }
}

.scriptsframe { background: var(--card); border-radius: var(--r); overflow: hidden; height: calc(100vh - 150px); min-height: 480px; }
.scriptsframe iframe { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.scriptsblocked h2 { margin-bottom: 8px; }
header.page a.clear { align-self: center; }
@media (max-width: 760px) { .scriptsframe { height: calc(100vh - 170px); border-radius: 18px; } }

.row .due.delivered { background: rgba(86,201,144,.13); color: #A9E5C6; }
.row .due.delivered b { color: var(--ok); }
.row .title .t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cattoggle b { color: var(--ink); margin-left: 2px; }

/* ── google calendar subscribe ────────────────────────────────────────── */
.subscribe { position: relative; }
.subscribe summary {
  list-style: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;
  background: var(--rail); border-radius: 999px; padding: 10px 16px; font-size: 13px; color: #D8D8DE; font-weight: 600;
}
.subscribe summary::-webkit-details-marker { display: none; }
.subscribe summary svg { width: 16px; height: 16px; }
.subscribe[open] summary, .subscribe summary:hover { background: #26262A; color: #fff; }
.subpanel {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; width: 380px; padding: 18px;
  background: var(--card); color: var(--ink); border-radius: 18px; box-shadow: 0 18px 44px rgba(0,0,0,.55), 0 0 0 1px #2E2E35;
}
.subpanel > b { font-family: var(--display); font-size: 17px; letter-spacing: -0.03em; }
.subpanel p { color: var(--ink3); font-size: 12.5px; margin: 6px 0 12px; line-height: 1.55; }
.subpanel p.fine { font-size: 11.5px; margin: 10px 0 0; }
.subpanel a { color: #AEB8F5; }
.subopts { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
.subopts label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.subopts input { accent-color: var(--yellow); width: 15px; height: 15px; margin: 0; }
.subcopy { display: flex; gap: 8px; }
.subcopy input {
  flex: 1; min-width: 0; padding: 9px 11px; border-radius: 10px; border: 0; background: var(--sunk);
  color: var(--ink2); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
}
.subpanel ol { margin: 12px 0 0; padding-left: 20px; font-size: 13px; line-height: 1.8; color: var(--ink2); }
@media (max-width: 760px) {
  .subpanel { position: fixed; left: 10px; right: 10px; top: 80px; width: auto; }
}

/* ── uploads ───────────────────────────────────────────────────────────── */
.usub { color: var(--dim); font-size: 13px; margin: -12px 4px 16px; }
.checknow { margin: 0; align-self: center; }
.utiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
.utiles.after { margin-top: 14px; }
.utile { background: var(--card); border-radius: var(--r); padding: 20px 22px; }
.utile .n { font-family: var(--display); font-size: 40px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; font-variant-numeric: tabular-nums; }
.utile .l { color: var(--ink3); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 10px; }
.utile.t-ok { background: #173226; } .utile.t-ok .n { color: #7FE0AE; }
.utile.t-late { background: #3A1E1D; } .utile.t-late .n { color: #FF9C94; }
.uplanes { position: relative; margin-bottom: 14px; }
.uphead { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; }
.uphead h2 { margin: 0; }
.uphead .tabs { margin-left: auto; display: flex; gap: 3px; background: var(--sunk); border-radius: 999px; padding: 4px; }
.uphead .tab { padding: 6px 14px; border-radius: 999px; font-size: 12.5px; color: var(--ink2); font-weight: 600; }
.uphead .tab.on { background: var(--yellow); color: #101012; }
.ulegend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--ink2); }
.ulegend span { display: inline-flex; align-items: center; gap: 6px; }
.ulegend i { display: inline-block; }
.lg-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ink2); box-shadow: 0 0 0 2px var(--card); }
.lg-ok { width: 18px; height: 3px; border-radius: 2px; background: #4A4A53; }
.lg-late { width: 18px; height: 5px; border-radius: 3px; background: #E5534B; }
.lg-due { width: 9px; height: 9px; transform: rotate(45deg); box-shadow: inset 0 0 0 1.5px var(--yellow); }
.upscroll { overflow-x: auto; }
.upscroll svg { display: block; min-width: 760px; }
.uplanes svg .wk { stroke: #26262C; stroke-width: 1; }
.uplanes svg .today { stroke: var(--yellow); stroke-width: 1.5; stroke-dasharray: 3 3; }
.uplanes svg .tick { fill: var(--ink3); font: 600 10.5px var(--ui); }
.uplanes svg .today-l { fill: var(--yellow); }
.uplanes svg .lname { fill: var(--ink); font: 600 12.5px var(--ui); }
.uplanes svg .ring { stroke: var(--card); stroke-width: 2; }
.uplanes svg .track { stroke: #202026; stroke-width: 1; }
.uplanes svg .nolink { fill: var(--ink3); font: 12px var(--ui); }
.uplanes svg .seg line { stroke-linecap: round; }
.uplanes svg .seg.ok line { stroke: #4A4A53; stroke-width: 3; }
.uplanes svg .seg.late line { stroke: #E5534B; stroke-width: 5; }
.uplanes svg .seg.wait line { stroke-dasharray: 2 5; }
.uplanes svg .seg.wait.late line { stroke-dasharray: 5 4; }
.uplanes svg .glab { fill: #FF9C94; font: 700 10.5px var(--ui); }
.uplanes svg .hit { fill: transparent; }
.uplanes svg .due-mark path { fill: none; stroke: var(--yellow); stroke-width: 1.5; }
.uplanes svg .due-mark .ahead { stroke: #5A5520; stroke-width: 1.5; stroke-dasharray: 1 4; }
.uplanes svg .up:hover .ring { stroke: var(--ink); }
.uplanes svg [data-tip] { cursor: default; }
.uplanes svg a.up { cursor: pointer; }
.uplanes svg .lstate { font: 700 12px var(--ui); fill: var(--ink2); }
.uplanes svg .lstate.ok { fill: #7FE0AE; } .uplanes svg .lstate.late { fill: #FF9C94; } .uplanes svg .lstate.due { fill: #F8C58F; }
.uptip {
  position: absolute; z-index: 5; pointer-events: none; max-width: 340px; padding: 8px 11px; border-radius: 10px;
  background: #2E2E35; color: var(--ink); font-size: 12.5px; line-height: 1.4; box-shadow: 0 8px 24px rgba(0,0,0,.5);
}
.uptip[hidden] { display: none; }
.utable-wrap { overflow-x: auto; }
.utable { width: 100%; border-collapse: collapse; font-size: 13px; }
.utable th { text-align: left; color: var(--ink3); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; padding: 0 10px 10px; white-space: nowrap; }
.utable td { padding: 10px; border-top: 1px solid #26262C; white-space: nowrap; }
.utable td small { color: var(--ink3); margin-left: 4px; }
.utable .num { text-align: right; font-variant-numeric: tabular-nums; }
.cdot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--ch); margin-right: 8px; box-shadow: 0 0 0 1px var(--ring); vertical-align: 0; }
.pace { display: inline-flex; gap: 4px; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; background: var(--sunk); color: var(--ink2); }
.pace.ok { background: rgba(86,201,144,.14); color: #8FE3B6; }
.pace.due { background: rgba(238,154,85,.14); color: #F8C58F; }
.pace.late { background: rgba(242,104,94,.14); color: #FF9C94; }
.panel + .panel { margin-top: 14px; }
.ulatest-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 18px; }
.ulatest { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 1px 0; padding: 9px 10px; border-radius: 12px; }
.ulatest:hover { background: var(--sunk); }
.ulatest .cdot { grid-row: span 2; margin-top: 5px; }
.ulatest .ut { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ulatest .uc, .ulatest .ud { grid-column: 2; font-size: 12px; color: var(--ink3); }
.ulatest .uc { display: none; }
.ulinks { margin-top: 14px; }
.ulinks summary { list-style: none; cursor: pointer; display: flex; align-items: baseline; gap: 12px; }
.ulinks summary::-webkit-details-marker { display: none; }
.ulinks summary h2 { margin: 0; }
.ulinks summary .sub { color: var(--ink3); font-size: 12.5px; }
.ulinks summary::after { content: "▾"; margin-left: auto; color: var(--ink3); }
.linkform { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.linkrow { display: grid; grid-template-columns: 220px minmax(0, 1fr) 260px; align-items: center; gap: 12px; }
.linkrow .lname { font-weight: 600; font-size: 13.5px; }
.linkrow input { padding: 9px 12px; border-radius: 10px; border: 1px solid transparent; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13px; }
.linkrow input:focus { outline: 0; border-color: var(--salmon); }
.lstat { font-size: 12px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lstat.ok { color: #8FE3B6; } .lstat.err { color: #FF9C94; white-space: normal; }
.linkform .clear { align-self: flex-start; margin-top: 10px; }
.uplanes svg .halo-up { fill: none; stroke: #F3E96C; stroke-width: 2; }
.uplanes svg .halo-down { fill: none; stroke: #8A8A94; stroke-width: 1.5; stroke-dasharray: 2 2.5; }
.lg-up { width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 2px #F3E96C; }
.lg-down { width: 12px; height: 12px; border-radius: 50%; border: 1.5px dashed #8A8A94; }
.performers h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; margin-left: 8px; }
.pcols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.pcols h3 { font-size: 14px; margin: 0 0 8px; display: flex; gap: 8px; align-items: baseline; }
.pcols h3 span { color: var(--ink3); font-family: var(--ui); font-size: 12px; }
.prow { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 12px; align-items: center; padding: 8px 10px; border-radius: 12px; }
.prow:hover { background: var(--sunk); }
.pmult { font-family: var(--display); font-weight: 800; font-size: 18px; letter-spacing: -0.03em; text-align: right; font-variant-numeric: tabular-nums; }
.pmult.breakout { color: #F8E27A; } .pmult.under { color: #B4B4BE; }
.pbody { display: flex; flex-direction: column; min-width: 0; }
.pbody .ut { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmeta { font-size: 12px; color: var(--ink3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbadge { font-weight: 700; margin-left: 4px; padding: 1px 7px; border-radius: 999px; }
.vbadge.breakout { background: rgba(243,233,108,.14); color: #F8E27A; }
.vbadge.under { background: var(--sunk); color: #B4B4BE; }
.catswitch { display: flex; gap: 6px; flex-wrap: wrap; margin: -6px 4px 14px; }
.catswitch a {
  display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px;
  background: var(--rail); color: #C9C9D0; font-weight: 700; font-size: 13.5px;
}
.catswitch a i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.catswitch a:hover { background: #26262A; color: #fff; }
.catswitch a.on { background: var(--c); color: var(--on); }
.catswitch a.on i { background: var(--on); }
.catswitch a i.round { border-radius: 50%; }
.chswitch a.back { background: transparent; color: var(--ink2); padding-left: 6px; }
.chswitch a.back:hover { color: #fff; background: var(--rail); }
.usub .cdot { margin-right: 6px; }
.usub a { color: var(--ink2); text-decoration: underline; text-decoration-color: var(--ink3); }
.hint-inline { color: var(--ink3); }
a.chlink { color: inherit; }
a.chlink:hover { text-decoration: underline; text-decoration-color: var(--ink3); }
.uplanes svg a.lane-a { cursor: pointer; }
.uplanes svg a.lane-a:hover .lname { fill: #fff; text-decoration: underline; }
.outliers .utiles { grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 12px 0 18px; }
.outliers .utile { background: var(--sunk); padding: 16px 18px; }
.outliers .utile .n { font-size: 30px; }
.ocols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px 22px; }
.ocols h3 { font-size: 13px; margin: 0 0 8px; color: var(--ink2); display: flex; gap: 6px; align-items: baseline; }
.ocols h3 span { color: var(--ink3); font-family: var(--ui); font-size: 11px; }
.obar { display: grid; grid-template-columns: 82px minmax(0, 1fr) 32px; gap: 10px; align-items: center; font-size: 12.5px; padding: 3px 0; }
.obar .ol { color: var(--ink2); white-space: nowrap; }
.obar .ot { height: 12px; border-radius: 6px; background: var(--sunk); overflow: hidden; }
.obar .ot i { display: block; height: 100%; border-radius: 6px; background: #6E6E78; min-width: 2px; }
.obar.down .ot i { background: #FF7A70; } .obar.soft .ot i { background: #B08A8A; } .obar.mid .ot i { background: #8A8A96; }
.obar.good .ot i { background: #8FE3B6; } .obar.up .ot i { background: #F8E27A; }
.obar b { text-align: right; font-variant-numeric: tabular-nums; }
.odays { display: flex; flex-direction: column; gap: 4px; }
.odays span { display: grid; grid-template-columns: 100px 56px 1fr; gap: 8px; font-size: 12.5px; align-items: baseline; }
.odays span.up b + * { color: #8FE3B6; } .odays span.down b + * { color: #FF9C94; }
.odays small { color: var(--ink3); }
.everyvid .uphead .evfilter { margin-left: 0; }
.evlist { display: flex; flex-direction: column; margin-top: 6px; }
.evrow { display: grid; grid-template-columns: 58px minmax(0, 1fr) 150px 88px 110px; gap: 12px; align-items: center;
  padding: 8px 8px; border-top: 1px solid #26262C; font-size: 13px; }
.evrow:hover { background: var(--sunk); border-radius: 10px; }
.evrow[hidden] { display: none; }
.evm { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink3); }
.evm.up { color: #8FE3B6; } .evm.down { color: #FF9C94; }
.evt { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.evd { color: var(--ink3); font-size: 12px; white-space: nowrap; }
.evv { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
.evv small { color: var(--ink3); font-weight: 500; }
.evtier { font-size: 12px; color: var(--ink2); white-space: nowrap; }
.evrow.up .evtier { color: #F8E27A; } .evrow.down .evtier { color: #FF9C94; }
.evmore { margin-top: 12px; }
.everyvid .tabs button { border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px; }
.everyvid .tabs button.on { background: var(--yellow); color: #101012; }
.chlab .isugg a { display: flex; flex-direction: column; gap: 3px; padding: 11px 13px; background: var(--sunk); border-radius: 12px; }
.chlab .isugg a:hover { background: #26262C; }
.chlab .isugg b { font-family: var(--display); font-size: 15px; letter-spacing: -0.02em; }
.chlab .lf { font-size: 10.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #B5BEF7; }
.chlab .why { color: var(--ink3); font-size: 12px; line-height: 1.5; }
@media (max-width: 760px) {
  .outliers .utiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .evrow { grid-template-columns: 50px minmax(0, 1fr) auto; row-gap: 2px; }
  .evrow .evt { grid-column: 2 / 4; }
  .evrow .evd { grid-column: 2; grid-row: 2; }
  .evrow .evv { grid-column: 3; grid-row: 2; }
  .evrow .evm { grid-row: span 2; }
  .evrow .evtier { display: none; }
  .chswitch { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .chswitch a { flex: none; }
}
.lg-cell { width: 12px; height: 12px; border-radius: 3px; margin-right: -2px; }
.uplanes svg .hc { fill: var(--ink2); font: 700 10.5px var(--ui); pointer-events: none; }
.uplanes svg .hc.dark { fill: #0B0B0D; }
.uplanes svg .hot-today { stroke: var(--yellow); stroke-width: 1.5; }
.ideas h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; margin-left: 8px; }
.ichecker { display: flex; gap: 8px; margin-bottom: 12px; }
.panel .ichecker { margin-top: 4px; }
.ichecker input[type=text] {
  flex: 1; min-width: 0; padding: 11px 14px; border-radius: 12px; border: 1px solid transparent;
  background: var(--sunk); color: var(--ink); font: inherit; font-size: 14px;
}
.ichecker input[type=text]:focus { outline: 0; border-color: var(--salmon); }
.iresult { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; background: var(--sunk); border-radius: 14px; padding: 12px 16px; margin-bottom: 16px; }
.ipred b { font-family: var(--display); font-size: 30px; letter-spacing: -0.04em; display: block; line-height: 1; }
.ipred span { color: var(--ink3); font-size: 12px; }
.ipred.up b { color: #8FE3B6; } .ipred.down b { color: #FF9C94; }
.ireasons { display: flex; gap: 6px; flex-wrap: wrap; }
.ichip { padding: 4px 10px; border-radius: 999px; background: var(--raised); font-size: 12.5px; color: var(--ink2); }
.ichip b { margin-left: 2px; } .ichip small { color: var(--ink3); margin-left: 4px; }
.ichip.up b { color: #8FE3B6; } .ichip.down b { color: #FF9C94; }
.icols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 6px; }
.icol h3, .ihead { font-size: 13px; margin: 0 0 8px; color: var(--ink2); letter-spacing: 0.02em; }
.ihead { margin-top: 18px; }
.ilist { list-style: none; margin: 0; padding: 0; }
.ilist li { border-top: 1px solid #26262C; font-size: 13px; }
.ilist .ik { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ilist .il { font-weight: 700; font-variant-numeric: tabular-nums; }
.ilist .il.up { color: #8FE3B6; } .ilist .il.down { color: #FF9C94; }
.ilist .in { color: var(--ink3); font-size: 11.5px; min-width: 62px; text-align: right; }
.isugg { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: start; }
.ikind { font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); }
.ikind.pairing { color: #B5BEF7; } .ikind.sequel { color: #F8E27A; } .ikind.revisit { color: #8FE3B6; }
.iidea { font-family: var(--display); font-weight: 700; font-size: 15px; letter-spacing: -0.02em; }
.iwhy { color: var(--ink3); font-size: 12px; line-height: 1.5; }
.ihead-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ihead-row h2 { margin-bottom: 10px; }
.ichan { margin-left: auto; }
.panel .ichan { margin-top: 0; }
.ichan label { font-size: 12.5px; color: var(--ink3); display: inline-flex; gap: 8px; align-items: center; }
.ichan select { padding: 7px 10px; border-radius: 10px; border: 0; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13px; color-scheme: dark; }
.ilist li { display: block; padding: 0; }
.ilist details summary {
  list-style: none; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px;
  align-items: baseline; padding: 6px 2px;
}
.ilist details summary::-webkit-details-marker { display: none; }
.ilist details summary:hover .ik { text-decoration: underline; text-decoration-color: var(--ink3); }
.ilist details[open] summary { background: var(--sunk); border-radius: 8px; }
.idetail { padding: 8px 4px 12px; }
.idetail h4 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin: 12px 0 6px; }
.idetail h4:first-child { margin-top: 2px; }
.imeta { color: var(--ink3); font-size: 12px; margin: 2px 0 6px; line-height: 1.5; }
.ibych { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 12px; color: var(--ink2); margin: 4px 0; }
.ibych b { margin-left: 3px; } .ibych small { color: var(--ink3); }
.ibych b.up, .vm.up { color: #8FE3B6; } .ibych b.down, .vm.down { color: #FF9C94; }
.ivids { list-style: none; margin: 0; padding: 0; }
.ivids a { display: grid; grid-template-columns: 50px minmax(0, 1fr); gap: 0 10px; padding: 5px 6px; border-radius: 8px; }
.ivids a:hover { background: var(--sunk); }
.vm { font-weight: 800; font-variant-numeric: tabular-nums; grid-row: span 2; }
.vt { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vc { font-size: 11.5px; color: var(--ink3); }
.isugg > li { list-style: none; }
.wnlist { display: flex; flex-direction: column; gap: 16px; }
.wnchan { border-left: 3px solid var(--ch); padding-left: 12px; transition: opacity .15s; }
.wnchan.busy { opacity: .45; pointer-events: none; }
.wnchan > header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.wnchan > header i { width: 10px; height: 10px; border-radius: 50%; background: var(--ch); }
.wnchan > header b { font-family: var(--display); font-size: 15px; }
.wnskip { font-size: 11.5px; color: var(--ink3); }
.wncard { display: flex; flex-direction: column; gap: 6px; }
.wnscore { align-self: flex-start; display: inline-flex; align-items: baseline; gap: 1px; font-family: var(--display); font-weight: 800; font-size: 20px;
  color: var(--sc); line-height: 1; }
.wnscore small { font-size: 11px; color: var(--ink3); font-weight: 700; }
.wnscore.sm { font-size: 13px; min-width: 24px; }
.wnsim { align-self: flex-start; font-size: 11.5px; font-weight: 700; color: #FFD29A; background: rgba(217,130,43,.18); border-radius: 6px; padding: 2px 8px; line-height: 1.45; }
.wnacts { display: flex; gap: 6px; flex-wrap: wrap; }
.wnacts form, .wnbucket form { display: inline; margin: 0; }
.wnbtn { border: 0; cursor: pointer; border-radius: 999px; padding: 5px 11px; background: var(--sunk); color: var(--ink2); font: 600 12px var(--ui); }
.wnbtn:hover { background: var(--line); color: var(--ink); }
.wnbucket { margin-left: auto; }
.wnbucket summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 700; color: var(--ink2); background: var(--sunk); border-radius: 999px; padding: 4px 11px; }
.wnbucket summary b { color: var(--yellow); }
.wnbucket ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.wnbucket li { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.wnbucket li a { color: var(--ink); font-weight: 600; } .wnbucket li a:hover { text-decoration: underline; }
.wnwhen { color: var(--ink3); font-size: 11.5px; margin-left: auto; white-space: nowrap; }
.wnx { border: 0; background: none; color: var(--ink3); cursor: pointer; font-size: 16px; padding: 0 4px; }
.wnx:hover { color: var(--late); }
@media (max-width: 760px) { .wnbucket { margin-left: 0; flex-basis: 100%; } }
.isg { background: var(--sunk); border-radius: 12px; }
.isg summary { list-style: none; cursor: pointer; padding: 11px 13px; display: flex; flex-direction: column; gap: 3px; }
.isg summary::-webkit-details-marker { display: none; }
.isg .imore { font-size: 11.5px; color: var(--ink3); font-weight: 600; margin-top: 2px; }
.isg[open] .imore { display: none; }
.isg .idetail { padding: 0 13px 13px; border-top: 1px solid #2E2E35; }
.labcta { display: flex; flex-direction: column; gap: 3px; background: linear-gradient(135deg, #2A1F3D, #1D2433); border-radius: var(--r); padding: 16px 20px; margin-bottom: 14px; }
.labcta b { font-family: var(--display); font-size: 18px; letter-spacing: -0.02em; }
.labcta span { color: var(--ink2); font-size: 13px; }
.labcta:hover { filter: brightness(1.12); }
.labrepeat { background: #3A1E1D; color: #FFC2BC; border-radius: 12px; padding: 10px 14px; font-size: 13px; margin: 0 0 12px; }
.labrepeat a { color: #fff; text-decoration: underline; }
.labsub { color: var(--ink2); font-size: 13.5px; line-height: 1.6; margin: -4px 0 14px; max-width: 900px; }
.labform { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.labform label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); }
.labform select { padding: 9px 10px; border-radius: 10px; border: 0; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13.5px; text-transform: none; letter-spacing: 0; color-scheme: dark; min-width: 150px; }
.labidea .idetail { padding-top: 10px; }
.labwhy { list-style: none; margin: 0 0 10px; padding: 0; font-size: 12.5px; color: var(--ink2); }
.labwhy li { padding: 3px 0; } .labwhy b { display: inline-block; min-width: 46px; } .labwhy b.up { color: #8FE3B6; } .labwhy b.down { color: #FF9C94; }
.bp { display: flex; flex-direction: column; gap: 12px; }
.bphead h3 { font-family: var(--display); font-size: 22px; letter-spacing: -0.02em; margin: 4px 0 2px; }
.bppitch { color: var(--ink2); font-size: 13.5px; line-height: 1.6; margin: 6px 0 0; }
.bpblock h4 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin: 0 0 6px; }
.bpblock p { margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
.bpmoves, .bpbeats { margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: var(--ink2); line-height: 1.6; }
.bpmoves b, .bpbeats b { color: var(--ink); margin-right: 4px; }
.bpbeats small { color: var(--ink3); margin-left: 6px; } .bpbeats p { margin: 2px 0 8px; }
.bpparts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.bpparts li { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 12px; background: var(--raised); border-radius: 12px; padding: 12px 14px; }
.bpn { font-family: var(--display); font-weight: 800; font-size: 20px; color: var(--salmon); }
.bpparts b { font-size: 14px; } .bpparts p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
.bpref { margin-top: 8px; font-size: 12px; color: var(--ink3); line-height: 1.5; border-left: 2px solid #3A3A44; padding-left: 10px; }
.bpref b { color: var(--ink2); font-weight: 600; }
.labcheck { padding: 0; }
.labcheck textarea { min-height: 180px; }
.labresult { margin-top: 12px; }
.labfind { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.labfind li { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 2px 10px; background: var(--sunk); border-radius: 10px; padding: 10px 12px; font-size: 13px; }
.labfind .lf { grid-row: span 2; font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; align-self: start; padding: 3px 0; }
.labfind .fix .lf { color: #FF9C94; } .labfind .note .lf { color: #F8E27A; } .labfind .good .lf { color: #8FE3B6; }
.labfind li > span:last-child { color: var(--ink2); line-height: 1.5; }
.labtable { border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
.labtable th, .labtable td { padding: 6px 14px 6px 0; text-align: left; border-bottom: 1px solid #26262C; }
.labtable th { color: var(--ink3); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.labformats { grid-template-columns: minmax(0, 1fr); }
.labcov { overflow-x: auto; }
.labcov table { border-collapse: collapse; font-size: 12px; }
.labcov th { text-align: left; font-weight: 600; color: var(--ink2); padding: 4px 8px 4px 0; white-space: nowrap; }
.labcov thead th { vertical-align: bottom; height: 110px; padding: 0 2px; }
.labcov thead th span { display: inline-block; writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
.labcov td { width: 26px; height: 24px; text-align: center; border: 1px solid #26262C; }
.labcov td.done { color: #8FE3B6; }
.labcov td a { display: block; color: #6E6E7A; } .labcov td a:hover { color: var(--salmon); background: var(--sunk); }
.sform { display: flex; flex-direction: column; gap: 8px; padding: 0 14px 14px; }
.sform input[type=text], .sform textarea {
  width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #2E2E35; background: var(--raised);
  color: var(--ink); font: inherit; font-size: 13.5px; resize: vertical;
}
.sform input[type=file] { color: var(--ink2); font-size: 12.5px; }
.sform button { align-self: flex-start; }
.scripts { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
.scard { background: var(--raised); border: 1px solid #2A2A30; border-left: 3px solid var(--c, var(--salmon)); border-radius: 12px; padding: 12px 14px; }
.scard .st { font-family: var(--display); font-weight: 800; font-size: 15px; color: var(--ink); }
.scard .sm { font-size: 12.5px; color: var(--ink2); margin-top: 4px; line-height: 1.5; }
.scard .sm a { color: var(--ink); text-decoration: underline; }
.scard .learn { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: #1E2A24; color: #8FE3B6; }
.scard .learn.no { background: #26262A; color: var(--ink3); }
.scard details { margin-top: 8px; }
.scard summary { cursor: pointer; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
.scripttext { margin-top: 8px; max-height: 420px; overflow: auto; background: var(--sunk); border-radius: 10px; padding: 10px 12px; font-size: 13px; line-height: 1.6; color: var(--ink2); }
.scripttext h4 { margin: 10px 0 4px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink3); }
.scripttext h4:first-child { margin-top: 0; }
.scripttext p { margin: 0 0 8px; }
.sacts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.sacts form { display: inline; margin: 0; }
.sacts button { font-size: 12px; padding: 6px 12px; }
.release { padding: 16px 18px; margin-bottom: 12px; }
.release .relhead { display: flex; gap: 12px; align-items: center; }
.release h2 { margin: 0; font-size: 17px; }
.release .reldate { font-size: 12px; color: var(--ink3); margin-top: 2px; }
.relchanges { margin: 12px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 7px; font-size: 13.5px; line-height: 1.55; color: var(--ink2); }
.relchanges a { color: var(--nc); font-weight: 700; white-space: nowrap; }
.scripterr { background: #3A1D1D; color: #FFB4B4; border-radius: 10px; padding: 9px 12px; font-size: 13px; margin-bottom: 10px; }
.sform .or { font-size: 12px; color: var(--ink3); text-align: center; }
.shook { margin: 0; background: var(--sunk); border-radius: 12px; padding: 12px 14px; font-size: 13.5px; line-height: 1.6; color: var(--ink2); }
.idrafts { margin: 0; padding-left: 20px; font-family: var(--display); font-weight: 700; font-size: 14px; line-height: 1.9; }
.idrafts a:hover { text-decoration: underline; }
.ifacts { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--ink2); margin-top: 12px; }
.ifacts b { color: var(--ink3); font-weight: 700; margin-right: 4px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
.icav { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--ink2); line-height: 1.6; }
.ihead .sub { font-weight: 500; color: var(--ink3); letter-spacing: 0; }
.uplanes svg .band { fill: rgba(255,255,255,.06); }
.uplanes svg .one { stroke: #5A5520; stroke-width: 1.5; stroke-dasharray: 3 3; }
.uplanes svg .sdot { stroke: var(--card); stroke-width: 1.5; }
.uplanes svg .sdot.normal { opacity: .75; }
.lg-tier { width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
.lg-band { width: 18px; height: 10px; border-radius: 3px; background: rgba(255,255,255,.12); }
.performers h2 .sub, .panel h2 .sub { font-family: var(--ui); font-size: 12.5px; font-weight: 500; color: var(--ink3); letter-spacing: 0; margin-left: 8px; }
.utable .up { color: #8FE3B6; } .utable .down { color: #FF9C94; }
.slots { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.slots li { display: grid; grid-template-columns: 120px minmax(0, 1fr) 54px 40px; gap: 12px; align-items: center; font-size: 13px; }
.slots .sb { height: 10px; background: #26262C; border-radius: 999px; overflow: hidden; }
.slots .sb i { display: block; height: 100%; border-radius: 999px; background: #4A4A53; }
.slots .sb i.up { background: #3A9A6B; }
.slots b { text-align: right; font-variant-numeric: tabular-nums; }
.slots b.up { color: #8FE3B6; } .slots b.down { color: #FF9C94; }
.slots small { color: var(--ink3); }
@media (max-width: 1000px) {
  .pcols, .icols, .isugg, .sgrid { grid-template-columns: minmax(0, 1fr); }
  .icols .icol { grid-column: auto !important; }
  .ichecker { flex-wrap: wrap; }
  .utiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ulatest-list { grid-template-columns: minmax(0, 1fr); }
  .linkrow { grid-template-columns: minmax(0, 1fr); gap: 4px; margin-bottom: 8px; }
}

/* ── working ahead ──────────────────────────────────────────────────────── */
.aheadbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-bottom: 14px; }
.aheadbar .nav {
  background: var(--sunk); border-radius: 999px; padding: 8px 14px; font-size: 13px; color: var(--ink2); font-weight: 600;
}
.aheadbar .nav:hover { background: var(--line); color: var(--ink); }
.aheadbar .nav[aria-disabled="true"] { pointer-events: none; color: #8E8E98; background: transparent; box-shadow: inset 0 0 0 1px #34343B; }
.aheadbar input[type="date"] {
  padding: 8px 12px; border-radius: 12px; border: 0; background: var(--sunk); color: var(--ink);
  font: inherit; font-size: 13px; color-scheme: dark;
}
.panel .aheadbar form { margin-top: 0; }
.aheadbar .quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.aheadbar .quick:first-of-type { margin-left: auto; }
.aheadbar .quick span { color: var(--ink3); font-size: 12.5px; }
.chipbtn {
  border: 0; cursor: pointer; border-radius: 999px; padding: 8px 13px; background: var(--sunk);
  color: var(--ink2); font: 600 12.5px var(--ui);
}
.chipbtn:hover { background: var(--line); color: var(--ink); }
.chipbtn.go { background: var(--salmon); color: #101012; }
.daychips { display: grid; grid-template-columns: repeat(14, minmax(0, 1fr)); gap: 6px; margin-bottom: 18px; }
.daychip {
  display: flex; flex-direction: column; gap: 3px; padding: 9px 9px 8px; border-radius: 12px;
  background: var(--sunk); color: var(--ink2); min-width: 0;
}
.daychip:hover { background: var(--line); }
.daychip.on { box-shadow: inset 0 0 0 2px var(--yellow); }
.daychip b { font-family: var(--display); font-size: 13px; color: var(--ink); letter-spacing: -0.02em; }
.daychip span { font-size: 11.5px; font-variant-numeric: tabular-nums; }
.daychip i { display: block; height: 4px; border-radius: 999px; background: #3A3A42; overflow: hidden; margin-top: 2px; }
.daychip i em { display: block; height: 100%; background: var(--ok); }
.daychip small { font-size: 10.5px; color: var(--ink3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.daychip.none { background: transparent; box-shadow: inset 0 0 0 1px #34343B; }
.daychip.none.on { box-shadow: inset 0 0 0 2px var(--yellow); }
.daychip.part small { color: var(--warn); }
.aheadday { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 4px 0 12px; }
.aheadday h3 { font-family: var(--display); font-size: 17px; letter-spacing: -0.03em; margin: 0; }
.panel .aheadday form { margin-top: 0; }
@media (max-width: 1100px) {
  .daychips { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: 84px; overflow-x: auto; padding-bottom: 6px; }
}
@media (max-width: 760px) {
  .aheadbar .quick:first-of-type { margin-left: 0; }
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

  /* Title and buttons on top, whose-and-when under, the deadline pill last. */
  .rows { padding: 6px; border-radius: 20px; }
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 5px 10px; padding: 11px 10px 12px 12px; }
  .row .title { grid-row: 1; }
  .row .title a { white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .row .acts { grid-column: 2; grid-row: 1; }
  .row .meta { grid-column: 1 / -1; grid-row: 2; }
  .row .due { grid-column: 1 / -1; grid-row: 3; justify-self: start; margin: 2px 0 0 19px; padding: 4px 9px; font-size: 12px; }
  .row { gap: 3px 10px; padding: 10px 10px 11px 12px; }

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
  .weekgrid, .weekgrid.span4 { grid-template-columns: minmax(0, 1fr); }
  .weekgrid .daycol { min-height: 0; }
  .chanmenu { position: fixed; left: 16px; right: 16px; top: 120px; width: auto; }
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
  /** Upload slots in the next eight days with nothing assigned: a badge on Calendar, dashed slots on it. */
  gaps?: UploadGap[];
  counts: Record<string, number>;
  nav: { reviews: number; queue: number; recurring: number; calendar: number; behind?: number | null };
  lastIntake: Date | null;
  /** How many records are removed; the rail links to them when there are any. */
  removed?: number;
  /** How many are paused; the rail links to them when there are any. */
  paused?: number;
  /** Kept so the box still shows what was searched for. */
  query?: string;
  /** Set when SCRIPTS_URL is, so the rail shows a Scripts tab. */
  scripts?: boolean;
  /** Every day marked off, YYYY-MM-DD. */
  daysOff?: string[];
  /** Sidebar items switched off in Settings (RAIL_ITEMS keys). */
  railHide?: string[];
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

/**
 * Everything on the sidebar that Settings can switch off. Settings itself
 * can't be: it's the way back.
 */
export const RAIL_ITEMS: Array<{ key: string; label: string; group: "Pages" | "Categories" | "Also" }> = [
  { key: "dashboard", label: "Dashboard", group: "Pages" },
  { key: "calendar", label: "Calendar", group: "Pages" },
  { key: "reviews", label: "Revisions", group: "Pages" },
  { key: "queue", label: "Queue", group: "Pages" },
  { key: "recurring", label: "Recurring", group: "Pages" },
  { key: "scripts", label: "Scripts", group: "Pages" },
  { key: "uploads", label: "Uploads", group: "Pages" },
  { key: "storylab", label: "Story Lab", group: "Pages" },
  ...CATEGORIES.map((c) => ({ key: `cat-${c.id}`, label: c.label, group: "Categories" as const })),
  { key: "search", label: "Search box", group: "Also" },
  { key: "live", label: "#intake · last message", group: "Also" },
  { key: "paused", label: "Paused", group: "Also" },
  { key: "removed", label: "Removed", group: "Also" },
  { key: "whatsnew", label: "What's new", group: "Also" },
];

const GEAR_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8"/></svg>`;

function sidebar(s: Shell): string {
  const off = new Set(s.railHide ?? []);
  const item = (href: string, label: string, n: number | null, key: string) =>
    off.has(key)
      ? ""
      : `<a class="${s.active === key ? "on" : ""}" href="${href}">${esc(label)}${
          n === null ? "" : `<span class="n">${n}</span>`
        }</a>`;

  const cats = CATEGORIES.filter((c) => !off.has(`cat-${c.id}`))
    .map(
      (c) => `<a class="cat" style="--c:${c.color}" href="/category/${c.id}">
      <span class="dot"></span>${esc(c.label)}<span class="n">${s.counts[c.id] ?? 0}</span>
    </a>`,
    )
    .join("");

  // "Live" is only honest if it says when, so it says when.
  const ago = s.lastIntake ? timeAgo(s.lastIntake) : "nothing yet";

  return `<aside><div class="inner">
    <a class="mark" href="/">Specular</a>
    ${
      off.has("search")
        ? ""
        : `<form class="search" method="get" action="/search" role="search">
      <input type="search" name="q" placeholder="Search…" value="${esc(s.query ?? "")}"
        aria-label="Search everything">
    </form>`
    }
    <nav>
      ${item("/", "Dashboard", null, "dashboard")}
      ${
        off.has("calendar")
          ? ""
          : `<a class="${s.active === "calendar" ? "on" : ""}" href="/calendar">Calendar${
              s.gaps?.length ? `<span class="gapbadge" title="${s.gaps.length} expected upload${s.gaps.length === 1 ? "" : "s"} in the next 8 days with nothing assigned">${s.gaps.length}</span>` : ""
            }<span class="n">${s.nav.calendar}</span></a>`
      }
      ${item("/revisions", "Revisions", s.nav.reviews, "reviews")}
      ${item("/queue", "Queue", s.nav.queue, "queue")}
      ${item("/recurring", "Recurring", s.nav.recurring, "recurring")}
      ${s.scripts ? item("/scripts", "Scripts", null, "scripts") : ""}
      ${item("/uploads", "Uploads", s.nav.behind ?? null, "uploads")}
      ${item("/story-lab", "Story Lab", null, "storylab")}
    </nav>
    ${cats ? `<h3>Categories</h3>\n    <div class="cats">${cats}</div>` : ""}
    ${off.has("live") ? "" : `<div class="live"><span class="pulse"></span>#intake · ${esc(ago)}</div>`}
    ${
      s.paused && !off.has("paused")
        ? `<a class="removed-link paused-link${s.active === "paused" ? " on" : ""}" href="/paused">Paused · ${s.paused}</a>`
        : ""
    }
    ${
      s.removed && !off.has("removed")
        ? `<a class="removed-link${s.active === "removed" ? " on" : ""}" href="/removed">Removed · ${s.removed}</a>`
        : ""
    }
    ${off.has("whatsnew") ? "" : `<a class="removed-link${s.active === "whatsnew" ? " on" : ""}" href="/whats-new">What's new</a>`}
    <a class="settings-link${s.active === "settings" ? " on" : ""}" href="/settings">${GEAR_ICON}Settings</a>
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
  {
    kind: "dayoff", label: "Day off", colour: "#2AA9D8",
    icon: `<path d="M15.2 12.6A6.2 6.2 0 0 1 7.4 4.8a6.2 6.2 0 1 0 7.8 7.8z"/>`,
  },
  {
    kind: "gap", label: "Nothing assigned", colour: "#E2574C",
    icon: `<rect x="3.5" y="4.5" width="13" height="12" rx="2" stroke-dasharray="2.2 1.8"/><path d="M3.5 8.5h13M7 3v3M13 3v3"/><path d="M10 10.8v2.4"/><circle cx="10" cy="15" r=".5" fill="currentColor"/>`,
  },
  {
    kind: "update", label: "What's new", colour: "#E8C547",
    icon: `<path d="m10 3.2 2 4.3 4.6.5-3.4 3.1 1 4.6L10 13.4l-4.2 2.3 1-4.6L3.4 8l4.6-.5z"/>`,
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
    if (n.kind === "update") return `What's new · ${n.release.changes.length} change${n.release.changes.length === 1 ? "" : "s"}`;
    if (n.kind === "gap") return `Expected ${esc(relativeDay(n.gap.date))} · ${esc(n.gap.channel)}`;
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
      case "dayoff": {
        const due = r.voDue ?? r.deadline ?? r.scriptDue;
        return `Day off ${esc(usDate(dayOf(r.offFrom ?? n.at)))} · now due ${due ? esc(renderIn(due, ORG_TZ, "ET")) : "the day before"}`;
      }
    }
  };
  const items = notices
    .map((n) => {
      const isNew = n.at.getTime() > seen;
      if (n.kind === "gap") {
        return `<a class="notice gap${isNew ? " new-item" : ""}" data-kind="gap" href="/day/${n.gap.date}">
        ${noticeIcon("gap")}
        <span class="body">
          <span class="nt">Nothing assigned for ${esc(usDate(n.gap.date))}</span>
          <span class="ns">${what(n)}</span>
        </span>
        <span class="ago">${esc(n.gap.inDays === 0 ? "today" : `${n.gap.inDays}d`)}</span>
      </a>`;
      }
      if (n.kind === "update") {
        return `<a class="notice update${isNew ? " new-item" : ""}" data-kind="update" href="/whats-new#${esc(n.release.id)}">
        ${noticeIcon("update")}
        <span class="body">
          <span class="nt">${esc(n.release.title)}</span>
          <span class="ns">${what(n)}</span>
        </span>
        <span class="ago">${esc(timeAgo(n.at))}</span>
      </a>`;
      }
      const r = n.record;
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
      <div class="nlist">${items || `<div class="nempty">Nothing yet. Revisions, deadlines, air dates and what's new on the board show up here.</div>`}</div>
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
            var heads = { revision: "Revision ready", overdue: "Overdue", upcoming: "Due soon", airing: "Airing soon", "new": "New assignment", dayoff: "Day off — due earlier", gap: "Nothing assigned", update: "What's new on the board" };
            var note = new Notification(heads[n.kind] || "Specular", {
              body: n.title + (n.channel ? " — " + n.channel : ""), tag: n.kind + ":" + n.id,
            });
            note.onclick = function () { window.focus(); location.href = n.href || "/r/" + n.id; };
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
export function displayTitle(r: StoredRecord): string {
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

/**
 * A task as one compact row: what it is on top, whose it is and when it airs
 * underneath, and a single deadline pill on the right. Stage, word count and
 * the second time zone live on the record's own page (and in the pill's
 * tooltip) — on a list they were only taking up room.
 */
function row(r: StoredRecord): string {
  const c = colourOf(r.category);
  // A batch is its channel; the deadline pill already says which day.
  const title = r.batchNo && r.channel ? r.channel : displayTitle(r);

  const meta: string[] = [];
  if (r.code) meta.push(`<span class="code">${esc(r.code)}</span>`);
  if (r.channel && !r.batchNo) {
    meta.push(
      `<a class="chan" style="--ch:${channelColour(r.channel)};--ink:${channelInk(channelColour(r.channel))}" href="/channel/${encodeURIComponent(r.channel)}"><i></i>${esc(r.channel)}</a>`,
    );
  } else if (!r.channel) {
    meta.push(`<span class="pill">${esc(LABELS[r.category] ?? "unsorted")}</span>`);
  }
  if (r.airDate && !r.batchNo) meta.push(airs(r));
  if (r.batchNo) {
    const target = r.batchTarget ?? 1;
    meta.push(`<span class="count">${r.status === "done" ? target : r.batchDone}/${target} uploaded</span>`);
  }
  for (const l of r.links) {
    const label = l.kind === "frameio" ? `Frame.io${r.version ? ` v${r.version}` : ""}` : l.label || l.kind;
    meta.push(
      `<a class="lnk ${esc(l.kind)}" href="${esc(l.url)}" target="_blank" rel="noreferrer" title="${esc(l.label || l.url)}">${esc(label)}</a>`,
    );
  }
  if (r.confidence < 0.7) meta.push(`<span class="warn">needs a look</span>`);
  if (r.uploadedAt) meta.unshift(`<span class="uploaded-tag" title="Marked ${esc(usDate(dayOf(r.uploadedAt)))}">Uploaded</span>`);
  if (r.noScriptAt && r.status === "open") meta.unshift(`<span class="noscript-tag" title="Marked ${esc(usDate(dayOf(r.noScriptAt)))}">No script · waiting</span>`);
  if (r.pausedAt) meta.unshift(`<span class="paused-tag" title="Paused ${esc(usDate(dayOf(r.pausedAt)))}">Paused</span>`);
  if (r.offFrom && r.status === "open" && !r.pausedAt) meta.unshift(offTag(r));
  // A revision says so first: it's a cut to review, not a video to voice.
  if (r.kind === "review") meta.unshift(`<span class="rev-tag">${REV_ICON}Revision${r.version ? ` v${r.version}` : ""}</span>`);

  return `<div class="row${r.kind === "review" ? " revision" : ""}${r.status === "done" ? " cleared" : ""}${r.uploadedAt ? " uploaded" : ""}${r.pinnedAt ? " pinned" : ""}${r.noScriptAt && r.status === "open" ? " noscript" : ""}${r.pausedAt ? " paused" : ""}" style="--c:${c}">
    <div class="title"><span class="swatch"></span><a href="/r/${r.id}" title="${esc(displayTitle(r))}">${
      r.batchNo && r.channel ? `<i class="chdot" style="--ch:${channelColour(r.channel)}"></i>` : ""
    }${esc(title)}</a>${pinControl(r)}</div>
    <div class="meta">${meta.join("")}</div>
    ${duePill(r)}
    ${actions(r)}
  </div>`;
}

/** A play mark, as the bell's revisions wear it. */
const REV_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L9.8 6z" fill="currentColor"/></svg>`;

const MOON_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M15.2 12.6A6.2 6.2 0 0 1 7.4 4.8a6.2 6.2 0 1 0 7.8 7.8z"/></svg>`;

const weekdayOf = (day: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** "Day off 9/28 · due Sun 9/27": a deadline a day off brought forward. */
function offTag(r: StoredRecord): string {
  const at = r.voDue ?? r.deadline ?? r.scriptDue;
  if (!r.offFrom || !at) return "";
  const was = dayOf(r.offFrom);
  const now = dayOf(at);
  return `<span class="off-tag" title="${esc(`Due ${renderIn(r.offFrom, ORG_TZ, "ET")}, a day off — so it's due the working day before`)}">${MOON_ICON}Day off ${esc(usDate(was).replace(/\/\d{4}$/, ""))} · due ${esc(weekdayOf(now))} ${esc(usDate(now).replace(/\/\d{4}$/, ""))}</span>`;
}

/**
 * The switch on a calendar day: mark it off, or make it a working day again.
 * Only today and later can be marked; a past day off can still be cleared.
 */
function offToggle(day: string, off: boolean): string {
  if (!off && day < dateIn(ORG_TZ)) return "";
  const label = off
    ? `${usDate(day)} is a day off — make it a working day again`
    : `Mark ${usDate(day)} as a day off: nothing can be due that day`;
  return `<form class="offbtn${off ? " on" : ""}" method="post" action="/days-off/${day}">
    <input type="hidden" name="on" value="${off ? "0" : "1"}">
    <button aria-label="${esc(label)}" title="${esc(label)}">${MOON_ICON}${off ? "<span>Day off</span>" : ""}</button>
  </form>`;
}

/**
 * The dashboard's days off: each one coming up, what it moved and to when,
 * and a date box to add another.
 */
/**
 * Nothing assigned: each upload a channel is expected to make in the next
 * eight days with no video on that day. A chip opens the day to fill it.
 */
function gapStrip(gaps: UploadGap[]): string {
  if (!gaps.length) return "";
  // One chip a channel, soonest first, naming each empty day.
  const byChannel = new Map<string, UploadGap[]>();
  for (const g of gaps) byChannel.set(g.channel, [...(byChannel.get(g.channel) ?? []), g]);
  const when = (g: UploadGap) => (g.inDays === 0 ? "today" : g.inDays === 1 ? "tomorrow" : `${weekdayOf(g.date)} ${usDate(g.date).replace(/\/\d{4}$/, "")}`);
  const items = [...byChannel]
    .map(([channel, list]) => `<a class="gapchip${list[0]!.inDays <= 2 ? " soon" : ""}" href="/day/${list[0]!.date}" style="--ch:${channelColour(channel)}" title="Last video ${esc(usDate(list[0]!.after))} · one every ${esc(String(everyFor(channel) ?? ""))} days">
        <i></i><b>${esc(channel.replace(/^Specular /, ""))}</b> <span class="first">${esc(when(list[0]!))}</span>${
          list.length > 1 ? `<span>· ${list.slice(1).map((g) => esc(when(g))).join(" · ")}</span>` : ""
        }</a>`)
    .join("");
  return `<div class="gapstrip" role="alert">
      <span class="lbl"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="12" rx="2" stroke-dasharray="2.2 1.8"/><path d="M10 9v3.4"/><circle cx="10" cy="14.6" r=".5" fill="currentColor"/></svg>Nothing assigned <b class="gapn">${gaps.length}</b></span>
      <span class="gapsub">expected uploads in the next 8 days with no video on the day · ${byChannel.size} channel${byChannel.size === 1 ? "" : "s"}</span>
      <div class="gapchips">${items}</div>
    </div>`;
}

function daysOffStrip(days: string[], shifted: StoredRecord[]): string {
  const today = dateIn(ORG_TZ);
  const ahead = days.filter((d) => d >= today).slice(0, 8);
  const byDay = new Map<string, StoredRecord[]>();
  for (const r of shifted) {
    if (!r.offFrom) continue;
    const d = dayOf(r.offFrom);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const items = ahead
    .map((d) => {
      const list = byDay.get(d) ?? [];
      const first = list[0];
      const to = first ? first.voDue ?? first.deadline ?? first.scriptDue : null;
      const names = list.slice(0, 3).map((r) => r.code ?? displayTitle(r)).join(", ") + (list.length > 3 ? ` +${list.length - 3}` : "");
      return `<li class="offday${d === today ? " now" : ""}">
        <b>${d === today ? "Today" : esc(weekdayOf(d))} ${esc(usDate(d))}</b>
        <span>${
          list.length && to
            ? `${list.length} deadline${list.length === 1 ? "" : "s"} now due ${esc(weekdayOf(dayOf(to)))} ${esc(usDate(dayOf(to)))} — ${esc(names)}`
            : "nothing was due"
        }</span>
        <form method="post" action="/days-off/${d}"><input type="hidden" name="on" value="0">
          <button class="x" aria-label="Make ${esc(usDate(d))} a working day again" title="Make it a working day again">×</button></form>
      </li>`;
    })
    .join("");
  return `<div class="offstrip${ahead[0] === today ? " today" : ""}">
    <span class="lbl">${MOON_ICON}Days off</span>
    ${items ? `<ul>${items}</ul>` : `<span class="none">None coming up. A deadline on a day off is due the working day before.</span>`}
    <form class="offadd" method="post" action="/days-off">
      <input type="date" name="date" min="${today}" required aria-label="A day off">
      <button>Add</button>
    </form>
  </div>`;
}

/**
 * The deadline as one pill: "VO 9/17/2026 · 11:59 PM", red with how late it
 * is once it has passed, amber inside a day. The tooltip carries the rest —
 * the IST time, and whether the VO time was worked out from the air date.
 */
function duePill(r: StoredRecord): string {
  const at = r.voDue ?? r.deadline ?? r.scriptDue;
  // Paused: no deadline anywhere until it's resumed.
  if (r.pausedAt)
    return `<span class="due paused" title="${esc(at ? `Was due ${renderIn(at, ORG_TZ, "ET")} — back when it's resumed` : "No deadline")}"><b>Paused</b>no deadline</span>`;
  if (!at) return `<span class="due none">no deadline</span>`;
  const label = r.kind === "review" ? "Review" : r.voDue ? "VO" : r.deadline ? "Due" : "Script";
  const ms = at.getTime() - Date.now();
  const open = r.status === "open";
  const state = !open ? "" : ms < 0 ? " late" : ms < 86_400_000 ? " soon" : "";
  const span = (n: number) => {
    const h = Math.round(Math.abs(n) / 3_600_000);
    return h < 1 ? "<1h" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
  };
  const tail = !open ? "" : ms < 0 ? `<em>${span(ms)} late</em>` : ms < 86_400_000 ? `<em>in ${span(ms)}</em>` : "";
  const [date, time] = renderIn(at, ORG_TZ, "ET").split(" @ ");
  const tip = [
    `${label} ${renderIn(at, ORG_TZ, "ET")}`,
    renderIn(at, TEAM_TZ, "IST"),
    r.voDue && r.voSource === "calculated" ? `set ${VO_BUFFER_DAYS} days before air` : "",
    r.kind === "review" && r.deadline && Math.abs(r.deadline.getTime() - r.createdAt.getTime() - REVIEW_HOURS * 3_600_000) < 60_000
      ? `${REVIEW_HOURS} hours after it came in`
      : "",
    r.offFrom ? `was ${renderIn(r.offFrom, ORG_TZ, "ET")}, a day off` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="due${state}" title="${esc(tip)}"><b>${label}</b>${esc(date ?? "")}<span class="tm">${esc(
    (time ?? "").replace(/ ET$/, ""),
  )}</span>${tail}</span>`;
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

const PAUSE_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.4" height="8" rx=".8" fill="currentColor"/><rect x="7.1" y="2" width="2.4" height="8" rx=".8" fill="currentColor"/></svg>`;
const UPLOAD_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 8.2V2.3M3.4 4.7 6 2.1l2.6 2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.3 8.6v1.3h7.4V8.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L9.6 6z" fill="currentColor"/></svg>`;
const NOSCRIPT_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5h4.2L9.5 3.8v6.7H3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6.2" cy="8.6" r=".75" fill="currentColor"/></svg>`;

/**
 * A card's buttons: ✓ clear and × remove on top; below them ⏸ pause (off
 * every deadline until resumed) and the no-script mark (the VO is needed but
 * the script hasn't been sent — the whole card turns magenta until it has).
 */
function actions(r: StoredRecord): string {
  const button = (action: string, label: string, glyph: string, cls = "", on = false) =>
    `<form class="tick${cls ? ` ${cls}` : ""}" method="post" action="/r/${r.id}/${action}">
      <button aria-label="${label}" title="${label}"${on ? ' class="on"' : ""}>${glyph}</button>
    </form>`;

  if (r.status === "removed") return `<div class="acts">${button("open", "Restore", "↺", "restore")}</div>`;

  const revision = r.kind === "review";
  const top = `${r.status === "done" ? button("open", "Reopen", "✓", "", true) : button("done", revision ? "Reviewed — clear it" : "Clear", "✓")}
    ${button("remove", "Remove — doesn't count as cleared", "×", "remove")}`;
  // Uploaded: live on the channel. Green on the calendar; a revision has nothing to upload.
  const upload = revision
    ? ""
    : r.uploadedAt
      ? button("notuploaded", "Uploaded — take the mark off", UPLOAD_ICON, "uploaded", true)
      : button("uploaded", "Uploaded — it's live on the channel", UPLOAD_ICON, "uploaded");
  if (r.status === "done") return `<div class="acts">${top}${upload}</div>`;
  const pause = r.pausedAt
    ? button("resume", "Resume — its deadline comes back", PLAY_ICON, "resume", true)
    : button("pause", "Pause — off every deadline, late list and the calendar until resumed", PAUSE_ICON, "pause");
  // A daily batch has no script to wait on, and neither does a revision.
  const noScript = r.batchNo || revision
    ? ""
    : r.noScriptAt
      ? button("script", "Script arrived — clear the no-script mark", NOSCRIPT_ICON, "noscript", true)
      : button("noscript", "No script — the VO is needed but the script hasn't been sent", NOSCRIPT_ICON, "noscript");
  return `<div class="acts">${top}${pause}${noScript}${upload}</div>`;
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

/**
 * Revisions on the dashboard: their own section, each due for review
 * REVIEW_HOURS after it came in unless its message said otherwise, soonest
 * first. The columns below are the work to voice.
 */
function revisionsSection(list: StoredRecord[], hidden: boolean): string {
  const late = list.filter((r) => {
    const at = r.deadline ?? r.voDue ?? r.scriptDue;
    return at !== null && at.getTime() < Date.now();
  }).length;
  const shown = list.slice(0, 8);
  return `<section class="panel revpanel dashpart" data-part="revisions"${hidden ? " hidden" : ""}>
    <div class="revhead">
      <h2>${REV_ICON}Revisions</h2>
      <span class="sub">${
        list.length
          ? `${list.length} to review${late ? ` · <b class="late">${late} past ${late === 1 ? "its" : "their"} time</b>` : ""} · each due ${REVIEW_HOURS} hours after it comes in`
          : `nothing to review · each new one is due ${REVIEW_HOURS} hours after it comes in`
      }</span>
      ${list.length > shown.length ? `<a class="seeall" href="/revisions">See all ${list.length} →</a>` : ""}
    </div>
    ${shown.length ? `<div class="rows">${shown.map((r) => `<div class="revcell">${row(r)}</div>`).join("")}</div>` : ""}
  </section>`;
}

/** The dashboard's columns until you pick your own. */
export const DEFAULT_DASH_COLS = ["stories", "gaming", "bits"];

/** The categories in the dashboard's column order: the saved order, then any it doesn't name. */
export function dashOrder(saved: string[] = []): typeof CATEGORIES {
  const byId = new Map(CATEGORIES.map((c) => [c.id as string, c]));
  const first = [...new Set(saved)].map((id) => byId.get(id)).filter((c): c is (typeof CATEGORIES)[number] => Boolean(c));
  return [...first, ...CATEGORIES.filter((c) => !first.includes(c))];
}

const GRIP_ICON = `<svg viewBox="0 0 10 16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/><circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/></g></svg>`;

export function renderDashboard(
  shell: Shell,
  data: {
    stats: Stats;
    byDay: DayBucket[];
    grouped: Map<string, StoredRecord[]>;
    channels: Record<string, number>;
    notices?: Notice[];
    seen?: number;
    /** Which categories show as columns, from the dash_cols cookie. */
    cols?: string[];
    /** The columns' order, every category, from the dash_order cookie. */
    order?: string[];
    /** Parts of the dashboard switched off ("unsorted", "channels"), from dash_hide. */
    hideParts?: string[];
    /** Open work a day off brought forward. */
    shifted?: StoredRecord[];
    /** Open revisions, soonest review first — their own section, never in the columns. */
    revisions?: StoredRecord[];
    /** Upload slots in the next eight days with nothing assigned. */
    gaps?: UploadGap[];
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

  // Categories side by side, in the order they were last arranged. Every
  // category is rendered; the ones not picked are hidden, so ticking one in
  // the Columns menu shows it at once.
  const picked = new Set(data.cols ?? DEFAULT_DASH_COLS);
  const cats = dashOrder(data.order);
  const shown = cats.filter((c) => picked.has(c.id)).length;
  const hideParts = new Set(data.hideParts ?? []);
  const columns = cats.map((c) => {
    const list = pinnedFirst(data.grouped.get(c.id) ?? []);
    const channels = CHANNELS.filter((ch) => ch.category === c.id).length;
    return `<section class="catcol" data-cat="${c.id}" style="--c:${c.color}"${picked.has(c.id) ? "" : " hidden"}>
      <div class="colhead">
        <span class="grip" draggable="true" title="Drag to move this column" aria-hidden="true">${GRIP_ICON}</span>
        <span class="dot"></span>
        <a class="name" href="/category/${c.id}">${esc(c.label)}</a>
        ${channels > 1 ? `<span class="sub">${channels} channels</span>` : ""}
        <span class="n">${list.length}</span>
      </div>
      ${list.length ? `<div class="rows">${list.slice(0, 10).map(row).join("")}</div>` : `<div class="empty">Nothing open.</div>`}
      ${list.length > 10 ? `<a class="seeall" href="/category/${c.id}">See all ${list.length} →</a>` : ""}
    </section>`;
  }).join("");

  const colPicker = `<details class="colpick">
    <summary>Columns <b id="colcount">${shown}</b></summary>
    <div class="colmenu" role="group" aria-label="Categories to show, in order">
      <div class="colorder" id="colorder">${cats
        .map(
          (c) => `<div class="colopt" data-cat="${c.id}" style="--c:${c.color}">
          <label><input type="checkbox" value="${c.id}"${picked.has(c.id) ? " checked" : ""}>
            <i></i>${esc(c.label)}<span>${(data.grouped.get(c.id) ?? []).length}</span></label>
          <button type="button" class="mv" data-d="-1" aria-label="Move ${esc(c.label)} left">↑</button>
          <button type="button" class="mv" data-d="1" aria-label="Move ${esc(c.label)} right">↓</button>
        </div>`,
        )
        .join("")}</div>
      <p class="colhint">Drag a column by its ⠿, or use the arrows. First is leftmost.</p>
      <div class="colparts">
        <b>Also show</b>
        <label><input type="checkbox" data-part="revisions"${hideParts.has("revisions") ? "" : " checked"}> Revisions</label>
        <label><input type="checkbox" data-part="unsorted"${hideParts.has("unsorted") ? "" : " checked"}> Unsorted</label>
        <label><input type="checkbox" data-part="channels"${hideParts.has("channels") ? "" : " checked"}> Channels</label>
      </div>
    </div>
  </details>`;

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
    ${gapStrip(data.gaps ?? [])}
    ${daysOffStrip(shell.daysOff ?? [], data.shifted ?? [])}

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

    ${revisionsSection(data.revisions ?? [], hideParts.has("revisions"))}

    <div class="colbar">
      <h2 class="section-title">Open work</h2>
      ${colPicker}
    </div>
    <div class="catcols" id="catcols" data-n="${shown}" style="--n:${Math.max(shown, 1)}">${columns}</div>
    <div class="empty nocols"${shown ? " hidden" : ""}>Pick a category under Columns to see its work here.</div>
    <script>
    // Tick a category and its column appears; drag a column by its grip (or
    // use the arrows in the menu) to put it where you want. Both are kept in
    // cookies so the dashboard opens the same way next time.
    (function () {
      var grid = document.getElementById("catcols"), count = document.getElementById("colcount");
      var list = document.getElementById("colorder");
      var none = document.querySelector(".nocols");
      var YEAR = "; path=/; max-age=31536000; samesite=lax";
      function ticked() {
        var on = [];
        list.querySelectorAll(".colopt input").forEach(function (b) {
          grid.querySelector('[data-cat="' + b.value + '"]').hidden = !b.checked;
          if (b.checked) on.push(b.value);
        });
        grid.dataset.n = String(on.length);
        grid.style.setProperty("--n", String(Math.max(on.length, 1)));
        count.textContent = String(on.length);
        none.hidden = on.length > 0;
        document.cookie = "dash_cols=" + (on.join(".") || "none") + YEAR;
      }
      // One order for both: the menu's rows and the columns follow it.
      function arrange(ids) {
        ids.forEach(function (id) {
          grid.appendChild(grid.querySelector('.catcol[data-cat="' + id + '"]'));
          list.appendChild(list.querySelector('.colopt[data-cat="' + id + '"]'));
        });
        document.cookie = "dash_order=" + ids.join(".") + YEAR;
        ticked();
      }
      function order(root, sel) {
        return Array.prototype.map.call(root.querySelectorAll(sel), function (el) { return el.dataset.cat; });
      }
      list.querySelectorAll(".colopt input").forEach(function (box) { box.addEventListener("change", ticked); });
      list.querySelectorAll(".mv").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var ids = order(list, ".colopt");
          var id = btn.closest(".colopt").dataset.cat, i = ids.indexOf(id), j = i + Number(btn.dataset.d);
          if (j < 0 || j >= ids.length) return;
          ids.splice(i, 1);
          ids.splice(j, 0, id);
          arrange(ids);
          btn.focus();
        });
      });
      var dragging = null;
      grid.querySelectorAll(".catcol .grip").forEach(function (grip) {
        grip.addEventListener("dragstart", function (e) {
          dragging = grip.closest(".catcol");
          dragging.classList.add("moving");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", dragging.dataset.cat);
        });
        grip.addEventListener("dragend", function () {
          if (dragging) dragging.classList.remove("moving");
          dragging = null;
          arrange(order(grid, ".catcol"));
        });
      });
      grid.addEventListener("dragover", function (e) {
        if (!dragging) return;
        e.preventDefault();
        var over = e.target.closest && e.target.closest(".catcol");
        if (!over || over === dragging) return;
        var box = over.getBoundingClientRect();
        grid.insertBefore(dragging, e.clientX > box.left + box.width / 2 ? over.nextSibling : over);
      });
      grid.addEventListener("drop", function (e) { if (dragging) e.preventDefault(); });
      // Unsorted and Channels: shown or not, remembered the same way.
      document.querySelectorAll(".colparts input").forEach(function (box) {
        box.addEventListener("change", function () {
          var off = [];
          document.querySelectorAll(".colparts input").forEach(function (b) {
            document.querySelectorAll('[data-part="' + b.dataset.part + '"]').forEach(function (el) {
              if (el !== b) el.hidden = !b.checked;
            });
            if (!b.checked) off.push(b.dataset.part);
          });
          document.cookie = "dash_hide=" + (off.join(".") || "none") + YEAR;
        });
      });
      document.addEventListener("click", function (e) {
        var menu = document.querySelector(".colpick");
        if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
      });
    })();
    </script>
    <div class="dashpart" data-part="unsorted"${hideParts.has("unsorted") ? " hidden" : ""}>${
      unsorted.length ? group("unknown", unsorted.slice(0, 8), "needs a category") : ""
    }</div>

    <div class="group dashpart" data-part="channels"${hideParts.has("channels") ? " hidden" : ""}>
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

/**
 * One kept script: how long, how it splits, where it came from, whether
 * Story Lab learns from it, the text itself, and what can be done with it.
 */
function scriptCard(sc: StoredScript, colour: string, from = ""): string {
  const sections = splitScript(sc.body, sc.title);
  const parts = sections.filter((x) => x.name.startsWith("PART")).length;
  const inLab = corpus().some((c) => c.board?.id === sc.id);
  const status = inLab
    ? `<span class="learn">Story Lab learns from it · read as ${esc(FORMAT_BY_ID.get(formatOfTitle(sc.title))?.name ?? "a script")}</span>`
    : learnsFrom(sc)
      ? `<span class="learn no">Too short for Story Lab to learn from — it needs 150 words or more</span>`
      : `<span class="learn no">Kept with the video · its opening feeds the Uploads idea hooks</span>`;
  const shown = sections.length
    ? sections
        .map((x) => `<h4>${esc(x.name)}${x.label ? ` — ${esc(x.label)}` : ""}</h4>${x.paras.map((p) => `<p>${esc(p)}</p>`).join("")}`)
        .join("")
    : `<p>${esc(sc.body)}</p>`;
  return `<div class="scard" style="--c:${colour}">
      <div class="st">${esc(sc.title)}</div>
      <div class="sm">${sc.words.toLocaleString("en-US")} words · ${parts ? `${parts} part${parts === 1 ? "" : "s"}` : "no PART headers"}${
        sc.url ? ` · <a href="${esc(sc.url)}" target="_blank" rel="noreferrer">Google Doc</a>` : " · pasted"
      } · added ${esc(usDate(dayOf(sc.addedAt)))}${sc.updatedAt.getTime() - sc.addedAt.getTime() > 60_000 ? `, re-read ${esc(usDate(dayOf(sc.updatedAt)))}` : ""}${from}</div>
      ${status}
      <details><summary>Read it</summary><div class="scripttext">${shown}</div></details>
      <div class="sacts">
        ${inLab ? `<form method="post" action="/story-lab/check#check"><input type="hidden" name="title" value="${esc(sc.title)}"><input type="hidden" name="script" value="${esc(sc.body)}"><button class="clear secondary">Check its structure</button></form>` : ""}
        ${sc.url ? `<form method="post" action="/scripts/${sc.id}/refresh"><button class="clear secondary" title="Read the doc again for its latest draft">Re-read the doc</button></form>` : ""}
        <form method="post" action="/scripts/${sc.id}/remove" onsubmit="return confirm('Remove this script? Story Lab stops learning from it.')"><button class="clear secondary">Remove</button></form>
      </div>
    </div>`;
}

/** Paste a script, or give its Google Doc link. */
function scriptForm(action: string, opts: { title?: boolean; url?: string; again?: boolean }): string {
  return `<form class="sform" method="post" action="${action}" style="padding:0">
      ${opts.title ? `<input type="text" name="title" placeholder="Its video title — e.g. What If Gojo Was In Invincible?" autocomplete="off" required>` : ""}
      <textarea name="text" rows="6" placeholder="Paste the script, with its INTRO / PART 1 / … / OUTRO headers"></textarea>
      <div class="or">or</div>
      <input type="text" name="url" value="${esc(opts.url ?? "")}" placeholder="Its Google Doc link — shared as “Anyone with the link can view”" autocomplete="off">
      <button class="clear">${opts.again ? "Add another draft" : "Add the script"}</button>
    </form>`;
}

export function renderRecord(
  shell: Shell,
  r: StoredRecord,
  extra: { later?: number; moved?: { token: string; text: string } | null; scripts?: StoredScript[]; scriptError?: string } = {},
): string {
  const later = extra.later ?? 0;
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
  if (r.pausedAt) facts.unshift(["Paused", `since ${usDate(dayOf(r.pausedAt))} · no deadline until it's resumed`]);
  if (r.uploadedAt) facts.unshift(["Uploaded", `marked ${usDate(dayOf(r.uploadedAt))} · live on the channel`]);
  if (r.noScriptAt && r.status === "open") facts.unshift(["No script", `waiting on the script since ${usDate(dayOf(r.noScriptAt))}`]);
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
        ${
          later && r.channel
            ? `<label class="restbox"><input type="checkbox" name="rest" value="1" checked>
                 Move ${later === 1 ? "the later" : `the ${later} later`} ${esc(r.channel)} video${later === 1 ? "" : "s"} by the same number of days</label>`
            : ""
        }
      </form>
    </section>
    ${
      extra.moved
        ? `<div class="mtoast" role="status"><span>${esc(extra.moved.text)}</span>
             <form method="post" action="/moves/undo"><input type="hidden" name="token" value="${esc(extra.moved.token)}"><button>Undo</button></form>
             <a class="x" href="/r/${r.id}" aria-label="Dismiss">×</a></div>`
        : ""
    }
    ${links}
    ${r.brief ? `<section><h2>Story brief</h2><div class="brief">${esc(r.brief)}</div></section>` : ""}
    ${
      r.kind === "review"
        ? ""
        : `<section id="script"><h2>Script</h2>
      ${extra.scriptError ? `<div class="scripterr" role="alert">${esc(extra.scriptError)}</div>` : ""}
      ${extra.scripts?.length ? `<div class="scripts">${extra.scripts.map((sc) => scriptCard(sc, c)).join("")}</div>` : ""}
      ${scriptForm(`/r/${r.id}/scripts`, {
        again: Boolean(extra.scripts?.length),
        // The doc already linked on the video, ready to read.
        url: extra.scripts?.length ? "" : (r.links.find((l) => l.kind === "docs" && l.url.includes("/document/"))?.url ?? ""),
      })}
    </section>`
    }
    ${r.warnings.length ? `<section><h2>Warnings</h2><div class="empty warn">${esc(r.warnings.join(" · "))}</div></section>` : ""}
    <section>
      ${
        r.status === "removed"
          ? ""
          : `<form class="inline" method="post" action="/r/${r.id}/${r.pinnedAt ? "unpin" : "pin"}" style="margin-right:8px">
               <button class="clear secondary">${r.pinnedAt ? "Unpin" : "Pin to top of category"}</button>
             </form>`
      }
      ${
        r.kind === "review" || r.status === "removed"
          ? ""
          : `<form class="inline" method="post" action="/r/${r.id}/${r.uploadedAt ? "notuploaded" : "uploaded"}" style="margin-right:8px">
               <button class="clear secondary uploadbtn${r.uploadedAt ? " on" : ""}" title="${r.uploadedAt ? "Take the uploaded mark off" : "It's live on the channel — clears it and turns it green on the calendar"}">${UPLOAD_ICON} ${r.uploadedAt ? "Uploaded ✓" : "Uploaded"}</button>
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
             </form>
             <div class="recacts2">
               <form class="inline" method="post" action="/r/${r.id}/${r.pausedAt ? "resume" : "pause"}">
                 <button class="clear secondary pausebtn" title="${r.pausedAt ? "Its deadline comes back as it was" : "Off every deadline, the late list and the calendar until you resume it"}">${r.pausedAt ? `${PLAY_ICON} Resume` : `${PAUSE_ICON} Pause`}</button>
               </form>
               ${
                 r.batchNo
                   ? ""
                   : `<form class="inline" method="post" action="/r/${r.id}/${r.noScriptAt ? "script" : "noscript"}" style="margin-left:8px">
                        <button class="clear secondary noscriptbtn${r.noScriptAt ? " on" : ""}" title="${r.noScriptAt ? "The script has arrived" : "The VO is needed but the script hasn't been sent"}">${NOSCRIPT_ICON} ${r.noScriptAt ? "Script arrived" : "No script"}</button>
                      </form>`
               }
             </div>`
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
function viewTabs(active: "month" | "week" | "4day" | "day", date: string, q: string, attrs = ""): string {
  const tab = (key: typeof active, href: string, label: string) =>
    `<a class="tab${active === key ? " on" : ""}" ${attrs} href="${href}${q}">${label}</a>`;
  return `<div class="tabs views">${tab("day", `/day/${date}`, "Day")}${tab("4day", `/4day/${date}`, "4 days")}${tab(
    "week",
    `/week/${date}`,
    "Week",
  )}${tab("month", `/calendar/${date.slice(0, 7)}`, "Month")}</div>`;
}

/**
 * The channel dropdown on every calendar view: tick or untick any channel
 * (grouped by category, with All, None and "only this category"), then Show.
 * What's unticked is remembered, like the category toggles.
 */
function channelPicker(chide: string[]): string {
  const off = new Set(chide);
  const total = CHANNELS.length + 1;
  const shown = total - CHANNELS.filter((c) => off.has(c.id)).length - (off.has("nochannel") ? 1 : 0);
  const groups = CATEGORIES.map((cat) => {
    const list = CHANNELS.filter((c) => c.category === cat.id);
    return `<div class="chgroup" style="--c:${cat.color}">
      <div class="chcat"><i></i>${esc(cat.label)}<button type="button" data-only="${cat.id}">only</button></div>
      ${list
        .map((c) => `<label><input type="checkbox" value="${c.id}" data-cat="${cat.id}"${off.has(c.id) ? "" : " checked"}>
          <span class="cdot" style="--ch:${c.color}"></span>${esc(c.name.replace(/^Specular /, "") || c.name)}</label>`)
        .join("")}
    </div>`;
  }).join("");
  return `<details class="chanpick" id="chanpick">
    <summary>Channels <b id="chancount">${shown === total ? "all" : `${shown}/${total}`}</b></summary>
    <div class="chanmenu">
      <div class="chanbtns">
        <button type="button" data-set="all">All</button>
        <button type="button" data-set="none">None</button>
        <button type="button" class="go" id="chango">Show</button>
      </div>
      <div class="chgroups">${groups}
        <div class="chgroup"><label><input type="checkbox" value="nochannel"${off.has("nochannel") ? "" : " checked"}>No channel</label></div>
      </div>
    </div>
    <script>
    (function () {
      var pick = document.getElementById("chanpick"), count = document.getElementById("chancount");
      var boxes = Array.prototype.slice.call(pick.querySelectorAll("input[type=checkbox]"));
      var start = JSON.stringify(hidden());
      function hidden() { return boxes.filter(function (b) { return !b.checked; }).map(function (b) { return b.value; }); }
      function tally() {
        var n = boxes.length - hidden().length;
        count.textContent = n === boxes.length ? "all" : n + "/" + boxes.length;
      }
      function go() {
        var off = hidden();
        if (JSON.stringify(off) === start) { pick.open = false; return; }
        var u = new URL(location.href);
        u.searchParams.set("chide", off.join(","));
        location.href = u.toString();
      }
      boxes.forEach(function (b) { b.addEventListener("change", tally); });
      pick.querySelectorAll("[data-set]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var on = btn.getAttribute("data-set") === "all";
          boxes.forEach(function (b) { b.checked = on; });
          tally();
        });
      });
      pick.querySelectorAll("[data-only]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var cat = btn.getAttribute("data-only");
          boxes.forEach(function (b) { b.checked = b.getAttribute("data-cat") === cat; });
          tally();
        });
      });
      document.getElementById("chango").addEventListener("click", go);
      // Closing the menu shows what's ticked, the same as pressing Show.
      // Keep the menu on screen: pull it left when it would run off the right edge.
      var menu = pick.querySelector(".chanmenu");
      pick.addEventListener("toggle", function () {
        if (!pick.open) { go(); return; }
        if (getComputedStyle(menu).position !== "absolute") return;
        menu.style.left = "0px";
        var over = menu.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
        if (over > 0) menu.style.left = -over + "px";
      });
      document.addEventListener("click", function (e) { if (pick.open && !pick.contains(e.target)) pick.open = false; });
    })();
    </script>
  </details>`;
}

/** The Sunday a week starts on — the month grid starts on Sunday too. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDay(date, -dow);
}

/** One day as a column of cards: the day view's strip and the week's grid. */
/** The gaps the calendar's category toggles and channel dropdown leave showing. */
function visibleGaps(gaps: UploadGap[] | undefined, hide: string[], chide: string[]): UploadGap[] {
  return (gaps ?? []).filter((g) => {
    const ch = CHANNELS.find((c) => c.name === g.channel);
    return !ch || (!hide.includes(ch.category) && !chide.includes(ch.id));
  });
}

function dayColumn(
  d: string,
  list: StoredRecord[],
  mode: CalendarMode,
  q: string,
  cls: string,
  off = false,
  gaps: UploadGap[] = [],
): string {
  // Nothing assigned: a dashed slot for each channel expected to post this day.
  const holes = mode === "posting"
    ? gaps.filter((g) => g.date === d).map((g) => `<a class="gapcard" href="/channel/${encodeURIComponent(g.channel)}" style="--ch:${channelColour(g.channel)}" title="Expected: its last video is ${esc(usDate(g.after))}"><i></i>Nothing assigned · ${esc(g.channel.replace(/^Specular /, ""))}</a>`).join("")
    : "";
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
  return `<section class="daycol${cls}${off ? " off" : ""}" data-date="${d}" data-pretty="${esc(`${weekday} ${usDate(d)}`)}">
    <header>
      <a class="dname" href="/day/${d}${q}" title="Open ${esc(weekday)} in the day view">
        <span class="wk">${esc(weekday)}</span>
        <span class="dt">${esc(usDate(d))}</span>
      </a>
      <span class="rel">${esc(relativeDay(d))}</span>
      ${offToggle(d, off)}
      <span class="cnt">${list.length}</span>
    </header>
    <div class="daybody">${holes}${
      list.length || holes ? list.map((r) => dayCard(r, mode)).join("") :
      `<div class="dayempty">${
        off && mode === "deadlines" ? "Day off — nothing can be due." : `Nothing ${mode === "posting" ? "airing" : "due"}.`
      }</div>`
    }</div>
  </section>`;
}

/**
 * After a drop: the board says what else moved (the rest of the channel's
 * schedule) with an Undo, across the reload that follows every move.
 * `rememberMove` keeps the server's answer for the next page; the rest shows
 * it. Shift held on the drop moves only the one.
 */
const MOVED_JS = `
      var KEY = "board-moved";
      function rememberMove(res) {
        return res.json().then(function (j) {
          if (j && j.text) {
            try { sessionStorage.setItem(KEY, JSON.stringify({ text: j.text, token: j.undo || "" })); } catch (e) {}
          }
        }, function () {});
      }
      function saveMove(id, date, only) {
        return fetch("/r/" + id + "/move", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
          body: new URLSearchParams({ date: date, mode: mode, only: only ? "1" : "" }),
        }).then(function (res) {
          if (!res.ok) { alert("Couldn't move that — nothing was changed."); return; }
          return rememberMove(res);
        }, function () {
          alert("Couldn't reach the board — nothing was changed.");
        }).then(function () { location.reload(); });
      }
      (function () {
        var info = null;
        try { info = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) {}
        if (!info || !info.text) return;
        var toast = document.createElement("div");
        toast.className = "mtoast";
        toast.setAttribute("role", "status");
        var text = document.createElement("span");
        text.textContent = info.text;
        var hint = document.createElement("small");
        hint.textContent = "Hold Shift as you drop to move just the one.";
        text.appendChild(hint);
        var undo = document.createElement("button");
        undo.type = "button";
        undo.className = "undo";
        undo.textContent = "Undo";
        undo.addEventListener("click", function () {
          undo.disabled = true;
          fetch("/moves/undo", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
            body: new URLSearchParams({ token: info.token }),
          }).then(function (res) {
            if (!res.ok) alert("Too late to undo that one — it's been over 15 minutes, or the board restarted.");
            location.reload();
          }, function () {
            alert("Couldn't reach the board — nothing was changed.");
            undo.disabled = false;
          });
        });
        var close = document.createElement("button");
        close.type = "button";
        close.className = "x";
        close.setAttribute("aria-label", "Dismiss");
        close.textContent = "×";
        close.addEventListener("click", function () { toast.remove(); });
        if (!info.token) hint.remove();
        toast.appendChild(text);
        if (info.token) toast.appendChild(undo);
        toast.appendChild(close);
        document.body.appendChild(toast);
      })();`;

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
          saveMove(card.dataset.id, col.dataset.date, e.shiftKey);
        });
      });
      ${MOVED_JS}
    })();
    </script>`;
}

/**
 * "Add to Google Calendar": the private feed link, a few switches for what it
 * carries, and the three steps to subscribe. Google then keeps it in step on
 * its own schedule — every few hours.
 */
function subscribePanel(feedUrl: string): string {
  return `<details class="subscribe">
    <summary>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2.5"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4"/></svg>
      Google Calendar
    </summary>
    <div class="subpanel">
      <b>Keep Google Calendar in step</b>
      <p>Air dates and deadlines from this board, updated as the board changes. Google refreshes
      subscribed calendars every few hours.</p>
      <div class="subopts" role="group" aria-label="What the calendar carries">
        <label><input type="checkbox" data-opt="airs" checked> Air dates</label>
        <label><input type="checkbox" data-opt="due" checked> Deadlines</label>
        <label><input type="checkbox" data-opt="batches"> Daily batches</label>
      </div>
      <div class="subcopy">
        <input type="text" readonly id="feedurl" value="${esc(feedUrl)}" aria-label="Calendar link" onclick="this.select()">
        <button type="button" class="chipbtn go" id="feedcopy">Copy</button>
      </div>
      <ol>
        <li>Copy the link.</li>
        <li><a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener">Open Google Calendar → From URL ↗</a></li>
        <li>Paste it and press <b>Add calendar</b>.</li>
      </ol>
      <p class="fine">Apple Calendar: <a id="feedwebcal" href="${esc(feedUrl.replace(/^https?:/, "webcal:"))}">subscribe here</a>.
      Keep the link private — anyone with it can read the calendar. Changing the board's password retires it.</p>
    </div>
  </details>
  <script>
  (function () {
    var base = ${JSON.stringify(feedUrl)};
    var input = document.getElementById("feedurl"), webcal = document.getElementById("feedwebcal");
    function update() {
      var u = new URL(base);
      document.querySelectorAll(".subopts input").forEach(function (b) {
        var o = b.dataset.opt;
        if (o === "batches") { if (b.checked) u.searchParams.set("batches", "1"); }
        else if (!b.checked) u.searchParams.set(o, "0");
      });
      input.value = u.toString();
      webcal.href = u.toString().replace(/^https?:/, "webcal:");
    }
    document.querySelectorAll(".subopts input").forEach(function (b) { b.addEventListener("change", update); });
    document.getElementById("feedcopy").addEventListener("click", function () {
      var btn = this;
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).then(
        function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); },
        function () { input.select(); document.execCommand("copy"); btn.textContent = "Copied"; });
    });
    document.addEventListener("click", function (e) {
      var d = document.querySelector(".subscribe");
      if (d && d.open && !d.contains(e.target)) d.open = false;
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
  feedUrl = "",
  chide: string[] = [],
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
  const offDays = new Set(shell.daysOff ?? []);

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
          (e) => `<a class="chip${e.record.status === "done" ? " done" : ""}${e.record.uploadedAt ? " uploaded" : ""}${e.record.noScriptAt && e.record.status === "open" ? " noscript" : ""}" draggable="true" data-id="${e.record.id}"
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

      const off = offDays.has(day);
      return `<div class="cell${outside ? " outside" : ""}${isToday ? " today" : ""}${off ? " off" : ""}" data-date="${day}">
        <a class="num" href="/day/${day}${q}">${num}${
          isToday ? `<span class="tag">today</span>` : ""
        }</a>
        ${offToggle(day, off)}
        ${
          mode === "posting"
            ? visibleGaps(shell.gaps, hide, chide).filter((g) => g.date === day).map((g) => `<a class="gapslot" href="/day/${day}${q}" style="--ch:${channelColour(g.channel)}" title="Nothing assigned — ${esc(g.channel)} is expected to post"><i></i><span class="t">${esc(g.channel.replace(/^Specular /, ""))} · nothing</span></a>`).join("")
            : ""
        }
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
      ${feedUrl ? subscribePanel(feedUrl) : ""}
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}${channelPicker(chide)}
      <span class="draghint">Drag anything to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      } — the channel's later videos follow. Shift-drop moves just the one.</span>
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
          saveMove(chip.dataset.id, cell.dataset.date, e.shiftKey);
        });
      });
      ${MOVED_JS}
    })();
    </script>`,
  );
}

/**
 * The scriptwriter's board, inside this one. Shown in a frame when his site
 * allows it; when it doesn't (many sites refuse to be framed, and a login
 * inside a frame can be blocked by the browser), a clear way to open it.
 */
export function renderScripts(shell: Shell, url: string, embeddable: boolean, why = ""): string {
  const open = `<a class="clear" href="${esc(url)}" target="_blank" rel="noopener">Open in a new tab ↗</a>`;
  return layout(
    "Scripts",
    shell,
    `${pageHeader("Scripts", open)}
    ${
      embeddable
        ? `<div class="scriptsframe"><iframe src="${esc(url)}" title="Scripts board"
             referrerpolicy="no-referrer" allow="clipboard-write"></iframe></div>
           <p class="hint">This is Josh's board, live. If it asks you to sign in and the
           sign-in doesn't stick, use <b>Open in a new tab</b> — some browsers block logins inside another site.</p>`
        : `<div class="panel scriptsblocked">
             <h2>Josh's board can't be shown inside this one</h2>
             <p class="hint">${esc(why || "The site doesn't allow being embedded in another page.")}
             It opens in its own tab instead, and stays signed in there.</p>
             <p style="margin-top:18px">${open}</p>
           </div>`
    }`,
  );
}

/** His statuses, in the order they need you, with a label and a colour each. */
const SCRIPT_GROUPS: Array<{ status: ScriptStatus; label: string; colour: string }> = [
  { status: "OVERDUE", label: "Overdue", colour: "#F2685E" },
  { status: "DUE_TODAY", label: "Due today", colour: "#EE9A55" },
  { status: "DUE_SOON", label: "Due soon", colour: "#F3E96C" },
  { status: "NO_DEADLINE", label: "No deadline found", colour: "#94949E" },
  { status: "PENDING", label: "Pending", colour: "#8D9BF2" },
  { status: "SUBMITTED_LATE", label: "Delivered late", colour: "#56C990" },
  { status: "SUBMITTED", label: "Delivered", colour: "#56C990" },
];

/**
 * The Scripts tab, from his board's own data: every script grouped by where
 * it stands, in this board's rows, with its air date, deadline, the script
 * doc he delivered and the Discord thread.
 */
export function renderScriptBoard(shell: Shell, url: string, report: ScriptReport): string {
  const open = `<a class="clear" href="${esc(url)}" target="_blank" rel="noopener">Open Josh's board ↗</a>`;
  const counts = SCRIPT_GROUPS.map((g) => ({ ...g, n: report.rows.filter((r) => r.status === g.status).length }));

  const scriptRow = (r: ScriptRow, colour: string) => {
    const done = r.status === "SUBMITTED" || r.status === "SUBMITTED_LATE";
    const meta: string[] = [];
    if (r.code) meta.push(`<span class="code">${esc(r.code)}</span>`);
    if (r.airDate) {
      const n = daysUntil(r.airDate);
      meta.push(`<span class="airs${!done && n >= 0 && n <= 3 ? " soon" : ""}">airs ${esc(usDate(r.airDate))} · ${esc(relativeDay(r.airDate))}</span>`);
    }
    if (r.role) meta.push(`<span>${esc(r.role.toLowerCase())}</span>`);
    r.delivered.slice(-1).forEach((l) => meta.push(`<a class="lnk" href="${esc(l)}" target="_blank" rel="noreferrer">Script doc ↗</a>`));
    if (r.discordUrl) meta.push(`<a class="lnk" href="${esc(r.discordUrl)}" target="_blank" rel="noreferrer">Discord ↗</a>`);
    if (r.needsReview) meta.push(`<span class="warn">needs a look</span>`);

    let pill = `<span class="due none">no deadline</span>`;
    if (done) {
      pill = `<span class="due delivered"><b>${r.status === "SUBMITTED_LATE" ? "Late" : "Sent"}</b>${
        r.deliveredAt ? esc(renderIn(r.deliveredAt, ORG_TZ, "ET").split(" @ ")[0] ?? "") : "delivered"
      }</span>`;
    } else if (r.deadline) {
      const ms = r.deadline.getTime() - Date.now();
      const h = Math.round(Math.abs(ms) / 3_600_000);
      const span = h < 1 ? "<1h" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
      const [date, time] = renderIn(r.deadline, ORG_TZ, "ET").split(" @ ");
      pill = `<span class="due${ms < 0 ? " late" : ms < 86_400_000 ? " soon" : ""}" title="${esc(renderIn(r.deadline, TEAM_TZ, "IST"))}"><b>Due</b>${esc(date ?? "")}<span class="tm">${esc((time ?? "").replace(/ ET$/, ""))}</span>${
        ms < 0 ? `<em>${span} late</em>` : ms < 86_400_000 ? `<em>in ${span}</em>` : ""
      }</span>`;
    }
    return `<div class="row${done ? " cleared" : ""}" style="--c:${colour}">
      <div class="title"><span class="swatch" style="border-radius:50%"></span><span class="t">${esc(r.title)}</span></div>
      <div class="meta">${meta.join("")}</div>
      ${pill}
    </div>`;
  };

  const groups = counts
    .filter((g) => g.n)
    .map((g) => {
      const list = report.rows
        .filter((r) => r.status === g.status)
        .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
      return `<div class="group" id="s-${g.status.toLowerCase()}">
        <div class="head" style="--c:${g.colour}"><span class="dot" style="border-radius:50%"></span>
          <span class="name">${esc(g.label)}</span><span class="n">${g.n}</span></div>
        <div class="rows">${list.map((r) => scriptRow(r, g.colour)).join("")}</div>
      </div>`;
    })
    .join("");

  const chips = counts
    .filter((g) => g.n)
    .map((g) => `<a class="cattoggle" href="#s-${g.status.toLowerCase()}" style="--c:${g.colour}"><i style="border-radius:50%"></i>${esc(g.label)} <b>${g.n}</b></a>`)
    .join("");

  return layout(
    "Scripts",
    shell,
    `${pageHeader("Scripts", open)}
    ${
      report.error
        ? `<div class="panel"><h2>Couldn't read Josh's board</h2><p class="hint">${esc(report.error)}</p></div>`
        : `<div class="cattoggles">${chips || ""}<span class="draghint">From Josh's board${
            report.generatedAt ? ` · updated ${esc(timeAgo(report.generatedAt))}` : ""
          }</span></div>
          ${groups || `<div class="empty">No scripts on Josh's board right now.</div>`}`
    }`,
  );
}

// ── uploads: the daily view (Bits, Reading) ───────────────────────────────

/** Five greens from nothing to on target: magnitude is one hue, dark to light. */
const HEAT = ["#26262C", "#1E3A2D", "#22553C", "#2A734F", "#3A9A6B", "#56C990"];

function dailyView(
  channels: string[],
  linkOf: Map<string, ChannelLink>,
  daily: DailyCadence[],
  range: number,
  typical: Map<string, { views: number; basis: string } | null>,
  category: CategoryId,
  now: Date,
  /** Where the range tabs point: the category, or one channel's own page. */
  base = `/uploads?cat=${category}&amp;`,
): string {
  // The Bits/Reading day: until 3 AM, "today" is still the day being finished.
  const today = shortsDay(now);
  const byName = new Map(daily.map((d) => [d.channel, d]));
  const linked = channels.filter((c) => linkOf.get(c)?.youtubeId);
  const live = linked.map((c) => byName.get(c)).filter((d): d is DailyCadence => Boolean(d));

  const todayDone = live.reduce((n, d) => n + Math.min(d.today, d.perDay), 0);
  const todayTarget = live.reduce((n, d) => n + d.perDay, 0);
  const onTargetToday = live.filter((d) => d.today >= d.perDay).length;
  const hits = live.filter((d) => d.hit30 !== null);
  const hit30 = hits.length ? Math.round((hits.reduce((n, d) => n + d.hit30!, 0) / hits.length) * 100) : null;
  const perDay7 = live.reduce((n, d) => n + (d.avg7 ?? 0), 0);
  const single = channels.length === 1 ? live[0] : undefined;
  const tiles = [
    { n: `${todayDone}/${todayTarget}`, l: "Shorts up today", cls: todayDone >= todayTarget && todayTarget ? "t-ok" : "" },
    single
      ? { n: String(single.streak), l: "days in a row on target", cls: single.streak >= 3 ? "t-ok" : "" }
      : { n: `${onTargetToday}/${live.length}`, l: "channels on target today", cls: "" },
    { n: hit30 === null ? "—" : `${hit30}%`, l: "days on target · 30 days", cls: "" },
    { n: perDay7.toFixed(1), l: `a day · last 7 · target ${todayTarget}`, cls: "" },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  const days: string[] = [];
  for (let i = range - 1; i >= 0; i -= 1) days.push(addDays(today, -i));
  const W = 1100, LABEL = 188, RIGHT = 70, ROW = 30, TOP = 30;
  const cw = (W - LABEL - RIGHT) / days.length;
  const H = TOP + channels.length * ROW + 6;
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

  const heads = days
    .map((d, i) => {
      const cx = LABEL + i * cw + cw / 2;
      const isToday = d === today;
      const show = isToday || (i % 7 === 0 && days.length - i > 3);
      return show ? `<text x="${cx.toFixed(1)}" y="${TOP - 10}" class="tick${isToday ? " today-l" : ""}" text-anchor="middle">${isToday ? "Today" : esc(usDate(d).replace(/\/\d{4}$/, ""))}</text>` : "";
    })
    .join("");

  const rowsSvg = channels
    .map((name, r) => {
      const y = TOP + r * ROW;
      const d = byName.get(name);
      const link = linkOf.get(name);
      const label = `<a href="${chanHref(name)}" class="lane-a"><circle cx="12" cy="${y + ROW / 2}" r="5" fill="${channelColour(name)}" class="ring"/>
        <text x="24" y="${y + ROW / 2 + 4}" class="lname">${esc(name.replace(/^Specular /, ""))}</text><title>${esc(name)} on its own</title></a>`;
      if (!link?.youtubeId || !d) {
        return `${label}<text x="${LABEL + 8}" y="${y + ROW / 2 + 4}" class="nolink">${
          link?.error ? `Couldn't read: ${esc(link.error)}` : "No link yet — add it below"
        }</text>`;
      }
      const cells = days
        .map((day, i) => {
          const n = d.counts.get(day) ?? 0;
          const step = n === 0 ? 0 : n >= d.perDay ? 5 : 1 + Math.min(3, Math.floor((n / d.perDay) * 4));
          const cx = LABEL + i * cw;
          const tip = `${name} · ${wd.format(new Date(`${day}T12:00:00Z`))} ${usDate(day)}: ${n} of ${d.perDay}${n >= d.perDay ? " ✓" : ""}`;
          return `<g data-tip="${esc(tip)}"><rect x="${(cx + 1).toFixed(1)}" y="${y + 3}" width="${Math.max(2, cw - 2).toFixed(1)}" height="${ROW - 6}" rx="4"
            fill="${HEAT[step]}"${day === today ? ' class="hot-today"' : ""}/>${
              cw >= 16 && n > 0
                ? `<text x="${(cx + cw / 2).toFixed(1)}" y="${y + ROW / 2 + 4}" text-anchor="middle" class="hc${step >= 4 ? " dark" : ""}">${n}</text>`
                : ""
            }</g>`;
        })
        .join("");
      const met = d.today >= d.perDay;
      return `${label}${cells}<text x="${W - RIGHT + 12}" y="${y + ROW / 2 + 4}" class="lstate ${met ? "ok" : d.today ? "due" : ""}">${met ? "✓" : ""} ${d.today}/${d.perDay}</text>`;
    })
    .join("");

  const ranges = [14, 30, 60]
    .map((r) => `<a class="tab${range === r ? " on" : ""}" href="${base}range=${r}">${r} days</a>`)
    .join("");

  const heatmap = `<div class="panel uplanes">
    <div class="uphead">
      <h2>Shorts a day, per channel</h2>
      <div class="ulegend" aria-label="Legend">
        <span><i class="lg-cell" style="background:${HEAT[0]}"></i>None</span>
        <span><i class="lg-cell" style="background:${HEAT[2]}"></i><i class="lg-cell" style="background:${HEAT[3]}"></i>Part of the day's number</span>
        <span><i class="lg-cell" style="background:${HEAT[5]}"></i>✓ On target</span>
      </div>
      <div class="tabs">${ranges}</div>
    </div>
    <div class="upscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Shorts per channel per day over the last ${range} days, against each channel's daily number">
      ${heads}${rowsSvg}</svg></div>
    <div class="uptip" hidden></div>
  </div>`;

  const tableRows = channels
    .map((name) => ({ name, d: byName.get(name), linked: Boolean(linkOf.get(name)?.youtubeId) }))
    .sort((a, b) => (a.d && b.d ? a.d.today / a.d.perDay - b.d.today / b.d.perDay : a.d ? -1 : 1))
    .map(({ name, d, linked: ok }) => {
      const t = typical.get(name);
      const met = d && d.today >= d.perDay;
      return `<tr>
        <td><a class="chlink" href="${chanHref(name)}"><span class="cdot" style="--ch:${channelColour(name)}"></span>${esc(name)}</a></td>
        <td>${ok && d ? `<span class="pace ${met ? "ok" : d.today ? "due" : "late"}">${met ? "✓" : d.today ? "◷" : "!"} ${d.today} of ${d.perDay}</span>` : "—"}</td>
        <td class="num">${d ? d.streak : "—"}</td>
        <td class="num">${d?.avg7 != null ? d.avg7.toFixed(1) : "—"}</td>
        <td class="num">${d?.hit30 != null ? `${Math.round(d.hit30 * 100)}%` : "—"}</td>
        <td>${d?.last ? `${esc(usDate(shortsDay(d.last)))} <small>${esc(relativeDay(shortsDay(d.last)))}</small>` : "—"}</td>
        <td class="num">${t ? `${esc(compactViews(Math.round(t.views)))} <small>${esc(t.basis)}</small>` : "—"}</td>
      </tr>`;
    })
    .join("");
  const table = `<div class="panel">
    <h2>${channels.length === 1 ? "Pace" : "By channel"}</h2>
    <div class="utable-wrap"><table class="utable">
      <thead><tr><th>Channel</th><th>Today</th><th class="num" title="Days in a row on target">Streak</th>
        <th class="num">A day · 7d</th><th class="num">On target · 30d</th><th>Last Short</th><th class="num">Typical views</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div>
  </div>`;

  return `<div class="utiles">${tiles}</div>${heatmap}${table}`;
}

// ── uploads: Shorts outliers (Bits, Reading) ──────────────────────────────

const TIER: Record<ShortTier, { label: string; icon: string; colour: string; r: number }> = {
  viral: { label: "Viral", icon: "🚀", colour: "#F8E27A", r: 7 },
  breakout: { label: "Breakout", icon: "🔥", colour: "#EE9A55", r: 5.5 },
  normal: { label: "Normal", icon: "", colour: "#6E6E78", r: 3.5 },
  soft: { label: "Soft", icon: "🫤", colour: "#B08A8A", r: 4 },
  flop: { label: "Flop", icon: "📉", colour: "#FF7A70", r: 5.5 },
};

function shortsPanel(
  channels: string[],
  uploads: Upload[],
  scores: Map<string, ShortScore>,
  health: ChannelShortHealth[],
  slots: SlotStat[],
  now: Date,
): string {
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const week = uploads.filter((u) => u.publishedAt.getTime() >= weekAgo && scores.has(u.videoId));
  const count = (t: ShortTier) => week.filter((u) => scores.get(u.videoId)!.tier === t).length;
  const beat = week.length ? Math.round((week.filter((u) => scores.get(u.videoId)!.multiple >= 1).length / week.length) * 100) : null;
  const tiles = [
    { n: `${count("viral")}`, l: "🚀 viral · 7 days", cls: count("viral") ? "t-ok" : "" },
    { n: `${count("breakout")}`, l: "🔥 breakouts · 7 days", cls: "" },
    { n: `${count("flop")}`, l: "📉 flops · 7 days", cls: count("flop") ? "t-late" : "" },
    { n: beat === null ? "—" : `${beat}%`, l: `beat their channel's usual · ${week.length} scored`, cls: "" },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  // The spread: every Short of the week on a log scale of its multiple.
  const W = 1100, LABEL = 188, RIGHT = 30, ROW = 34, TOP = 30;
  const lo = Math.log(0.1), hi = Math.log(10);
  const x = (m: number) => LABEL + ((Math.min(Math.max(Math.log(m), lo), hi) - lo) / (hi - lo)) * (W - LABEL - RIGHT);
  const H = TOP + channels.length * ROW + 8;
  const ticks = [0.1, 0.25, 0.5, 1, 2, 4, 10]
    .map((m) => `<line x1="${x(m).toFixed(1)}" x2="${x(m).toFixed(1)}" y1="${TOP - 6}" y2="${H - 6}" class="${m === 1 ? "one" : "wk"}"/>
      <text x="${x(m).toFixed(1)}" y="${TOP - 12}" text-anchor="middle" class="tick${m === 1 ? " today-l" : ""}">${m === 1 ? "usual" : `${m}×`}</text>`)
    .join("");
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * (ROW - 12);
  const rows = channels
    .map((name, i) => {
      const y = TOP + i * ROW + ROW / 2;
      const mine = week.filter((u) => u.channel === name).map((u) => ({ u, sc: scores.get(u.videoId)! }));
      const spread = mine[0]?.sc.spread;
      const band = spread
        ? `<rect x="${x(Math.exp(-spread)).toFixed(1)}" y="${y - ROW / 2 + 3}" width="${(x(Math.exp(spread)) - x(Math.exp(-spread))).toFixed(1)}" height="${ROW - 6}" rx="6" class="band"/>`
        : "";
      const dots = mine
        .sort((a, b) => (a.sc.tier === "normal" ? -1 : 0) - (b.sc.tier === "normal" ? -1 : 0))
        .map(({ u, sc }) => {
          const t = TIER[sc.tier];
          const tip = `${t.icon ? `${t.icon} ` : ""}${u.title} · ${u.views !== null ? `${u.views.toLocaleString()} views · ` : ""}${formatMultiple(sc.multiple)} usual ${sc.basis} · beat ${sc.percentile}% of the last ${sc.sample}`;
          return `<a href="${esc(u.url)}" target="_blank" rel="noreferrer" data-tip="${esc(tip)}">
            <circle cx="${x(sc.multiple).toFixed(1)}" cy="${(y + jitter()).toFixed(1)}" r="${t.r}" fill="${t.colour}" class="sdot ${sc.tier}"/></a>`;
        })
        .join("");
      return `<circle cx="12" cy="${y}" r="5" fill="${channelColour(name)}" class="ring"/>
        <text x="24" y="${y + 4}" class="lname">${esc(name.replace(/^Specular /, ""))}</text>
        <line x1="${LABEL}" x2="${W - RIGHT}" y1="${y}" y2="${y}" class="track"/>${band}${dots}${
          mine.length ? "" : `<text x="${LABEL + 8}" y="${y + 4}" class="nolink">${
            uploads.some((u) => u.channel === name && u.views !== null)
              ? "Nothing scored this week yet — Shorts score at 3 days old until tracking from upload has built up"
              : "No view counts yet for this channel — they arrive with the hourly read"
          }</text>`
        }`;
    })
    .join("");
  const spreadChart = `<div class="panel uplanes">
    <div class="uphead">
      <h2>This week's Shorts, against each channel's usual</h2>
      <div class="ulegend">
        ${(["viral", "breakout", "normal", "soft", "flop"] as ShortTier[]).map((t) => `<span><i class="lg-tier" style="--c:${TIER[t].colour}"></i>${TIER[t].icon} ${TIER[t].label}</span>`).join("")}
        <span><i class="lg-band"></i>Normal range</span>
      </div>
    </div>
    <div class="upscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Every Short of the last seven days, placed by its multiple of its channel's usual views on a log scale">
      ${ticks}${rows}</svg></div>
    <div class="uptip" hidden></div>
    <p class="hint">Each Short is compared with its channel's last 60 at the same age (1 hour, 3, 6, 24, 3 days, 7 days) on a log scale.
    Viral is three typical spreads above usual, breakout two; soft one below, flop two. The shaded band is each channel's normal range.
    Until those ages have been tracked from upload for enough Shorts (a couple of days after deploying), Shorts three days and older are compared on their views now.</p>
  </div>`;

  // Channel health.
  const trend = (h: ChannelShortHealth) => {
    if (h.thisWeek === null || h.lastWeek === null) return "—";
    const pct = Math.round((h.thisWeek / h.lastWeek - 1) * 100);
    return `<span class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
  };
  const healthRows = health
    .map((h) => `<tr>
      <td><span class="cdot" style="--ch:${channelColour(h.channel)}"></span>${esc(h.channel)}</td>
      <td class="num">${h.thisWeek === null ? "—" : esc(formatMultiple(h.thisWeek))}</td>
      <td class="num">${trend(h)}</td>
      <td class="num">${h.beatRate === null ? "—" : `${Math.round(h.beatRate * 100)}%`}</td>
      <td class="num">${h.counts.viral || "·"}</td><td class="num">${h.counts.breakout || "·"}</td>
      <td class="num">${h.counts.soft || "·"}</td><td class="num">${h.counts.flop || "·"}</td>
      <td class="num">${h.scored}</td>
    </tr>`)
    .join("");
  const healthTable = `<div class="panel">
    <h2>Channel health <span class="sub">this week against last</span></h2>
    <div class="utable-wrap"><table class="utable">
      <thead><tr><th>Channel</th><th class="num" title="Median multiple of this week's Shorts">Typical ×</th><th class="num">vs last week</th>
        <th class="num">Beat usual</th><th class="num">🚀</th><th class="num">🔥</th><th class="num">🫤</th><th class="num">📉</th><th class="num">Scored</th></tr></thead>
      <tbody>${healthRows}</tbody></table></div>
  </div>`;

  // The outliers themselves.
  const month = uploads.filter((u) => now.getTime() - u.publishedAt.getTime() < 30 * 86_400_000 && scores.has(u.videoId));
  const row = (u: Upload) => {
    const sc = scores.get(u.videoId)!;
    const t = TIER[sc.tier];
    return `<a class="prow" href="${esc(u.url)}" target="_blank" rel="noreferrer">
      <span class="pmult ${sc.tier === "flop" || sc.tier === "soft" ? "under" : "breakout"}">${esc(formatMultiple(sc.multiple))}</span>
      <span class="pbody"><span class="ut">${t.icon} ${esc(u.title)}</span>
        <span class="pmeta"><span class="cdot" style="--ch:${channelColour(u.channel)}"></span>${esc(u.channel)} · ${
          sc.tier === "flop" || sc.tier === "soft" ? `bottom ${Math.max(1, 100 - sc.percentile)}%` : `top ${Math.max(1, 100 - sc.percentile)}%`
        } · ${esc(compactViews(sc.value))} ${esc(sc.basis)} vs ${esc(compactViews(Math.round(sc.baseline)))} usual · ${esc(relativeDay(shortsDay(u.publishedAt)))}</span></span>
    </a>`;
  };
  const ups = month.filter((u) => ["viral", "breakout"].includes(scores.get(u.videoId)!.tier)).sort((a, b) => scores.get(b.videoId)!.z - scores.get(a.videoId)!.z).slice(0, 10);
  const downs = month.filter((u) => scores.get(u.videoId)!.tier === "flop").sort((a, b) => scores.get(a.videoId)!.z - scores.get(b.videoId)!.z).slice(0, 10);
  const outliers = `<div class="panel performers">
    <h2>Outliers <span class="sub">last 30 days, most unusual first</span></h2>
    <div class="pcols">
      <div><h3>🚀🔥 Above <span>${ups.length}</span></h3>${ups.map(row).join("") || `<p class="hint">None this month yet.</p>`}</div>
      <div><h3>📉 Flops <span>${downs.length}</span></h3>${downs.map(row).join("") || `<p class="hint">None this month.</p>`}</div>
    </div>
  </div>`;

  const maxSlot = Math.max(...slots.map((s) => s.median), 1);
  const slotPanel = slots.length
    ? `<div class="panel"><h2>When Shorts do best <span class="sub">three-hour slots, Eastern · median multiple of the channel's usual</span></h2>
        <ul class="slots">${slots
          .slice()
          .sort((a, b) => a.from - b.from)
          .map((sl) => `<li><span class="sl">${esc(sl.label)}</span>
            <span class="sb"><i style="width:${((sl.median / maxSlot) * 100).toFixed(0)}%" class="${sl.median >= 0.95 ? "up" : "down"}"></i></span>
            <b class="${sl.median >= 0.95 ? "up" : "down"}">${esc(formatMultiple(sl.median))}</b><small>${sl.count}</small></li>`)
          .join("")}</ul></div>`
    : "";

  return `<div class="utiles after">${tiles}</div>${spreadChart}${outliers}${healthTable}${slotPanel}`;
}

// ── uploads: ideas ────────────────────────────────────────────────────────

function liftText(lift: number): string {
  const pct = Math.round((lift - 1) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

function ideasPanel(
  category: CategoryId,
  a: IdeaAnalysis,
  idea: { title: string; check: IdeaCheck } | null,
  channels: string[] = [],
  channel: string | null = null,
  hooks: Map<string, string> = new Map(),
): string {
  const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? "";
  const scope = channel ?? `${catLabel} channels`;
  const ago = (d: Date) => relativeDay(dayOf(d));
  const vidLine = (v: IdeaVideo) => `<li><a href="${esc(v.url)}" target="_blank" rel="noreferrer">
      <span class="vm ${v.multiple! >= 1 ? "up" : "down"}">${esc(formatMultiple(v.multiple!))}</span>
      <span class="vt">${esc(v.title)}</span>
      <span class="vc"><span class="cdot" style="--ch:${channelColour(v.channel)}"></span>${esc(v.channel.replace(/^Specular /, ""))} · ${esc(ago(v.publishedAt))}</span>
    </a></li>`;
  const channelTable = (st: FeatureStat) =>
    st.byChannel.length > 1
      ? `<div class="ibych">${st.byChannel
          .slice(0, 6)
          .map((c) => `<span><span class="cdot" style="--ch:${channelColour(c.channel)}"></span>${esc(c.channel.replace(/^Specular /, ""))}
            <b class="${c.median >= a.overall ? "up" : "down"}">${esc(formatMultiple(c.median))}</b> <small>${c.count}</small></span>`)
          .join("")}</div>`
      : "";
  const statDetail = (st: FeatureStat) => {
    const best = st.videos.slice(0, 3);
    const worst = st.videos.length > 4 ? st.videos.slice(-2).reverse() : [];
    return `<div class="idetail">
      <p class="imeta">${st.count} judged videos · median ${esc(formatMultiple(st.median))} their channel's usual
        (all ${esc(catLabel)}: ${esc(formatMultiple(a.overall))}) · last used ${esc(ago(st.lastUsed))}</p>
      ${channelTable(st)}
      <h4>Best</h4><ul class="ivids">${best.map(vidLine).join("")}</ul>
      ${worst.length ? `<h4>Weakest</h4><ul class="ivids">${worst.map(vidLine).join("")}</ul>` : ""}
    </div>`;
  };
  const statRow = (st: FeatureStat) => `<li><details>
      <summary><span class="ik">${esc(st.key)}</span>
        <span class="il ${st.lift >= 1 ? "up" : "down"}">${esc(liftText(st.lift))}</span>
        <span class="in">${st.count} video${st.count === 1 ? "" : "s"}</span></summary>
      ${statDetail(st)}
    </details></li>`;
  const list = (title: string, xs: FeatureStat[], n: number) =>
    `<div class="icol"><h3>${esc(title)}</h3>${xs.length ? `<ul class="ilist">${xs.slice(0, n).map(statRow).join("")}</ul>` : `<p class="hint">Not enough yet.</p>`}</div>`;

  const picker = channels.length > 1
    ? `<form method="get" action="/uploads" class="ichan">
        <input type="hidden" name="cat" value="${category}">
        <label>Ideas for
          <select name="ch" onchange="this.form.submit()">
            <option value="">all ${esc(catLabel)} channels</option>
            ${channels.map((c) => `<option value="${esc(c)}"${c === channel ? " selected" : ""}>${esc(c)}</option>`).join("")}
          </select>
        </label>
      </form>`
    : "";

  const checker = `<form method="get" action="/uploads" class="ichecker">
      <input type="hidden" name="cat" value="${category}">
      ${channel ? `<input type="hidden" name="ch" value="${esc(channel)}">` : ""}
      <input type="text" name="idea" value="${esc(idea?.title ?? "")}" placeholder="Type a title idea — e.g. What If Gojo Joined The Avengers?" autocomplete="off">
      <button class="clear">Check idea</button>
    </form>
    ${
      idea
        ? `<div class="iresult">
            <div class="ipred ${idea.check.predicted >= 1.15 ? "up" : idea.check.predicted <= 0.87 ? "down" : ""}">
              <b>${esc(formatMultiple(idea.check.predicted))}</b>
              <span>${idea.check.predicted >= 1.15 ? "likely above usual" : idea.check.predicted <= 0.87 ? "likely below usual" : "about usual"} · ${esc(idea.check.confidence)} confidence</span>
            </div>
            <div class="ireasons">${
              idea.check.reasons.length
                ? idea.check.reasons
                    .map((r) => `<span class="ichip ${r.lift >= 1 ? "up" : "down"}">${esc(r.label)} <b>${esc(liftText(r.lift))}</b> <small>${r.count}</small></span>`)
                    .join("")
                : `<span class="hint">Nothing in this title matches a format or subject with enough history yet${
                    idea.check.subjects.length ? ` (read as ${esc(idea.check.subjects.join(", "))})` : ""
                  }.</span>`
            }</div>
          </div>`
        : ""
    }`;

  const suggestion = (sg: Suggestion) => {
    const d = sg.details;
    return `<li><details class="isg">
      <summary>
        <span class="ikind ${sg.kind}">${sg.kind === "pairing" ? "New pairing" : sg.kind === "sequel" ? "Follow-up" : "Bring back"}</span>
        <span class="iidea">${esc(sg.idea)}</span><span class="iwhy">${esc(sg.why)}</span>
        <span class="imore">Details ▾</span>
      </summary>
      <div class="idetail">
        ${d.drafts.length ? `<h4>Titles to start from</h4><ol class="idrafts">${d.drafts.map((t) => `<li><a href="/uploads?cat=${category}${channel ? `&amp;ch=${encodeURIComponent(channel)}` : ""}&amp;idea=${encodeURIComponent(t)}" title="Check this title">${esc(t)}</a></li>`).join("")}</ol>` : ""}
        ${d.source ? `<h4>The hit it builds on</h4><ul class="ivids">${vidLine(d.source)}</ul>` : ""}
        ${d.source && hooks.get(d.source.url) ? `<h4>How it opened</h4><blockquote class="shook">${esc(hooks.get(d.source.url)!)}</blockquote>` : ""}
        <div class="ifacts">
          ${d.bestChannel ? `<span><b>Best channel</b> ${esc(d.bestChannel.channel)} · ${esc(formatMultiple(d.bestChannel.median))} usual</span>` : ""}
          ${d.bestDay ? `<span><b>Best day</b> ${esc(d.bestDay.key)} · ${esc(liftText(d.bestDay.lift))}</span>` : ""}
          ${d.lastUsedDays !== null ? `<span><b>Last done</b> ${d.lastUsedDays} days ago</span>` : `<span><b>Last done</b> never</span>`}
        </div>
        ${d.evidence.map((e) => `<h4>${esc(e.label)} · ${esc(liftText(e.stat.lift))} over ${e.stat.count} videos</h4>${channelTable(e.stat)}<ul class="ivids">${e.stat.videos.slice(0, 3).map(vidLine).join("")}</ul>`).join("")}
        ${d.caveats.length ? `<h4>Watch out</h4><ul class="icav">${d.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      </div>
    </details></li>`;
  };

  return `<div class="panel ideas" id="ideas">
    <div class="ihead-row">
      <h2>Ideas <span class="sub">from ${a.judged} videos on ${esc(scope)}, each judged against its channel's usual</span></h2>
      ${picker}
    </div>
    ${checker}
    ${
      a.judged < 6
        ? `<p class="hint">Ideas need at least six judged videos${channel ? " on this channel" : " in this category"} — videos are judged once they're two weeks old, or sooner as the hourly view history builds up.</p>`
        : `<div class="icols">
            ${list("Formats", a.formats, 6)}
            ${list("Subjects", a.subjects, 8)}
            <div class="icol"><h3>Best days</h3>${a.days.length ? `<ul class="ilist">${a.days.slice(0, 3).map(statRow).join("")}</ul>` : `<p class="hint">Not enough yet.</p>`}
              <h3 style="margin-top:14px">Title length</h3><ul class="ilist">${[a.length.short, a.length.long]
                .filter((x): x is FeatureStat => Boolean(x))
                .map(statRow)
                .join("")}</ul></div>
          </div>
          <h3 class="ihead">Suggested ideas <span class="sub">— open one for titles, evidence and where to post it</span></h3>
          ${a.suggestions.length ? `<ul class="isugg">${a.suggestions.map(suggestion).join("")}</ul>` : `<p class="hint">No suggestions yet — they need a few formats and subjects with a track record.</p>`}`
    }
  </div>`;
}

// ── uploads ───────────────────────────────────────────────────────────────

/** 🔥 3.4× / 📉 0.4× beside a video, or nothing when it's normal or unscored. */
function verdictBadge(p: Performance | undefined): string {
  if (!p || p.verdict === "normal") return "";
  return ` <span class="vbadge ${p.verdict}">${p.verdict === "breakout" ? "🔥" : "📉"} ${esc(formatMultiple(p.multiple))}</span>`;
}



const PACE: Record<PaceState, { label: string; icon: string; cls: string }> = {
  "on-pace": { label: "On pace", icon: "✓", cls: "ok" },
  due: { label: "Due today", icon: "◷", cls: "due" },
  behind: { label: "Behind", icon: "!", cls: "late" },
  none: { label: "No uploads yet", icon: "–", cls: "none" },
};

/** One channel on the Uploads page by itself. */
export interface ChannelFocus {
  channel: string;
  /** Every upload the board has for it, newest first. */
  all: Upload[];
  /** Stories only: Story Lab ideas ranked by how well they fit this channel, and why. */
  lab?: Array<{ idea: LabIdea; fit: string[] }>;
}

/** A channel's own Uploads page. */
export function chanHref(name: string): string {
  return `/uploads/channel/${CHANNELS.find((c) => c.name === name)?.id ?? ""}`;
}

/** How a video did: a Short by its tier against the channel's last sixty, a long-form video by its verdict. */
function judged(u: Upload, perf: Map<string, Performance>, shorts: Map<string, ShortScore> | null) {
  const s = shorts?.get(u.videoId);
  if (s) return { multiple: s.multiple, kind: s.tier === "viral" || s.tier === "breakout" ? "up" : s.tier === "flop" ? "down" : s.tier === "soft" ? "soft" : "mid", badge: TIER[s.tier].icon ? `${TIER[s.tier].icon} ${TIER[s.tier].label}` : "", note: `top ${Math.max(1, 100 - s.percentile)}% · ${s.basis}` };
  const p = perf.get(u.videoId);
  if (p) return { multiple: p.multiple, kind: p.verdict === "breakout" ? "up" : p.verdict === "under" ? "down" : "mid", badge: p.verdict === "breakout" ? "🔥 Breakout" : p.verdict === "under" ? "📉 Under" : "", note: p.basis };
  return null;
}

const medianOf = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length ? (v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2) : null;
};

/**
 * What stands out on one channel: its usual, how often it beats it, the
 * spread of every scored video, the best and the weakest, whether it's
 * trending up, and (long form) which days do best.
 */
function outlierPanel(
  f: ChannelFocus,
  perf: Map<string, Performance>,
  shorts: Map<string, ShortScore> | null,
  typical: { views: number; basis: string } | null,
  now: Date,
): string {
  const scored = f.all
    .map((u) => ({ u, j: judged(u, perf, shorts) }))
    .filter((x): x is { u: Upload; j: NonNullable<ReturnType<typeof judged>> } => x.j !== null);
  if (!scored.length) {
    return `<div class="panel"><h2>Outliers</h2><p class="hint">Scores appear once the channel has three earlier videos to compare
      with at the same age — straight away for older videos, within days for new ones as the view snapshots build up.</p></div>`;
  }
  const ms = scored.map((x) => x.j.multiple);
  const up = scored.filter((x) => x.j.kind === "up");
  const down = scored.filter((x) => x.j.kind === "down");
  const beat = Math.round((ms.filter((m) => m >= 1).length / ms.length) * 100);
  const newest = [...scored].sort((a, b) => b.u.publishedAt.getTime() - a.u.publishedAt.getTime());
  const recent = medianOf(newest.slice(0, 10).map((x) => x.j.multiple));
  const before = medianOf(newest.slice(10, 20).map((x) => x.j.multiple));
  const trend = recent !== null && before !== null && newest.length >= 14 ? recent / before - 1 : null;
  const tiles = [
    { n: typical ? compactViews(Math.round(typical.views)) : "—", l: `typical views${typical ? ` · ${typical.basis}` : ""}`, cls: "" },
    { n: `${beat}%`, l: `beat the channel's usual · ${ms.length} scored`, cls: beat >= 50 ? "t-ok" : "" },
    { n: `${up.length}`, l: `${shorts ? "🚀🔥 viral or breakout" : "🔥 breakouts (≥2×)"} · ${Math.round((up.length / ms.length) * 100)}%`, cls: up.length ? "t-ok" : "" },
    { n: `${down.length}`, l: `${shorts ? "📉 flops" : "📉 under (≤½)"} · ${Math.round((down.length / ms.length) * 100)}%`, cls: down.length ? "t-late" : "" },
    {
      n: trend === null ? "—" : `${trend >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(trend * 100))}%`,
      l: trend === null ? "trend · needs 14 scored" : `last 10 vs the 10 before · ${formatMultiple(recent!)} now`,
      cls: trend === null ? "" : trend >= 0.1 ? "t-ok" : trend <= -0.1 ? "t-late" : "",
    },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  // The spread: every scored video by how it did against the usual.
  const bins = [
    { l: "½× or less", test: (m: number) => m <= 0.5, cls: "down" },
    { l: "½–0.8×", test: (m: number) => m > 0.5 && m < 0.8, cls: "soft" },
    { l: "0.8–1.25×", test: (m: number) => m >= 0.8 && m < 1.25, cls: "mid" },
    { l: "1.25–2×", test: (m: number) => m >= 1.25 && m < 2, cls: "good" },
    { l: "2–4×", test: (m: number) => m >= 2 && m < 4, cls: "up" },
    { l: "4× or more", test: (m: number) => m >= 4, cls: "up" },
  ].map((b) => ({ ...b, n: ms.filter(b.test).length }));
  const most = Math.max(1, ...bins.map((b) => b.n));
  const spread = bins
    .map((b) => `<div class="obar ${b.cls}"><span class="ol">${esc(b.l)}</span>
      <span class="ot"><i style="width:${((b.n / most) * 100).toFixed(1)}%"></i></span><b>${b.n}</b></div>`)
    .join("");

  const line = ({ u, j }: (typeof scored)[number]) => `<li><a href="${esc(u.url)}" target="_blank" rel="noreferrer">
      <span class="vm ${j.multiple >= 1 ? "up" : "down"}">${esc(formatMultiple(j.multiple))}</span>
      <span class="vt">${esc(u.title)}</span>
      <span class="vc">${esc(usDate(dayOf(u.publishedAt)))}${u.views !== null ? ` · ${esc(compactViews(u.views))} views` : ""}</span></a></li>`;
  const byMultiple = [...scored].sort((a, b) => b.j.multiple - a.j.multiple);

  // Long form: which day of the week does best, where there's enough to say.
  let days = "";
  if (!shorts) {
    const wd = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: ORG_TZ });
    const byDay = new Map<string, number[]>();
    for (const x of scored) {
      const d = wd.format(x.u.publishedAt);
      byDay.set(d, [...(byDay.get(d) ?? []), x.j.multiple]);
    }
    const rows = [...byDay]
      .filter(([, list]) => list.length >= 2)
      .map(([d, list]) => ({ d, n: list.length, med: medianOf(list)! }))
      .sort((a, b) => b.med - a.med);
    if (rows.length >= 2) {
      days = `<div><h3>By day posted <span>ET</span></h3><div class="odays">${rows
        .map((r) => `<span class="${r.med >= 1 ? "up" : "down"}"><b>${esc(r.d)}</b>${esc(formatMultiple(r.med))}<small>${r.n} videos</small></span>`)
        .join("")}</div></div>`;
    }
  }

  return `<div class="panel outliers">
    <h2>Outliers <span class="sub">— every scored video against ${esc(f.channel)}'s own usual at the same age</span></h2>
    <div class="utiles">${tiles}</div>
    <div class="ocols">
      <div><h3>The spread</h3>${spread}</div>
      <div><h3>Best</h3><ul class="ivids">${byMultiple.slice(0, 4).map(line).join("")}</ul></div>
      <div><h3>Weakest</h3><ul class="ivids">${byMultiple.slice(-4).reverse().map(line).join("")}</ul></div>
      ${days}
    </div>
  </div>`;
}

/**
 * Every video the board has for the channel — views, how it did against the
 * usual, its tier — sortable and filterable, sixty at a time.
 */
function everyVideoPanel(f: ChannelFocus, perf: Map<string, Performance>, shorts: Map<string, ShortScore> | null, now: Date): string {
  const SHOW = 60;
  const rows = f.all
    .map((u, i) => {
      const j = judged(u, perf, shorts);
      const age = relativeDay(dayOf(u.publishedAt));
      return `<a class="evrow ${j?.kind ?? "none"}" href="${esc(u.url)}" target="_blank" rel="noreferrer"
        data-t="${u.publishedAt.getTime()}" data-v="${u.views ?? -1}" data-m="${j ? j.multiple.toFixed(4) : -1}" data-k="${j?.kind ?? "none"}"${i >= SHOW ? " hidden" : ""}>
        <span class="evm ${j ? (j.multiple >= 1 ? "up" : "down") : ""}" title="${esc(j ? `${formatMultiple(j.multiple)} the channel's usual · ${j.note}` : "Not scored yet")}">${j ? esc(formatMultiple(j.multiple)) : "—"}</span>
        <span class="evt">${esc(u.title)}</span>
        <span class="evd">${esc(usDate(dayOf(u.publishedAt)))} · ${esc(age)}</span>
        <span class="evv">${u.views !== null ? `${esc(compactViews(u.views))}` : "—"}<small> views</small></span>
        <span class="evtier">${j?.badge ? esc(j.badge) : ""}</span>
      </a>`;
    })
    .join("");
  void now;
  const n = f.all.length;
  return `<div class="panel everyvid" id="everyvid">
    <div class="uphead">
      <h2>Every video <span class="sub">${n} upload${n === 1 ? "" : "s"} · views as of the last read</span></h2>
      <div class="tabs evsort" role="group" aria-label="Sort">
        <button type="button" class="tab on" data-sort="t">Newest</button>
        <button type="button" class="tab" data-sort="v">Most viewed</button>
        <button type="button" class="tab" data-sort="m">Best vs usual</button>
        <button type="button" class="tab" data-sort="w">Weakest</button>
      </div>
      <div class="tabs evfilter" role="group" aria-label="Show">
        <button type="button" class="tab on" data-f="all">All</button>
        <button type="button" class="tab" data-f="up">Outliers up</button>
        <button type="button" class="tab" data-f="down">Outliers down</button>
      </div>
    </div>
    <div class="evlist" id="evlist">${rows || `<p class="hint">No uploads read yet.</p>`}</div>
    ${n > SHOW ? `<button type="button" class="clear secondary evmore" id="evmore">Show all ${n}</button>` : ""}
    <script>
    (function () {
      var list = document.getElementById("evlist"), more = document.getElementById("evmore");
      var rows = Array.prototype.slice.call(list.querySelectorAll(".evrow"));
      var key = "t", only = "all", all = false, LIMIT = ${SHOW};
      function num(el, k) { return Number(el.getAttribute("data-" + k)); }
      function draw() {
        var picked = rows.filter(function (r) { return only === "all" || r.getAttribute("data-k") === only; });
        picked.sort(function (a, b) {
          if (key === "w") {
            var am = num(a, "m"), bm = num(b, "m");
            if (am < 0) return 1;
            if (bm < 0) return -1;
            return am - bm;
          }
          return num(b, key) - num(a, key);
        });
        rows.forEach(function (r) { r.hidden = true; });
        picked.forEach(function (r, i) { r.hidden = !all && i >= LIMIT; list.appendChild(r); });
        if (more) more.hidden = all || picked.length <= LIMIT;
      }
      function pick(group, attr, set) {
        document.querySelectorAll(group + " button").forEach(function (b) {
          b.addEventListener("click", function () {
            document.querySelectorAll(group + " button").forEach(function (x) { x.classList.toggle("on", x === b); });
            set(b.getAttribute(attr));
            draw();
          });
        });
      }
      pick(".evsort", "data-sort", function (v) { key = v; });
      pick(".evfilter", "data-f", function (v) { only = v; });
      if (more) more.addEventListener("click", function () { all = true; draw(); });
    })();
    </script>
  </div>`;
}

/** Story Lab's ideas, the ones that fit this channel first, each opening its blueprint. */
function channelLabPanel(f: ChannelFocus): string {
  const items = (f.lab ?? [])
    .map(({ idea, fit }) => {
      const qs = new URLSearchParams({
        format: idea.format,
        ...(idea.hero ? { hero: idea.hero.id } : {}),
        ...(idea.world ? { world: idea.world.id } : {}),
        ...(idea.power ? { power: idea.power.id } : {}),
        ...(idea.target ? { target: idea.target.id } : {}),
        ...(idea.shape ? { shape: idea.shape } : {}),
      }).toString();
      const why = [...fit, ...idea.reasons.slice(0, 1).map((r) => r.text)];
      return `<li><a href="/story-lab?${esc(qs)}#blueprint">
        <b>${esc(idea.title)}</b>
        <span class="lf">${esc(FORMAT_BY_ID.get(idea.format)?.name ?? idea.format)}</span>
        ${why.length ? `<span class="why">${why.map(esc).join(" · ")}</span>` : ""}
      </a></li>`;
    })
    .join("");
  return `<div class="panel ideas chlab">
    <h2>What ${esc(f.channel)} could make next <span class="sub">— Story Lab's ideas that fit this channel's worlds, heroes and formats; none already public on any channel</span></h2>
    ${items ? `<ul class="isugg">${items}</ul>` : `<p class="hint">Nothing fits yet — see <a href="/story-lab">Story Lab</a> for every idea.</p>`}
    <p class="hint">Each opens its part-by-part blueprint in <a href="/story-lab">Story Lab</a>.</p>
  </div>`;
}

/**
 * The Uploads tab: whether each Stories channel is keeping to one long-form
 * upload every four days. Tiles for the headline, a timeline lane per channel
 * — every upload a dot, every gap coloured by whether it kept the pace, the
 * wait since the last one running up to today and on to when the next is due
 * — then the same thing as a table, the latest uploads, and the links.
 */
export function renderUploads(
  shell: Shell,
  data: {
    channels: string[];
    links: ChannelLink[];
    uploads: Upload[];
    cadence: ChannelCadence[];
    range: number;
    hasKey: boolean;
    perf?: Map<string, Performance>;
    typical?: Map<string, { views: number; basis: string } | null>;
    category?: CategoryId;
    daily?: DailyCadence[];
    ideas?: IdeaAnalysis;
    idea?: { title: string; check: IdeaCheck } | null;
    ideaChannel?: string | null;
    shorts?: { scores: Map<string, ShortScore>; health: ChannelShortHealth[]; slots: SlotStat[] };
    /** Each Stories video's opening, from its script, by the video's link. */
    hooks?: Map<string, string>;
    /** One channel on its own page: every upload it has, and Story Lab ideas that fit it. */
    focus?: ChannelFocus;
  },
  now = new Date(),
): string {
  const category: CategoryId = data.category ?? "stories";
  const focus = data.focus ?? null;
  const target = UPLOAD_TARGETS[category];
  // Targets are per channel: Stories every four days, Specular one a day,
  // others none. A channel with no target still shows every gap, none "late".
  const everyOf = (name: string) => everyFor(name);
  const targeted = data.channels.filter((n) => everyOf(n) !== null);
  const hasTarget = targeted.length > 0;
  const everyValues = [...new Set(targeted.map((n) => everyOf(n)!))];
  const every = everyValues.length ? Math.max(...everyValues) : STORIES_EVERY_DAYS;
  // One target shared by every channel reads as a heading; a mix doesn't.
  const uniform = everyValues.length === 1 && targeted.length === data.channels.length;
  const everyText = (d: number) => (d === 1 ? "one a day" : `every ${d} days`);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? "Stories";
  const q = (extra = "") => `/uploads?cat=${category}${extra}`;
  const perf = data.perf ?? new Map<string, Performance>();
  const typical = data.typical ?? new Map();
  const perfNote = (id: string) => {
    const p = perf.get(id);
    return p ? ` · ${formatMultiple(p.multiple)} usual (${p.basis})` : "";
  };
  const today = dayOf(now);
  const linkOf = new Map(data.links.map((l) => [l.channel, l]));
  const cad = new Map(data.cadence.map((c) => [c.channel, c]));
  const linked = data.channels.filter((c) => linkOf.get(c)?.youtubeId);
  const tracked = data.cadence.filter((c) => linked.includes(c.channel));

  // ── tiles
  const trackedT = tracked.filter((c) => everyOf(c.channel) !== null);
  const linkedT = linked.filter((n) => everyOf(n) !== null);
  const onPace = trackedT.filter((c) => c.state === "on-pace" || c.state === "due").length;
  const behind = trackedT.filter((c) => c.state === "behind").length;
  const last30 = tracked.reduce((n, c) => n + c.uploads30, 0);
  const target30 = Math.round(linkedT.reduce((n, name) => n + 30 / everyOf(name)!, 0));
  const gapsT = trackedT.flatMap((c) => c.gaps.filter((g) => g.to > addDays(today, -90)).map((g) => ({ g, ev: everyOf(c.channel)! })));
  const onTime = gapsT.length ? Math.round((gapsT.filter(({ g, ev }) => g.days <= ev).length / gapsT.length) * 100) : null;
  const allGaps = tracked.flatMap((c) => c.gaps.filter((g) => g.to > addDays(today, -90)).map((g) => g.days)).sort((x, y) => x - y);
  const medGap = allGaps.length ? allGaps[Math.floor(allGaps.length / 2)]! : null;
  const active7 = tracked.filter((c) => c.daysSince !== null && c.daysSince <= 7).length;
  const tiles = (hasTarget
    ? [
        { n: linkedT.length ? `${onPace}/${linkedT.length}` : "—", l: uniform ? "on pace" : targeted.length === 1 ? `on pace · ${targeted[0]} ${everyText(everyOf(targeted[0]!)!)}` : "on pace · channels with a target", cls: "t-ok" },
        { n: String(behind), l: "behind", cls: behind ? "t-late" : "" },
        { n: `${last30}`, l: `uploads · 30 days · target ${target30}`, cls: "" },
        { n: onTime === null ? "—" : `${onTime}%`, l: "gaps on time · 90 days", cls: "" },
      ]
    : [
        { n: linked.length ? `${active7}/${linked.length}` : "—", l: "posted in the last 7 days", cls: "" },
        { n: `${last30}`, l: "uploads · 30 days", cls: "" },
        { n: medGap === null ? "—" : `${medGap}d`, l: "typical gap · 90 days", cls: "" },
        { n: String(linked.length), l: "channels tracked", cls: "" },
      ])
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  // ── the timeline
  const W = 1100, LABEL = 188, RIGHT = 70, ROW = 36, TOP = 34;
  const start = addDays(today, -data.range);
  const end = addDays(today, hasTarget ? every + 2 : 3);
  const span = daysBetween(start, end);
  const x = (day: string) => LABEL + (daysBetween(start, day) / span) * (W - LABEL - RIGHT);
  const H = TOP + data.channels.length * ROW + 8;
  const byChannel = new Map<string, Upload[]>();
  for (const u of data.uploads) {
    if (!byChannel.has(u.channel)) byChannel.set(u.channel, []);
    byChannel.get(u.channel)!.push(u);
  }

  // Week lines, labelled on Mondays; the tick labels are M/D.
  const grid: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) continue;
    const gx = x(d).toFixed(1);
    grid.push(`<line x1="${gx}" x2="${gx}" y1="${TOP - 6}" y2="${H - 6}" class="wk"/>`);
    // Today's own label wins where the two would collide.
    if (Math.abs(x(d) - x(today)) > 34) {
      grid.push(`<text x="${gx}" y="${TOP - 14}" class="tick" text-anchor="middle">${esc(usDate(d).replace(/\/\d{4}$/, ""))}</text>`);
    }
  }
  const tx = x(today).toFixed(1);
  grid.push(`<line x1="${tx}" x2="${tx}" y1="${TOP - 6}" y2="${H - 6}" class="today"/>`);
  grid.push(`<text x="${tx}" y="${TOP - 14}" class="tick today-l" text-anchor="middle">Today</text>`);

  const lanes = data.channels
    .map((name, i) => {
      const y = TOP + i * ROW + ROW / 2;
      const c = cad.get(name);
      const link = linkOf.get(name);
      const colour = channelColour(name);
      const label = `<a href="${chanHref(name)}" class="lane-a"><g class="lane-l"><circle cx="12" cy="${y}" r="5" fill="${colour}" class="ring"/>
        <text x="24" y="${y + 4}" class="lname">${esc(name.replace(/^Specular /, ""))}</text></g><title>${esc(name)} on its own</title></a>`;
      const track = `<line x1="${LABEL}" x2="${W - RIGHT}" y1="${y}" y2="${y}" class="track"/>`;
      if (!link?.youtubeId) {
        return `${label}${track}<text x="${LABEL + 8}" y="${y + 4}" class="nolink">${
          link?.error ? `Couldn't read: ${esc(link.error)}` : "No link yet — add it below"
        }</text>`;
      }
      const vids = (byChannel.get(name) ?? []).slice().sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
      const days = [...new Set(vids.map((v) => dayOf(v.publishedAt)))].sort();
      const clamp = (d: string) => (d < start ? start : d);

      // Gaps between uploads, the late ones in red with their length.
      const ev = everyOf(name);
      const segs = (c?.gaps ?? [])
        .filter((g) => g.to >= start)
        .map((g) => {
          const late = ev !== null && g.days > ev;
          const x1 = x(clamp(g.from)), x2 = x(g.to);
          const mid = (x1 + x2) / 2;
          const tip = `${g.days}-day gap · ${usDate(g.from)} → ${usDate(g.to)}${late ? ` · ${g.days - ev!} over` : ev !== null ? " · on pace" : ""}`;
          return `<g class="seg ${late ? "late" : "ok"}" data-tip="${esc(tip)}">
            <line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${y}" y2="${y}"/>
            <rect x="${x1.toFixed(1)}" y="${y - 9}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="18" class="hit"/>
            ${late && x2 - x1 > 28 ? `<text x="${mid.toFixed(1)}" y="${y - 8}" text-anchor="middle" class="glab">${g.days}d</text>` : ""}
          </g>`;
        })
        .join("");

      // The wait since the last upload, and the target beyond it.
      let wait = "";
      if (c?.lastDay && c.nextDue) {
        const over = c.state === "behind";
        const x1 = x(clamp(c.lastDay)), x2 = x(today);
        wait = `<g class="seg wait ${over ? "late" : "ok"}" data-tip="${esc(
          `${c.daysSince} day${c.daysSince === 1 ? "" : "s"} since the last upload${over ? ` · ${c.behindBy} over` : ""}`,
        )}"><line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${y}" y2="${y}"/>
          <rect x="${x1.toFixed(1)}" y="${y - 9}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="18" class="hit"/></g>`;
        if (ev !== null && c.nextDue >= today) {
          const dx = x(c.nextDue);
          wait += `<g class="due-mark" data-tip="${esc(`Next due ${usDate(c.nextDue)} · ${relativeDay(c.nextDue)}`)}">
            <line x1="${x2.toFixed(1)}" x2="${dx.toFixed(1)}" y1="${y}" y2="${y}" class="ahead"/>
            <path d="M${dx.toFixed(1)} ${y - 6} l6 6 l-6 6 l-6 -6 z"/>
            <rect x="${(dx - 10).toFixed(1)}" y="${y - 10}" width="20" height="20" class="hit"/></g>`;
        }
      }

      const dots = vids
        .filter((v) => dayOf(v.publishedAt) >= start)
        .map((v) => {
          const vx = x(dayOf(v.publishedAt)).toFixed(1);
          const p = perf.get(v.videoId);
          const tip = `${p?.verdict === "breakout" ? "🔥 " : p?.verdict === "under" ? "📉 " : ""}${v.title} · ${usDate(dayOf(v.publishedAt))}${
            v.views !== null ? ` · ${v.views.toLocaleString()} views` : ""
          }${perfNote(v.videoId)}`;
          // A breakout wears a gold halo; an underperformer a dashed one.
          const halo =
            p?.verdict === "breakout"
              ? `<circle cx="${vx}" cy="${y}" r="9.5" class="halo-up"/>`
              : p?.verdict === "under"
                ? `<circle cx="${vx}" cy="${y}" r="9" class="halo-down"/>`
                : "";
          return `<a href="${esc(v.url)}" target="_blank" rel="noreferrer" class="up" data-tip="${esc(tip)}">
            <circle cx="${vx}" cy="${y}" r="11" class="hit"/>${halo}
            <circle cx="${vx}" cy="${y}" r="5.5" fill="${colour}" class="ring"/></a>`;
        })
        .join("");

      const state = c ? PACE[c.state] : PACE.none;
      const status = ev !== null
        ? `<text x="${W - RIGHT + 12}" y="${y + 4}" class="lstate ${state.cls}">${state.icon} ${
            c?.state === "behind" ? `${c.behindBy}d` : c?.state === "on-pace" ? (c.daysSince === 0 ? "today" : `${c.daysSince}d`) : c?.state === "due" ? "today" : ""
          }</text>`
        : `<text x="${W - RIGHT + 12}" y="${y + 4}" class="lstate">${c?.daysSince == null ? "" : c.daysSince === 0 ? "today" : `${c.daysSince}d ago`}</text>`;
      void days;
      return `${label}${track}${segs}${wait}${dots}${status}`;
    })
    .join("");

  const ranges = [30, 90, 180]
    .map((r) => `<a class="tab${data.range === r ? " on" : ""}" href="${focus ? `${chanHref(focus.channel)}?range=${r}` : q(`&amp;range=${r}`)}">${r} days</a>`)
    .join("");

  const timeline = `<div class="panel uplanes">
    <div class="uphead">
      <h2>${focus ? (hasTarget ? `${cap(everyText(every))} · every upload and the gaps between` : "Every upload and the gaps between") : uniform ? `${cap(everyText(every))}, per channel` : hasTarget ? `Uploads per channel · ${targeted.map((n) => `${n.replace(/^Specular /, "")} ${everyText(everyOf(n)!)}`).join(" · ")}` : "Uploads per channel"}</h2>
      <div class="ulegend" aria-label="Legend">
        <span><i class="lg-dot"></i>Upload</span>
        ${hasTarget ? `<span><i class="lg-ok"></i>✓ Gap on pace${uniform ? ` (≤${every}d)` : ""}</span>
        <span><i class="lg-late"></i>! Gap over ${uniform ? `${every} day${every === 1 ? "" : "s"}` : "the channel's target"}</span>
        <span><i class="lg-due"></i>Next due</span>` : `<span><i class="lg-ok"></i>Gap between uploads</span>`}
        <span><i class="lg-up"></i>🔥 Breakout (≥2× usual)</span>
        <span><i class="lg-down"></i>📉 Under (≤½ usual)</span>
      </div>
      <div class="tabs">${ranges}</div>
    </div>
    <div class="upscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
      aria-label="Uploads per ${esc(catLabel)} channel over the last ${data.range} days">
      ${grid.join("")}${lanes}</svg></div>
    <div class="uptip" hidden></div>
  </div>`;

  // ── the table — the same facts, readable without the chart
  const order: Record<PaceState, number> = { behind: 0, due: 1, "on-pace": 2, none: 3 };
  const rowsHtml = data.channels
    .map((name) => ({ name, c: cad.get(name), link: linkOf.get(name) }))
    .sort((a, b) => order[a.c?.state ?? "none"] - order[b.c?.state ?? "none"] || (b.c?.daysSince ?? -1) - (a.c?.daysSince ?? -1))
    .map(({ name, c, link }) => {
      const st = link?.youtubeId && c ? PACE[c.state] : PACE.none;
      const ch = channelColour(name);
      return `<tr>
        <td><a class="chlink" href="${chanHref(name)}"><span class="cdot" style="--ch:${ch}"></span>${esc(name)}</a></td>
        <td>${everyOf(name) !== null ? `<span class="pace ${st.cls}">${st.icon} ${esc(st.label)}${c?.state === "behind" ? ` · ${c.behindBy}d` : ""}</span>` : c?.daysSince != null ? `${c.daysSince}d ago` : "—"}</td>
        <td>${c?.lastDay ? `${esc(usDate(c.lastDay))} <small>${esc(relativeDay(c.lastDay))}</small>` : "—"}</td>
        <td>${c?.nextDue ? `${esc(usDate(c.nextDue))} <small>${esc(relativeDay(c.nextDue))}</small>` : "—"}</td>
        <td class="num">${c?.streak ?? "—"}</td>
        <td class="num">${c ? c.uploads30 : "—"}</td>
        <td class="num">${c?.avgGap90 != null ? `${c.avgGap90.toFixed(1)}d` : "—"}</td>
        <td class="num">${c?.onTime90 != null ? `${Math.round(c.onTime90 * 100)}%` : "—"}</td>
        <td class="num">${(() => {
          const t = typical.get(name);
          return t ? `${esc(compactViews(Math.round(t.views)))} <small>${esc(t.basis)}</small>` : "—";
        })()}</td>
      </tr>`;
    })
    .join("");
  const table = `<div class="panel">
    <h2>${focus ? "Pace" : "By channel"}</h2>
    <div class="utable-wrap"><table class="utable">
      <thead><tr><th>Channel</th><th>Status</th><th>Last upload</th><th>Next due</th>
        <th class="num" title="On-time uploads in a row">Streak</th><th class="num">30 days</th>
        <th class="num">Avg gap · 90d</th><th class="num">On time · 90d</th><th class="num" title="Median views of the last twenty uploads">Typical views</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></div>
  </div>`;

  // ── latest uploads
  const latest = data.uploads
    .slice()
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 12)
    .map((u) => `<a class="ulatest" href="${esc(u.url)}" target="_blank" rel="noreferrer">
      <span class="cdot" style="--ch:${channelColour(u.channel)}"></span>
      <span class="ut">${esc(u.title)}</span>
      <span class="uc">${esc(u.channel)}</span>
      <span class="ud">${esc(usDate(dayOf(u.publishedAt)))} · ${esc(relativeDay(dayOf(u.publishedAt)))}${u.views !== null ? ` · ${u.views.toLocaleString()} views` : ""}${verdictBadge(perf.get(u.videoId))}</span>
    </a>`)
    .join("");

  // ── breakouts and underperformers, last 30 days
  const since30 = now.getTime() - 30 * 86_400_000;
  const scored = data.uploads
    .filter((u) => u.publishedAt.getTime() >= since30 && perf.has(u.videoId))
    .map((u) => ({ u, p: perf.get(u.videoId)! }));
  const perfRow = ({ u, p }: { u: Upload; p: Performance }) => `<a class="prow" href="${esc(u.url)}" target="_blank" rel="noreferrer">
      <span class="pmult ${p.verdict}">${esc(formatMultiple(p.multiple))}</span>
      <span class="pbody"><span class="ut">${esc(u.title)}</span>
        <span class="pmeta"><span class="cdot" style="--ch:${channelColour(u.channel)}"></span>${esc(u.channel)} · ${esc(
          compactViews(p.value),
        )} ${esc(p.basis)} vs ${esc(compactViews(Math.round(p.baseline)))} usual</span></span>
    </a>`;
  const ups = scored.filter((x) => x.p.verdict === "breakout").sort((a, b) => b.p.multiple - a.p.multiple).slice(0, 8);
  const downs = scored.filter((x) => x.p.verdict === "under").sort((a, b) => a.p.multiple - b.p.multiple).slice(0, 8);
  const performers = linked.length
    ? `<div class="panel performers">
        <h2>Breakouts &amp; underperformers <span class="sub">last 30 days, against each channel's usual at the same age</span></h2>
        <div class="pcols">
          <div><h3>🔥 Breakouts <span>${ups.length}</span></h3>${ups.map(perfRow).join("") || `<p class="hint">None this month yet.</p>`}</div>
          <div><h3>📉 Underperforming <span>${downs.length}</span></h3>${downs.map(perfRow).join("") || `<p class="hint">None this month.</p>`}</div>
        </div>
        ${scored.length ? "" : `<p class="hint">Scores appear once a channel has three earlier videos to compare with at the same age — from the first read for videos two weeks and older, and within days for new ones as the hourly view snapshots build up.</p>`}
      </div>`
    : "";

  // ── the links
  const set = data.links.filter((l) => data.channels.includes(l.channel)).length;
  const links = `<details class="panel ulinks"${set ? "" : " open"}>
    <summary><h2>Channel links</h2><span class="sub">${set} of ${data.channels.length} set</span></summary>
    <p class="hint">Paste each ${esc(catLabel)} channel's YouTube link — its page, like youtube.com/@SpecularStudios, is
    enough. The board looks up the rest, reads every channel once an hour, and keeps every ${
      formatFor(category) === "short" ? "Short it sees — long-form videos don't count here" : "long-form upload it sees — Shorts don't count"
    }. ${
      data.hasKey
        ? "A YouTube API key is set, so each channel's full history comes in on its first read."
        : "Without a YouTube API key, each channel starts from its latest 15 uploads — and builds from there. Set YOUTUBE_API_KEY to pull full history."
    }</p>
    <form method="post" action="/uploads/links" class="linkform">
      <input type="hidden" name="_cat" value="${category}">${focus ? `<input type="hidden" name="_ch" value="${esc(focus.channel)}">` : ""}
      ${data.channels
        .map((name) => {
          const l = linkOf.get(name);
          const note = !l
            ? ""
            : l.error
              ? `<span class="lstat err">! ${esc(l.error)}</span>`
              : l.youtubeId
                ? `<span class="lstat ok">✓ ${esc(l.title ?? "found")}</span>`
                : `<span class="lstat">waiting for the next read</span>`;
          return `<label class="linkrow"><span class="lname"><span class="cdot" style="--ch:${channelColour(name)}"></span>${esc(name)}</span>
            <input type="text" name="${esc(name)}" value="${esc(l?.input ?? "")}" placeholder="youtube.com/@…" autocomplete="off" spellcheck="false">
            ${note}</label>`;
        })
        .join("")}
      <button class="clear">Save and read now</button>
    </form>
  </details>`;

  const checked = data.links.map((l) => l.checkedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);

  const focusLink = focus ? linkOf.get(focus.channel) : undefined;
  const header = focus
    ? `${pageHeader(
        focus.channel,
        `<form method="post" action="/uploads/check" class="checknow"><input type="hidden" name="_cat" value="${category}"><input type="hidden" name="_ch" value="${esc(focus.channel)}"><button class="clear secondary">Read YouTube now</button></form>`,
      )}
      <nav class="catswitch chswitch" aria-label="${esc(catLabel)} channels">
        <a class="back" href="/uploads?cat=${category}">← All ${esc(catLabel)}</a>
        ${CHANNELS.filter((c) => c.category === category)
          .map((c) => `<a class="${c.name === focus.channel ? "on" : ""}" style="--c:${c.color};--on:${
            contrastRatio("#0B0B0D", c.color) >= contrastRatio("#FFFFFF", c.color) ? "#0B0B0D" : "#FFFFFF"
          }" href="${chanHref(c.name)}"${c.name === focus.channel ? ' aria-current="page"' : ""}><i class="round"></i>${esc(c.name.replace(/^Specular /, ""))}</a>`)
          .join("")}
      </nav>
      <div class="usub"><span class="cdot" style="--ch:${channelColour(focus.channel)}"></span>${esc(catLabel)} · ${esc(
        everyOf(focus.channel) !== null ? everyText(everyOf(focus.channel)!) : target.kind === "daily" ? `${describeTarget(category)}` : "no target"
      )}${focusLink?.youtubeId ? ` · <a href="https://www.youtube.com/channel/${esc(focusLink.youtubeId)}" target="_blank" rel="noreferrer">${esc(focusLink.title ?? "on YouTube")} ↗</a>` : ""}${
        checked ? ` · read ${esc(timeAgo(new Date(checked)))}` : ""
      }</div>`
    : `${pageHeader(
        "Uploads",
        `<form method="post" action="/uploads/check" class="checknow"><input type="hidden" name="_cat" value="${category}"><button class="clear secondary">Read YouTube now</button></form>`,
      )}
    <nav class="catswitch" aria-label="Category">${UPLOAD_CATEGORIES.map(
      (c) => `<a class="${c.id === category ? "on" : ""}" style="--c:${c.color};--on:${
        contrastRatio("#0B0B0D", c.color) >= contrastRatio("#FFFFFF", c.color) ? "#0B0B0D" : "#FFFFFF"
      }" href="/uploads?cat=${c.id}"><i></i>${esc(c.label)}</a>`,
    ).join("")}</nav>
    <div class="usub">${esc(catLabel)} · ${esc(describeTarget(category))}${
      checked ? ` · read ${esc(timeAgo(new Date(checked)))}` : ""
    } · <span class="hint-inline">click a channel for its own page</span></div>`;

  return layout(
    focus ? focus.channel : "Uploads",
    shell,
    `${header}
    ${
      linked.length
        ? target.kind === "daily"
          ? `${dailyView(data.channels, linkOf, data.daily ?? [], data.range, typical, category, now, focus ? `${chanHref(focus.channel)}?` : undefined)}${
              data.shorts ? shortsPanel(data.channels, data.uploads, data.shorts.scores, data.shorts.health, data.shorts.slots, now) : performers
            }`
          : `<div class="utiles">${tiles}</div>${timeline}${focus ? "" : performers}${table}`
        : ""
    }
    ${focus && linked.length ? outlierPanel(focus, perf, data.shorts?.scores ?? null, typical.get(focus.channel) ?? null, now) : ""}
    ${focus && linked.length ? everyVideoPanel(focus, perf, data.shorts?.scores ?? null, now) : ""}
    ${focus?.lab ? channelLabPanel(focus) : ""}
    ${category === "stories" && !focus ? `<a class="labcta" href="/story-lab"><b>Story Lab</b><span>What to write next, with a part-by-part blueprint for each — learned from the Stories scripts →</span></a>` : ""}
    ${data.ideas ? ideasPanel(category, data.ideas, data.idea ?? null, data.channels, data.ideaChannel ?? null, data.hooks) : ""}
    ${latest && !focus ? `<div class="panel"><h2>Latest uploads</h2><div class="ulatest-list">${latest}</div></div>` : ""}
    ${links}
    <script>
    // Hover any upload, gap, day or Short for what it is — on every chart.
    document.querySelectorAll(".uptip").forEach(function (tip) {
      var box = tip.parentElement;
      box.addEventListener("mousemove", function (e) {
        var t = e.target.closest && e.target.closest("[data-tip]");
        if (!t) { tip.hidden = true; return; }
        tip.textContent = t.getAttribute("data-tip");
        tip.hidden = false;
        var r = box.getBoundingClientRect();
        var left = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8);
        tip.style.left = Math.max(8, left) + "px";
        tip.style.top = (e.clientY - r.top + 16) + "px";
      });
      box.addEventListener("mouseleave", function () { tip.hidden = true; });
    });
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
  chide: string[] = [],
): string {
  const q = calQuery(mode, st);
  const today = dateIn(ORG_TZ);
  const off = new Set(shell.daysOff ?? []);
  const first = days[0]?.date ?? date;
  const last = days[days.length - 1]?.date ?? date;

  const columns = days
    .map(({ date: d, list }) =>
      dayColumn(d, list, mode, q, `${d === today ? " today" : ""}${d === date ? " focus" : ""}`, off.has(d), visibleGaps(shell.gaps, hide, chide)),
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
    <div class="cattoggles">${toggles}${showAll}${statuses}${channelPicker(chide)}
      <span class="draghint">Scroll sideways, or ← → keys. Drag a card to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      } — the channel's later videos follow; Shift-drop moves just the one.</span>
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
            .replace(new RegExp("/(day|4day|week)/[0-9]{4}-[0-9]{2}-[0-9]{2}"), "/$1/" + d)
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
  chide: string[] = [],
  /** 7 for a week (Sunday to Saturday), 4 for the 4-day view (from any day). */
  span: 7 | 4 = 7,
): string {
  const q = calQuery(mode, st);
  const today = dateIn(ORG_TZ);
  const off = new Set(shell.daysOff ?? []);
  const end = shiftDay(start, span - 1);
  const anchor = today >= start && today <= end ? today : start;
  const path = span === 4 ? "4day" : "week";

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" href="/${path}/${start}${calQuery(value, st)}">${label}</a>`;
  const { toggles, showAll } = categoryToggles(hide, (h) => `/${path}/${start}${q}&amp;hide=${h}`);
  const statuses = statusToggles(st, (x) => `/${path}/${start}?mode=${mode}&amp;st=${x}`);
  const total = days.reduce((n, d) => n + d.list.length, 0);

  return layout(
    span === 4 ? `${usDate(start)} – ${usDate(end)}` : `Week of ${usDate(start)}`,
    shell,
    `${pageHeader(span === 4 ? "4 days" : "Week")}
    <div class="calbar">
      <a class="nav" href="/${path}/${shiftDay(start, -span)}${q}" aria-label="${span === 4 ? "Previous 4 days" : "Previous week"}">←</a>
      <span class="month">${esc(usDate(start))} – ${esc(usDate(end))}</span>
      <a class="nav" href="/${path}/${shiftDay(start, span)}${q}" aria-label="${span === 4 ? "Next 4 days" : "Next week"}">→</a>
      <a class="nav" href="/${path}/${today}${q}">${span === 4 ? "Today" : "This week"}</a>
      ${viewTabs(span === 4 ? "4day" : "week", anchor, q)}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}${channelPicker(chide)}
      <span class="draghint">${total} ${span === 4 ? "in these 4 days" : "this week"} · drag a card to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      } — the channel's later videos follow; Shift-drop moves just the one.</span>
    </div>
    <div class="weekgrid${span === 4 ? " span4" : ""}">${days
      .map(({ date: d, list }) => dayColumn(d, list, mode, q, d === today ? " today" : "", off.has(d), visibleGaps(shell.gaps, hide, chide)))
      .join("")}</div>
    ${columnDragScript(mode)}`,
  );
}

/** A record as a card in a day column: what it is, whose it is, when, and ✓ ×. */
function dayCard(r: StoredRecord, mode: CalendarMode): string {
  const ch = r.channel ? channelColour(r.channel) : null;
  const at = mode === "deadlines" ? r.voDue ?? r.deadline ?? r.scriptDue : r.voDue;
  const label = r.kind === "review" ? "review" : r.voDue ? "VO" : r.deadline ? "due" : "script";
  const over = at && r.status === "open" && at.getTime() < Date.now();

  const bits: string[] = [];
  if (r.stage) bits.push(esc(r.stage));
  if (r.version) bits.push(`v${r.version}`);
  if (r.batchTarget && r.batchTarget > 1) {
    bits.push(`${r.status === "done" ? r.batchTarget : r.batchDone}/${r.batchTarget}`);
  }

  if (r.offFrom && r.status === "open" && mode === "deadlines") bits.push(offTag(r));

  return `<article class="dcard${r.kind === "review" ? " revision" : ""}${r.status === "done" ? " cleared" : ""}${r.uploadedAt ? " uploaded" : ""}${r.pinnedAt ? " pinned" : ""}${r.noScriptAt && r.status === "open" ? " noscript" : ""}" draggable="true" data-id="${r.id}"
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
  today: { date: string; rows: Array<{ channel: string; total: number; done: number; removed: number; date?: string }> },
  ahead: { date: string; rows: Array<{ channel: string; total: number; done: number; removed: number }> },
  list: StoredRecord[],
  strip: Array<{ date: string; channels: number; total: number; done: number }> = [],
  maxAhead = 90,
): string {
  const categoryOf = (channel: string) => CHANNELS.find((ch) => ch.name === channel)?.category ?? "bits";

  const line = (
    r: { channel: string; total: number; done: number; removed?: number; date?: string },
    sectionDate?: string,
  ) => {
    // A long-form channel's today can be a calendar day ahead of the Shorts
    // day (midnight to 3 AM), so its row carries its own date.
    const date = sectionDate ? r.date ?? sectionDate : undefined;
    const lf = isLongFormRecurring(CHANNELS.find((ch) => ch.name === r.channel));
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    const state =
      r.total === 0
        ? r.removed ? "removed" : "not open"
        : lf
          ? r.done === r.total ? "video up" : "video due"
          : r.done === r.total ? "cleared" : `${r.done}/${r.total}`;
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
        <span class="dot"></span><span class="name">${esc(r.channel)}</span>${lf ? `<span class="lfbadge" title="Long-form — one video a day, midnight to midnight">LF</span>` : ""}
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

  // A channel is missing on a day when nothing of it is there — not even a
  // batch someone removed on purpose, which must stay removed.
  const missing = ahead.rows.filter((r) => r.total === 0 && r.removed === 0).length;
  const channelCount = ahead.rows.length;
  const firstAhead = strip[0]?.date ?? ahead.date;
  const shift = (d: string, by: number) => {
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + by);
    return x.toISOString().slice(0, 10);
  };
  const lastAllowed = shift(firstAhead, maxAhead - 1);

  // Two weeks at a glance: how much of each day is open, and how much is done.
  const chips = strip
    .map((d) => {
      const at = new Date(`${d.date}T12:00:00Z`);
      const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(at);
      const state = d.channels === 0 ? "none" : d.channels < channelCount ? "part" : "full";
      const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
      return `<a class="daychip ${state}${d.date === ahead.date ? " on" : ""}" href="/recurring?day=${d.date}"
          title="${esc(usDate(d.date))}: ${
            d.channels === 0 ? "not open" : `${d.channels}/${channelCount} channels open · ${d.done}/${d.total} uploads done`
          }">
        <b>${esc(wd)}</b><span>${esc(usDate(d.date).replace(/\/\d{4}$/, ""))}</span>
        <i><em style="width:${pct}%"></em></i>
        <small>${d.channels === 0 ? "not open" : d.channels < channelCount ? `${d.channels}/${channelCount} open` : `${d.done}/${d.total}`}</small>
      </a>`;
    })
    .join("");

  // One labelled block per recurring category — Reading, then Bits — so a
  // dozen lines read as two short lists rather than one long one.
  type Row_ = { channel: string; total: number; done: number; removed: number };
  const sections = (list_: Row_[], date: string) =>
    CATEGORIES.filter((cat) => list_.some((r) => categoryOf(r.channel) === cat.id))
      .map((cat) => {
        const mine = list_.filter((r) => categoryOf(r.channel) === cat.id);
        const done = mine.reduce((n, r) => n + r.done, 0);
        const total = mine.reduce((n, r) => n + r.total, 0);
        const longForm = mine.every((r) => isLongFormRecurring(CHANNELS.find((ch) => ch.name === r.channel)));
        const unit = longForm
          ? total === 1 ? "long-form video" : "long-form videos"
          : mine.some((r) => (CHANNELS.find((ch) => ch.name === r.channel)?.recurring?.units ?? 1) > 1)
            ? "uploads"
            : "cleared";
        return `<div class="batch-group" style="--c:${cat.color}">
          <div class="batch-head"><span class="dot"></span>${esc(cat.label)}${
            longForm ? `<span class="sub">long-form · midnight to midnight</span>` : ""
          }
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

    <div class="panel ahead" style="margin-bottom:14px">
      <h2>Ahead</h2>
      <div class="aheadbar">
        <a class="nav" href="/recurring?day=${shift(ahead.date, -1)}" aria-label="Previous day"${
          ahead.date <= firstAhead ? ' aria-disabled="true" tabindex="-1"' : ""
        }>←</a>
        <form method="get" action="/recurring" class="daypick">
          <input type="date" name="day" value="${ahead.date}" min="${firstAhead}" aria-label="Pick a day"
            onchange="this.form.submit()">
        </form>
        <a class="nav" href="/recurring?day=${shift(ahead.date, 1)}" aria-label="Next day">→</a>
        <form method="post" action="/recurring/ahead" class="quick">
          <span>Open the next</span>
          <button class="chipbtn" name="days" value="7">7 days</button>
          <button class="chipbtn" name="days" value="14">14 days</button>
          <button class="chipbtn" name="days" value="30">30 days</button>
        </form>
        <form method="post" action="/recurring/ahead" class="quick">
          <span>or through</span>
          <input type="date" name="through" min="${firstAhead}" max="${lastAllowed}" value="${shift(firstAhead, 6)}" aria-label="Open every day through">
          <button class="chipbtn go">Open</button>
        </form>
      </div>
      <div class="daychips">${chips}</div>

      <div class="aheadday">
        <h3>${esc(pretty(ahead.date))}</h3>
        ${
          missing
            ? `<form method="post" action="/recurring/ahead" class="openday">
                 <input type="hidden" name="day" value="${ahead.date}">
                 <button class="clear">${
                   missing === channelCount ? "Open this day" : `Open the ${missing} channel${missing === 1 ? "" : "s"} not open yet`
                 }</button>
               </form>`
            : ""
        }
      </div>
      ${
        missing === channelCount
          ? `<p class="hint">Nothing open for this day yet. It opens by itself that morning — or open it now to work ahead.</p>`
          : `${sections(ahead.rows, ahead.date)}
             <p class="hint">Clear anything you get ahead on and it stays cleared — the morning run finds
             these and leaves them alone.</p>`
      }
    </div>

    <div class="group">
      <div class="head" style="--c:${colourOf("reading")}">
        <span class="dot"></span><span class="name">Today's batches</span>
        <span class="sub">${esc(pretty(today.date))}</span>
        <span class="n">${list.length}</span>
      </div>
      ${rows(list, "Nothing open yet today.")}
    </div>
    <script>
    // Ticking a segment or clearing a channel saves in the background: the
    // segment fills at once, then the page's numbers refresh in place. No
    // reload, so no flash of the dark background between taps.
    (function () {
      var busy = Promise.resolve();
      function fill(form) {
        var row = form.closest(".batch");
        if (!row) return;
        var pips = row.querySelectorAll(".pip");
        var total = pips.length;
        var done = new URL(form.action, location.href).pathname === "/recurring/clear" ? total : Number(form.elements.done.value);
        pips.forEach(function (p, i) {
          p.classList.toggle("on", i < done);
          // Tapping the last filled segment again steps back one — so a quick
          // second tap works before the refresh lands.
          var input = p.form && p.form.elements.done;
          if (input) input.value = String(i + 1 === done ? i : i + 1);
        });
        var state = row.querySelector(".state");
        if (state && total) state.textContent = done === total ? "cleared" : done + "/" + total;
        row.classList.toggle("done", total > 0 && done === total);
      }
      function refresh() {
        return fetch(location.href, { headers: { Accept: "text/html" } })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var fresh = new DOMParser().parseFromString(html, "text/html").querySelector("main");
            var main = document.querySelector("main");
            if (!fresh || !main) return;
            main.querySelectorAll(".panel, .group").forEach(function (el, i) {
              var next = fresh.querySelectorAll(".panel, .group")[i];
              if (next) el.innerHTML = next.innerHTML;
            });
            var nav = fresh.ownerDocument.querySelector("aside nav");
            if (nav) document.querySelector("aside nav").innerHTML = nav.innerHTML;
          });
      }
      document.addEventListener("submit", function (e) {
        var form = e.target;
        var path = new URL(form.action, location.href).pathname;
        if (path !== "/recurring/progress" && path !== "/recurring/clear") return;
        e.preventDefault();
        fill(form);
        var body = new URLSearchParams(new FormData(form));
        busy = busy.then(function () {
          return fetch(form.action, { method: "POST", body: body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        }).then(function (r) {
          if (!r.ok) throw new Error("save failed");
          return refresh();
        }).catch(function () { location.reload(); });
      });
    })();
    </script>`,
  );
}

// ── Story Lab ─────────────────────────────────────────────────────────────

export interface StoryLabData {
  scripts: number;
  words: number;
  matched: number;
  ideas: Array<{ idea: LabIdea; blueprint: Blueprint | null }>;
  blueprint: Blueprint | null;
  /** The public video the built blueprint would repeat, if any. */
  builtRepeats?: PublicVideo | null;
  /** How many ideas were held back because they're already public, out of how many public videos. */
  heldBack?: number;
  publicCount?: number;
  picked: { format: string; hero: string; world: string; power: string; target: string; shape?: string };
  check: { title: string; text: string; result: DraftCheck | null } | null;
  contrast: Contrast[] | null;
  results: ScriptResult[];
  coverage: { heroes: Hero[]; worlds: World[]; done: Set<string> };
  formats: Array<{ format: Format; norms: Norms; examples: string[] }>;
  /** Title shapes added from the dice. */
  shapes?: Shape[];
  /** Write next, channel by channel: the cards, the idea bucket, how many rerolled away. */
  writeNext?: Array<{ channel: string; cards: Array<IdeaCard & { blueprint: Blueprint | null }>; saved: IdeaMark[]; skipped: number }>;
  /** The scripts added on the board, and how many came from the Drive. */
  library?: { scripts: StoredScript[]; drive: number; error: string };
  /** 🎲 What was rolled, what was just added, and what's been added so far. */
  dice?: {
    rolled: DiceCard | null;
    added: DiceCard | null;
    additions: Array<{ kind: DiceKind; id: string; name: string }>;
    left: Record<DiceKind, number>;
    group: DiceKind | null;
    nonce: string;
    rolledNothing: boolean;
  };
}

/** A score out of 100 as a colour: green for the best, amber in the middle, red for the weakest. */
const scoreColour = (n: number) => (n >= 70 ? "#3CCB84" : n >= 55 ? "#9BD35A" : n >= 40 ? "#E8C547" : "#E5534B");

const SOURCE_LABEL: Record<Neighbour["source"], string> = {
  uploaded: "uploaded",
  assigned: "on the board",
  script: "a written script",
  saved: "saved for later",
  card: "another card",
};

/**
 * Write next, channel by channel: two cards each, best score first. Every
 * card has its score out of 100, a warning when it's too close to something
 * made or planned on any channel, ↻ for a fresh idea in its place and 🔖 to
 * save it to the channel's idea bucket.
 */
function writeNextPanel(list: NonNullable<StoryLabData["writeNext"]>, shapes: Shape[], publicCount: number): string {
  const shapeName = (id: string | null | undefined) => (id ? shapes.find((x) => x.id === id)?.name ?? id : "");
  const hidden = (m: Record<string, string | null | number>) =>
    Object.entries(m)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v ?? "")}">`)
      .join("");
  const idFields = (channel: string, i: IdeaCard["idea"], score: number) =>
    hidden({ channel, key: i.key, title: i.title, format: i.format, hero: i.hero?.id ?? null, world: i.world?.id ?? null, power: i.power?.id ?? null, target: i.target?.id ?? null, shape: i.shape ?? null, score });
  const card = (channel: string, c: IdeaCard & { blueprint: Blueprint | null }) => `<li class="wncard"><details class="isg labidea">
      <summary>
        <span class="wnscore" style="--sc:${scoreColour(c.score)}" title="Predicted ${c.predicted}× the channel's usual">${c.score}<small>/100</small></span>
        <span class="ikind ${c.idea.format}">${esc(FORMAT_BY_ID.get(c.idea.format)?.name ?? c.idea.format)}${c.idea.shape ? ` · ${esc(shapeName(c.idea.shape))}` : ""}</span>
        <span class="iidea">${esc(c.idea.title)}</span>
        ${
          c.similar
            ? `<span class="wnsim" title="Still an option — ↻ for another">Too close to “${esc(c.similar.title)}”${c.similar.channel ? ` · ${esc(c.similar.channel.replace(/^Specular /, ""))}` : ""} · ${esc(SOURCE_LABEL[c.similar.source])} (${esc(c.similar.why)})</span>`
            : ""
        }
        <span class="iwhy">${[...c.fit.slice(0, 1), ...c.idea.reasons.slice(0, 2).map((r) => r.text)].map(esc).join(" · ")}</span>
        <span class="imore">Blueprint ▾</span>
      </summary>
      <div class="idetail">
        <h4>Why this one</h4>
        <ul class="labwhy">${[
          ...c.fit.map((f) => `<li><b class="up">fit</b> ${esc(f)}</li>`),
          ...c.idea.reasons.map((r) => `<li><b class="${r.lift >= 1 ? "up" : "down"}">${esc(liftText(r.lift))}</b> ${esc(r.text)}</li>`),
        ].join("")}</ul>
        ${c.blueprint ? blueprintHtml(c.blueprint) : ""}
      </div>
    </details>
    <div class="wnacts">
      <form method="post" action="/story-lab/idea" data-swap>${idFields(channel, c.idea, c.score)}<input type="hidden" name="do" value="reroll"><button class="wnbtn" title="A fresh idea in its place — this one won't come back to this channel">↻ Reroll</button></form>
      <form method="post" action="/story-lab/idea" data-swap>${idFields(channel, c.idea, c.score)}<input type="hidden" name="do" value="save"><button class="wnbtn" title="Keep it in this channel's idea bucket, and get a fresh card">🔖 Save for later</button></form>
    </div></li>`;
  const section = (w: (typeof list)[number]) => {
    const ch = CHANNELS.find((c) => c.name === w.channel);
    const saved = w.saved.length
      ? `<details class="wnbucket"><summary>🔖 Idea bucket <b>${w.saved.length}</b></summary><ul>${w.saved
          .map((m) => {
            const q = new URLSearchParams({ format: m.shape ? "" : m.format, ...(m.hero ? { hero: m.hero } : {}), ...(m.world ? { world: m.world } : {}), ...(m.power ? { power: m.power } : {}), ...(m.target ? { target: m.target } : {}), ...(m.shape ? { shape: m.shape } : {}) });
            return `<li><span class="wnscore sm" style="--sc:${scoreColour(m.score)}">${m.score}</span><a href="/story-lab?${esc(q.toString())}#blueprint">${esc(m.title)}</a><span class="wnwhen">saved ${esc(usDate(dayOf(m.markedAt)))}</span>
              <form method="post" action="/story-lab/idea" data-swap>${hidden({ channel: w.channel, key: m.key, do: "unsave" })}<button class="wnx" title="Take it out of the bucket">×</button></form></li>`;
          })
          .join("")}</ul></details>`
      : "";
    return `<section class="wnchan" id="wn-${esc(ch?.id ?? w.channel)}" style="--ch:${channelColour(w.channel)}">
      <header><i></i><b>${esc(w.channel)}</b>${w.skipped ? `<span class="wnskip">${w.skipped} rerolled away</span>` : ""}${saved}</header>
      ${w.cards.length ? `<ul class="isugg">${w.cards.map((c) => card(w.channel, c)).join("")}</ul>` : `<p class="hint">Nothing left that fits — add something from the dice.</p>`}
    </section>`;
  };
  return `<div class="panel ideas" id="writenext"><h2>Write next <span class="sub">— two for every channel, best score first · the score predicts how it'll do against the channel's usual (50 = its usual)${
    publicCount ? ` · checked against ${publicCount.toLocaleString("en-US")} public videos` : ""
  }</span></h2>
    <div class="wnlist">${list.map(section).join("")}</div>
    <script>
    (function () {
      // Reroll, save and unsave without losing your place: the new section swaps in.
      document.getElementById("writenext").addEventListener("submit", function (e) {
        var form = e.target;
        if (!form.hasAttribute("data-swap") || !window.fetch || !window.DOMParser) return;
        e.preventDefault();
        var sec = form.closest(".wnchan");
        sec.classList.add("busy");
        fetch(form.action, { method: "POST", body: new URLSearchParams(new FormData(form)), headers: { Accept: "text/html" } })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var doc = new DOMParser().parseFromString(html, "text/html");
            var next = doc.getElementById(sec.id);
            if (next) sec.replaceWith(document.importNode(next, true)); else location.reload();
          })
          .catch(function () { form.submit(); });
      });
    })();
    </script>
  </div>`;
}

/**
 * The scripts Story Lab learns from: the Drive's, plus every one added on the
 * board — a Stories video's own, or one added here on its own.
 */
function libraryPanel(lib: NonNullable<StoryLabData["library"]>): string {
  const learning = lib.scripts.filter((sc) => corpus().some((c) => c.board?.id === sc.id)).length;
  const cards = lib.scripts
    .slice()
    .reverse()
    .map((sc) => scriptCard(sc, colourOf(sc.category ?? "stories"), sc.recordId ? ` · <a href="/r/${sc.recordId}#script">its video</a>` : " · added here"))
    .join("");
  return `<div class="panel ideas" id="scripts"><h2>Scripts it learns from <span class="sub">— ${lib.drive} from the Drive${
    lib.scripts.length ? ` · ${learning} added on the board` : ""
  }</span></h2>
    <p class="hint" style="padding:0 14px">Every Stories script added to a video (on its page) or here joins the ${lib.drive + learning} Story Lab reads: format norms, blueprints' reference parts, the draft check, what the best scripts did differently and what's been done. Any category's script also gives its video's opening to the Uploads idea hooks.</p>
    <div style="padding:0 14px 14px">
      ${lib.error ? `<div class="scripterr" role="alert">${esc(lib.error)}</div>` : ""}
      ${cards ? `<div class="scripts">${cards}</div>` : ""}
      <details class="addscript"><summary class="clear secondary" style="display:inline-block;cursor:pointer">+ Add a script</summary><div style="margin-top:10px">${scriptForm("/story-lab/scripts", { title: true })}</div></details>
    </div></div>`;
}

/**
 * 🎲 Roll for something new: one new format, hero, world, power or target
 * per roll — what it is, the ideas it opens up — and Add to make it part of
 * Story Lab. Everything added is listed, and can come out again.
 */
function dicePanel(d: NonNullable<StoryLabData["dice"]>): string {
  const groups: DiceKind[] = ["shape", "hero", "world", "power", "target"];
  const total = groups.reduce((n, k) => n + d.left[k], 0);
  const rollHref = (g: DiceKind | null) => `/story-lab?roll=${d.nonce}${g ? `&amp;dice=${g}` : ""}#dice`;
  const card = (c: DiceCard, action: "add" | "added") => `<div class="dicecard ${c.kind}">
      <div class="dchead">
        <span class="dcgroup">${esc(c.group)}</span>
        <h3>${esc(c.name)}</h3>
        <span class="dcfrom">${esc(c.from)}</span>
      </div>
      <dl class="dcfacts">${c.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${
        c.opens.length
          ? `<h4>${action === "added" ? "Now in Story Lab — ideas it makes" : "What it opens up"}</h4>
             <ul class="dcopens">${c.opens.map((o) => `<li><a href="${esc(o.href)}"><span class="ikind">${esc(o.format)}</span>${esc(o.title)}</a></li>`).join("")}</ul>`
          : `<p class="hint">Every idea it makes is already public or written — it'll still show in the builder.</p>`
      }
      ${
        action === "add"
          ? `<div class="dcacts">
              <form method="post" action="/story-lab/add"><input type="hidden" name="kind" value="${c.kind}"><input type="hidden" name="id" value="${esc(c.id)}">
                <button class="clear">Add to Story Lab</button></form>
              <a class="clear secondary" href="${rollHref(d.group)}">🎲 Roll again</a>
            </div>`
          : `<div class="dcacts"><a class="clear" href="${rollHref(null)}">🎲 Roll another</a></div>`
      }
    </div>`;
  return `<div class="panel ideas dice" id="dice">
    <h2>🎲 Roll for something new <span class="sub">— one new format, hero, world, power or target a roll, none already in Story Lab; add the ones worth writing</span></h2>
    <div class="dicebar">
      <a class="clear" href="${rollHref(null)}">🎲 Roll</a>
      <span class="dgroups">${groups
        .map((g) => d.left[g]
          ? `<a class="${d.group === g ? "on" : ""}" href="${rollHref(g)}">${esc(DICE_LABELS[g])} <small>${d.left[g]}</small></a>`
          : `<span class="none">${esc(DICE_LABELS[g])} <small>all in</small></span>`)
        .join("")}</span>
    </div>
    ${d.rolledNothing ? `<p class="hint">${total ? "Nothing left in that group — roll any." : "Everything on the dice is in Story Lab now."}</p>` : ""}
    ${d.added ? `<p class="saved dcsaved" role="status">Added ${esc(d.added.name)}.</p>${card(d.added, "added")}` : ""}
    ${d.rolled ? card(d.rolled, "add") : ""}
    ${
      d.additions.length
        ? `<div class="dcadded"><h4>Added from the dice</h4>${d.additions
            .map((a) => `<form method="post" action="/story-lab/remove" class="dcchip">
              <input type="hidden" name="kind" value="${a.kind}"><input type="hidden" name="id" value="${esc(a.id)}">
              <span><small>${esc(DICE_LABELS[a.kind])}</small> ${esc(a.name)}</span>
              <button aria-label="Take ${esc(a.name)} out of Story Lab" title="Take it out again">×</button></form>`)
            .join("")}</div>`
        : ""
    }
  </div>`;
}

function blueprintHtml(b: Blueprint): string {
  const refLine = (p: PlannedPart) =>
    p.ref ? `<div class="bpref">Modelled on <b>${esc(p.ref.title)}</b>, ${esc(p.ref.part)}: <i>“${esc(p.ref.line)}”</i></div>` : "";
  return `<div class="bp">
    <div class="bphead">
      <span class="ikind ${b.format.id}">${esc(b.format.name)}</span>
      <h3>${esc(b.title)}</h3>
      ${b.alternates.length ? `<p class="imeta">Or: ${b.alternates.map(esc).join(" · ")}</p>` : ""}
      <p class="bppitch">${esc(b.premise)}</p>
    </div>
    ${b.versionLock ? `<div class="bpblock"><h4>Version lock</h4><p>${esc(b.versionLock)}</p></div>` : ""}
    ${b.intro.length ? `<div class="bpblock"><h4>Intro — about ${b.norms.introWords[0]}–${b.norms.introWords[1]} words, three moves</h4>
      <blockquote class="shook">${b.intro.map((l) => esc(l)).join(" ")}</blockquote>
      <ol class="bpmoves"><li><b>Open</b> ${esc(b.format.intro.open)}</li><li><b>Build</b> ${esc(b.format.intro.build)}</li><li><b>Hook</b> ${esc(b.format.intro.hook)}</li></ol></div>` : ""}
    <div class="bpblock"><h4>The parts — ${b.parts.length} of about ${b.norms.partWords[1]} words each (${b.norms.partWords[0]}–${b.norms.partWords[2]})</h4>
      <ol class="bpparts">${b.parts
        .map((p) => `<li><div class="bpn">${p.n}</div><div><b>${esc(p.name)}</b><p>${esc(p.plan)}</p>${refLine(p)}</div></li>`)
        .join("")}</ol></div>
    ${b.outro ? `<div class="bpblock"><h4>Outro</h4><p>${esc(b.outro)}</p></div>` : ""}
    ${b.caveats.length ? `<div class="bpblock"><h4>Stay honest about</h4><ul class="icav">${b.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
    <div class="bpblock"><h4>Rules for this format</h4><ul class="icav">${b.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
    <p class="imeta">Target about ${b.norms.words.toLocaleString("en-US")} words · sentences around ${b.norms.sentence} words · paragraphs of about ${b.norms.paragraph} sentences · reasoned in “would / could”, not narrated.
      Closest scripts: ${b.refs.map((r) => esc(r.title)).join(" · ") || "none yet"}.</p>
  </div>`;
}

export function renderStoryLab(shell: Shell, d: StoryLabData): string {
  const opt = (value: string, label: string, sel: string) => `<option value="${esc(value)}"${value === sel ? " selected" : ""}>${esc(label)}</option>`;
  const builder = `<form method="get" action="/story-lab#blueprint" class="labform">
      <label>Format<select name="format" onchange="var s=this.form.querySelector('[name=shape]');if(s)s.value=''">${d.formats
        .filter((f) => ["insert", "survive", "power", "hunt", "versus", "reborn", "you"].includes(f.format.id))
        .map((f) => opt(f.format.id, f.format.name, d.picked.shape ? "" : d.picked.format))
        .join("")}</select></label>
      ${
        d.shapes?.length
          ? `<label>Title shape<select name="shape"><option value="">— the format's own</option>${d.shapes
              .map((sh) => opt(sh.id, `${sh.name} (${FORMAT_BY_ID.get(sh.base)?.name ?? sh.base})`, d.picked.shape ?? ""))
              .join("")}</select></label>`
          : ""
      }
      <label>Hero<select name="hero"><option value="">—</option>${HEROES.map((h) => opt(h.id, `${h.name}${h.fresh ? " (new)" : ""}`, d.picked.hero)).join("")}</select></label>
      <label>World or setting<select name="world"><option value="">—</option>${WORLDS.map((w) => opt(w.id, `${w.name}${w.fresh ? " (new)" : ""}`, d.picked.world)).join("")}</select></label>
      <label>Power<select name="power"><option value="">—</option>${POWERS.map((p) => opt(p.id, p.name, d.picked.power)).join("")}</select></label>
      <label>Target / opponent<select name="target"><option value="">—</option>${HEROES.map((h) => opt(h.id, h.name, d.picked.target)).join("")}</select></label>
      <button class="clear">Build blueprint</button>
    </form>`;

  const ideaCard = ({ idea, blueprint }: StoryLabData["ideas"][number]) => `<li><details class="isg labidea">
      <summary>
        <span class="ikind ${idea.format}">${esc(FORMAT_BY_ID.get(idea.format)?.name ?? idea.format)}${
          idea.shape ? ` · ${esc(d.shapes?.find((x) => x.id === idea.shape)?.name ?? idea.shape)}` : ""
        }</span>
        <span class="iidea">${esc(idea.title)}</span>
        <span class="iwhy">${idea.reasons.slice(0, 2).map((r) => esc(r.text)).join(" · ")}</span>
        <span class="imore">Blueprint ▾</span>
      </summary>
      <div class="idetail">
        <h4>Why this one</h4>
        <ul class="labwhy">${idea.reasons.map((r) => `<li><b class="${r.lift >= 1 ? "up" : "down"}">${esc(liftText(r.lift))}</b> ${esc(r.text)}</li>`).join("")}</ul>
        ${blueprint ? blueprintHtml(blueprint) : ""}
      </div>
    </details></li>`;

  const check = d.check;
  const checker = `<form method="post" action="/story-lab/check#check" class="sform labcheck">
      <input type="text" name="title" value="${esc(check?.title ?? "")}" placeholder="Title — e.g. What If Gojo Was In Invincible?" autocomplete="off">
      <textarea name="script" rows="10" placeholder="Paste the draft with its INTRO / PART 1 / … / OUTRO headers">${esc(check?.text ?? "")}</textarea>
      <button class="clear">Check the structure</button>
    </form>
    ${
      check
        ? check.result
          ? `<div class="labresult">
              <p class="imeta">Read as a <b>${esc(check.result.format.name)}</b>${check.result.hero ? ` with ${esc(check.result.hero.name)}` : ""}${check.result.world ? ` in ${esc(check.result.world.name)}` : ""} · ${check.result.words.toLocaleString("en-US")} words · ${check.result.sections.map((s) => `${esc(s.name.replace("PART ", "P"))} ${s.words}`).join(" · ")}</p>
              <ul class="labfind">${check.result.findings
                .sort((a, b) => ["fix", "note", "good"].indexOf(a.level) - ["fix", "note", "good"].indexOf(b.level))
                .map((f) => `<li class="${f.level}"><span class="lf">${f.level === "fix" ? "Fix" : f.level === "note" ? "Note" : "Good"}</span><b>${esc(f.label)}</b><span>${esc(f.detail)}</span></li>`)
                .join("")}</ul>
            </div>`
          : `<p class="hint">That's too short to check — paste the whole draft.</p>`
        : ""
    }`;

  const contrast = d.contrast
    ? `<table class="labtable"><thead><tr><th></th><th>Top third</th><th>Bottom third</th></tr></thead><tbody>${d.contrast
        .map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.hits)}</td><td>${esc(c.misses)}</td></tr>`)
        .join("")}</tbody></table>`
    : `<p class="hint">${d.matched} of the scripts are matched to their uploads so far — this needs six. It fills in as the scripts' videos go up and get judged against their channel's usual.</p>`;
  const results = d.results.length
    ? `<ul class="ivids">${[...d.results]
        .sort((a, b) => b.multiple - a.multiple)
        .slice(0, 8)
        .map((r) => `<li><a><span class="vm ${r.multiple >= 1 ? "up" : "down"}">${esc(formatMultiple(r.multiple))}</span><span class="vt">${esc(r.script.title)}</span><span class="vc">${esc(FORMAT_BY_ID.get(r.script.format)?.name ?? "")} · ${r.script.metrics.parts} parts · ${r.script.words.toLocaleString("en-US")} words</span></a></li>`)
        .join("")}</ul>`
    : "";

  const coverage = `<div class="labcov"><table><thead><tr><th></th>${d.coverage.worlds
    .map((w) => `<th title="${esc(w.name)}"><span>${esc(w.name.replace(/^The /, ""))}</span></th>`)
    .join("")}</tr></thead><tbody>${d.coverage.heroes
    .map(
      (h) => `<tr><th>${esc(h.name)}</th>${d.coverage.worlds
        .map((w) => {
          const done = d.coverage.done.has(`${h.id}|${w.id}`) || h.home === w.id;
          const href = `/story-lab?format=${w.kind === "setting" ? "survive" : "insert"}&amp;hero=${h.id}&amp;world=${w.id}#blueprint`;
          return done ? `<td class="done" title="${esc(`${h.name} × ${w.name}: done`)}">●</td>` : `<td><a href="${href}" title="${esc(`Blueprint: ${h.name} × ${w.name}`)}">+</a></td>`;
        })
        .join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;

  const formats = d.formats
    .map(
      (f) => `<li><details class="isg">
        <summary><span class="ikind ${f.format.id}">${esc(f.format.name)}</span><span class="iwhy">${f.norms.scripts} scripts · ${f.norms.parts} parts · ~${f.norms.words.toLocaleString("en-US")} words — ${esc(f.format.pitch)}</span><span class="imore">How it's built ▾</span></summary>
        <div class="idetail">
          <h4>Intro</h4><ol class="bpmoves"><li><b>Open</b> ${esc(f.format.intro.open)}</li><li><b>Build</b> ${esc(f.format.intro.build)}</li><li><b>Hook</b> ${esc(f.format.intro.hook)}</li></ol>
          <h4>Beats, in order</h4><ol class="bpbeats">${f.format.beats.map((b) => `<li><b>${esc(b.name)}</b> <small>part ${b.at.join("–")}</small><p>${esc(b.does)}</p></li>`).join("")}</ol>
          <h4>Outro</h4><p>${esc(f.format.outro)}</p>
          <h4>Rules</h4><ul class="icav">${f.format.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          ${f.examples.length ? `<h4>In the corpus</h4><p class="imeta">${f.examples.map(esc).join(" · ")}</p>` : ""}
        </div>
      </details></li>`,
    )
    .join("");

  return layout(
    "Story Lab",
    shell,
    `${pageHeader("Story Lab", `<a class="clear secondary" href="/uploads?cat=stories">Stories uploads</a>`)}
    <p class="labsub">Learned from ${d.scripts} Stories scripts (${Math.round(d.words / 1000)}K words): how each format is built part by part, how every world's institution, roster and apex are used, and each hero's ability ladder. Ideas are ranked on the channel's own results${d.matched ? ` (${d.matched} scripts matched to their uploads)` : ""}, fit and freshness.</p>
    ${
      d.blueprint
        ? `<div class="panel" id="blueprint"><h2>Blueprint</h2>${
            d.builtRepeats
              ? `<p class="labrepeat">Already on YouTube: <a href="${esc(d.builtRepeats.url)}" target="_blank" rel="noreferrer">${esc(d.builtRepeats.title)}</a> (${esc(d.builtRepeats.channel)}). This would repeat it — pick a different world or format.</p>`
              : ""
          }${blueprintHtml(d.blueprint)}</div>`
        : d.picked.format && d.picked.hero
          ? `<div class="panel" id="blueprint"><p class="hint">That combination needs a ${d.picked.format === "power" ? "power" : d.picked.format === "hunt" || d.picked.format === "versus" ? "target" : "world"} too.</p></div>`
          : ""
    }
    ${
      d.writeNext
        ? writeNextPanel(d.writeNext, d.shapes ?? [], d.publicCount ?? 0)
        : `<div class="panel ideas"><h2>Write next <span class="sub">— open one for the full blueprint${
            d.publicCount ? ` · checked against ${d.publicCount.toLocaleString("en-US")} public videos${d.heldBack ? `, ${d.heldBack} already done and left out` : ""}` : ""
          }</span></h2>
      <ul class="isugg">${d.ideas.map(ideaCard).join("")}</ul></div>`
    }
    ${d.dice ? dicePanel(d.dice) : ""}
    <div class="panel ideas"><h2>Build any blueprint</h2>${builder}</div>
    <div class="panel ideas" id="check"><h2>Check a draft <span class="sub">— against the ${d.scripts} scripts, format by format</span></h2>${checker}</div>
    ${d.library ? libraryPanel(d.library) : ""}
    <div class="panel ideas"><h2>What the best-performing scripts did differently</h2>${contrast}${results}</div>
    <div class="panel ideas"><h2>The formats <span class="sub">— how each one is actually built</span></h2><ul class="isugg labformats">${formats}</ul></div>
    <div class="panel ideas"><h2>What's been done <span class="sub">— ● written · + opens a blueprint</span></h2>${coverage}</div>`,
  );
}

/**
 * Settings: what the sidebar shows, what the dashboard shows, and the days
 * off. Kept in this browser (cookies), like the dashboard's own choices.
 */
export interface ColourRow {
  id: string;
  name: string;
  category: string;
  colour: string;
  source: "hand" | "avatar" | "catalog";
  /** Bits and Reading: the colour comes from the YouTube avatar. */
  sampled: boolean;
  linked: boolean;
  error: string | null;
}

export function renderSettings(
  shell: Shell,
  data: {
    railHide: string[]; dashHide: string[]; daysOff: string[]; shifted: StoredRecord[]; saved: boolean; scripts: boolean;
    colours?: ColourRow[]; coloursSaved?: string;
  },
): string {
  const off = new Set(data.railHide);
  const dash = new Set(data.dashHide);
  const box = (key: string, label: string, colour = "") =>
    `<label><input type="checkbox" name="show" value="${esc(key)}"${off.has(key) ? "" : " checked"}>${
      colour ? `<i style="--c:${colour}"></i>` : ""
    }${esc(label)}</label>`;
  const groups = (["Pages", "Categories", "Also"] as const)
    .map((g) => {
      const items = RAIL_ITEMS.filter((i) => i.group === g && (i.key !== "scripts" || data.scripts));
      return `<fieldset><legend>${g}</legend>${items
        .map((i) => box(i.key, i.label, i.key.startsWith("cat-") ? CATEGORIES.find((c) => `cat-${c.id}` === i.key)?.color ?? "" : ""))
        .join("")}</fieldset>`;
    })
    .join("");
  return layout(
    "Settings",
    shell,
    `${pageHeader("Settings")}
    <form class="settings" method="post" action="/settings">
      <input type="hidden" name="form" value="1">
      <section class="panel setgroup">
        <h2>Sidebar <span class="sub">— untick anything you don't use. Settings always stays at the bottom.</span></h2>
        <div class="setcols">${groups}</div>
      </section>
      <section class="panel setgroup">
        <h2>Dashboard</h2>
        <div class="setrow">
          <label><input type="checkbox" name="dash" value="revisions"${dash.has("revisions") ? "" : " checked"}> Revisions</label>
          <label><input type="checkbox" name="dash" value="unsorted"${dash.has("unsorted") ? "" : " checked"}> Unsorted list</label>
          <label><input type="checkbox" name="dash" value="channels"${dash.has("channels") ? "" : " checked"}> Channels list</label>
        </div>
        <p class="hint">Which categories are columns, and their order, are in the dashboard's <b>Columns</b> menu —
          or drag a column by the ⠿ beside its name.</p>
      </section>
      <div class="setsave"><button class="clear">Save</button>${data.saved ? `<span class="saved" role="status">Saved.</span>` : ""}</div>
    </form>
    <section class="panel setgroup settings" style="margin-top:14px">
      <h2>Days off <span class="sub">— no work that day: anything due on it is due the working day before</span></h2>
      ${daysOffStrip(data.daysOff, data.shifted)}
    </section>
    ${data.colours ? colourSettings(data.colours, data.coloursSaved ?? "") : ""}`,
  );
}

/**
 * Every channel's colour, where it comes from, and a picker to set one by
 * hand. Bits and Reading take theirs from their YouTube avatars.
 */
function colourSettings(rows: ColourRow[], saved: string): string {
  const why = (r: ColourRow) =>
    r.source === "hand"
      ? `set by hand <button class="linkbtn" name="reset" value="${esc(r.id)}">Reset</button>`
      : r.source === "avatar"
        ? "from its YouTube avatar"
        : r.sampled
          ? r.error
            ? `<span class="warn" title="${esc(r.error)}">avatar not read yet</span>`
            : r.linked
              ? "avatar not read yet"
              : `no YouTube link yet — <a href="/uploads?cat=${esc(r.category)}">add it</a>`
          : r.category === "stories"
            ? "its avatar colour"
            : "the board's own";
  const groups = CATEGORIES.map((c) => {
    const list = rows.filter((r) => r.category === c.id);
    if (!list.length) return "";
    return `<fieldset style="--c:${c.color}"><legend><i></i>${esc(c.label)}</legend>${list
      .map(
        (r) => `<label class="colrow">
          <input type="color" name="c_${esc(r.id)}" value="${esc(r.colour.toLowerCase())}" aria-label="${esc(r.name)}'s colour">
          <span class="nm">${esc(r.name)}</span>
          <span class="src">${why(r)}</span>
        </label>`,
      )
      .join("")}</fieldset>`;
  }).join("");
  return `<form class="panel setgroup settings colourset" id="colours" method="post" action="/settings/colours" style="margin-top:14px">
    <h2>Channel colours <span class="sub">— Bits and Reading wear their YouTube avatars' colours, read on the server
      and kept apart from every other channel's. Pick one to set it by hand.</span></h2>
    <div class="colgrid">${groups}</div>
    <div class="setsave">
      <button class="clear">Save colours</button>
      <button class="clear secondary" name="sample" value="1" title="Read every Bits and Reading avatar again now">Read the avatars again</button>
      ${saved ? `<span class="saved" role="status">${esc(saved)}</span>` : ""}
    </div>
  </form>`;
}

/**
 * Revisions: every cut waiting for review, soonest first, each due
 * REVIEW_HOURS after it came in unless its message said otherwise. Below,
 * other open work that carries a Frame.io link, so a link never goes missing.
 */
export function renderRevisions(shell: Shell, revisions: StoredRecord[], others: StoredRecord[], sort?: SortState): string {
  const shown = sort ? sortRecords(revisions, sort.key, sort.dir) : revisions;
  return layout(
    "Revisions",
    shell,
    `${pageHeader("Revisions")}
    <p class="labsub">Each revision is due for review ${REVIEW_HOURS} hours after it comes in, unless its message gives a
      deadline. ✓ marks it reviewed. Revisions have their own place — here and on the dashboard — and never carry a VO deadline.</p>
    ${revisions.length > 1 ? sortBar(sort) : ""}
    ${rows(shown, "No revisions waiting. Forward a Frame.io link into the intake channel.")}
    ${
      others.length
        ? `<h2 class="section-title" style="margin-top:28px">Other work with a Frame.io link</h2>
           <p class="hint">Assignments sent with a cut to watch — they stay with their category's work.</p>
           ${rows(others, "")}`
        : ""
    }`,
  );
}

/** Everything paused — out of the workflow with no deadline — and the way back. */
/** What's new: every change to the board, newest first, as its notification summed it up. */
export function renderWhatsNew(shell: Shell, releases: Array<Release & { at: Date | null }>): string {
  const k = NOTICE_KINDS.find((n) => n.kind === "update")!;
  const items = releases
    .map(
      (r) => `<section class="panel release" id="${esc(r.id)}" style="--nc:${k.colour}">
      <div class="relhead">${noticeIcon("update")}<div><h2>${esc(r.title)}</h2>
        <div class="reldate">${r.at ? `${esc(usDate(dayOf(r.at)))} · ${esc(timeAgo(r.at))}` : "not live yet"}</div></div></div>
      <ul class="relchanges">${r.changes
        .map((c) => `<li>${esc(c.text)}${c.href ? ` <a href="${esc(c.href)}">Open →</a>` : ""}</li>`)
        .join("")}</ul>
    </section>`,
    )
    .join("");
  return layout(
    "What's new",
    shell,
    `${pageHeader("What's new")}
    <p class="labsub">Every change to the board, newest first. Each one also arrives in the bell as its own kind of notification, <b>What's new</b>.</p>
    ${items}`,
  );
}

export function renderPaused(shell: Shell, list: StoredRecord[]): string {
  return layout(
    "Paused",
    shell,
    `${pageHeader("Paused")}
    <p class="labsub">Paused videos have no deadline anywhere: they're off late, due today, the calendar, the
      dashboard columns, the bell and the reminders. Resume one (▶) and its deadline comes back as it was —
      if that date has passed, change it on its page.</p>
    ${rows(list, "Nothing paused.")}`,
  );
}
