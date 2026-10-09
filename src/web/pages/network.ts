/**
 * Network Overview: the whole network on one page — filters for divisions,
 * channels, format and dates at the top, and every section below reading
 * the same selection. Revenue is always marked as an estimate; a figure with
 * missing readings says so instead of showing a gap as zero.
 */
import { esc, safeHref, safeUrl } from "../html.js";
import { TIP_SCRIPT, layout, niceStep, pageHeader, type Shell } from "../page.js";
import { ORG_TZ, usDate } from "../../parse/derive.js";
import { METRICS, MIN_COVERAGE, type Change, type Metric, type Series, type Totals } from "../../network/compute.js";
import { PRESETS } from "../../network/period.js";
import { LEADER_SORTS, queryString, type NetQuery, type Overview } from "../../network/overview.js";
import { HEALTH_CHANGE, MOMENTUM_BAND, MOVER_CHANGE, QUIET_DAYS, type Efficiency } from "../../network/insights.js";
import type { Division, NetChannel } from "../../network/types.js";

// ── formatting ──────────────────────────────────────────────────────────────

/** 184203 → "184K", 1250000 → "1.25M"; small numbers in full. */
export function fmtNum(n: number | null, opts: { sign?: boolean } = {}): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const sign = opts.sign && n > 0 ? "+" : n < 0 ? "−" : "";
  const a = Math.abs(n);
  const body =
    a >= 1e9 ? `${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`
      : a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`
        : a >= 1e4 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
          : Math.round(a).toLocaleString("en-US");
  return `${sign}${body}`;
}

/** An estimated amount in its currency: "$5,240", "$52.4K", "$0.84". */
export function fmtMoneyIn(n: number | null, currency: string, opts: { exact?: boolean } = {}): string {
  if (n === null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const compact = !opts.exact && a >= 100_000;
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency, notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : a < 10 ? 2 : 0, minimumFractionDigits: a < 10 && !compact ? 2 : 0,
  }).format(a);
  return n < 0 ? `−${s}` : s;
}

const fmtPctPlain = (x: number) => `${Math.abs(x * 100) >= 100 ? Math.round(Math.abs(x * 100)) : Math.abs(x * 100).toFixed(1)}%`;

/** A change against the previous period: an arrow and the size, or why there isn't one. */
function changeBadge(c: Change | null, prevLabel: string | null, opts: { invert?: boolean } = {}): string {
  if (!c || !prevLabel) return "";
  if (c.change === null) return `<span class="nt-chg none" title="${esc(c.why ?? "")}">no comparison</span>`;
  const up = c.change > 0;
  const tone = Math.abs(c.change) < 0.005 ? "flat" : up !== Boolean(opts.invert) ? "up" : "down";
  return `<span class="nt-chg ${tone}" title="${esc(`${fmtNum(c.cur)} vs ${fmtNum(c.prev)} — ${prevLabel}, ${c.channels} channel${c.channels === 1 ? "" : "s"}`)}">${up ? "▲" : c.change < 0 ? "▼" : "■"} ${fmtPctPlain(c.change)}</span>`;
}

/** A small trend line, with gaps where there's no reading. */
function spark(values: Array<number | null>, colour: string): string {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v !== null) as Array<{ v: number; i: number }>;
  if (pts.length < 2) return "";
  const W = 120, H = 28;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => (values.length <= 1 ? 0 : (i / (values.length - 1)) * W);
  const y = (v: number) => (hi === lo ? H / 2 : H - 2 - ((v - lo) / (hi - lo)) * (H - 4));
  const runs: string[] = [];
  let run: string[] = [];
  values.forEach((v, i) => {
    if (v === null) { if (run.length > 1) runs.push(run.join(" ")); run = []; return; }
    run.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (run.length > 1) runs.push(run.join(" "));
  return `<svg class="nt-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${runs
    .map((r) => `<polyline points="${r}" fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`)
    .join("")}</svg>`;
}

const pill = (text: string, cls = "") => `<span class="nt-pill${cls ? ` ${cls}` : ""}">${esc(text)}</span>`;
const href = (q: NetQuery, change: Partial<NetQuery> = {}, anchor = "") => `/network${queryString(q, change)}${anchor}`;

// ── filters ────────────────────────────────────────────────────────────────

function filters(o: Overview): string {
  const q = o.q;
  const keep = (name: string, value: string | number | null | undefined, unless: string | number) =>
    value === null || value === undefined || value === unless ? "" : `<input type="hidden" name="${name}" value="${esc(String(value))}">`;
  const divChips = o.divisions
    .filter((d) => o.pool.some((c) => c.divisionId === d.id))
    .map((d) => {
      const on = q.divisions.includes(d.id);
      return `<label class="nt-chip${on ? " on" : ""}" style="--c:${esc(d.colour)}"><input type="checkbox" name="div" value="${esc(d.id)}"${on ? " checked" : ""}><i></i>${esc(d.name)}</label>`;
    })
    .join("");
  const channelGroups = o.divisions
    .map((d) => ({ d, list: o.pool.filter((c) => c.divisionId === d.id) }))
    .filter((g) => g.list.length)
    .map((g) => `<fieldset><legend>${esc(g.d.name)}</legend>${g.list
      .map((c) => `<label><input type="checkbox" name="ch" value="${esc(c.id)}"${q.channels.includes(c.id) ? " checked" : ""}><i style="background:${esc(c.colour)}"></i>${esc(c.name)}</label>`)
      .join("")}</fieldset>`)
    .join("");
  const fmtSeg = (["all", "long", "short"] as const)
    .map((f) => `<label class="nt-seg${q.fmt === f ? " on" : ""}"><input type="radio" name="fmt" value="${f}"${q.fmt === f ? " checked" : ""}>${f === "all" ? "All videos" : f === "long" ? "Long-form" : "Shorts"}</label>`)
    .join("");
  const presets = PRESETS.map((p) => `<option value="${p.id}"${q.preset === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("");
  const picked = q.channels.length ? `${q.channels.length} channel${q.channels.length === 1 ? "" : "s"} picked` : "Pick channels";
  return `<form class="panel nt-filters" method="get" action="/network" id="ntf">
    <div class="nt-frow">
      <div class="nt-chips" role="group" aria-label="Divisions">${divChips}</div>
      <details class="nt-chpick"${q.channels.length ? " open" : ""}><summary>${esc(picked)}</summary><div class="nt-chgrid">${channelGroups}</div>
        <p class="hint">Picking channels overrides the divisions. Each channel counts once, in its own division.</p></details>
      ${q.divisions.length || q.channels.length ? `<a class="clear secondary nt-reset" href="${esc(href(q, { divisions: [], channels: [] }))}">Whole network</a>` : ""}
    </div>
    <div class="nt-frow">
      <div class="nt-segs" role="radiogroup" aria-label="Format">${fmtSeg}</div>
      <label class="nt-range">Dates <select name="range" id="ntrange">${presets}</select></label>
      <span class="nt-custom"${q.preset === "custom" ? "" : " hidden"}>
        <input type="date" name="from" value="${esc(q.preset === "custom" ? o.period.from : "")}" aria-label="From">
        <input type="date" name="to" value="${esc(q.preset === "custom" ? o.period.to : "")}" aria-label="To">
      </span>
      <label class="nt-range">Compare <select name="cmp">
        <option value="lfl"${q.cmp === "lfl" ? " selected" : ""}>Like for like</option>
        <option value="current"${q.cmp === "current" ? " selected" : ""}>Current network</option></select></label>
      ${keep("metric", q.metric, "views")}${keep("split", q.split, "total")}${keep("contrib", q.contrib, "revenue")}${keep("dsort", q.dsort, "views")}
      ${keep("lsort", q.lsort, "views")}${keep("lmode", q.lmode, "abs")}${keep("vsort", q.vsort, "views")}${keep("scn", q.scenario, "")}
      <button class="clear">Apply</button>
    </div>
  </form>
  <script>
  (function () {
    var f = document.getElementById("ntf");
    var range = document.getElementById("ntrange"), custom = f.querySelector(".nt-custom");
    range.addEventListener("change", function () { custom.hidden = range.value !== "custom"; if (range.value !== "custom") f.submit(); });
    f.querySelectorAll('input[name="div"], input[name="fmt"], select[name="cmp"]').forEach(function (el) {
      el.addEventListener("change", function () { if (el.name === "div") f.querySelectorAll('input[name="ch"]').forEach(function (c) { c.checked = false; }); f.submit(); });
    });
  })();
  </script>`;
}

