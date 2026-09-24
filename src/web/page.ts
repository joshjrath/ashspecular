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
import type { StoredRecord } from "../db/records.js";

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
  --bg: #0E1014; --panel: #161A21; --line: #232935;
  --text: #E6E9EF; --dim: #8A93A3; --faint: #5B6474;
  --warn: #D9752E;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.5 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 28px 20px 72px; }
header.top { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
header.top h1 { font-size: 19px; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
header.top .now { color: var(--dim); font-size: 13px; margin-left: auto; }
nav.cats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 30px; }
nav.cats a {
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 13px 15px; display: block; border-left: 3px solid var(--c);
}
nav.cats a:hover { border-color: var(--c); }
nav.cats .n { font-size: 25px; font-weight: 640; letter-spacing: -0.02em; }
nav.cats .l { color: var(--dim); font-size: 12.5px; margin-top: 2px; }
section { margin-bottom: 34px; }
section > h2 {
  font-size: 12px; font-weight: 650; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--dim); margin: 0 0 11px;
}
section > h2 .count { color: var(--faint); font-weight: 500; letter-spacing: 0; }
.rows { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.row {
  display: grid; grid-template-columns: 1fr auto; gap: 4px 18px; align-items: center;
  padding: 13px 16px; background: var(--panel); border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--c);
}
.row:last-child { border-bottom: 0; }
.row:hover { background: #1A1F28; }
.row .title { font-weight: 550; letter-spacing: -0.005em; }
.row .title .code { color: var(--faint); font-weight: 500; font-variant-numeric: tabular-nums; margin-right: 7px; }
.row .meta { grid-column: 1; color: var(--dim); font-size: 12.5px; display: flex; gap: 9px; flex-wrap: wrap; }
.row .meta .chan { color: var(--c); font-weight: 550; }
.row .when { grid-row: span 2; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.row .when .d { font-size: 13.5px; font-weight: 550; }
.row .when .z { color: var(--faint); font-size: 11.5px; }
.row .when .derived { color: var(--warn); font-size: 11.5px; }
.pill {
  display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11px;
  border: 1px solid var(--line); color: var(--dim);
}
.empty { background: var(--panel); border: 1px dashed var(--line); border-radius: 10px;
  padding: 26px 18px; color: var(--faint); text-align: center; font-size: 13.5px; }
.links { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 2px; }
.links a { font-size: 12px; padding: 2px 9px; border-radius: 6px;
  border: 1px solid var(--line); color: var(--dim); }
.links a.frameio { border-color: #3C5A8A; color: #9EC1F0; }
.links a:hover { border-color: var(--c); color: var(--text); }
.chanlist { display: flex; flex-wrap: wrap; gap: 7px; }
.chanlist a { background: var(--panel); border: 1px solid var(--line); border-radius: 999px;
  padding: 5px 12px; font-size: 13px; border-left: 3px solid var(--c); }
.chanlist a:hover { border-color: var(--c); }
.chanlist .n { color: var(--faint); margin-left: 6px; font-variant-numeric: tabular-nums; }
.warn { color: var(--warn); font-size: 12px; }
form.inline { display: inline; }
button.clear {
  background: transparent; border: 1px solid var(--line); color: var(--dim);
  border-radius: 7px; padding: 5px 11px; font-size: 12px; cursor: pointer; font-family: inherit;
}
button.clear:hover { border-color: var(--c); color: var(--text); }
.back { color: var(--dim); font-size: 13px; }
.brief { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 16px 18px; white-space: pre-wrap; line-height: 1.62; }
.login { max-width: 320px; margin: 16vh auto; }
.login input { width: 100%; padding: 11px 13px; border-radius: 8px; background: var(--panel);
  border: 1px solid var(--line); color: var(--text); font: inherit; margin-bottom: 10px; }
.login button { width: 100%; padding: 11px; border-radius: 8px; border: 0; cursor: pointer;
  background: #5B8DEF; color: #0B0D11; font: inherit; font-weight: 620; }
.err { color: #E0685F; font-size: 13px; margin-bottom: 10px; }
@media (max-width: 720px) {
  nav.cats { grid-template-columns: repeat(2, 1fr); }
}
`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Specular</title>
<style>${CSS}</style>
</head><body><div class="wrap">${body}</div></body></html>`;
}

function topBar(): string {
  const now = renderIn(new Date(), ORG_TZ, "ET");
  return `<header class="top">
    <h1><a href="/">Specular</a></h1>
    <span class="now">${esc(now)}</span>
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

export function renderDashboard(data: {
  vo: StoredRecord[];
  reviews: StoredRecord[];
  rest: StoredRecord[];
  counts: Record<string, number>;
  channels: Record<string, number>;
}): string {
  const tiles = CATEGORIES.map(
    (c) => `<a href="/category/${c.id}" style="--c:${c.color}">
      <div class="n">${data.counts[c.id] ?? 0}</div>
      <div class="l">${esc(c.label)}</div>
    </a>`,
  ).join("");

  const chanList = CHANNELS.map((ch) => {
    const n = data.channels[ch.name] ?? 0;
    return `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${colourOf(ch.category)}">${esc(
      ch.name,
    )}<span class="n">${n}</span></a>`;
  }).join("");

  return layout(
    "Dashboard",
    `${topBar()}
    <nav class="cats">${tiles}</nav>

    <section>
      <h2>VO to record <span class="count">${data.vo.length}</span></h2>
      ${rows(data.vo, "Nothing waiting on a voiceover.")}
    </section>

    <section>
      <h2>Reviews <span class="count">${data.reviews.length}</span></h2>
      ${rows(data.reviews, "No Frame.io links yet. Forward one into the intake channel.")}
    </section>

    <section>
      <h2>Everything else <span class="count">${data.rest.length}</span></h2>
      ${rows(data.rest, "Nothing else open.")}
    </section>

    <section>
      <h2>Channels</h2>
      <div class="chanlist">${chanList}</div>
    </section>`,
  );
}

export function renderList(title: string, subtitle: string, list: StoredRecord[]): string {
  return layout(
    title,
    `${topBar()}
    <section>
      <h2>${esc(title)} <span class="count">${list.length}</span></h2>
      ${rows(list, subtitle)}
    </section>
    <a class="back" href="/">← everything</a>`,
  );
}

export function renderRecord(r: StoredRecord): string {
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
    `${topBar()}
    <section>
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
    `${topBar()}
    <div class="empty" style="padding:40px 22px;line-height:1.7">
      <strong style="color:var(--text)">No database connected.</strong><br>
      The board needs <code>DATABASE_URL</code>. Add a Postgres service in
      Railway and the bot will start filing what it parses.
    </div>`,
  );
}

export type { CategoryId };
