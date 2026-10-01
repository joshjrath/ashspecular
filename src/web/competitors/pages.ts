/**
 * Competitors' pages: each niche's command centre (hottest outliers, top
 * concept gaps, what's working, emerging topics, competitor performance, my
 * position, recent uploads), every concept gap with its evidence, the top
 * videos, and one competitor in depth. Numbers come from the data; anything
 * Claude wrote is marked as interpretation and cites the facts it rests on.
 */
import { ORG_TZ, dateIn, usDate } from "../../parse/derive.js";
import { compactViews } from "../performance.js";
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { esc, layout, pageHeader, timeAgo, type Shell } from "../page.js";
import type { Alert, CompChannel, CompSettings, Group, Read } from "../../db/competitors.js";
import type { ChannelStats, Emerging, Gap, Pattern, Position, Row, SortKey, FormatPick } from "../../competitors/analysis.js";
import { FORMAT_LABEL } from "../../competitors/concepts.js";

const day = (d: Date) => usDate(dateIn(ORG_TZ, d));
const views = (n: number | null) => (n === null ? "—" : compactViews(Math.round(n)));
const mult = (m: number | null) => (m === null ? "—" : m >= 10 ? `${Math.round(m)}×` : `${m.toFixed(1)}×`);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const age = (days: number) => (days < 1 ? `${Math.max(1, Math.round(days * 24))}h` : days < 60 ? `${Math.round(days)}d` : days < 730 ? `${Math.round(days / 30.4)}mo` : `${Math.round(days / 365)}y`);
const heat = (m: number | null, s: CompSettings) => (m === null ? "none" : m >= s.major ? "major" : m >= s.outlier ? "out" : m >= 1 ? "up" : "down");
const safe = (u: string | null | undefined) => (u && /^https:\/\//.test(u) ? u : "");

export interface NicheQuery { format: FormatPick; days: number }
const qs = (gid: number, q: NicheQuery, extra: Record<string, string> = {}, path = "") =>
  `/competitors/${gid}${path}?${new URLSearchParams({ f: q.format, d: String(q.days), ...extra }).toString()}`;

function avatar(c: CompChannel, size = 32): string {
  const a = safe(c.avatar);
  const name = c.title ?? c.input;
  return a
    ? `<img class="cavatar" src="${esc(a)}" width="${size}" height="${size}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="cavatar none" style="width:${size}px;height:${size}px">${esc(name.replace(/^specular\s+/i, "").slice(0, 1).toUpperCase())}</span>`;
}
const cname = (c: CompChannel) => esc(c.title ?? c.boardChannel ?? c.input);

/** A video: thumbnail, its multiple (relative) and its views (raw), kept apart. */
export function videoCard(r: Row, s: CompSettings, compact = false): string {
  const h = heat(r.multiple, s);
  return `<a class="cvid h-${h}${r.channel.mine ? " mine" : ""}" href="${esc(r.video.url)}" target="_blank" rel="noreferrer" title="${esc(r.video.title)}">
    <span class="cthumb"><img src="${esc(safe(r.video.thumbnail) || `https://i.ytimg.com/vi/${r.video.videoId}/mqdefault.jpg`)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <b class="cmult" title="${r.multiple === null ? "Not enough of its channel's videos to compare with yet" : `Against its channel's normal, ${esc(r.basis ?? "")}`}">${mult(r.multiple)}</b>
      ${r.video.isShort ? `<i class="cshort">Short</i>` : ""}</span>
    <span class="ctitle">${esc(r.video.title)}</span>
    <span class="cmeta">${r.channel.mine ? `<em>Mine</em> ` : ""}${cname(r.channel)}</span>
    ${compact ? "" : `<span class="cnums"><span title="Raw views">${views(r.video.views)} views</span><span>${esc(day(r.video.publishedAt))} · ${age(r.ageDays)}</span><span title="Views a day since it went up">${views(r.perDay)}/day</span></span>`}
  </a>`;
}

function gapCard(g: Gap, gid: number, q: NicheQuery, s: CompSettings): string {
  const cov: Record<Gap["coverage"], string> = { never: "Never covered", stale: "Stale coverage", recent: "Recently covered", planned: "Planned" };
  return `<article class="cgap ${g.coverage}${g.strong ? " strong" : ""}">
    <header><a href="${esc(qs(gid, q, { c: g.key }, "/gaps"))}#gap"><h3>${esc(g.label)}</h3></a>
      <span class="cgcov ${g.coverage}">${cov[g.coverage]}</span>${g.saturated ? `<span class="cgcov sat">Saturated</span>` : ""}${g.strong ? `<span class="cgstrong" title="Two or more independent competitors with outliers, and not covered (or not lately)">Strong signal</span>` : ""}</header>
    <dl class="cgsig">
      <div><dt>Outliers</dt><dd>${g.outliers.length}</dd></div>
      <div><dt>Competitors</dt><dd>${g.channels}</dd></div>
      <div><dt>Highest</dt><dd class="h-${heat(g.maxMultiple, s)}">${mult(g.maxMultiple)}</dd></div>
      <div><dt>Median views/day</dt><dd>${views(g.medianPerDay)}</dd></div>
      <div><dt>Last 14 days</dt><dd>${g.recentOutliers} outlier${g.recentOutliers === 1 ? "" : "s"}</dd></div>
      <div><dt>My coverage</dt><dd>${g.lastCovered ? esc(day(g.lastCovered)) : g.planned ? "planned" : "none"}</dd></div>
    </dl>
    <p class="cgwhy">${esc(g.why)}</p>
    <div class="cgthumbs">${g.outliers.slice(0, 4).map((r) => videoCard(r, s, true)).join("")}</div>
  </article>`;
}

function niches(groups: Group[], active: number | null, q: NicheQuery): string {
  return `<nav class="cniches">${groups
    .map((g) => `<a href="${esc(qs(g.id, q))}"${g.id === active ? ' class="on"' : ""}>${esc(g.name)} <small>${g.channels}${g.mine ? ` + ${g.mine} mine` : ""}</small></a>`)
    .join("")}<a class="add" href="/competitors/manage#niches">＋ Niche</a><a class="add" href="/competitors/manage">Manage</a></nav>`;
}

function switches(gid: number, q: NicheQuery, path = "", extra: Record<string, string> = {}): string {
  const f = (["long", "short", "all"] as const).map((x) => `<a href="${esc(qs(gid, { ...q, format: x }, extra, path))}"${q.format === x ? ' class="on"' : ""}>${x === "long" ? "Long-form" : x === "short" ? "Shorts" : "Both"}</a>`).join("");
  const d = [7, 30, 90, 3650].map((x) => `<a href="${esc(qs(gid, { ...q, days: x }, extra, path))}"${q.days === x ? ' class="on"' : ""}>${x === 3650 ? "All time" : `${x} days`}</a>`).join("");
  return `<div class="cswitch"><span>${f}</span><span>${d}</span></div>`;
}

// ── the niche dashboard ────────────────────────────────────────────────────

export interface NichePage {
  groups: Group[];
  group: Group;
  q: NicheQuery;
  settings: CompSettings;
  channels: CompChannel[];
  rows: Row[];
  hottest: Row[];
  gaps: Gap[];
  working: Pattern[];
  emerging: Emerging[];
  stats: ChannelStats[];
  position: Position;
  recent: Row[];
  alerts: Alert[];
  read: Read | null;
  status: { key: boolean; ai: boolean; quotaUsed: number; aiUsed: number };
  flash?: string;
}

export function renderNiche(shell: Shell, d: NichePage): string {
  const s = d.settings;
  const competitors = d.channels.filter((c) => !c.mine);
  const mine = d.channels.filter((c) => c.mine);
  const majors = d.rows.filter((r) => !r.channel.mine && r.ageDays <= d.q.days && (r.multiple ?? 0) >= s.major).length;
  const lastRead = d.channels.map((c) => c.refreshedAt).filter((x): x is Date => Boolean(x)).sort((a, b) => b.getTime() - a.getTime())[0];
  const failing = d.channels.filter((c) => c.error);
  const gid = d.group.id;
  const tiles = `<section class="ctiles">
      <div><b>${competitors.length}</b><span>competitors tracked</span></div>
      <div><b>${mine.length}</b><span>my channels</span></div>
      <div><b>${d.rows.length.toLocaleString("en-US")}</b><span>videos analysed</span></div>
      <div class="hot"><b>${majors}</b><span>${s.major}×+ outliers, ${d.q.days === 3650 ? "all time" : `last ${d.q.days} days`}</span></div>
    </section>
    <p class="cfresh">${lastRead ? `Data refreshed ${esc(timeAgo(lastRead))}` : "Not read yet — first reads start within a few minutes"} · ${
      d.status.key ? `YouTube API · ${d.status.quotaUsed.toLocaleString("en-US")} of ${s.quota.toLocaleString("en-US")} quota units today` : `<b>No YouTube key</b> (<a href="/settings#key-youtube">add one in Settings</a>): only each channel's latest 15 videos (free feed), no durations or subscribers`
    }${failing.length ? ` · <span class="cerr">${failing.length} channel${failing.length === 1 ? "" : "s"} couldn't be read</span>` : ""}</p>`;
  const alerts = d.alerts.filter((a) => !a.seenAt).slice(0, 5);
  const insight = alerts.length ? `<section class="cinsights">${alerts.map((a) => `<a href="${esc(a.href ?? "#")}"${a.href?.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}><i class="k-${esc(a.kind)}"></i>${esc(a.text)}</a>`).join("")}</section>` : "";
  const hottest = `<section class="panel" id="hottest"><h2>Hottest outliers <span class="sub">— against each video's own channel's normal, not raw views</span><a class="cmore" href="${esc(qs(gid, d.q, { sort: "multiple" }, "/videos"))}">All top videos →</a></h2>
      ${d.hottest.length ? `<div class="cgrid">${d.hottest.map((r) => videoCard(r, s)).join("")}</div>` : `<p class="empty">No competitor video scored above its channel's normal in this window yet. A channel needs a few videos at a known age before its videos can be compared — see Data below.</p>`}</section>`;
  const gaps = `<section class="panel" id="gaps"><h2>Top concept gaps <span class="sub">— working for competitors, not covered by your channels</span><a class="cmore" href="${esc(qs(gid, d.q, {}, "/gaps"))}">View all gaps →</a></h2>
      ${!mine.length ? `<p class="cnote">Add your own channels to this niche (mark them <b>Mine</b>) so gaps can be checked against what you've made.</p>` : ""}
      ${d.gaps.length ? `<div class="cgaps">${d.gaps.slice(0, 5).map((g) => gapCard(g, gid, d.q, s)).join("")}</div>` : `<p class="empty">No concept has a competitor outlier in this window yet.</p>`}</section>`;
  const read = d.read && d.read.notes.length
    ? `<section class="panel cread"><h2>AI read <span class="sub">— Claude's interpretation of the facts below, ${esc(timeAgo(d.read.at))}. It never adds numbers; each note cites the facts it rests on.</span></h2>
        <ul>${d.read.notes.map((n) => `<li>${esc(n.text)} <details><summary>${n.cites.map(esc).join(", ")}</summary><ul class="cfacts">${(d.read!.facts as Array<{ id: string; text: string }>).filter((f) => n.cites.includes(f.id)).map((f) => `<li><b>${esc(f.id)}</b> ${esc(f.text)}</li>`).join("")}</ul></details></li>`).join("")}</ul></section>`
    : "";
  const working = `<section class="panel" id="working"><h2>What's working <span class="sub">— what this window's outliers share more than the niche does (2+ outliers from 2+ channels, 1.5× the niche's outlier rate)</span></h2>
      ${d.working.length ? `<ul class="cpat">${d.working.map((p) => `<li><p>${esc(p.fact)}</p><div class="cmini">${p.examples.map((r) => videoCard(r, s, true)).join("")}</div></li>`).join("")}</ul>` : `<p class="empty">Nothing stands out yet in this window.</p>`}</section>`;
  const emerging = `<section class="panel" id="emerging"><h2>Emerging topics <span class="sub">— early signals, less certain than the patterns above: several channels picking something up in the last 14 days</span></h2>
      ${d.emerging.length ? `<ul class="cpat em">${d.emerging.map((e) => `<li><p><span class="cemk">${esc(e.kind)}</span> ${esc(e.fact)}</p><div class="cmini">${e.videos.slice(0, 4).map((r) => videoCard(r, s, true)).join("")}</div></li>`).join("")}</ul>` : `<p class="empty">No topic is spreading across several channels right now.</p>`}</section>`;
  const perf = `<section class="panel" id="channels"><h2>Competitor performance <span class="sub">— last 90 days, ${d.q.format === "short" ? "Shorts" : d.q.format === "long" ? "long-form" : "all videos"}</span></h2>
      <div class="ccards">${d.stats.filter((x) => !x.channel.mine).map((x) => statCard(x, s)).join("") || `<p class="empty">No competitors in this niche yet — add one below.</p>`}</div></section>`;
  const pos = positionTable(d.position, s);
  const recent = `<section class="panel" id="recent"><h2>Recent uploads</h2>${d.recent.length ? `<div class="cgrid">${d.recent.map((r) => videoCard(r, s)).join("")}</div>` : `<p class="empty">None yet.</p>`}</section>`;
  const add = addForm(d.groups, gid);
  return layout(
    `Competitors · ${d.group.name}`,
    shell,
    `${pageHeader(`${d.group.name} — competitive overview`)}
    <style>${CSS}</style>
    ${niches(d.groups, gid, d.q)}
    ${d.flash ? `<div class="cflash" role="status">${esc(d.flash)}</div>` : ""}
    ${switches(gid, d.q)}
    ${tiles}
    ${insight}
    ${gaps}
    ${hottest}
    ${read}
    ${working}
    ${emerging}
    ${perf}
    ${pos}
    ${recent}
    ${add}`,
  );
}

function statCard(x: ChannelStats, s: CompSettings): string {
  const c = x.channel;
  return `<a class="ccard" href="/competitors/c/${c.id}">
    <header>${avatar(c, 36)}<div><b>${cname(c)}</b><small>${c.subscribers !== null ? `${compactViews(c.subscribers)} subscribers` : "subscribers hidden"} · ${c.refreshedAt ? `read ${esc(timeAgo(c.refreshedAt))}` : "not read yet"}</small></div></header>
    ${c.error ? `<p class="cerr">${esc(c.error)}</p>` : ""}
    <dl>
      <div><dt>Median views</dt><dd>${views(x.medianViews)}</dd></div>
      <div><dt>Average</dt><dd>${views(x.avgViews)}</dd></div>
      <div><dt>Views/day</dt><dd>${views(x.medianPerDay)}</dd></div>
      <div><dt>Uploads/week</dt><dd>${x.perWeek.toFixed(1)}</dd></div>
      <div><dt>Outlier rate</dt><dd>${pct(x.outlierRate)}</dd></div>
      <div><dt>Momentum</dt><dd class="h-${heat(x.momentum, s)}" title="Median multiple of the last 30 days: above 1× is above its own normal">${mult(x.momentum)}</dd></div>
    </dl>
    ${x.best ? `<p class="cbest">Best: <b class="h-${heat(x.best.multiple, s)}">${mult(x.best.multiple)}</b> ${esc(x.best.video.title)}</p>` : ""}
    ${x.topConcepts.length ? `<p class="ctop">${x.topConcepts.map((t) => `<span>${esc(t.label)} · ${t.n}</span>`).join("")}</p>` : ""}
  </a>`;
}

function positionTable(p: Position, s: CompSettings): string {
  const n = p.niche;
  const cell = (v: string, mine: number | null, niche: number | null) => {
    const cls = mine === null || niche === null ? "" : mine >= niche ? "above" : "below";
    return `<td class="${cls}">${v}</td>`;
  };
  return `<section class="panel" id="position"><h2>My position <span class="sub">— every channel in the niche, last 90 days; green is at or above the competitors' median, red below. No combined score: the numbers are the comparison.</span></h2>
    <div class="ctable"><table><thead><tr><th>Channel</th><th>Median views</th><th>Average</th><th>Views/day</th><th>Uploads/wk</th><th>Outlier rate</th><th>Outlier strength</th><th>Momentum</th></tr></thead><tbody>
    ${p.stats
      .map((x) => {
        const m = x.channel.mine;
        const c = (v: string, a: number | null, b: number | null) => (m ? cell(v, a, b) : `<td>${v}</td>`);
        return `<tr class="${m ? "mine" : ""}"><th><a href="/competitors/c/${x.channel.id}">${avatar(x.channel, 22)}${cname(x.channel)}</a>${m ? " <em>Mine</em>" : ""}</th>
          ${c(views(x.medianViews), x.medianViews, n.medianViews)}<td>${views(x.avgViews)}</td>${c(views(x.medianPerDay), x.medianPerDay, n.medianPerDay)}
          ${c(x.perWeek.toFixed(1), x.perWeek, n.perWeek)}${c(pct(x.outlierRate), x.outlierRate, n.outlierRate)}${c(mult(x.outlierStrength), x.outlierStrength, n.outlierStrength)}${c(mult(x.momentum), x.momentum, n.momentum)}</tr>`;
      })
      .join("")}
    <tr class="niche"><th>Competitors' median</th><td>${views(n.medianViews)}</td><td></td><td>${views(n.medianPerDay)}</td><td>${n.perWeek === null ? "—" : n.perWeek.toFixed(1)}</td><td>${pct(n.outlierRate)}</td><td>${mult(n.outlierStrength)}</td><td>${mult(n.momentum)}</td></tr>
    </tbody></table></div>
    <p class="hint">Median and average views: videos from the last 90 days at least a week old. Outlier rate: share of its videos at ${s.outlier}× its own normal or more. Momentum: the median multiple of its last 30 days.</p></section>`;
}

function addForm(groups: Group[], gid: number): string {
  return `<section class="panel" id="add"><h2>Add a channel to this niche</h2>
    <form method="post" action="/competitors/channels" class="caddf">
      <input type="hidden" name="group" value="${gid}">
      <label>YouTube channel link<input name="url" placeholder="https://www.youtube.com/@channel" autocomplete="off"></label>
      <label class="cchk"><input type="checkbox" name="mine" value="1"> Mine</label>
      <span class="cor">or one of the board's channels (mine)</span>
      <label>Board channel<select name="board"><option value="">—</option>${CATEGORIES.map((cat) => `<optgroup label="${esc(cat.label)}">${CHANNELS.filter((c) => c.category === cat.id).map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <label>Niche<select name="to">${groups.map((g) => `<option value="${g.id}"${g.id === gid ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select></label>
      <button class="clear">Add</button>
    </form>
    <p class="hint">A board channel's videos come from Uploads (link its YouTube channel there); others are read through the YouTube API.</p></section>`;
}

// ── all gaps ───────────────────────────────────────────────────────────────

export function renderGaps(shell: Shell, d: { groups: Group[]; group: Group; q: NicheQuery; settings: CompSettings; gaps: Gap[]; status: string; open: Gap | null; related: Gap[]; trends: Array<{ trend: string; outliers: number; channels: number; covered: number }> }): string {
  const gid = d.group.id;
  const filters: Array<[string, string]> = [["", "All"], ["never", "Never covered"], ["stale", "Stale"], ["recent", "Recently covered"], ["planned", "Planned"], ["saturated", "Saturated"]];
  const list = d.gaps.filter((g) => !d.status || (d.status === "saturated" ? g.saturated : g.coverage === d.status));
  const s = d.settings;
  const detail = d.open
    ? `<section class="panel cgdetail" id="gap"><h2>${esc(d.open.label)} <span class="sub">${esc(d.open.trend ?? "")}${d.open.format ? ` · ${esc(FORMAT_LABEL[d.open.format] ?? d.open.format)}` : ""}</span></h2>
        <p class="cgwhy big">${esc(d.open.why)}</p>
        <h3>Competitor videos (${d.open.videos.length})</h3><div class="cgrid">${d.open.videos.map((r) => videoCard(r, s)).join("")}</div>
        <h3>From my channels</h3>${d.open.mine.length ? `<div class="cgrid">${d.open.mine.map((r) => videoCard(r, s)).join("")}</div>` : `<p class="empty">Nothing on this concept from the channels marked yours${d.open.planned ? `; planned: “${esc(d.open.planned.title)}” on ${esc(d.open.planned.channel)}${d.open.planned.date ? `, ${esc(usDate(d.open.planned.date))}` : ""}` : ""}.</p>`}
        <p class="hint">${d.open.lastCovered ? `Last covered ${esc(day(d.open.lastCovered))}. ` : ""}Coverage counts a video of yours with the same lead and the same other side, in any format ("joined The Seven" and "was in The Boys" are one concept; Batman in The Boys doesn't cover Spider-Man in The Boys). Stale after ${s.staleMonths} months.</p>
        ${d.related.length ? `<h3>Related concepts</h3><div class="cgaps">${d.related.map((g) => gapCard(g, gid, d.q, s)).join("")}</div>` : ""}
      </section>`
    : "";
  const trends = d.trends.length
    ? `<section class="panel"><h2>Broader trends <span class="sub">— outliers in this window by pattern, and how many of your videos are on it</span></h2><div class="ctable"><table><thead><tr><th>Pattern</th><th>Outliers</th><th>Competitors</th><th>My videos on it</th></tr></thead><tbody>${d.trends
        .map((t) => `<tr><th>${esc(t.trend)}</th><td>${t.outliers}</td><td>${t.channels}</td><td>${t.covered}</td></tr>`)
        .join("")}</tbody></table></div></section>`
    : "";
  return layout(
    `Concept gaps · ${d.group.name}`,
    shell,
    `${pageHeader(`${d.group.name} — concept gaps`, `<a class="clear secondary" href="${esc(qs(gid, d.q))}">Back to the overview</a>`)}
    <style>${CSS}</style>
    ${niches(d.groups, gid, d.q)}
    ${switches(gid, d.q, "/gaps", d.status ? { status: d.status } : {})}
    <nav class="cfilt">${filters.map(([v, l]) => `<a href="${esc(qs(gid, d.q, v ? { status: v } : {}, "/gaps"))}"${d.status === v ? ' class="on"' : ""}>${esc(l)} <small>${v ? d.gaps.filter((g) => (v === "saturated" ? g.saturated : g.coverage === v)).length : d.gaps.length}</small></a>`).join("")}</nav>
    ${detail}
    <section class="panel"><h2>Every concept with a competitor outlier <span class="sub">— open concepts first, then by independent competitors, outliers, strength and recency</span></h2>
      ${list.length ? `<div class="cgaps">${list.map((g) => gapCard(g, gid, d.q, s)).join("")}</div>` : `<p class="empty">None here.</p>`}</section>
    ${trends}`,
  );
}

// ── top videos ─────────────────────────────────────────────────────────────

export function renderVideos(shell: Shell, d: { groups: Group[]; group: Group; q: NicheQuery; settings: CompSettings; sort: SortKey; rows: Row[] }): string {
  const gid = d.group.id;
  const sorts: Array<[SortKey, string]> = [["multiple", "Outlier"], ["views", "Views"], ["perday", "Views/day"], ["date", "Newest"]];
  return layout(
    `Top videos · ${d.group.name}`,
    shell,
    `${pageHeader(`${d.group.name} — top videos`, `<a class="clear secondary" href="${esc(qs(gid, d.q))}">Back to the overview</a>`)}
    <style>${CSS}</style>
    ${niches(d.groups, gid, d.q)}
    ${switches(gid, d.q, "/videos", { sort: d.sort })}
    <nav class="cfilt">${sorts.map(([v, l]) => `<a href="${esc(qs(gid, d.q, { sort: v }, "/videos"))}"${d.sort === v ? ' class="on"' : ""}>${l}</a>`).join("")}</nav>
    <section class="panel">${d.rows.length ? `<div class="cgrid">${d.rows.map((r) => videoCard(r, d.settings)).join("")}</div>` : `<p class="empty">No videos in this window.</p>`}</section>`,
  );
}

// ── one competitor ─────────────────────────────────────────────────────────

export function renderChannel(shell: Shell, d: { groups: Group[]; group: Group; settings: CompSettings; stats: ChannelStats; niche: Position["niche"]; top: Row[]; recent: Row[]; gaps: Gap[]; trend: Array<{ month: string; median: number | null; n: number }> }): string {
  const c = d.stats.channel;
  const s = d.settings;
  const x = d.stats;
  const q: NicheQuery = { format: "long", days: 90 };
  const vs = (a: number | null, b: number | null, f: (n: number | null) => string) => `${f(a)} <small>niche ${f(b)}</small>`;
  const maxN = Math.max(1, ...d.trend.map((t) => t.median ?? 0));
  return layout(
    `${c.title ?? c.input} · Competitors`,
    shell,
    `${pageHeader(c.title ?? c.input, `<a class="clear secondary" href="/competitors/${d.group.id}">${esc(d.group.name)}</a>`)}
    <style>${CSS}</style>
    <section class="panel chead">${avatar(c, 64)}<div>
      <h2>${cname(c)} ${c.mine ? "<em>Mine</em>" : ""}</h2>
      <p>${c.handle ? `${esc(c.handle)} · ` : ""}${c.subscribers !== null ? `${compactViews(c.subscribers)} subscribers` : "subscribers hidden"}${c.videoCount !== null ? ` · ${c.videoCount.toLocaleString("en-US")} videos` : ""} · ${esc(d.group.name)}
        ${c.youtubeId ? ` · <a href="https://www.youtube.com/channel/${esc(c.youtubeId)}" target="_blank" rel="noreferrer">On YouTube ↗</a>` : ""}</p>
      <p class="hint">${c.boardChannel ? "Read from the board's Uploads." : c.refreshedAt ? `Read ${esc(timeAgo(c.refreshedAt))}.` : "Not read yet."}${c.error ? ` <span class="cerr">${esc(c.error)}</span>` : ""}</p>
      ${!c.boardChannel ? `<form method="post" action="/competitors/channels/${c.id}/refresh"><button class="clear secondary">Read now</button></form>` : ""}
    </div></section>
    <section class="panel"><h2>Recent performance <span class="sub">— last 90 days, against the niche's competitors</span></h2>
      <dl class="cbig">
        <div><dt>Median views</dt><dd>${vs(x.medianViews, d.niche.medianViews, views)}</dd></div>
        <div><dt>Average views</dt><dd>${views(x.avgViews)}</dd></div>
        <div><dt>Views/day</dt><dd>${vs(x.medianPerDay, d.niche.medianPerDay, views)}</dd></div>
        <div><dt>Uploads/week</dt><dd>${x.perWeek.toFixed(1)} <small>niche ${d.niche.perWeek === null ? "—" : d.niche.perWeek.toFixed(1)}</small></dd></div>
        <div><dt>Outliers</dt><dd>${x.outliers90} of ${x.scored90} <small>${pct(x.outlierRate)}</small></dd></div>
        <div><dt>Outlier strength</dt><dd>${vs(x.outlierStrength, d.niche.outlierStrength, mult)}</dd></div>
        <div><dt>Momentum</dt><dd class="h-${heat(x.momentum, s)}">${vs(x.momentum, d.niche.momentum, mult)}</dd></div>
        <div><dt>Last upload</dt><dd>${x.lastUpload ? esc(day(x.lastUpload)) : "—"}</dd></div>
      </dl></section>
    ${d.trend.length ? `<section class="panel"><h2>Performance trend <span class="sub">— median views of each month's videos (at least a week old)</span></h2><div class="ctrend">${d.trend.map((t) => `<div title="${esc(t.month)}: ${views(t.median)} median of ${t.n}"><i style="height:${t.median === null ? 0 : Math.max(4, Math.round((t.median / maxN) * 100))}%"></i><span>${esc(t.month.slice(5))}</span></div>`).join("")}</div></section>` : ""}
    <section class="panel"><h2>Top outliers</h2>${d.top.length ? `<div class="cgrid">${d.top.map((r) => videoCard(r, s)).join("")}</div>` : `<p class="empty">None yet.</p>`}</section>
    ${x.topConcepts.length ? `<section class="panel"><h2>Best-performing topics <span class="sub">— what its outliers were about</span></h2><p class="ctop big">${x.topConcepts.map((t) => `<span>${esc(t.label)} · ${t.n} outlier${t.n === 1 ? "" : "s"}</span>`).join("")}</p></section>` : ""}
    ${!c.mine ? `<section class="panel"><h2>Concepts it's winning with that you haven't covered</h2>${d.gaps.length ? `<div class="cgaps">${d.gaps.map((g) => gapCard(g, d.group.id, q, s)).join("")}</div>` : `<p class="empty">None open right now.</p>`}</section>` : ""}
    <section class="panel"><h2>Recent uploads</h2>${d.recent.length ? `<div class="cgrid">${d.recent.map((r) => videoCard(r, s)).join("")}</div>` : `<p class="empty">None yet.</p>`}</section>`,
  );
}

// ── manage ─────────────────────────────────────────────────────────────────

export function renderManage(shell: Shell, d: { groups: Group[]; channels: CompChannel[]; settings: CompSettings; flash?: string; error?: string; status: { key: boolean; ai: boolean } }): string {
  const s = d.settings;
  const groupOpts = (sel: number) => d.groups.map((g) => `<option value="${g.id}"${g.id === sel ? " selected" : ""}>${esc(g.name)}</option>`).join("");
  return layout(
    "Competitors · Manage",
    shell,
    `${pageHeader("Competitors — niches & channels", d.groups[0] ? `<a class="clear secondary" href="/competitors/${d.groups[0].id}">Back</a>` : "")}
    <style>${CSS}</style>
    ${d.flash ? `<div class="cflash" role="status">${esc(d.flash)}</div>` : ""}${d.error ? `<div class="cflash bad" role="alert">${esc(d.error)}</div>` : ""}
    <section class="panel" id="niches"><h2>Niches <span class="sub">— competitors are only ever compared within their niche</span></h2>
      <ul class="cmlist">${d.groups
        .map((g) => `<li><form method="post" action="/competitors/groups/${g.id}"><input name="name" value="${esc(g.name)}" maxlength="60" required><button class="clear secondary">Rename</button></form>
          <span class="hint">${g.channels} competitors, ${g.mine} mine</span>
          <form method="post" action="/competitors/groups/${g.id}/delete" onsubmit="return confirm('Delete ${esc(g.name).replace(/'/g, "")} and stop tracking its channels?')"><button class="linkbtn">Delete</button></form></li>`)
        .join("")}</ul>
      <form method="post" action="/competitors/groups" class="caddf"><label>New niche<input name="name" required maxlength="60" placeholder="e.g. What If, Rankings, FNAF"></label><button class="clear">Add niche</button></form></section>
    ${d.groups.length ? addForm(d.groups, d.groups[0]!.id).replace('<h2>Add a channel to this niche</h2>', "<h2>Add a channel</h2>") : ""}
    <section class="panel"><h2>Channels</h2>
      ${d.groups
        .map((g) => {
          const list = d.channels.filter((c) => c.groupId === g.id);
          return `<h3>${esc(g.name)}</h3>${list.length ? `<ul class="cmlist">${list
            .map((c) => `<li>${avatar(c, 24)}<a href="/competitors/c/${c.id}">${cname(c)}</a>${c.error ? ` <span class="cerr">${esc(c.error)}</span>` : ""}
              <form method="post" action="/competitors/channels/${c.id}" class="cinline"><select name="to" onchange="this.form.submit()">${groupOpts(g.id)}</select>
                <label class="cchk"><input type="checkbox" name="mine" value="1"${c.mine ? " checked" : ""} onchange="this.form.submit()"> Mine</label><input type="hidden" name="was" value="1"></form>
              <form method="post" action="/competitors/channels/${c.id}/delete" onsubmit="return confirm('Stop tracking it?')"><button class="linkbtn">Remove</button></form></li>`)
            .join("")}</ul>` : `<p class="empty">None.</p>`}`;
        })
        .join("")}</section>
    <section class="panel"><h2>Settings</h2>
      <form method="post" action="/competitors/settings" class="caddf">
        <label>Outlier at<input type="number" name="outlier" min="1.2" max="10" step="0.1" value="${s.outlier}"></label>
        <label>Major outlier (alerts) at<input type="number" name="major" min="1.5" max="50" step="0.5" value="${s.major}"></label>
        <label>Coverage stale after (months)<input type="number" name="staleMonths" min="1" max="60" value="${s.staleMonths}"></label>
        <label>YouTube quota units a day<input type="number" name="quota" min="100" max="10000" step="100" value="${s.quota}"></label>
        <label>Claude calls a day<input type="number" name="aiCalls" min="0" max="500" value="${s.aiCalls}"></label>
        <button class="clear">Save</button>
      </form>
      <p class="hint">${d.status.key ? "A YouTube key is set (Settings → Connections &amp; API keys; several keys share the quota)." : `<b>No YouTube key</b> — add one in <a href="/settings#key-youtube">Settings → Connections &amp; API keys</a>: channels are read from their free feeds (latest 15 videos only).`} ${d.status.ai ? "Claude reads concepts and writes the daily read." : "No Claude key (Settings → Connections &amp; API keys): concepts are read by rules only, and there's no AI read."}</p></section>`,
  );
}

export function renderEmpty(shell: Shell): string {
  return layout(
    "Competitors",
    shell,
    `${pageHeader("Competitors")}<style>${CSS}</style>
    <section class="panel"><h2>Start with a niche</h2><p>Competitors are compared only within their niche — What If against What If, Rankings against Rankings. Make one, then add channels to it.</p>
    <form method="post" action="/competitors/groups" class="caddf"><label>Niche<input name="name" required maxlength="60" placeholder="e.g. What If"></label><button class="clear">Add niche</button></form></section>`,
  );
}

const CSS = `
.cniches { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
.cniches a { padding: 7px 13px; border-radius: 999px; background: var(--sunk); color: var(--ink2); font-size: 13px; font-weight: 700; }
.cniches a small { color: var(--ink3); font-weight: 600; margin-left: 4px; }
.cniches a.on { background: var(--yellow); color: #101012; } .cniches a.on small { color: #3A3A12; }
.cniches a.add { background: none; border: 1px dashed var(--line); color: var(--ink3); }
.cswitch, .cfilt { display: flex; gap: 8px 16px; flex-wrap: wrap; margin: 0 0 12px; }
.cswitch span { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.cswitch a, .cfilt a { padding: 5px 11px; border-radius: 8px; background: var(--card); color: var(--ink3); font-size: 12.5px; font-weight: 600; }
.cswitch a.on, .cfilt a.on { background: #2E2E36; color: #fff; }
.cfilt small { color: var(--ink3); margin-left: 3px; }
.ctiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0 0 6px; }
.ctiles div { background: var(--card); border-radius: var(--r); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ctiles b { font-family: var(--display); font-size: 26px; line-height: 1.1; }
.ctiles span { font-size: 12px; color: var(--ink3); }
.ctiles .hot b { color: #FF9C6B; }
.cfresh { font-size: 12.5px; color: var(--ink3); margin: 0 0 14px; }
.cerr { color: #FF9C94; }
.cflash { background: rgba(60,203,132,.12); color: #BFF3D6; border-radius: 12px; padding: 10px 14px; margin: 0 0 12px; font-size: 13.5px; }
.cflash.bad { background: rgba(229,83,75,.14); color: #FFC4BF; }
.cnote { background: #2A2819; color: #F3E9A8; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
.cinsights { display: flex; flex-direction: column; gap: 6px; margin: 0 0 14px; }
.cinsights a { display: flex; gap: 10px; align-items: center; background: var(--card); border-radius: 12px; padding: 9px 13px; color: var(--ink); font-size: 13.5px; font-weight: 600; }
.cinsights i { width: 9px; height: 9px; border-radius: 50%; flex: none; background: #FF9C6B; }
.cinsights i.k-gap { background: #3CCB84; } .cinsights i.k-spread { background: #B5BEF7; }
.panel h2 .cmore { float: right; font-size: 12.5px; font-weight: 700; color: #9FDDF4; }
.cgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
.cvid { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: var(--ink); }
.cvid:hover .ctitle { text-decoration: underline; }
.cthumb { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 10px; overflow: hidden; background: var(--sunk); }
.cthumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cmult { position: absolute; right: 6px; bottom: 6px; padding: 2px 7px; border-radius: 7px; background: rgba(16,16,18,.86); font-family: var(--display); font-size: 15px; color: #fff; }
.h-major .cmult, .cmult.h-major { background: #E2562F; } .h-out .cmult { background: #2F8F5E; }
dd.h-major, b.h-major { color: #FF9C6B; } dd.h-out, b.h-out { color: #7EE2B8; } dd.h-down, b.h-down { color: #FF9C94; }
.cshort { position: absolute; left: 6px; top: 6px; padding: 1px 6px; border-radius: 6px; background: rgba(16,16,18,.8); font-size: 10.5px; font-style: normal; font-weight: 700; color: #fff; }
.ctitle { font-weight: 700; font-size: 13.5px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cmeta { font-size: 12px; color: var(--ink3); }
.cmeta em, h2 em, .ctable em { font-style: normal; font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #101012; background: var(--yellow); border-radius: 5px; padding: 1px 5px; }
.cvid.mine .cthumb { outline: 2px solid var(--yellow); }
.cnums { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11.5px; color: var(--ink2); }
.cgaps { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.cgap { background: var(--sunk); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; border-left: 3px solid #4A4A55; min-width: 0; }
.cgap.never { border-left-color: #3CCB84; } .cgap.stale { border-left-color: #E8C547; } .cgap.recent, .cgap.planned { border-left-color: #6E6E7A; }
.cgap header { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cgap h3 { margin: 0; font-family: var(--display); font-size: 16px; color: var(--ink); width: 100%; }
.cgcov, .cgstrong { font-size: 11px; font-weight: 800; border-radius: 6px; padding: 2px 7px; background: #2E2E36; color: var(--ink2); }
.cgcov.never { background: rgba(60,203,132,.18); color: #9FF0C8; } .cgcov.stale { background: rgba(232,197,71,.18); color: #F3E39A; }
.cgcov.sat { background: rgba(229,83,75,.16); color: #FFB4A8; } .cgstrong { background: #E2562F; color: #fff; }
.cgsig { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0; }
.cgsig div { display: flex; flex-direction: column; } .cgsig dt { font-size: 10.5px; color: var(--ink3); text-transform: uppercase; letter-spacing: .05em; }
.cgsig dd { margin: 0; font-weight: 800; font-size: 14px; }
.cgwhy { margin: 0; font-size: 12.5px; color: var(--ink2); line-height: 1.5; } .cgwhy.big { font-size: 14px; }
.cgthumbs, .cmini { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.cgthumbs .ctitle, .cmini .ctitle { font-size: 11.5px; } .cgthumbs .cmult, .cmini .cmult { font-size: 12px; }
.cpat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.cpat li { background: var(--sunk); border-radius: 12px; padding: 10px 12px; } .cpat p { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; }
.cpat.em li { border: 1px dashed #4A4A55; background: transparent; }
.cemk { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #B5BEF7; margin-right: 4px; }
.cread ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; } .cread li { font-size: 14px; line-height: 1.5; }
.cread details summary { display: inline; cursor: pointer; font-size: 11.5px; color: #9FDDF4; }
.cfacts { list-style: none; padding: 0 !important; margin-top: 6px !important; } .cfacts li { font-size: 12.5px !important; color: var(--ink2); }
.cread { border: 1px solid #3A3550; }
.ccards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ccard { background: var(--sunk); border-radius: 14px; padding: 12px 14px; color: var(--ink); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ccard:hover { background: #26262C; }
.ccard header, .chead { display: flex; gap: 10px; align-items: center; } .ccard header div { min-width: 0; display: flex; flex-direction: column; }
.ccard header small { color: var(--ink3); font-size: 11.5px; }
.ccard dl, .cbig { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0; }
.cbig { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.ccard dt, .cbig dt { font-size: 10.5px; color: var(--ink3); text-transform: uppercase; letter-spacing: .05em; } .ccard dd, .cbig dd { margin: 0; font-weight: 800; font-size: 14px; }
.cbig dd { font-size: 18px; font-family: var(--display); } .cbig small { font-family: var(--body, inherit); font-size: 11px; color: var(--ink3); font-weight: 600; margin-left: 4px; }
.cbest { margin: 0; font-size: 12.5px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctop { margin: 0; display: flex; flex-wrap: wrap; gap: 4px; } .ctop span { font-size: 11.5px; background: #2E2E36; border-radius: 6px; padding: 2px 7px; color: var(--ink2); }
.ctop.big span { font-size: 13px; padding: 4px 9px; }
.cavatar { border-radius: 50%; flex: none; object-fit: cover; background: #2E2E36; }
.cavatar.none { display: inline-flex; align-items: center; justify-content: center; font-weight: 800; color: var(--ink2); }
.ctable { overflow-x: auto; } .ctable table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
.ctable th, .ctable td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.ctable thead th { font-size: 11px; color: var(--ink3); text-transform: uppercase; letter-spacing: .05em; }
.ctable tbody th a { display: inline-flex; gap: 6px; align-items: center; color: var(--ink); }
.ctable tr.mine { background: rgba(243,233,108,.06); } .ctable tr.niche { color: var(--ink3); font-style: italic; }
.ctable td.above { color: #7EE2B8; font-weight: 700; } .ctable td.below { color: #FF9C94; font-weight: 700; }
.chead h2 { margin: 0 0 4px; } .chead p { margin: 0 0 4px; font-size: 13px; color: var(--ink2); } .chead a { color: #9FDDF4; }
.ctrend { display: flex; align-items: flex-end; gap: 6px; height: 140px; } .ctrend div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; min-width: 0; }
.ctrend i { width: 100%; max-width: 34px; background: #4A5CD4; border-radius: 5px 5px 0 0; } .ctrend span { font-size: 10.5px; color: var(--ink3); }
.caddf { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-end; }
.caddf label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--ink3); }
.caddf input:not([type=checkbox]), .caddf select, .cmlist input, .cinline select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--sunk); color: var(--ink); font: inherit; font-size: 14px; }
.caddf input[name=url] { width: min(340px, 80vw); }
.cchk { flex-direction: row !important; align-items: center; gap: 6px !important; } .cor { font-size: 12px; color: var(--ink3); align-self: center; }
.cmlist { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cmlist li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; } .cmlist li a { color: var(--ink); font-weight: 700; }
.cmlist form, .cinline { display: inline-flex; gap: 6px; align-items: center; margin: 0; }
@media (max-width: 700px) {
  .ctiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cbig { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .cgaps, .ccards { grid-template-columns: minmax(0, 1fr); }
  .panel h2 .cmore { float: none; display: block; margin-top: 4px; }
}
`;