// ── status and tiles ────────────────────────────────────────────────────────

function statusLine(o: Overview, s: { lastRead: Date | null; stale: boolean; linked: number; unlinked: string[]; errors: Array<{ name: string; error: string }>; key: boolean }): string {
  const t = o.totals;
  const notes: string[] = [];
  notes.push(s.lastRead ? `Last updated ${esc(timeEt(s.lastRead))}${s.stale ? ` ${pill("stale", "warn")}` : ""}` : `${pill("no readings yet", "warn")} Daily figures start from the first hourly read with a YouTube key.`);
  if (!s.key && !o.analytics.connected) notes.push(`${pill("needs a key", "warn")} Views, subscribers and revenue need the YouTube key (<a href="/settings#keys">Settings → Connections</a>).`);
  if (o.period.partial) notes.push(`${pill("partial")} ${esc(o.period.label)} runs to today, which isn't over.`);
  const a = o.analytics;
  notes.push(a.connected
    ? `${pill(`${a.connected} of ${o.selected.length} from YouTube Analytics`, "ok")}${a.through ? ` YouTube's figures run to ${esc(usDate(a.through))}; later days come from the public counts.` : " Their history is loading."}${a.connected < o.selected.length ? ` <a href="/settings/network#analytics">Connect the rest</a>.` : ""}`
    : `Public counts only: <a href="/settings/network#analytics">connect YouTube Analytics</a> for real daily views and revenue, years back.`);
  if (o.startedAt) notes.push(`Views and subscribers count from the first reading, ${esc(timeEt(o.startedAt))}. YouTube's public figures don't go back further.`);
  if (t.days > 0 && t.viewDays < t.days) notes.push(`Daily view history for ${t.viewDays} of ${t.days} day${t.days === 1 ? "" : "s"}${t.gappy ? ` (${t.gappy} channel${t.gappy === 1 ? "" : "s"} missing some)` : ""}.`);
  if (s.unlinked.length) notes.push(`${s.unlinked.length} channel${s.unlinked.length === 1 ? "" : "s"} not linked to YouTube: <a href="/settings/network#channels">link them</a>.`);
  if (s.errors.length) notes.push(`<span title="${esc(s.errors.map((e) => `${e.name}: ${e.error}`).join("\n"))}">${s.errors.length} channel${s.errors.length === 1 ? "" : "s"} failed the last read; their last good figures are shown.</span>`);
  return `<p class="nt-status">${notes.join(" · ")}</p>`;
}

/** "10/8/2026, 3:07 PM ET": the studio's time zone. */
const timeEt = (d: Date) => `${new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} ET`;

