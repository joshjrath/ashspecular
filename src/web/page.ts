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
import { ORG_TZ, TEAM_TZ, renderIn } from "../parse/derive.js";
import type { DayBucket, Stats, StoredRecord } from "../db/records.js";

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
:root {
  --bg: #0B0D12; --panel: #151922; --panel2: #1A1F2A; --line: #242B38;
  --text: #E8EBF2; --dim: #8D96A8; --faint: #5A6479;
  --late: #E0685F; --warn: #D9752E;
  --lf: #5B8DEF; --rd: #D9752E; --gm: #34A871; --bt: #9A6AE0;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 14.5px/1.5 "Plus Jakarta Sans", ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }

/* ── shell ─────────────────────────────────────────────────────────────── */
.shell { display: grid; grid-template-columns: 216px 1fr; min-height: 100vh; }
aside {
  border-right: 1px solid var(--line); padding: 22px 14px; position: sticky; top: 0;
  height: 100vh; overflow-y: auto;
}
aside .mark { font-size: 16px; font-weight: 680; letter-spacing: -0.01em; padding: 0 10px 20px; display: block; }
aside nav a {
  display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px;
  color: var(--dim); font-size: 14px; font-weight: 500;
}
aside nav a:hover { background: var(--panel); color: var(--text); }
aside nav a.on { background: var(--panel2); color: var(--text); font-weight: 600; }
aside nav a .n { margin-left: auto; font-size: 12.5px; color: var(--faint); font-variant-numeric: tabular-nums; }
aside h3 {
  font-size: 10.5px; font-weight: 650; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--faint); margin: 26px 0 8px; padding: 0 10px;
}
aside .cat {
  display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 8px;
  font-size: 13.5px; color: var(--dim);
}
aside .cat:hover { background: var(--panel); color: var(--text); }
aside .cat .dot { width: 8px; height: 8px; border-radius: 3px; background: var(--c); flex: none; }
aside .cat .n { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--faint); }
aside .live {
  margin-top: 26px; padding: 10px; border-radius: 8px; background: var(--panel);
  border: 1px solid var(--line); font-size: 12px; color: var(--dim);
  display: flex; align-items: center; gap: 7px;
}
aside .live .pulse { width: 7px; height: 7px; border-radius: 50%; background: var(--gm); flex: none; }

main { padding: 26px 30px 70px; max-width: 1180px; }
header.page { display: flex; align-items: baseline; gap: 14px; margin-bottom: 22px; }
header.page h1 { font-size: 21px; font-weight: 660; letter-spacing: -0.015em; margin: 0; }
header.page .when { color: var(--faint); font-size: 13px; margin-left: auto; font-variant-numeric: tabular-nums; }

/* ── stat row ──────────────────────────────────────────────────────────── */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 11px; margin-bottom: 26px; }
.stat {
  background: var(--panel); border: 1px solid var(--line); border-radius: 11px; padding: 14px 16px;
}
.stat .n { font-size: 27px; font-weight: 660; letter-spacing: -0.025em; line-height: 1.15; font-variant-numeric: tabular-nums; }
.stat .l { color: var(--dim); font-size: 12.5px; margin-top: 3px; }
.stat.alert .n { color: var(--late); }

/* ── panels ────────────────────────────────────────────────────────────── */
.split { display: grid; grid-template-columns: 1fr 268px; gap: 14px; margin-bottom: 30px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 17px 19px; }
.panel > h2 {
  font-size: 11px; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--dim); margin: 0 0 14px;
}
.legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 12px; font-size: 12px; color: var(--dim); }
.legend span { display: flex; align-items: center; gap: 6px; }
.legend i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); display: block; }

.today .date { font-size: 15px; font-weight: 600; }
.today .due { color: var(--dim); font-size: 12.5px; margin-bottom: 14px; }
.today .line {
  display: flex; align-items: center; gap: 9px; padding: 7px 0; font-size: 13.5px;
  border-top: 1px solid var(--line);
}
.today .line .dot { width: 8px; height: 8px; border-radius: 3px; background: var(--c); flex: none; }
.today .line .n { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600; }

