/**
 * Finance's analysis pages — Overview, Channels, a channel, Reports. Each is
 * a view of the same facts (see finance/metrics.ts); none keeps its own data.
 */
import { CHANNELS } from "../../catalog.js";
import type { Category, Company, Lists, Stream } from "../../db/finance.js";
import {
  COST_GROUPS, EXPENSE_TYPE, breakEven, derived, pnl, project, rolling, series, sustainability,
  type Facts, type Flag, type PnL, type Projection, type Thresholds,
} from "../../finance/metrics.js";
import { addMonths, fmtMoney, fmtPct, monthLabel, monthsEnding } from "../../finance/money.js";
import { channelColour, esc, fmtMin, type Shell } from "../page.js";
import { barList, financePage, flagCard, groupAlerts, flagPill, money, monthSwitch, pct, tile, trendChart } from "./ui.js";

const catOf = (lists: Lists, id: string) => lists.categories.find((c) => c.id === id) ?? ({ id, label: id === "other" ? "Other" : id, colour: "#6E6E7A" } as Category);
const streamOf = (lists: Lists, id: string) => lists.streams.find((s) => s.id === id) ?? ({ id, label: id, colour: "#94949E" } as Stream);
const companyName = (lists: Lists, id: number | null) => (id === null ? "No company" : lists.companies.find((c: Company) => c.id === id)?.name ?? "Unknown");

/** Channels with anything in these months — revenue, costs, uploads, views, or time. */
export function activeChannels(f: Facts, months: string[]): string[] {
  const set = new Set(months);
  const names = new Set<string>();
  for (const i of f.income) if (i.channel && set.has(i.month)) names.add(i.channel);
  for (const e of f.expenses) if (e.channel && set.has(e.month)) names.add(e.channel);
  for (const c of f.channels) if (set.has(c.month) && (c.uploads || c.views || c.ownerMinutes)) names.add(c.channel);
  const order = CHANNELS.map((c) => c.name);
  return [...names].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
}

/** Every channel's flags for a month — the ones worth an alert, most serious first. */
export function channelAlerts(f: Facts, month: string, t: Thresholds, only?: string[]): Array<{ channel: string; flag: Flag }> {
  const rank: Record<string, number> = { persistent_loss: 0, loss: 1, low_time: 2, declining: 3, low_margin: 4 };
  const out: Array<{ channel: string; flag: Flag }> = [];
  for (const channel of activeChannels(f, [month])) {
    for (const flag of sustainability(f, month, channel, t)) {
      if (flag.id === "healthy" || flag.id === "no_data") continue;
      if (only && !only.includes(flag.id)) continue;
      out.push({ channel, flag });
    }
  }
  return out.sort((a, b) => (rank[a.flag.id] ?? 9) - (rank[b.flag.id] ?? 9));
}