function tiles(o: Overview): string {
  const t = o.totals;
  const prevLabel = o.period.prev?.label ?? null;
  const why = o.period.noPrevWhy;
  const notFormat = o.q.fmt !== "all";
  const confidence = (t: Totals) => {
    if (t.revenue === null) return "";
    const yt = t.revenue > 0 ? t.revYouTube / t.revenue : 0;
    if (yt >= 0.999) return pill("from YouTube Analytics", "ok");
    const share = t.revenue > 0 ? t.revBlended / t.revenue : 0;
    const rpm = share > 0.5 ? pill("mostly blended RPM", "warn") : share > 0 ? pill(`${Math.round(share * 100)}% at blended RPM`) : pill("format RPMs");
    return yt > 0 ? `${pill(`${Math.round(yt * 100)}% from YouTube Analytics`, "ok")} · rest at ${rpm}` : rpm;
  };
  const tile = (o2: { label: string; value: string; change: string; sub: string; spark?: string; tone?: string }) =>
    `<div class="nt-tile${o2.tone ? ` ${o2.tone}` : ""}"><div class="nt-tl">${o2.label}</div><div class="nt-tv">${o2.value}</div>
      <div class="nt-tc">${o2.change}${o2.spark ?? ""}</div><div class="nt-ts">${o2.sub}</div></div>`;
  const avgPerDay = t.revenue !== null && t.viewDays ? t.revenue / t.viewDays : null;
  return `<section class="nt-tiles" aria-label="Key figures">
    ${tile({
      label: `Total views${notFormat ? ` · ${o.q.fmt === "long" ? "long-form" : "Shorts"}` : ""}`, value: esc(fmtNum(t.views)),
      change: changeBadge(o.changes.views, prevLabel), spark: spark(o.sparks.views, "#E8C547"),
      sub: esc(prevLabel ? `vs ${prevLabel}` : why ?? ""),
    })}
    ${tile({
      label: `Est. revenue ${pill("ESTIMATED", "est")}`, value: esc(fmtMoneyIn(t.revenue, o.currency)),
      change: changeBadge(o.changes.revenue, prevLabel), spark: spark(o.sparks.revenue, "#56C990"),
      sub: `${avgPerDay !== null ? `${esc(fmtMoneyIn(avgPerDay, o.currency))} a day · ` : ""}${confidence(t)}${t.needRpm.length ? ` · <a href="/settings/network#rpm">${t.needRpm.length} without an RPM</a>` : ""}${t.pendingRevenue.length ? ` · last days not in from YouTube yet` : ""}`,
    })}
    ${tile({
      label: "Net subscribers", value: esc(fmtNum(t.subs, { sign: true })),
      change: changeBadge(o.changes.subs, prevLabel), spark: spark(o.sparks.subs, "#7D8AF5"),
      sub: `${notFormat ? "Channel-level, not format-specific · " : ""}${o.analytics.connected === o.selected.length && o.selected.length ? "gained less lost, from YouTube Analytics" : "approximate where from public counts: YouTube rounds them"}`,
    })}
    ${tile({
      label: "Uploads", value: esc(fmtNum(t.uploads.total)),
      change: changeBadge(o.changes.uploads, prevLabel), spark: spark(o.sparks.uploads, "#EE9A55"),
      sub: esc(`${fmtNum(t.uploads.long)} long-form · ${fmtNum(t.uploads.short)} Shorts${t.uploads.unknown ? ` · ${fmtNum(t.uploads.unknown)} unknown` : ""}`),
    })}
    ${tile({ label: "Active channels", value: `${t.activeChannels}<small> of ${t.channels}</small>`, change: "", sub: "uploaded in the period, of the channels selected" })}
    ${tile({
      label: `Network RPM ${pill("ESTIMATED", "est")}`, value: esc(t.rpm === null ? "—" : fmtMoneyIn(t.rpm, o.currency, { exact: true })),
      change: "", sub: "estimated revenue ÷ the views it was worked out from × 1,000",
    })}
  </section>`;
}

// ── the main chart ──────────────────────────────────────────────────────────

/** Days grouped into weeks when there are too many to draw one bar each. */
function bucket(days: string[], series: Series[]): { labels: string[]; series: Series[] } {
  if (days.length <= 120) return { labels: days, series };
  const size = 7;
  const labels: string[] = [];
  for (let i = 0; i < days.length; i += size) labels.push(days[i]!);
  return {
    labels,
    series: series.map((s) => ({
      ...s,
      values: labels.map((_, b) => {
        const xs = s.values.slice(b * size, b * size + size).filter((v): v is number => v !== null);
        return xs.length ? xs.reduce((a, c) => a + c, 0) : null;
      }),
    })),
  };
}

function valueText(metric: Metric, v: number | null, currency: string): string {
  if (v === null) return "no reading";
  return metric === "revenue" ? fmtMoneyIn(v, currency) : fmtNum(v, { sign: metric === "subs" });
}