/* ── record rows ───────────────────────────────────────────────────────── */
.group { margin-bottom: 22px; }
.group > .head { display: flex; align-items: baseline; gap: 9px; margin: 0 0 9px; }
.group > .head .name { font-size: 14.5px; font-weight: 620; }
.group > .head .dot { width: 9px; height: 9px; border-radius: 3px; background: var(--c); }
.group > .head .sub { color: var(--faint); font-size: 12.5px; }
.group > .head .n { margin-left: auto; color: var(--faint); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.rows { border: 1px solid var(--line); border-radius: 11px; overflow: hidden; }
.row {
  display: grid; grid-template-columns: 1fr auto; gap: 3px 18px; align-items: center;
  padding: 12px 15px; background: var(--panel); border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--c);
}
.row:last-child { border-bottom: 0; }
.row:hover { background: var(--panel2); }
.row .title { font-weight: 550; letter-spacing: -0.005em; }
.row .title .code { color: var(--faint); font-weight: 500; font-variant-numeric: tabular-nums; margin-right: 7px; }
.row .meta { grid-column: 1; color: var(--dim); font-size: 12.5px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.row .meta .chan { color: var(--c); font-weight: 550; }
.row .when { grid-row: span 2; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row .when .d { font-size: 13px; font-weight: 550; }
.row .when .z { color: var(--faint); font-size: 11.5px; }
.row .when .derived { color: var(--warn); font-size: 11.5px; }
.row .when .over { color: var(--late); font-size: 11.5px; font-weight: 600; }
.pill { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px;
  border: 1px solid var(--line); color: var(--dim); }
.empty { background: var(--panel); border: 1px dashed var(--line); border-radius: 11px;
  padding: 24px 18px; color: var(--faint); text-align: center; font-size: 13.5px; }
.links { display: flex; gap: 6px; flex-wrap: wrap; }
.links a { font-size: 11.5px; padding: 1px 8px; border-radius: 6px; border: 1px solid var(--line); color: var(--dim); }
.links a.frameio { border-color: #3C5A8A; color: #9EC1F0; }
.links a:hover { border-color: var(--c); color: var(--text); }
.warn { color: var(--warn); font-size: 12px; }
.chanlist { display: flex; flex-wrap: wrap; gap: 7px; }
.chanlist a { background: var(--panel); border: 1px solid var(--line); border-radius: 999px;
  padding: 5px 12px; font-size: 13px; border-left: 3px solid var(--c); }
.chanlist a:hover { border-color: var(--c); }
.chanlist .n { color: var(--faint); margin-left: 6px; font-variant-numeric: tabular-nums; }
.back { color: var(--dim); font-size: 13px; }
.brief { background: var(--panel); border: 1px solid var(--line); border-radius: 11px;
  padding: 16px 18px; white-space: pre-wrap; line-height: 1.62; }
form.inline { display: inline; }
button.clear { background: transparent; border: 1px solid var(--line); color: var(--dim);
  border-radius: 7px; padding: 5px 11px; font-size: 12px; cursor: pointer; font-family: inherit; }
button.clear:hover { border-color: var(--lf); color: var(--text); }
.login { max-width: 320px; margin: 16vh auto; }
.login input { width: 100%; padding: 11px 13px; border-radius: 8px; background: var(--panel);
  border: 1px solid var(--line); color: var(--text); font: inherit; margin-bottom: 10px; }
.login button { width: 100%; padding: 11px; border-radius: 8px; border: 0; cursor: pointer;
  background: var(--lf); color: #0B0D11; font: inherit; font-weight: 620; }
.err { color: var(--late); font-size: 13px; margin-bottom: 10px; }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  .split { grid-template-columns: 1fr; }
  .stats { grid-template-columns: repeat(2, 1fr); }
}
`;

export interface Shell {
  /** Which sidebar entry is lit. */
  active: string;
  counts: Record<string, number>;
  nav: { reviews: number; queue: number; recurring: number };
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
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
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
    <div class="title">${code}<a href="/r/${r.id}">${esc(title)}</a></div>
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
  const W = 700, H = 188, PAD_L = 26, PAD_B = 30, PAD_T = 18;
  const max = Math.max(4, ...buckets.map((b) => b.total));
  const plotH = H - PAD_B - PAD_T;
  const slot = (W - PAD_L) / buckets.length;
  const barW = Math.min(30, slot - 8);

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
          text-anchor="middle" font-size="10.5" fill="#8D96A8"
          font-variant-numeric="tabular-nums">${b.total}</text>` : ""}
        <text x="${(x + barW / 2).toFixed(1)}" y="${H - PAD_B + 15}" text-anchor="middle"
          font-size="10.5" fill="${b.date ? "#5A6479" : "#E0685F"}">${esc(label)}</text>`;
    })
    .join("");

  const ticks = [0, Math.ceil(max / 2), max]
    .map((v) => {
      const y = H - PAD_B - (v / max) * plotH;
      return `<line x1="${PAD_L}" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"
        stroke="#242B38" stroke-width="1"/>
      <text x="${PAD_L - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10"
        fill="#5A6479" font-variant-numeric="tabular-nums">${v}</text>`;
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
      (t) => `<div class="stat${t.alert ? " alert" : ""}">
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
    return `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${colourOf(ch.category)}">${esc(
      ch.name,
    )}<span class="n">${n}</span></a>`;
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
      <div class="head"><span class="name">Channels</span></div>
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
            `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${colourOf(id)}">${esc(
              ch.name,
            )}<span class="n">${channels[ch.name] ?? 0}</span></a>`,
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
      <h1 style="font-size:23px;margin:0 0 14px;letter-spacing:-0.015em">${esc(displayTitle(r))}</h1>
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
      <h1 style="font-size:19px;margin:0 0 14px">Specular</h1>
      ${error ? `<div class="err">${esc(error)}</div>` : ""}
      <form method="post" action="/login">
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