function projectionCard(p: Projection, title = "Next month projection"): string {
  const range = (r: [number, number], sign = false) => `${esc(fmtMoney(r[0], { compact: true, sign }))}–${esc(fmtMoney(r[1], { compact: true, sign }))}`;
  return `<section class="panel"><h2>${esc(title)} <span class="sub">— ${esc(monthLabel(p.month))}</span></h2>
    ${
      p.thin && !p.revenue[1]
        ? `<div class="empty">${esc(p.basis[0] ?? "Not enough history yet.")}</div>`
        : `<dl class="fkv">
            <div><dt>Revenue</dt><dd>${range(p.revenue)}</dd></div>
            <div><dt>Expected expenses</dt><dd>~${esc(fmtMoney(p.expenses, { compact: true }))}</dd></div>
            <div class="tot"><dt>Expected profit</dt><dd>${range(p.profit, true)}</dd></div>
          </dl>
          <p class="fnote">Based on:</p><ul class="fbasis">${p.basis.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
          ${p.thin ? `<p class="fnote">Only one month of history — treat this as a rough guide.</p>` : ""}`
    }
  </section>`;
}

/** The three kinds of cost, kept apart so a one-off never looks like a new monthly cost. */
function costGroups(p: PnL, runRate: number): string {
  return `<div class="fgrid3">${COST_GROUPS.map((g) => {
    const v = p.byGroup[g.id];
    const sub =
      g.id === "recurring"
        ? `Running now: ${fmtMoney(runRate)} a month`
        : g.id === "production"
          ? "contractor work and production"
          : "not part of monthly running costs";
    return `<div class="ftile"><div class="fv">${money(v)}</div><div class="fl">${esc(g.label)}</div><div class="fs">${esc(sub)}</div></div>`;
  }).join("")}</div>`;
}

export interface OverviewData {
  month: string;
  facts: Facts;
  lists: Lists;
  thresholds: Thresholds;
  runRate: number;
  empty: boolean;
}

export function renderFinanceOverview(shell: Shell, d: OverviewData): string {
  const { facts: f, month, lists } = d;
  const p = pnl(f, [month], { all: true });
  const prev = pnl(f, [addMonths(month, -1)], { all: true });
  const change = (a: number, b: number) => (b ? `${a >= b ? "▲" : "▼"} ${fmtPct(Math.abs((a - b) / b), 0)} vs ${monthLabel(addMonths(month, -1), "short")}` : "");
  const href = (m: string) => `/finance?m=${m}`;

  if (d.empty) {
    return financePage(shell, "overview", "Finance", `<section class="panel"><h2>Start here</h2>
      <p class="labsub">Finance works out where money comes from, where it goes, and whether each channel pays for itself — including your own time on it, from My Day's estimates.</p>
      <ol class="fbasis" style="font-size:14px;line-height:1.7">
        <li><a href="/finance/settings">Settings</a>: add your company (LLC) and assign channels to it.</li>
        <li><a href="/finance/income/entry">Enter a month of revenue</a> — every channel's AdSense on one screen.</li>
        <li><a href="/finance/expenses/new">Add expenses</a>, <a href="/finance/subscriptions">subscriptions</a>, and your <a href="/finance/contractors">contractors</a> with how each is paid.</li>
      </ol></section>`);
  }

  const tiles = `<div class="ftiles">
    ${tile(money(p.revenue), "Total revenue", esc(change(p.revenue, prev.revenue)))}
    ${tile(money(p.expenses), "Total expenses", esc(change(p.expenses, prev.expenses)))}
    ${tile(money(p.profit, { sign: true }), "Net profit", `margin ${esc(fmtPct(p.margin))}`, "hero")}
    ${tile(esc(fmtPct(p.margin)), "Profit margin", `cash out ${esc(fmtMoney(p.cashOut))}${p.unpaid ? ` · <b>${esc(fmtMoney(p.unpaid))}</b> unpaid` : ""}`)}
  </div>`;

  const alerts = channelAlerts(f, month, d.thresholds);
  const alertPanel = alerts.length
    ? `<section class="panel"><h2>Needs a look <span class="sub">— against the thresholds in <a href="/finance/settings#thresholds">Settings</a>; informational only</span></h2>
        <div class="falerts">${groupAlerts(alerts).map((a) => flagCard(a.channel, a.flags[0]!, `/finance/channels/${encodeURIComponent(a.channel)}?m=${month}`, a.flags.slice(1))).join("")}</div></section>`
    : "";

  const months = trimLeading(f, monthsEnding(month, 12), { all: true });
  const trend = series(f, months, { all: true }).map((x, i) => ({ month: months[i]!, revenue: x.revenue, expenses: x.expenses, profit: x.profit }));

  // By channel: revenue, direct costs, profit, margin, where it stands.
  const chans = activeChannels(f, [month]);
  const general = pnl(f, [month], { general: true });
  const rows = chans
    .map((c) => ({ c, p: pnl(f, [month], { channel: c }) }))
    .filter((r) => r.p.revenue || r.p.expenses)
    .sort((a, b) => b.p.revenue - a.p.revenue || b.p.expenses - a.p.expenses);
  const chanTable = rows.length
    ? `<div class="fscroll"><table class="ftable"><thead><tr><th>Channel</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Margin</th><th class="l">Status</th></tr></thead><tbody>
      ${rows
        .map(({ c, p: cp }) => {
          const flags = sustainability(f, month, c, d.thresholds);
          return `<tr><td><a class="fchn" style="--ch:${channelColour(c)}" href="/finance/channels/${encodeURIComponent(c)}?m=${month}"><i></i>${esc(c)}</a></td>
            <td>${money(cp.revenue)}</td><td>${money(cp.expenses)}</td><td>${money(cp.profit, { sign: true })}</td><td>${pct(cp.margin)}</td>
            <td class="l">${flags.map((x) => flagPill(x)).join(" ")}</td></tr>`;
        })
        .join("")}
      ${general.revenue || general.expenses ? `<tr><td><span class="fchn" style="--ch:#6E6E7A"><i></i>General / network-wide</span></td><td>${money(general.revenue)}</td><td>${money(general.expenses)}</td><td>${money(general.profit, { sign: true })}</td><td></td><td class="l"><span class="fnote" style="margin:0">shared costs</span></td></tr>` : ""}
      </tbody><tfoot><tr><td>Network</td><td>${money(p.revenue)}</td><td>${money(p.expenses)}</td><td>${money(p.profit, { sign: true })}</td><td>${pct(p.margin)}</td><td></td></tr></tfoot></table></div>`
    : `<div class="empty">No channel has revenue or costs in ${esc(monthLabel(month))}.</div>`;

  const byStream = barList([...p.byStream].map(([id, v]) => ({ label: streamOf(lists, id).label, value: v, colour: streamOf(lists, id).colour, href: `/finance/income?m=${month}&stream=${id}` })), { empty: "No revenue this month." });
  const byCategory = barList([...p.byCategory].map(([id, v]) => ({ label: catOf(lists, id).label, value: v, colour: catOf(lists, id).colour, href: `/finance/expenses?m=${month}&category=${id}` })), { empty: "No expenses this month." });

  // By company: revenue and costs per LLC.
  const companies = new Map<number | null, { rev: number; exp: number }>();
  for (const i of f.income) if (i.month === month) { const c = companies.get(i.company) ?? { rev: 0, exp: 0 }; c.rev += i.cents; companies.set(i.company, c); }
  for (const e of f.expenses) if (e.month === month && !e.advance) { const c = companies.get(e.company) ?? { rev: 0, exp: 0 }; c.exp += e.cents; companies.set(e.company, c); }
  const companyTable = companies.size
    ? `<table class="ftable"><thead><tr><th>Company</th><th>Revenue</th><th>Expenses</th><th>Profit</th></tr></thead><tbody>${[...companies]
        .sort((a, b) => b[1].rev - a[1].rev)
        .map(([id, v]) => `<tr><td>${esc(companyName(lists, id))}</td><td>${money(v.rev)}</td><td>${money(v.exp)}</td><td>${money(v.rev - v.exp, { sign: true })}</td></tr>`)
        .join("")}</tbody></table>`
    : `<div class="empty">Nothing this month.</div>`;

  const body = `
    <div class="fheadrow">${monthSwitch(month, href)}<span class="sp"></span>
      <a class="clear secondary" href="/finance/income/entry?m=${month}">Enter month's revenue</a><a class="clear" href="/finance/expenses/new">+ Expense</a></div>
    ${tiles}
    ${alertPanel}
    <section class="panel"><h2>Last 12 months <span class="fh-r"><a href="/finance/reports?to=${month}">As a table →</a></span></h2>${trendChart(trend)}</section>
    <section class="panel"><h2>By channel <span class="sub">— channel revenue less its direct costs; shared costs sit under General</span></h2>${chanTable}</section>
    ${costGroups(p, d.runRate)}
    <div class="fgrid2">
      <section class="panel"><h2>Revenue by stream</h2>${byStream}</section>
      <section class="panel"><h2>Expenses by category</h2>${byCategory}</section>
    </div>
    <div class="fgrid2">
      <section class="panel"><h2>By company</h2>${companyTable}</section>
      ${projectionCard(project(f, month, { all: true }))}
    </div>`;
  return financePage(shell, "overview", "Finance", body);
}

// ── channels ───────────────────────────────────────────────────────────────

export interface ChannelsData {
  month: string;
  window: number;
  facts: Facts;
  thresholds: Thresholds;
  showAll: boolean;
}

export function renderFinanceChannels(shell: Shell, d: ChannelsData): string {
  const { facts: f, month } = d;
  const months = monthsEnding(month, d.window);
  const names = d.showAll ? CHANNELS.map((c) => c.name) : activeChannels(f, months);
  const rows = names
    .map((c) => {
      const p = pnl(f, months, { channel: c });
      return { c, p, x: derived(p), flags: sustainability(f, month, c, d.thresholds) };
    })
    // Channels with money in or out; the rest only when asked for, after them.
    .filter((r) => d.showAll || r.p.revenue || r.p.expenses)
    .sort((a, b) => Number(Boolean(b.p.revenue || b.p.expenses)) - Number(Boolean(a.p.revenue || a.p.expenses)) || b.p.profit - a.p.profit);
  const winHref = (n: number) => `/finance/channels?m=${month}&w=${n}${d.showAll ? "&all=1" : ""}`;
  const table = rows.length
    ? `<div class="fscroll"><table class="ftable"><thead><tr>
        <th>Channel</th><th>Revenue</th><th>Expenses</th><th>Profit</th><th>Margin</th><th>Views</th><th>AdSense RPM</th><th>Uploads</th>
        <th>Rev / upload</th><th>Cost / upload</th><th>Profit / upload</th><th>Your hours</th><th>Profit / hour</th><th class="l">Status</th></tr></thead><tbody>
      ${rows
        .map(({ c, p, x, flags }) => `<tr>
          <td><a class="fchn" style="--ch:${channelColour(c)}" href="/finance/channels/${encodeURIComponent(c)}?m=${month}"><i></i>${esc(c)}</a></td>
          <td>${money(p.revenue)}</td><td>${money(p.expenses)}</td><td>${money(p.profit, { sign: true })}</td><td>${pct(p.margin)}</td>
          <td>${p.views === null ? "—" : `${esc(compactNum(p.views))}${p.viewsEstimated ? "<small title=\"estimated from the board's view snapshots\">*</small>" : ""}`}</td>
          <td>${x.rpm === null ? "—" : esc(`$${(x.rpm / 100).toFixed(2)}`)}</td><td>${p.uploads || "—"}</td>
          <td>${x.revenuePerUpload === null ? "—" : money(Math.round(x.revenuePerUpload))}</td><td>${x.costPerUpload === null ? "—" : money(Math.round(x.costPerUpload))}</td>
          <td>${x.profitPerUpload === null ? "—" : money(Math.round(x.profitPerUpload), { sign: true })}</td>
          <td>${x.ownerHours ? esc(x.ownerHours.toFixed(1)) : "—"}</td><td>${x.profitPerHour === null ? "—" : money(Math.round(x.profitPerHour), { sign: true })}</td>
          <td class="l">${flags.map((fl) => flagPill(fl)).join(" ")}</td></tr>`)
        .join("")}</tbody></table></div>
      <p class="fnote">RPM is AdSense (platform) revenue ÷ views × 1,000 — sponsorships count toward profit, never RPM. * views estimated from the board's own view snapshots where none were entered. Your hours come from the work you finished on each channel: time you tracked, else its estimate from <a href="/settings#estimates">Time estimates</a>. Status is for ${esc(monthLabel(month))}.</p>`
    : `<div class="empty">No channel has anything in these months. <a href="/finance/channels?m=${month}&w=${d.window}&all=1">Show every channel</a>.</div>`;
  const body = `<div class="fheadrow">${monthSwitch(month, (m) => `/finance/channels?m=${m}&w=${d.window}`)}
      <div class="fwin">${[1, 3, 6, 12].map((n) => `<a href="${winHref(n)}"${n === d.window ? ' class="on"' : ""}>${n === 1 ? "1 month" : `${n} months`}</a>`).join("")}</div>
      <span class="sp"></span><a class="linkbtn" href="/finance/channels?m=${month}&w=${d.window}${d.showAll ? "" : "&all=1"}">${d.showAll ? "Only channels with data" : "Show every channel"}</a></div>
    <section class="panel"><h2>Channel sustainability <span class="sub">— ${d.window === 1 ? esc(monthLabel(month)) : `${esc(monthLabel(months[0]!, "short"))}–${esc(monthLabel(month))}`}, most profitable first</span></h2>${table}</section>`;
  return financePage(shell, "channels", "Channels", body);
}

/** Months from the first with any money in or out — at least three — so a new ledger isn't mostly empty chart. */
function trimLeading(f: Facts, months: string[], scope: Parameters<typeof pnl>[2]): string[] {
  const first = months.findIndex((m) => { const p = pnl(f, [m], scope); return p.revenue || p.expenses; });
  return first === -1 ? months : months.slice(Math.min(first, months.length - 3));
}

const compactNum = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : String(n));