export function mainChart(o: Overview): string {
  const { labels, series } = bucket(o.chart.days, o.chart.series);
  const weekly = labels.length !== o.chart.days.length;
  const metric = o.q.metric;
  const W = 760, H = 260, L = 54, R = 10, T = 10, B = 26;
  const n = labels.length;
  // Stacked: positives up from zero, negatives down.
  const pos = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const neg = labels.map((_, i) => series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0));
  const hasData = series.some((s) => s.values.some((v) => v !== null));
  if (!hasData) {
    return `<div class="empty">${metric === "uploads" ? "No uploads in this period." : "No readings for this period yet. Daily figures start from the first hourly read with a YouTube key, and build from there."}</div>`;
  }
  const hi = Math.max(0, ...pos), lo = Math.min(0, ...neg);
  const step = niceStep((hi - lo) / 4 || 1);
  const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
  const y = (v: number) => T + ((top - v) / (top - bot)) * (H - T - B);
  const bw = (W - L - R) / n;
  const bar = Math.max(1.5, Math.min(18, bw * 0.7));
  const ticks: number[] = [];
  for (let v = bot; v <= top + step / 2; v += step) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v === 0 ? "zero" : "grid"}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" class="ax" text-anchor="end">${esc(metric === "revenue" ? fmtMoneyIn(v, o.currency) : fmtNum(v))}</text>`).join("");
  const labelEvery = Math.max(1, Math.ceil(n / 8));
  const cols = labels.map((day, i) => {
    const cx = L + bw * i + bw / 2;
    let up = 0, down = 0;
    const segs = series.map((s) => {
      const v = s.values[i];
      if (v === null || v === undefined || v === 0) return "";
      const from = v > 0 ? up : down;
      const to = from + v;
      if (v > 0) up = to; else down = to;
      const y0 = y(Math.max(from, to)), h = Math.max(1, Math.abs(y(from) - y(to)) - (series.length > 1 ? 1 : 0));
      return `<rect x="${(cx - bar / 2).toFixed(1)}" y="${y0.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="${series.length > 1 ? 1 : 3}" fill="${esc(s.colour)}"/>`;
    }).join("");
    const missing = series.every((s) => s.values[i] === null);
    const tipLines = series.map((s) => `${s.label}: ${valueText(metric, s.values[i] ?? null, o.currency)}`);
    const total = series.length > 1 ? `Total: ${valueText(metric, series.some((s) => s.values[i] !== null) ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : null, o.currency)}` : "";
    const tip = [`${weekly ? "Week of " : ""}${usDate(day)}${missing ? " · no reading" : ""}`, ...(total ? [total] : []), ...tipLines].join("|");
    const lab = i % labelEvery === 0 ? `<text x="${cx.toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(usDate(day).replace(/\/\d{4}$/, ""))}</text>` : "";
    const gap = missing && metric !== "uploads" ? `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(0) - 6}" y2="${y(0)}" class="nt-gap"/>` : "";
    return `<g>${segs}${gap}${lab}<rect class="hit" x="${(L + bw * i).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" data-tip="${esc(tip)}"/></g>`;
  }).join("");
  const legend = series.length > 1
    ? `<div class="flegend nt-legend">${series.map((s) => `<span style="--c:${esc(s.colour)}"><i></i>${esc(s.label)}</span>`).join("")}</div>`
    : "";
  return `<figure class="fchart nt-chart">${legend}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${METRICS.find((m) => m.id === metric)?.label ?? ""}, ${weekly ? "by week" : "by day"}`)}" preserveAspectRatio="none">${grid}${cols}</svg>
    ${weekly ? `<figcaption class="hint">Grouped by week: the range is too long for a bar a day.</figcaption>` : ""}
  </figure>`;
}

function chartPanel(o: Overview): string {
  const q = o.q;
  const tabs = METRICS.map((m) => `<a class="nt-tab${q.metric === m.id ? " on" : ""}" href="${esc(href(q, { metric: m.id }, "#chart"))}">${esc(m.label)}</a>`).join("");
  const splits = ([["total", "Combined"], ["division", "By division"], ["channel", "By channel"]] as const)
    .map(([id, label]) => `<a class="nt-tab sm${q.split === id ? " on" : ""}" href="${esc(href(q, { split: id }, "#chart"))}">${label}</a>`).join("");
  const note = q.metric === "subs" && q.fmt !== "all" ? `<p class="hint">Subscribers are counted per channel, not per format.</p>` : q.metric === "revenue" ? `<p class="hint">Estimated: YouTube Analytics' own estimate for connected channels; otherwise views × each channel's RPM for the format, in force that day.</p>` : "";
  return `<section class="panel nt-panel" id="chart"><div class="nt-head"><h2>Performance over time</h2><div class="nt-tabs">${tabs}</div><div class="nt-tabs">${splits}</div></div>
    ${mainChart(o)}${note}</section>`;
}

// ── divisions ───────────────────────────────────────────────────────────────

function divisionPanel(o: Overview): string {
  const q = o.q;
  if (!o.divisionRows.length) return "";
  const sortKey = (r: Overview["divisionRows"][number]) =>
    q.dsort === "name" ? 0 : q.dsort === "views" ? r.totals.views ?? -Infinity : q.dsort === "revenue" ? r.totals.revenue ?? -Infinity : q.dsort === "subs" ? r.totals.subs ?? -Infinity : r.totals.uploads.total;
  const rows = [...o.divisionRows].sort((a, b) => (q.dsort === "name" ? a.division.position - b.division.position : sortKey(b) - sortKey(a)));
  const th = (id: NetQuery["dsort"], label: string, cls = "") => `<th class="${cls}"><a href="${esc(href(q, { dsort: id }, "#divisions"))}"${q.dsort === id ? ' aria-sort="descending"' : ""}>${label}${q.dsort === id ? " ↓" : ""}</a></th>`;
  const body = rows.map((r) => `<tr>
      <td class="l"><a class="nt-name" href="${esc(href(q, { divisions: [r.division.id], channels: [] }))}"><i style="background:${esc(r.division.colour)}"></i>${esc(r.division.name)}</a></td>
      <td>${esc(fmtNum(r.totals.views))} ${changeBadge(r.viewsChange, o.period.prev?.label ?? null)}</td>
      <td>${esc(fmtMoneyIn(r.totals.revenue, o.currency))}</td>
      <td>${esc(fmtNum(r.totals.subs, { sign: true }))}</td>
      <td>${esc(fmtNum(r.totals.uploads.total))}</td>
      <td>${esc(r.totals.rpm === null ? "—" : fmtMoneyIn(r.totals.rpm, o.currency, { exact: true }))}</td></tr>`).join("");
  const contribTabs = ([["revenue", "Revenue"], ["views", "Views"], ["subs", "Subscribers"], ["uploads", "Uploads"]] as const)
    .map(([id, label]) => `<a class="nt-tab sm${q.contrib === id ? " on" : ""}" href="${esc(href(q, { contrib: id }, "#divisions"))}">${label}</a>`).join("");
  const value = (t: Totals) => (q.contrib === "revenue" ? t.revenue : q.contrib === "views" ? t.views : q.contrib === "subs" ? t.subs : t.uploads.total);
  const contrib = o.divisionRows.map((r) => ({ d: r.division, v: value(r.totals) })).filter((x): x is { d: Division; v: number } => x.v !== null && x.v !== 0);
  return `<section class="panel nt-panel" id="divisions"><div class="nt-head"><h2>Divisions</h2><span class="sub">Click one to see only it. Each channel counts once, in its own division.</span></div>
    <div class="nt-scroll"><table class="nt-table"><thead><tr>${th("name", "Division", "l")}${th("views", "Views")}${th("revenue", "Est. revenue")}${th("subs", "Net subs")}${th("uploads", "Uploads")}<th>Est. RPM</th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="nt-head" style="margin-top:18px"><h3>Share of the network</h3><div class="nt-tabs">${contribTabs}</div></div>
    ${contribution(contrib, q.contrib, o.currency)}
  </section>`;
}

/** Each division's share: one 100% bar for positive totals; for subscribers (which can be negative), a diverging bar per division. */
export function contribution(rows: Array<{ d: Division; v: number }>, kind: NetQuery["contrib"], currency: string): string {
  if (!rows.length) return `<div class="empty">Nothing to compare for this period yet.</div>`;
  const fmt = (v: number) => (kind === "revenue" ? fmtMoneyIn(v, currency) : fmtNum(v, { sign: kind === "subs" }));
  if (kind === "subs" || rows.some((r) => r.v < 0)) {
    const max = Math.max(...rows.map((r) => Math.abs(r.v)));
    return `<div class="nt-diverge">${rows.map((r) => {
      const w = ((Math.abs(r.v) / max) * 50).toFixed(1);
      return `<div class="nt-drow"><span class="nt-dl"><i style="background:${esc(r.d.colour)}"></i>${esc(r.d.name)}</span>
        <span class="nt-dtrack"><i class="${r.v < 0 ? "neg" : "pos"}" style="width:${w}%;background:${esc(r.d.colour)}"></i></span><span class="nt-dv">${esc(fmt(r.v))}</span></div>`;
    }).join("")}<p class="hint">Gains to the right of the middle line, losses to the left.</p></div>`;
  }
  const total = rows.reduce((a, r) => a + r.v, 0);
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  return `<div class="nt-stack" role="img" aria-label="Share by division">${sorted.map((r) => `<i style="flex:${r.v};background:${esc(r.d.colour)}" data-tip="${esc(`${r.d.name}|${fmt(r.v)} · ${fmtPctPlain(r.v / total)}`)}"></i>`).join("")}</div>
    <ul class="nt-shares">${sorted.map((r) => `<li><i style="background:${esc(r.d.colour)}"></i>${esc(r.d.name)} <b>${esc(fmtPctPlain(r.v / total))}</b> <span>${esc(fmt(r.v))}</span></li>`).join("")}</ul>`;
}

// ── leaderboard ─────────────────────────────────────────────────────────────

function avatar(c: NetChannel): string {
  const url = safeUrl(c.avatarUrl);
  return url ? `<img class="nt-av" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="nt-av" style="background:${esc(c.colour)}"></span>`;
}

function leaderboard(o: Overview): string {
  const q = o.q;
  if (!o.leaders.length) return "";
  const sorts = LEADER_SORTS.map((s) => `<option value="${s.id}"${q.lsort === s.id ? " selected" : ""}>${esc(s.label)}</option>`).join("");
  const modeTabs = `<a class="nt-tab sm${q.lmode === "abs" ? " on" : ""}" href="${esc(href(q, { lmode: "abs" }, "#leaders"))}">Absolute</a><a class="nt-tab sm${q.lmode === "rel" ? " on" : ""}" href="${esc(href(q, { lmode: "rel" }, "#leaders"))}">Relative to size</a>`;
  const rel = q.lmode === "rel";
  const rows = o.leaders.map((r, i) => {
    const f = r.f;
    const c = f.channel;
    const viewsCell = rel ? `${esc(fmtNum(r.viewsPerKSub))}<small> per 1K subs</small>` : esc(fmtNum(f.views));
    const subsCell = rel && f.subs !== null && f.subsNow ? `${esc(fmtPctPlain(f.subs / f.subsNow))}${f.subs < 0 ? " down" : ""}` : esc(fmtNum(f.subs, { sign: true }));
    const growth = r.growth === null ? `<span class="nt-chg none">—</span>` : `<span class="nt-chg ${r.growth >= 0 ? "up" : "down"}">${r.growth >= 0 ? "▲" : "▼"} ${esc(fmtPctPlain(r.growth))}</span>`;
    const partial = f.days && f.viewDays < f.days * MIN_COVERAGE && f.viewDays > 0 ? ` <span class="nt-pill" title="Readings for ${f.viewDays} of ${f.days} days">partial</span>` : "";
    return `<tr>
      <td class="l nt-rank">${i + 1}</td>
      <td class="l"><span class="nt-ch">${avatar(c)}<span><a href="${esc(href(q, { channels: [c.id], divisions: [] }))}">${esc(c.name)}</a><small>${esc(r.divisionName)} · <a href="/uploads/channel/${esc(c.id)}">uploads</a></small></span></span></td>
      <td>${viewsCell}${partial}</td>
      <td>${esc(fmtMoneyIn(f.revenue, o.currency))}${f.noRpm ? ` <a class="nt-pill warn" href="/settings/network#rpm-${esc(c.id)}">set RPM</a>` : ""}</td>
      <td>${subsCell}</td>
      <td>${esc(fmtNum(f.uploads.total))}</td>
      <td>${growth}</td>
      <td>${esc(fmtNum(r.perUpload))}</td>
      <td>${esc(r.rpm === null ? "—" : fmtMoneyIn(r.rpm, o.currency, { exact: true }))}</td>
      <td>${r.momentum === null ? "—" : `<span class="nt-chg ${r.momentum >= 0 ? "up" : "down"}">${r.momentum >= 0 ? "▲" : "▼"} ${esc(fmtPctPlain(r.momentum))}</span>`}</td>
      <td>${r.outlierRate === null ? "—" : esc(fmtPctPlain(r.outlierRate))}</td>
    </tr>`;
  }).join("");
  return `<section class="panel nt-panel" id="leaders"><div class="nt-head"><h2>Channel leaderboard</h2>
      <form method="get" action="/network#leaders" class="nt-inline">${hiddenQuery(q, ["lsort"])}<label>Rank by <select name="lsort" onchange="this.form.submit()">${sorts}</select></label><noscript><button class="clear sm">Go</button></noscript></form>
      <div class="nt-tabs">${modeTabs}</div></div>
    <div class="nt-scroll"><table class="nt-table nt-leaders"><thead><tr><th class="l">#</th><th class="l">Channel</th><th>${rel ? "Views / 1K subs" : "Views"}</th><th>Est. revenue</th><th>${rel ? "Subs growth" : "Net subs"}</th><th>Uploads</th>
      <th title="Views against the previous period, like for like">Change</th><th title="Median views at 7 days of the period's uploads">Per upload</th><th>Est. RPM</th><th title="Last 7 days against the 7 before">Momentum</th><th title="Share of the period's uploads at 2× their channel's usual or more">Outliers</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="hint">Relative to size divides by each channel's subscribers, so a small channel doing well isn't buried under a big one. Per upload is each new video's first week, so the back catalogue's views aren't credited to new uploads.</p>
  </section>`;
}