export interface ChannelData {
  channel: string;
  month: string;
  facts: Facts;
  lists: Lists;
  thresholds: Thresholds;
  companyId: number | null;
}

export function renderFinanceChannel(shell: Shell, d: ChannelData): string {
  const { facts: f, month, channel, lists } = d;
  const p = pnl(f, [month], { channel });
  const x = derived(p);
  const flags = sustainability(f, month, channel, d.thresholds);
  const href = (m: string) => `/finance/channels/${encodeURIComponent(channel)}?m=${m}`;

  const revLines = [...p.byStream].sort((a, b) => b[1] - a[1]).map(([id, v]) => `<div><dt>${esc(streamOf(lists, id).label)}</dt><dd>${esc(fmtMoney(v))}</dd></div>`).join("");
  const expLines = [...p.byCategory].sort((a, b) => b[1] - a[1]).map(([id, v]) => `<div><dt>${esc(catOf(lists, id).label)}</dt><dd>${esc(fmtMoney(v))}</dd></div>`).join("");
  const statement = `<section class="panel"><h2>${esc(channel)} — ${esc(monthLabel(month))}</h2>
    <div class="fgrid2" style="margin:0">
      <dl class="fkv">${revLines || `<div><dt>No revenue entered</dt><dd>—</dd></div>`}<div class="tot"><dt>Total revenue</dt><dd>${esc(fmtMoney(p.revenue))}</dd></div></dl>
      <dl class="fkv">${expLines || `<div><dt>No direct expenses</dt><dd>—</dd></div>`}<div class="tot"><dt>Total expenses</dt><dd>${esc(fmtMoney(p.expenses))}</dd></div></dl>
    </div>
    <dl class="fkv" style="margin-top:12px"><div class="tot"><dt>Net profit</dt><dd>${money(p.profit, { sign: true })}</dd></div><div><dt>Profit margin</dt><dd>${esc(fmtPct(p.margin))}</dd></div></dl>
    <p class="fnote">Direct costs only — anything split across channels counts its share here; network-wide costs stay under General.</p>
  </section>`;

  const perf = `<section class="panel"><h2>Performance &amp; your time</h2><dl class="fkv">
    <div><dt>Uploads</dt><dd>${p.uploads}</dd></div>
    <div><dt>Views</dt><dd>${p.views === null ? "—" : `${esc(p.views.toLocaleString("en-US"))}${p.viewsEstimated ? " (est.)" : ""}`}</dd></div>
    <div><dt>Channel revenue</dt><dd>${esc(fmtMoney(p.revenue))}</dd></div>
    <div><dt>Expenses</dt><dd>${esc(fmtMoney(p.expenses))}</dd></div>
    <div><dt>Profit</dt><dd>${money(p.profit, { sign: true })}</dd></div>
    <div><dt>Average revenue per upload</dt><dd>${x.revenuePerUpload === null ? "—" : esc(fmtMoney(Math.round(x.revenuePerUpload)))}</dd></div>
    <div><dt>Cost per upload</dt><dd>${x.costPerUpload === null ? "—" : esc(fmtMoney(Math.round(x.costPerUpload)))}</dd></div>
    <div><dt>AdSense RPM</dt><dd>${x.rpm === null ? "—" : esc(`$${(x.rpm / 100).toFixed(2)}`)}</dd></div>
    <div><dt>Your time</dt><dd>${x.ownerHours ? esc(`${x.ownerHours.toFixed(1)} h (${fmtMin(p.ownerMinutes)})`) : "—"}</dd></div>
    <div class="tot"><dt>Profit per owner hour</dt><dd>${x.profitPerHour === null ? "—" : money(Math.round(x.profitPerHour), { sign: true })}</dd></div>
  </dl><p class="fnote">No per-video revenue is claimed: these are the channel's month, divided. RPM uses AdSense only.${p.views === null ? ` <a href="/finance/income/entry?m=${month}">Enter views</a> for an RPM.` : ""}</p></section>`;

  const roll = rolling(f, month, { channel });
  const rollTable = `<section class="panel"><h2>Rolling <span class="sub">— one bad month, or a trend? Monthly averages</span></h2><div class="fscroll"><table class="ftable">
    <thead><tr><th></th>${roll.map((r) => `<th>${r.n === 1 ? "1 month" : `${r.n} months`}</th>`).join("")}</tr></thead><tbody>
    <tr><td>Revenue / month</td>${roll.map((r) => `<td>${money(Math.round(r.avgRevenue))}</td>`).join("")}</tr>
    <tr><td>Expenses / month</td>${roll.map((r) => `<td>${money(Math.round(r.avgExpenses))}</td>`).join("")}</tr>
    <tr><td>Profit / month</td>${roll.map((r) => `<td>${money(Math.round(r.avgProfit), { sign: true })}</td>`).join("")}</tr>
    <tr><td>Margin</td>${roll.map((r) => `<td>${pct(r.pnl.margin)}</td>`).join("")}</tr>
    <tr><td>Views / month</td>${roll.map((r) => `<td>${r.pnl.views === null ? "—" : esc(compactNum(Math.round(r.pnl.views / r.n)))}</td>`).join("")}</tr>
    <tr><td>AdSense RPM</td>${roll.map((r) => `<td>${r.d.rpm === null ? "—" : esc(`$${(r.d.rpm / 100).toFixed(2)}`)}</td>`).join("")}</tr>
    <tr><td>Profit / upload</td>${roll.map((r) => `<td>${r.d.profitPerUpload === null ? "—" : money(Math.round(r.d.profitPerUpload), { sign: true })}</td>`).join("")}</tr>
    <tr><td>Profit / owner hour</td>${roll.map((r) => `<td>${r.d.profitPerHour === null ? "—" : money(Math.round(r.d.profitPerHour), { sign: true })}</td>`).join("")}</tr>
    </tbody></table></div></section>`;

  const be = breakEven(f, month, channel);
  const beCard = `<section class="panel"><h2>Break-even <span class="sub">— from the last 3 months</span></h2>${
    be
      ? `<dl class="fkv">
          <div><dt>Monthly expenses</dt><dd>${esc(fmtMoney(Math.round(be.monthlyExpenses)))}</dd></div>
          ${be.otherRevenue ? `<div><dt>Covered by sponsorships &amp; other revenue</dt><dd>−${esc(fmtMoney(Math.round(be.otherRevenue)))}</dd></div>` : ""}
          <div><dt>Left for AdSense to cover</dt><dd>${esc(fmtMoney(Math.round(be.remaining)))}</dd></div>
          <div><dt>Effective AdSense RPM</dt><dd>${esc(`$${(be.rpm / 100).toFixed(2)}`)}</dd></div>
          <div class="tot"><dt>AdSense views needed a month</dt><dd>${esc(compactNum(be.viewsNeeded))}</dd></div>
          <div><dt>Current pace</dt><dd>${esc(compactNum(be.currentViews))} ${be.covered ? "✓ covering it" : "▼ short"}</dd></div>
        </dl>`
      : `<div class="empty">Needs AdSense revenue and views for an RPM.</div>`
  }</section>`;

  const months = trimLeading(f, monthsEnding(month, 12), { channel });
  const trend = series(f, months, { channel }).map((s, i) => ({ month: months[i]!, revenue: s.revenue, expenses: s.expenses, profit: s.profit }));
  const companySel = `<form method="post" action="/finance/channels/${encodeURIComponent(channel)}/company" class="ffilters" style="margin:0">
    <select name="company" onchange="this.form.submit()" aria-label="Company">${`<option value="">No company</option>`}${lists.companies.filter((c) => !c.archived).map((c) => `<option value="${c.id}"${c.id === d.companyId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
    <noscript><button class="clear secondary">Set</button></noscript></form>`;

  const body = `<div class="fheadrow">${monthSwitch(month, href)}<span style="display:flex;gap:6px;flex-wrap:wrap">${flags.map((fl) => flagPill(fl)).join("")}</span><span class="sp"></span>${companySel}
      <a class="clear secondary" href="/finance/expenses?channel=${encodeURIComponent(channel)}&m=${month}">Expenses</a><a class="clear secondary" href="/finance/income?channel=${encodeURIComponent(channel)}&m=${month}">Income</a></div>
    ${flags.some((fl) => fl.id !== "healthy" && fl.id !== "no_data") ? `<div class="falerts" style="margin-bottom:14px">${flags.filter((fl) => fl.id !== "healthy" && fl.id !== "no_data").map((fl) => flagCard(channel, fl, "#")).join("")}</div>` : ""}
    <div class="fgrid2">${statement}${perf}</div>
    <section class="panel"><h2>Last 12 months</h2>${trendChart(trend, { label: `${channel}: revenue, expenses and profit by month` })}</section>
    ${rollTable}
    <div class="fgrid2">${beCard}${projectionCard(project(f, month, { channel }))}</div>`;
  return financePage(shell, "channels", channel.replace(/^Specular (?=.)/, ""), body);
}

// ── reports ────────────────────────────────────────────────────────────────

export interface ReportsData {
  to: string;
  n: number;
  facts: Facts;
  lists: Lists;
}

export function renderFinanceReports(shell: Shell, d: ReportsData): string {
  const { facts: f, lists } = d;
  const months = trimLeading(f, monthsEnding(d.to, d.n), { all: true });
  const per = series(f, months, { all: true });
  const tot = pnl(f, months, { all: true });
  const th = months.map((m) => `<th>${esc(monthLabel(m, "shortYear"))}</th>`).join("");
  const pnlTable = `<div class="fscroll"><table class="ftable"><thead><tr><th></th>${th}<th>Total</th></tr></thead><tbody>
    <tr><td>Revenue</td>${per.map((p) => `<td>${money(p.revenue, { compact: true })}</td>`).join("")}<td>${money(tot.revenue, { compact: true })}</td></tr>
    ${COST_GROUPS.map((g) => `<tr><td>&nbsp;&nbsp;${esc(g.label)}</td>${per.map((p) => `<td>${money(p.byGroup[g.id], { compact: true, muted: true })}</td>`).join("")}<td>${money(tot.byGroup[g.id], { compact: true, muted: true })}</td></tr>`).join("")}
    <tr><td>Expenses</td>${per.map((p) => `<td>${money(p.expenses, { compact: true })}</td>`).join("")}<td>${money(tot.expenses, { compact: true })}</td></tr>
    <tr><td><b>Net profit</b></td>${per.map((p) => `<td>${money(p.profit, { compact: true, sign: true })}</td>`).join("")}<td>${money(tot.profit, { compact: true, sign: true })}</td></tr>
    <tr><td>Margin</td>${per.map((p) => `<td>${pct(p.margin)}</td>`).join("")}<td>${pct(tot.margin)}</td></tr>
    <tr><td>Cash out</td>${per.map((p) => `<td>${money(p.cashOut, { compact: true, muted: true })}</td>`).join("")}<td>${money(tot.cashOut, { compact: true, muted: true })}</td></tr>
    </tbody></table></div>`;

  const matrix = (title: string, keys: Array<{ key: string; label: string; colour: string }>, cell: (p: PnL, key: string) => number, sign = false, csv = "") => {
    const rows = keys
      .map((k) => ({ k, vals: months.map((m) => cell(pnl(f, [m], k.key === "__general" ? { general: true } : k.key.startsWith("ch:") ? { channel: k.key.slice(3) } : { all: true }), k.key)) }))
      .filter((r) => r.vals.some((v) => v !== 0));
    if (!rows.length) return `<section class="panel"><h2>${esc(title)}</h2><div class="empty">Nothing in these months.</div></section>`;
    return `<section class="panel"><h2>${esc(title)}${csv ? ` <span class="fh-r"><a href="${csv}">CSV</a></span>` : ""}</h2><div class="fscroll"><table class="ftable"><thead><tr><th></th>${th}<th>Total</th></tr></thead><tbody>
      ${rows
        .map((r) => `<tr><td><span class="fchn" style="--ch:${r.k.colour}"><i></i>${esc(r.k.label)}</span></td>${r.vals.map((v) => `<td>${money(v, { compact: true, sign })}</td>`).join("")}<td>${money(r.vals.reduce((a, b) => a + b, 0), { compact: true, sign })}</td></tr>`)
        .join("")}</tbody></table></div></section>`;
  };
  const chanKeys = [...CHANNELS.map((c) => ({ key: `ch:${c.name}`, label: c.name, colour: c.color })), { key: "__general", label: "General / network-wide", colour: "#6E6E7A" }];
  const catKeys = lists.categories.map((c) => ({ key: c.id, label: c.label, colour: c.colour }));
  const streamKeys = lists.streams.map((s) => ({ key: s.id, label: s.label, colour: s.colour }));
  const qs = `to=${d.to}&n=${d.n}`;

  const body = `<div class="fheadrow">${monthSwitch(d.to, (m) => `/finance/reports?to=${m}&n=${d.n}`)}
      <div class="fwin">${[3, 6, 12, 24].map((n) => `<a href="/finance/reports?to=${d.to}&n=${n}"${n === d.n ? ' class="on"' : ""}>${n} months</a>`).join("")}</div>
      <span class="sp"></span><a class="clear secondary" href="/finance/reports.csv?kind=pnl&${qs}">P&amp;L CSV</a><a class="clear secondary" href="/finance/reports.csv?kind=expenses&${qs}">Expenses CSV</a><a class="clear secondary" href="/finance/reports.csv?kind=income&${qs}">Income CSV</a></div>
    <section class="panel"><h2>Profit &amp; loss by month</h2>${pnlTable}</section>
    ${matrix("Profit by channel", chanKeys, (p) => p.profit, true, `/finance/reports.csv?kind=channels&${qs}`)}
    ${matrix("Revenue by stream", streamKeys, (p, k) => p.byStream.get(k) ?? 0)}
    ${matrix("Expenses by category", catKeys, (p, k) => p.byCategory.get(k) ?? 0)}
    ${matrix("Expenses by type", [...EXPENSE_TYPE.values()].map((t) => ({ key: t.id, label: t.label, colour: "#94949E" })), (p, k) => p.byType.get(k as never) ?? 0)}`;
  return financePage(shell, "reports", "Reports", body);
}

/** Reports as CSV: one row per month (P&L) or per channel × month. */
export function reportsCsv(kind: string, d: ReportsData): string {
  const months = monthsEnding(d.to, d.n);
  const q = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const $ = (c: number) => (c / 100).toFixed(2);
  const lines: string[][] = [];
  if (kind === "channels") {
    lines.push(["month", "channel", "revenue", "adsense_revenue", "expenses", "profit", "margin", "uploads", "views", "owner_hours"]);
    for (const m of months) {
      for (const c of [...activeChannels(d.facts, [m]), null]) {
        const p = pnl(d.facts, [m], c === null ? { general: true } : { channel: c });
        if (!p.revenue && !p.expenses) continue;
        lines.push([m, c ?? "General", $(p.revenue), $(p.platformRevenue), $(p.expenses), $(p.profit), p.margin === null ? "" : p.margin.toFixed(4), String(p.uploads), p.views === null ? "" : String(p.views), (p.ownerMinutes / 60).toFixed(2)]);
      }
    }
  } else {
    lines.push(["month", "revenue", "expenses", "recurring", "production", "one_off", "profit", "margin", "cash_out", "unpaid"]);
    for (const m of months) {
      const p = pnl(d.facts, [m], { all: true });
      lines.push([m, $(p.revenue), $(p.expenses), $(p.byGroup.recurring), $(p.byGroup.production), $(p.byGroup.oneoff), $(p.profit), p.margin === null ? "" : p.margin.toFixed(4), $(p.cashOut), $(p.unpaid)]);
    }
  }
  return lines.map((l) => l.map(q).join(",")).join("\n") + "\n";
}