/** The current query as hidden inputs, all but the ones a form sets itself. */
function hiddenQuery(q: NetQuery, except: string[]): string {
  const p = new URLSearchParams(queryString(q).slice(1));
  return [...p].filter(([k]) => !except.includes(k)).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("");
}

// ── gainers, momentum, health ───────────────────────────────────────────────

function movers(o: Overview): string {
  const m = o.movers;
  const card = (list: Overview["movers"]["gainers"], title: string, cls: string, empty: string) => `<div class="nt-movers ${cls}"><h3>${title}</h3>${
    list.length
      ? `<ol>${list.slice(0, 6).map((x) => `<li><a href="${esc(href(o.q, { channels: [x.channel.id], divisions: [] }))}">${esc(x.channel.name)}</a> <span class="nt-chg ${x.change >= 0 ? "up" : "down"}">${x.change >= 0 ? "▲" : "▼"} ${esc(fmtPctPlain(x.change))}</span><p>${esc(x.reason)}</p></li>`).join("")}</ol>`
      : `<p class="hint">${empty}</p>`
  }</div>`;
  return `<section class="panel nt-panel" id="movers"><div class="nt-head"><h2>Top gainers and needs attention</h2>
      <span class="sub">${esc(m.range.label)} against ${esc(m.prevLabel)}${m.widened ? " (a period this short can't say)" : ""}. A channel shows here with readings for most of both periods, ${Math.round(MOVER_CHANGE * 100)}% change or more, and at least 1,000 views before.</span></div>
    <div class="nt-two">${card(m.gainers, "Top gainers", "gain", "No channel grew by that much.")}${card(m.attention, "Needs attention", "drop", "No channel fell by that much.")}</div>
  </section>`;
}

function momentumPanel(o: Overview): string {
  const m = o.momentum;
  const line = (label: string, c: Change, money = false) =>
    `<div class="nt-mrow"><span>${label}</span><b>${c.change === null ? `<span class="nt-chg none" title="${esc(c.why ?? "")}">not enough history</span>` : `<span class="nt-chg ${c.change >= 0 ? "up" : "down"}">${c.change >= 0 ? "▲" : "▼"} ${esc(fmtPctPlain(c.change))}</span>`}</b>
      <small>${c.cur !== null ? esc(`${money ? fmtMoneyIn(c.cur, o.currency) : fmtNum(c.cur)} vs ${money ? fmtMoneyIn(c.prev, o.currency) : fmtNum(c.prev)}`) : ""}</small></div>`;
  const trend = m.trend
    ? `<div class="nt-trend ${m.trend}"><b>${m.trend === "accelerating" ? "Accelerating" : m.trend === "declining" ? "Declining" : "Stable"}</b><span>Views over the last 7 days against the 7 before: ${Math.round(MOMENTUM_BAND * 100)}% or more up is accelerating, ${Math.round(MOMENTUM_BAND * 100)}% or more down is declining, anything between is stable.</span></div>`
    : `<div class="nt-trend"><b>Not enough history yet</b><span>Momentum needs readings for most of the last two weeks.</span></div>`;
  return `<section class="panel nt-panel" id="momentum"><div class="nt-head"><h2>Network momentum</h2><span class="sub">Fixed windows ending yesterday, like for like, whatever the dates above.</span></div>
    ${trend}
    <div class="nt-mgrid">${line("Views, last 7 days", m.views7)}${line("Views, last 30 days", m.views30)}${line(`Est. revenue, last 30 days`, m.revenue30, true)}${line("Net subscribers, last 30 days", m.subs30)}${line("Uploads, last 30 days", m.uploads30)}
      <div class="nt-mrow"><span>Average a day (30 days)</span><b>${esc(fmtNum(m.avgDailyViews))} views</b><small>${esc(fmtMoneyIn(m.avgDailyRevenue, o.currency))} est.</small></div></div>
    ${m.explain ? `<p class="nt-explain">${esc(m.explain)}</p>` : `<p class="hint">Once uploads have a week of views behind them, this says how much of a change came from uploading more or less, and how much from how each video did.</p>`}
  </section>`;
}

function healthPanel(o: Overview, alerts: Array<{ text: string; href: string | null; at: Date }>): string {
  const h = o.health;
  const count = (n: number, label: string, names: string[], rule: string) =>
    `<div class="nt-hcount"><b>${n}</b><span>${esc(label)}</span><small>${esc(rule)}</small>${names.length ? `<em>${esc(names.slice(0, 6).join(", "))}${names.length > 6 ? ` and ${names.length - 6} more` : ""}</em>` : ""}</div>`;
  return `<section class="panel nt-panel" id="health"><div class="nt-head"><h2>Network health</h2><span class="sub">Counts, not a score: each says what it counts.</span></div>
    <div class="nt-hgrid">
      ${count(h.growing.length, "channels growing", h.growing, `views up ${Math.round(HEALTH_CHANGE * 100)}%+ vs ${o.movers.prevLabel}`)}
      ${count(h.declining.length, "channels declining", h.declining, `views down ${Math.round(HEALTH_CHANGE * 100)}%+ vs ${o.movers.prevLabel}`)}
      ${count(h.behind.length, "behind their usual cadence", h.behind.map((b) => `${b.channel} (${b.daysSince} days; usually ${b.usualGap})`), "last upload more than twice the usual gap ago")}
      ${count(h.quiet.length, "with no recent uploads", h.quiet, `nothing in ${QUIET_DAYS} days`)}
      ${count(h.outliersThisWeek, "outliers this week", [], "uploads at 2× their channel's usual or more")}
      <div class="nt-hcount"><b>${h.leadingDivision ? esc(h.leadingDivision.name) : "—"}</b><span>leading growth</span><small>${h.leadingDivision ? esc(`+${fmtNum(h.leadingDivision.gained)} views, like for like`) : "no division grew"}</small></div>
    </div>
    ${alerts.length ? `<h3 style="margin-top:16px">Recent alerts</h3><ul class="nt-alerts">${alerts.slice(0, 8).map((a) => `<li>${a.href && safeHref(a.href) ? `<a href="${esc(safeHref(a.href))}">${esc(a.text)}</a>` : esc(a.text)} <small>${esc(timeEt(a.at))}</small></li>`).join("")}</ul>` : ""}
  </section>`;
}

// ── top videos ─────────────────────────────────────────────────────────────

function topVideos(o: Overview): string {
  const q = o.q;
  const tabs = ([["views", "Views"], ["perday", "Views a day"], ["multiple", "Outlier score"], ["date", "Newest"]] as const)
    .map(([id, label]) => `<a class="nt-tab sm${q.vsort === id ? " on" : ""}" href="${esc(href(q, { vsort: id }, "#videos"))}">${label}</a>`).join("");
  const rows = o.top.map((t) => {
    const v = t.video;
    const thumb = /^[\w-]{11}$/.test(v.videoId) ? `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg` : "";
    const url = safeUrl(v.url);
    return `<tr>
      <td class="l"><a class="nt-vid" href="${esc(url)}" target="_blank" rel="noreferrer">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span>${esc(v.title)}<small>${v.format === "short" ? "Short" : v.format === "long" ? "Long-form" : "Format unknown"}</small></span></a></td>
      <td class="l">${esc(t.channel?.name ?? v.channel)}</td>
      <td>${esc(usDate(v.publishedAt.toISOString().slice(0, 10)))}</td>
      <td title="Lifetime views">${esc(fmtNum(v.views))}</td>
      <td title="Lifetime views ÷ days since upload">${esc(fmtNum(t.score?.perDay ?? null))}</td>
      <td title="${esc(t.score?.basis ? `Against the channel's usual, ${t.score.basis}` : "Not enough history to score")}">${t.score?.multiple != null ? `${t.score.outlier ? "<b>" : ""}${esc(t.score.multiple.toFixed(1))}×${t.score.outlier ? "</b>" : ""}` : "—"}</td>
    </tr>`;
  }).join("");
  return `<section class="panel nt-panel" id="videos"><div class="nt-head"><h2>Top videos</h2><span class="sub">Uploaded in the period. Outlier scores come from the same engines as Uploads.</span><div class="nt-tabs">${tabs}</div></div>
    ${rows ? `<div class="nt-scroll"><table class="nt-table"><thead><tr><th class="l">Video</th><th class="l">Channel</th><th>Uploaded</th><th>Views</th><th>Views a day</th><th>Outlier</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No uploads in this period.</div>`}
  </section>`;
}

// ── uploads ────────────────────────────────────────────────────────────────

const HEAT = ["#222227", "#1E3A2D", "#22553C", "#2A734F", "#3A9A6B", "#56C990"];

function effLine(label: string, cur: string, prev: string | null, note: string): string {
  return `<div class="nt-mrow"><span>${esc(label)}</span><b>${esc(cur)}</b><small>${prev !== null ? `${esc(prev)} before · ` : ""}${esc(note)}</small></div>`;
}

function uploadsPanel(o: Overview): string {
  const u = o.uploads;
  const e: Efficiency = u.efficiency;
  const p = u.prevEfficiency;
  const max = Math.max(1, ...u.byDay.map((d) => d.n));
  const step = (n: number) => (n === 0 ? 0 : Math.min(HEAT.length - 1, 1 + Math.floor(((n - 1) / max) * (HEAT.length - 1))));
  // A calendar: one square per day, weeks as columns, Sunday on top.
  const firstDow = new Date(`${u.byDay[0]?.day ?? o.today}T12:00:00Z`).getUTCDay();
  const cells = [...Array.from({ length: firstDow }, () => `<i class="pad"></i>`), ...u.byDay.slice(-371).map((d) => `<i style="background:${HEAT[step(d.n)]}" data-tip="${esc(`${usDate(d.day)}|${d.n} upload${d.n === 1 ? "" : "s"}`)}"></i>`)].join("");
  const perDivision = u.byDivision.map((x) => `<li><i style="background:${esc(x.division.colour)}"></i>${esc(x.division.name)} <b>${x.n}</b></li>`).join("");
  const perChannel = u.byChannel.slice(0, 40).map((x) => `<tr><td class="l">${esc(x.channel.name)}</td><td>${x.n}</td><td>${esc(x.perWeek.toFixed(1))}</td></tr>`).join("");
  const prevNote = u.prevTotal !== null ? `${u.prevTotal} in ${o.period.prev?.label ?? "the period before"}` : "";
  return `<section class="panel nt-panel" id="uploads"><div class="nt-head"><h2>Uploads</h2><span class="sub">${esc(prevNote)}</span></div>
    <div class="nt-ugrid">
      <div class="nt-hcount"><b>${u.total}</b><span>uploads</span><small>${esc(`${u.long} long-form · ${u.short} Shorts${u.unknown ? ` · ${u.unknown} unknown` : ""}`)}</small></div>
      <div class="nt-hcount"><b>${esc(u.perDay.toFixed(1))}</b><span>a day</span><small>over ${o.period.days} day${o.period.days === 1 ? "" : "s"}</small></div>
      ${perDivision ? `<ul class="nt-shares">${perDivision}</ul>` : ""}
    </div>
    <div class="nt-heat" role="img" aria-label="Uploads per day">${cells}</div>
    <h3 style="margin-top:16px">How new uploads are doing</h3>
    <div class="nt-mgrid">
      ${effLine("Views per upload", e.medianFirstWeek === null ? "—" : fmtNum(e.medianFirstWeek), p && p.medianFirstWeek !== null ? fmtNum(p.medianFirstWeek) : null, `median at 7 days · ${e.measured} of ${e.uploads} measured`)}
      ${effLine("Est. revenue per upload", e.revenuePerUpload === null ? "—" : fmtMoneyIn(e.revenuePerUpload, o.currency), p && p.revenuePerUpload !== null ? fmtMoneyIn(p.revenuePerUpload, o.currency) : null, "first week, at each channel's RPM or YouTube's (estimated)")}
      ${effLine("Median recent video", e.medianRecent === null ? "—" : fmtNum(e.medianRecent), null, "lifetime views, each channel's last 10 a week old or more")}
      ${effLine("Beat their channel's usual", e.beatRate === null ? "—" : fmtPctPlain(e.beatRate), p && p.beatRate !== null ? fmtPctPlain(p.beatRate) : null, `${e.scored} scored`)}
    </div>
    <p class="hint">Measured on each upload's own first week, so a channel's older videos don't count as this period's.</p>
    ${perChannel ? `<details class="nt-more"><summary>Per channel</summary><div class="nt-scroll"><table class="nt-table"><thead><tr><th class="l">Channel</th><th>Uploads</th><th>A week</th></tr></thead><tbody>${perChannel}</tbody></table></div></details>` : ""}
  </section>`;
}

// ── milestones and scenarios ───────────────────────────────────────────────

function milestonesPanel(o: Overview): string {
  if (!o.milestones.length) return "";
  return `<section class="panel nt-panel nt-quiet" id="milestones"><div class="nt-head"><h2>Next milestones</h2></div><div class="nt-mile">${o.milestones.map((m) => {
    const f = (v: number) => (m.money ? fmtMoneyIn(v, o.currency) : fmtNum(v));
    const share = Math.min(1, m.current / m.target);
    return `<div><span>${esc(f(m.target))} ${esc(m.label)}</span><span class="nt-bar"><i style="width:${(share * 100).toFixed(1)}%"></i></span><small>${esc(`${f(m.current)} now · ${f(m.target - m.current)} to go`)}</small></div>`;
  }).join("")}</div></section>`;
}

function scenarioPanel(o: Overview): string {
  const s = o.scenario;
  return `<section class="panel nt-panel nt-quiet" id="scenario"><div class="nt-head"><h2>Revenue scenario</h2><span class="sub">A planning tool, not a forecast. Nothing here changes your saved RPMs.</span></div>
    <form method="get" action="/network#scenario" class="nt-inline">${hiddenQuery(o.q, ["scn"])}
      <span>Network RPM now <b>${esc(s.rpm === null ? "—" : fmtMoneyIn(s.rpm, o.currency, { exact: true }))}</b></span>
      <label>Try an RPM of <input type="number" name="scn" min="0.01" max="100" step="0.01" value="${s.at ?? ""}" inputmode="decimal"></label><button class="clear sm">Work it out</button></form>
    ${s.at !== null && s.scenarioRevenue !== null ? `<p class="nt-explain">At the same views, ${esc(fmtMoneyIn(s.revenue, o.currency))} would be <b>${esc(fmtMoneyIn(s.scenarioRevenue, o.currency))}</b> at ${esc(fmtMoneyIn(s.at, o.currency, { exact: true }))} RPM (estimated). <a href="/settings/network#rpm">Change the saved RPMs</a> if you mean to.</p>` : ""}
  </section>`;
}

// ── the page ───────────────────────────────────────────────────────────────

export interface NetworkPageExtra {
  lastRead: Date | null;
  stale: boolean;
  linked: number;
  unlinked: string[];
  errors: Array<{ name: string; error: string }>;
  key: boolean;
  alerts: Array<{ text: string; href: string | null; at: Date }>;
}

export function renderNetwork(shell: Shell, o: Overview, x: NetworkPageExtra): string {
  const exportLink = (kind: string, label: string) => `<a href="/network/export.csv${esc(queryString(o.q) ? `${queryString(o.q)}&kind=${kind}` : `?kind=${kind}`)}">${label}</a>`;
  const exports = `<details class="nt-export"><summary>Export CSV</summary><div>${exportLink("channels", "Channel performance")}${exportLink("divisions", "Division performance")}${exportLink("daily", "Daily network figures")}${exportLink("revenue", "Estimated revenue by channel and day")}${exportLink("uploads", "Upload activity")}</div></details>`;
  const selection = o.q.channels.length
    ? `${o.selected.length} channel${o.selected.length === 1 ? "" : "s"}`
    : o.q.divisions.length
      ? o.divisions.filter((d) => o.q.divisions.includes(d.id)).map((d) => d.name).join(" + ")
      : "Whole network";
  const fmtLabel = o.q.fmt === "all" ? "" : o.q.fmt === "long" ? " · Long-form" : " · Shorts";
  const periodLabel = o.period.preset === "custom" ? `${usDate(o.period.from)} – ${usDate(o.period.to)}` : o.period.label;
  return layout(
    "Network Overview",
    shell,
    `${pageHeader("Network Overview", exports)}
    ${filters(o)}
    <h2 class="nt-scope">${esc(selection)}${esc(fmtLabel)} · ${esc(periodLabel)}${o.period.prev ? `<small>vs ${esc(o.period.prev.label)}${o.q.cmp === "lfl" ? ", like for like" : ", current network"}</small>` : ""}</h2>
    ${statusLine(o, x)}
    ${o.selected.length ? `${tiles(o)}${chartPanel(o)}${divisionPanel(o)}${leaderboard(o)}${movers(o)}
    <div class="nt-two">${momentumPanel(o)}${healthPanel(o, x.alerts)}</div>
    ${topVideos(o)}${uploadsPanel(o)}
    <div class="nt-two">${milestonesPanel(o)}${scenarioPanel(o)}</div>
    <p class="hint nt-method">All revenue here is <b>estimated</b>. For a channel connected to YouTube Analytics it's YouTube's own estimate, as YouTube Studio shows it; otherwise views ÷ 1,000 × the RPM you set for each channel and format, as it stood each day. Neither is what YouTube paid. Connected channels' views and subscribers are YouTube Analytics' figures; the rest come from YouTube's public counts, read hourly, and a day with no reading is left out, never counted as zero.</p>`
      : `<div class="panel"><div class="empty">No channels in this selection. <a href="/network">Show the whole network</a> or <a href="/settings/network#channels">check which channels are switched on</a>.</div></div>`}
    ${TIP_SCRIPT}`,
  );
}
