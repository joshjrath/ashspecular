/**
 * Finance's entry pages — Income (and the monthly grid), Expenses,
 * Subscriptions, Contractors, Settings. Each writes to the same tables the
 * analysis pages read.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import type { Expense, Income, Lists, Person, Recurring, VoiceNote } from "../../db/finance.js";
import { EXPENSE_TYPES, EXPENSE_TYPE, FLAGS, type Thresholds } from "../../finance/metrics.js";
import { FREQUENCIES, FREQUENCY, fmtMoney, monthLabel, usDay } from "../../finance/money.js";
import { PAY_MODELS, PAY_MODEL, describePay, payChannels, tiersText, type PayModel } from "../../finance/pay.js";
import { ORG_TZ, dateIn } from "../../parse/derive.js";
import { channelColour, type Shell } from "../page.js";
import { esc } from "../html.js";
import { CHIPS_SCRIPT, channelChips, channelSelect, checkMark, fieldName, financePage, voiceBox, money, monthSwitch, opt, splitEditor, splitsText, tile } from "./ui.js";

const dollars = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(/\.00$/, ""));
const statusPill = (e: { status: string; isAdvance?: boolean }) =>
  e.isAdvance ? `<span class="fpill adv">Advance</span>` : `<span class="fpill ${e.status}">${e.status === "covered" ? "Covered by advance" : e.status === "paid" ? "Paid" : "Unpaid"}</span>`;
const chanLabel = (c: string | null) => (c ? `<span class="fch" style="--ch:${channelColour(c)}"><i></i>${esc(c.replace(/^Specular (?=.)/, ""))}</span>` : `<span class="fgen">General</span>`);
/** Fields to mark on a form: missing (red, needed) or unsure (amber, check). */
export interface Flags { missing: string[]; unsure: string[] }
/** A draft being finished from a voice note: what was said, and which note/entry to mark done. */
export interface VoicePrefill { transcript: string; ref: string; flags: Flags }

const fl = (f: Flags | undefined, ...fields: string[]) => {
  if (!f) return "";
  if (fields.some((x) => f.missing.includes(x))) return ' data-flag="missing" data-flag-text="needed"';
  return fields.some((x) => f.unsure.includes(x)) ? ' data-flag="unsure" data-flag-text="check"' : "";
};
const voiceBanner = (v: VoicePrefill | undefined) =>
  v ? `<div class="fvbanner"><span>🎙</span><div>From your voice note: <i>“${esc(v.transcript.length > 200 ? `${v.transcript.slice(0, 197)}…` : v.transcript)}”</i><br>${
    v.flags.missing.length ? `<b>Fill in ${esc(v.flags.missing.map(fieldName).join(", "))}</b>${v.flags.unsure.length ? " and check" : ""}` : "<b>Check</b>"
  }${v.flags.unsure.length ? ` ${esc(v.flags.unsure.map(fieldName).join(", "))}` : ""} — marked below.</div></div>` : "";

const saved = (msg: string) => (msg ? `<div class="panel" role="status" style="padding:12px 18px;margin-bottom:14px;color:#8FE3B6;font-weight:700">${esc(msg)}</div>` : "");

// ── income ─────────────────────────────────────────────────────────────────

export interface IncomeData {
  month: string;
  list: Income[];
  lists: Lists;
  filter: { stream?: string; channel?: string };
  msg: string;
  voice: VoiceNote[];
  prefill?: { i: Partial<Income>; voice: VoicePrefill };
}

function incomeForm(lists: Lists, i: Partial<Income>, month: string, action: string, f?: Flags, voiceRef?: string): string {
  const monthly = !i.granularity || i.granularity === "month";
  return `<form class="fform" method="post" action="${action}">${voiceRef ? `<input type="hidden" name="voice" value="${esc(voiceRef)}">` : ""}
    <label${fl(f, "amount")}>Amount ($)<input name="amount" inputmode="decimal" required value="${esc(dollars(i.amount))}" placeholder="1,000"></label>
    <label${fl(f, "stream")}>Revenue stream<select name="stream">${lists.streams.filter((s) => !s.archived || s.id === i.streamId).map((s) => opt(s.id, s.label, s.id === (i.streamId ?? "adsense"))).join("")}</select></label>
    <label class="w2"${fl(f, "payee")}>Source <input name="source" value="${esc(i.source ?? "")}" placeholder="Sponsor or platform — e.g. NordVPN"></label>
    <label${fl(f, "channels")}>Channel${channelSelect("channel", i.channel === undefined ? null : (i.channel ?? "general"), { general: "General / whole business" })}</label>
    <label>Company<select name="company">${opt("", "Channel's company", !i.companyId)}${lists.companies.filter((c) => !c.archived).map((c) => opt(c.id, c.name, c.id === i.companyId)).join("")}</select></label>
    <label${fl(f, "month")}>Month<input type="month" name="month" value="${esc(monthly && i.periodStart ? i.periodStart.slice(0, 7) : month)}"></label>
    <label${fl(f, "date")}>Received on<input type="date" name="received" value="${esc(i.receivedOn ?? "")}"></label>
    <details class="w4"${monthly ? "" : " open"}><summary class="linkbtn">A week or other period instead of a month</summary>
      <div class="fform" style="margin-top:10px"><label>From<input type="date" name="from" value="${esc(monthly ? "" : i.periodStart ?? "")}"></label><label>To<input type="date" name="to" value="${esc(monthly ? "" : i.periodEnd ?? "")}"></label>
      <p class="fhint">Set both and they're used instead of the month. Reports spread a period across the months it touches, by day.</p></div></details>
    <label class="w4">Notes<input name="notes" value="${esc(i.notes ?? "")}"></label>
    <div class="fbtns"><button class="clear">${i.id ? "Save" : "Add income"}</button></div>
  </form>`;
}

export function renderIncome(shell: Shell, d: IncomeData): string {
  const { lists } = d;
  const total = d.list.reduce((a, i) => a + i.amount, 0);
  const qs = (m: string) => `/finance/income?m=${m}${d.filter.stream ? `&stream=${d.filter.stream}` : ""}${d.filter.channel ? `&channel=${encodeURIComponent(d.filter.channel)}` : ""}`;
  const rows = d.list
    .map((i) => {
      const s = lists.streams.find((x) => x.id === i.streamId);
      const period = i.granularity === "month" ? monthLabel(i.periodStart.slice(0, 7), "shortYear") : `${usDay(i.periodStart)}–${usDay(i.periodEnd)}`;
      return `<tr id="i${i.id}"><td class="l">${esc(period)}</td><td class="l"><span class="fch" style="--ch:${s?.colour ?? "#94949E"}"><i></i>${esc(s?.label ?? i.streamId)}</span>${i.source ? ` <small class="fnote">${esc(i.source)}</small>` : ""}${checkMark(i.review)}</td>
        <td class="l">${chanLabel(i.channel)}</td><td>${money(i.amount)}</td>
        <td><details class="fedit"><summary class="linkbtn">Edit</summary>${incomeForm(lists, i, d.month, `/finance/income/${i.id}`, { missing: [], unsure: i.review ?? [] })}
          <form method="post" action="/finance/income/${i.id}/delete" style="margin-top:8px"><button class="linkbtn danger">Delete</button></form></details></td></tr>`;
    })
    .join("");
  const body = `${saved(d.msg)}${voiceBox("income", "/finance/income", d.voice)}<div class="fheadrow">${monthSwitch(d.month, qs)}
      <form class="ffilters" method="get" action="/finance/income" style="margin:0"><input type="hidden" name="m" value="${d.month}">
        <select name="stream" onchange="this.form.submit()">${opt("", "Every stream", !d.filter.stream)}${lists.streams.map((s) => opt(s.id, s.label, s.id === d.filter.stream)).join("")}</select>
        ${channelSelect("channel", d.filter.channel ?? null, { any: "Every channel", general: "General only" }).replace("<select", '<select onchange="this.form.submit()"')}
      </form><span class="sp"></span><a class="clear" href="/finance/income/entry?m=${d.month}">Monthly entry — every channel</a></div>
    <div class="ftiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tile(money(total), `Income · ${monthLabel(d.month)}`, `${d.list.length} entr${d.list.length === 1 ? "y" : "ies"}`)}${tile(
      money(d.list.filter((i) => lists.streams.find((s) => s.id === i.streamId)?.platform).reduce((a, i) => a + i.amount, 0)),
      "Platform (AdSense)",
      "what RPM is worked out from",
    )}</div>
    <section class="panel"><h2>${esc(monthLabel(d.month))}</h2>${
      rows ? `<div class="fscroll"><table class="ftable"><thead><tr><th class="l">Period</th><th class="l">Stream · source</th><th class="l">Channel</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">No income entered for ${esc(monthLabel(d.month))}. <a href="/finance/income/entry?m=${d.month}">Enter the month</a>.</div>`
    }</section>
    <section class="panel" id="add"><h2>Add income <span class="sub">— a sponsorship, affiliate payout, anything. Revenue stream and channel are separate: a sponsorship on a channel is that channel's revenue, but never its RPM.</span></h2>${voiceBanner(d.prefill?.voice)}${incomeForm(lists, d.prefill?.i ?? {}, d.month, "/finance/income", d.prefill?.voice.flags, d.prefill?.voice.ref)}</section>`;
  return financePage(shell, "income", "Income", body);
}

export interface EntryData {
  month: string;
  stream: string;
  lists: Lists;
  amounts: Map<string, number>;
  views: Map<string, number>;
  estimated: Map<string, number>;
  last: Map<string, number>;
  general: number | null;
  msg: string;
}

/** Every channel on one screen: the month's amount for a stream, and its views. */
export function renderIncomeEntry(shell: Shell, d: EntryData): string {
  const s = d.lists.streams.find((x) => x.id === d.stream);
  const rows = CATEGORIES.map((c) => {
    const list = CHANNELS.filter((ch) => ch.category === c.id);
    if (!list.length) return "";
    return `<tr class="fgridcat"><td colspan="5">${esc(c.label)}</td></tr>${list
      .map((ch) => {
        const est = d.estimated.get(ch.name);
        return `<tr><td class="l"><span class="fchn" style="--ch:${ch.color}"><i></i>${esc(ch.name)}</span></td>
          <td class="fgridin"><input name="a:${esc(ch.name)}" inputmode="decimal" value="${esc(dollars(d.amounts.get(ch.name)))}" placeholder="$" aria-label="${esc(ch.name)} ${esc(s?.label ?? "")}" data-amt></td>
          <td>${d.last.has(ch.name) ? money(d.last.get(ch.name)!, { muted: true }) : `<span class="m mut">—</span>`}</td>
          <td class="fgridin"><input name="v:${esc(ch.name)}" inputmode="numeric" value="${d.views.has(ch.name) ? d.views.get(ch.name) : ""}" placeholder="${est ? `~${est.toLocaleString("en-US")}` : "views"}" aria-label="${esc(ch.name)} views"></td>
          <td class="l">${est && !d.views.has(ch.name) ? `<small class="fnote" style="margin:0">est. from snapshots</small>` : ""}</td></tr>`;
      })
      .join("")}`;
  }).join("");
  const body = `${saved(d.msg)}<div class="fheadrow">${monthSwitch(d.month, (m) => `/finance/income/entry?m=${m}&stream=${d.stream}`)}
      <form class="ffilters" method="get" action="/finance/income/entry" style="margin:0"><input type="hidden" name="m" value="${d.month}">
        <select name="stream" onchange="this.form.submit()">${d.lists.streams.filter((x) => !x.archived).map((x) => opt(x.id, x.label, x.id === d.stream)).join("")}</select></form></div>
    <form method="post" action="/finance/income/entry" class="panel">
      <input type="hidden" name="m" value="${d.month}"><input type="hidden" name="stream" value="${esc(d.stream)}">
      <h2>${esc(s?.label ?? d.stream)} — ${esc(monthLabel(d.month))} <span class="sub">— one line per channel. Blank removes it. Saving again corrects, never adds twice.</span></h2>
      <div class="fscroll"><table class="ftable"><thead><tr><th>Channel</th><th>${esc(s?.label ?? "Amount")} ($)</th><th>Last month</th><th>Views (optional)</th><th></th></tr></thead>
        <tbody>${rows}
        <tr class="fgridcat"><td colspan="5">Not one channel</td></tr>
        <tr><td class="l"><span class="fgen">General / whole business</span></td><td class="fgridin"><input name="a:__general" inputmode="decimal" value="${esc(dollars(d.general))}" placeholder="$" data-amt></td><td></td><td></td><td></td></tr>
        </tbody><tfoot><tr><td>Total</td><td data-total>${esc(fmtMoney([...d.amounts.values()].reduce((a, b) => a + b, 0) + (d.general ?? 0)))}</td><td></td><td></td><td></td></tr></tfoot></table></div>
      <p class="fnote">Views are the channel's views for the month from YouTube Studio — they give the AdSense RPM and break-even. Left blank, the board uses its own snapshot estimate where it has one.</p>
      <div class="setsave"><button class="clear">Save ${esc(monthLabel(d.month))}</button></div>
    </form>
    <script>
    (function () {
      var out = document.querySelector("[data-total]");
      function sum() {
        var t = 0;
        document.querySelectorAll("[data-amt]").forEach(function (i) { var v = Number(String(i.value).split(",").join("").split("$").join("").trim()); if (isFinite(v)) t += v; });
        out.textContent = "$" + t.toLocaleString("en-US", { maximumFractionDigits: 2 });
      }
      document.addEventListener("input", function (e) { if (e.target.hasAttribute && e.target.hasAttribute("data-amt")) sum(); });
    })();
    </script>`;
  return financePage(shell, "income", "Monthly entry", body);
}

// ── expenses ───────────────────────────────────────────────────────────────

export interface ExpensesData {
  month: string | null;
  list: Expense[];
  lists: Lists;
  filter: Record<string, string>;
  msg: string;
  voice: VoiceNote[];
}

export function renderExpenses(shell: Shell, d: ExpensesData): string {
  const { lists } = d;
  const cost = d.list.filter((e) => !e.isAdvance).reduce((a, e) => a + e.amount, 0);
  const cash = d.list.filter((e) => e.status === "paid").reduce((a, e) => a + e.amount, 0);
  const unpaid = d.list.filter((e) => e.status === "unpaid").reduce((a, e) => a + e.amount, 0);
  const f = d.filter;
  const qs = (m: string) => `/finance/expenses?${new URLSearchParams({ ...f, m }).toString()}`;
  const sel = (name: string, first: string, items: Array<[string, string]>) =>
    `<select name="${name}" onchange="this.form.submit()">${opt("", first, !f[name])}${items.map(([v, l]) => opt(v, l, f[name] === v)).join("")}</select>`;
  const rows = d.list
    .map((e) => {
      const cat = lists.categories.find((c) => c.id === e.categoryId);
      return `<tr>
        <td class="l">${esc(usDay(e.date))}</td>
        <td class="l"><a href="/finance/expenses/${e.id}" style="color:var(--ink);font-weight:650">${esc(e.payee || e.personName || "(no payee)")}</a>${checkMark(e.review)}${e.personName && e.payee && e.payee !== e.personName ? ` <small class="fnote">${esc(e.personName)}</small>` : ""}${e.recordTitle ? `<div class="fnote" style="margin:2px 0 0">▸ ${esc(e.recordTitle)}</div>` : ""}</td>
        <td class="l">${cat ? `<span class="fch" style="--ch:${cat.colour}"><i></i>${esc(cat.label)}</span>` : ""}</td>
        <td class="l"><small>${esc(EXPENSE_TYPE.get(e.type)?.label ?? e.type)}</small></td>
        <td class="l">${splitsText(e.splits)}</td>
        <td>${money(e.amount)}${e.calculated !== null && e.calculated !== e.amount ? `<div class="fnote" style="margin:0" title="What the pay model worked out">calc. ${esc(fmtMoney(e.calculated))}</div>` : ""}</td>
        <td class="l">${statusPill(e)}${e.attachments.length || e.receiptUrl ? " 📎" : ""}</td>
        <td><div class="flist-actions">${e.status === "unpaid" ? `<form method="post" action="/finance/expenses/${e.id}/paid"><button class="linkbtn">Mark paid</button></form>` : ""}<a class="linkbtn" href="/finance/expenses/${e.id}">Edit</a></div></td></tr>`;
    })
    .join("");
  const body = `${saved(d.msg)}${voiceBox("expense", "/finance/expenses", d.voice)}<div class="fheadrow">${d.month ? monthSwitch(d.month, qs) : `<a class="linkbtn" href="/finance/expenses">This month</a>`}<span class="sp"></span><a class="clear" href="/finance/expenses/new">+ Add expense</a></div>
    <form class="ffilters" method="get" action="/finance/expenses">${d.month ? `<input type="hidden" name="m" value="${d.month}">` : ""}
      ${sel("type", "Every type", EXPENSE_TYPES.map((t) => [t.id, t.label]))}
      ${sel("category", "Every category", lists.categories.map((c) => [c.id, c.label]))}
      ${channelSelect("channel", f.channel || null, { any: "Every channel", general: "General only" }).replace("<select", '<select onchange="this.form.submit()"')}
      ${sel("person", "Everyone", lists.people.map((p) => [String(p.id), p.name]))}
      ${sel("status", "Any status", [["paid", "Paid"], ["unpaid", "Unpaid"], ["covered", "Covered by advance"], ["advance", "Advances"]])}
      ${sel("company", "Every company", lists.companies.map((c) => [String(c.id), c.name]))}
      <input type="search" name="q" value="${esc(f.q ?? "")}" placeholder="Search payee, notes…">
      ${d.month ? `<a class="linkbtn" href="${esc(`/finance/expenses?${new URLSearchParams({ ...f, all: "1" }).toString()}`)}">All dates</a>` : `<a class="linkbtn" href="/finance/expenses">This month only</a>`}
    </form>
    <div class="ftiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">${tile(money(cost), "Cost", "what the work cost — counts toward profit")}${tile(money(cash), "Cash paid", "money that actually left")}${tile(money(unpaid), "Unpaid", "owed, not paid yet")}</div>
    <section class="panel">${
      rows
        ? `<div class="fscroll"><table class="ftable"><thead><tr><th class="l">Date</th><th class="l">Payee · video</th><th class="l">Category</th><th class="l">Type</th><th class="l">Channel</th><th>Amount</th><th class="l">Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="empty">No expenses${d.month ? ` in ${esc(monthLabel(d.month))}` : ""} match. <a href="/finance/expenses/new">Add one</a>.</div>`
    }</section>`;
  return financePage(shell, "expenses", "Expenses", body);
}

export interface ExpenseFormData {
  e: Partial<Expense>;
  lists: Lists;
  records: Array<{ id: number; label: string; channel: string | null }>;
  models: Map<number, string>;
  msg: string;
  voice?: VoicePrefill;
}

export function renderExpenseForm(shell: Shell, d: ExpenseFormData): string {
  const { e, lists } = d;
  const f: Flags | undefined = d.voice?.flags ?? (e.review?.length ? { missing: [], unsure: e.review } : undefined);
  const today = dateIn(ORG_TZ);
  const recordVal = e.recordId ? `#${e.recordId} · ${e.recordTitle ?? ""}` : "";
  const personOpts = lists.people.map((p) => `<option value="${p.id}"${p.id === e.personId ? " selected" : ""} data-model="${esc(d.models.get(p.id) ?? "")}">${esc(p.name)}${p.role ? ` — ${esc(p.role)}` : ""}</option>`).join("");
  const body = `${saved(d.msg)}<form class="panel" method="post" action="${e.id ? `/finance/expenses/${e.id}` : "/finance/expenses"}" enctype="multipart/form-data">
    <h2>${e.id ? "Edit expense" : "New expense"}</h2>${voiceBanner(d.voice)}${
      !d.voice && e.review?.length ? `<div class="fvbanner"><span>🎙</span><div>Logged from a voice note — <b>check ${esc(e.review.map(fieldName).join(", "))}</b>, marked below. Saving clears the mark.</div></div>` : ""
    }${d.voice ? `<input type="hidden" name="voice" value="${esc(d.voice.ref)}">` : ""}
    <div class="fform">
      <label${fl(f, "amount")}>Amount ($)<input name="amount" inputmode="decimal" value="${esc(dollars(e.amount))}" placeholder="${e.id ? "" : "blank = work it out"}"></label>
      <label${fl(f, "date")}>Date<input type="date" name="date" required value="${esc(e.date ?? today)}"></label>
      <label class="w2"${fl(f, "payee")}>Payee / vendor<input name="payee" value="${esc(e.payee ?? "")}" placeholder="Who was paid"></label>
      <label${fl(f, "expense_type")}>Type<select name="type">${EXPENSE_TYPES.map((t) => opt(t.id, t.label, t.id === (e.type ?? "one_off"))).join("")}</select></label>
      <label${fl(f, "category")}>Category<select name="category">${opt("", "—", !e.categoryId)}${lists.categories.filter((c) => !c.archived || c.id === e.categoryId).map((c) => opt(c.id, c.label, c.id === e.categoryId)).join("")}</select></label>
      <label>Company<select name="company">${opt("", "Channel's company", !e.companyId)}${lists.companies.filter((c) => !c.archived).map((c) => opt(c.id, c.name, c.id === e.companyId)).join("")}</select></label>
      <label${fl(f, "method")}>Payment method<select name="method">${opt("", "—", !e.methodId)}${lists.methods.filter((m) => !m.archived).map((m) => opt(m.id, m.label, m.id === e.methodId)).join("")}</select></label>
      <label${fl(f, "person")}>Contractor / person<select name="person" data-person>${opt("", "—", !e.personId)}${personOpts}</select></label>
      <label>Finished videos<input name="videos" inputmode="decimal" value="${e.unitsVideos ?? ""}" placeholder="for per-video pay"></label>
      <label>Finished minutes<input name="minutes" inputmode="decimal" value="${e.unitsMinutes ?? ""}" placeholder="for per-minute pay"></label>
      <label${fl(f, "status")}>Status<select name="status">${opt("paid", "Paid", (e.status ?? "paid") === "paid")}${opt("unpaid", "Unpaid", e.status === "unpaid")}${opt("covered", "Covered by an advance", e.status === "covered")}</select></label>
      <p class="fhint" data-model-hint>${e.paySnapshot ? `Worked out with: ${esc(describePay(e.paySnapshot))}${e.calculated !== null && e.calculated !== undefined ? ` → ${esc(fmtMoney(e.calculated))}${e.paySnapshot.explain ? ` (${esc(e.paySnapshot.explain)})` : ""}` : ""}. ` : ""}Pick a person and leave Amount blank to work it out from their pay model; type an amount to override it.</p>
      <label>Paid on<input type="date" name="paid_on" value="${esc(e.paidOn ?? "")}"></label>
      <label class="chk" style="align-self:center"><input type="checkbox" name="advance" value="1"${e.isAdvance ? " checked" : ""}> This is an advance (prepaid)</label>
      <label class="w2">Video / project<input name="record" list="records" value="${esc(recordVal)}" placeholder="Search a video on the board…"></label>
      <datalist id="records">${d.records.map((r) => `<option value="${esc(`#${r.id} · ${r.label}`)}">${esc(r.channel ?? "")}</option>`).join("")}</datalist>
      <label class="w4"${fl(f, "channels")}>Channels<span style="font-weight:500">${splitEditor(e.splits ?? [])}</span></label>
      <label class="w2">Receipt / invoice<input type="file" name="receipt" accept="image/*,application/pdf"></label>
      <label class="w2">…or its link<input name="receipt_url" type="url" value="${esc(e.receiptUrl ?? "")}" placeholder="https://"></label>
      ${e.attachments?.length ? `<div class="w4 fnote">Attached: ${e.attachments.map((a) => `<a href="/finance/attachments/${a.id}" target="_blank">${esc(a.filename)}</a> <button class="linkbtn danger" formaction="/finance/attachments/${a.id}/delete" formenctype="application/x-www-form-urlencoded" formnovalidate>remove</button>`).join(" · ")}</div>` : ""}
      <label class="w4">Notes<textarea name="notes">${esc(e.notes ?? "")}</textarea></label>
      <div class="fbtns"><button class="clear">${e.id ? "Save" : "Add expense"}</button><a class="clear secondary" href="/finance/expenses">Cancel</a>
        ${e.id ? `<span class="sp" style="flex:1"></span><button class="linkbtn danger" formaction="/finance/expenses/${e.id}/delete" formenctype="application/x-www-form-urlencoded" formnovalidate onclick="return confirm('Delete this expense?')">Delete</button>` : ""}</div>
    </div>
  </form>
  <script>
  (function () {
    var p = document.querySelector("[data-person]"), h = document.querySelector("[data-model-hint]"), base = h ? h.textContent : "";
    if (!p || !h) return;
    p.addEventListener("change", function () {
      var o = p.options[p.selectedIndex], m = o && o.getAttribute("data-model");
      h.textContent = (m ? "Their pay: " + m + ". " : "") + "Leave Amount blank to work it out from their pay model; type an amount to override it.";
      var t = document.querySelector("select[name=type]");
      if (m && t && t.value === "one_off") t.value = "contractor";
    });
  })();
  </script>`;
  return financePage(shell, "expenses", e.id ? "Expense" : "New expense", body);
}

// ── subscriptions ──────────────────────────────────────────────────────────

export interface SubscriptionsData {
  list: Recurring[];
  lists: Lists;
  msg: string;
  editing: number | null;
  voice: VoiceNote[];
  prefill?: { r: Partial<Recurring>; voice: VoicePrefill };
}

function recurringForm(lists: Lists, r: Partial<Recurring>, action: string, f?: Flags, voiceRef?: string): string {
  return `<form class="fform" method="post" action="${action}">${voiceRef ? `<input type="hidden" name="voice" value="${esc(voiceRef)}">` : ""}
    <label class="w2"${fl(f, "payee", "service")}>Service / vendor<input name="vendor" required value="${esc(r.vendor ?? "")}" placeholder="Adobe, Epidemic Sound, office rent…"></label>
    <label${fl(f, "amount")}>Cost ($)<input name="amount" inputmode="decimal" required value="${esc(dollars(r.amount))}"></label>
    <label${fl(f, "frequency")}>Billed<select name="frequency">${FREQUENCIES.map((f) => opt(f.id, f.label, f.id === (r.frequency ?? "monthly"))).join("")}</select></label>
    <label${fl(f, "next_bill")}>Next bill<input type="date" name="next_bill" value="${esc(r.nextBill ?? "")}"></label>
    <label>Kind<select name="kind">${opt("subscription", "Subscription", (r.kind ?? "subscription") === "subscription")}${opt("recurring", "Other recurring cost", r.kind === "recurring")}</select></label>
    <label${fl(f, "category")}>Category<select name="category">${opt("", "—", !r.categoryId)}${lists.categories.filter((c) => !c.archived).map((c) => opt(c.id, c.label, c.id === r.categoryId)).join("")}</select></label>
    <label>Company<select name="company">${opt("", "—", !r.companyId)}${lists.companies.filter((c) => !c.archived).map((c) => opt(c.id, c.name, c.id === r.companyId)).join("")}</select></label>
    <label>Payment method<select name="method">${opt("", "—", !r.methodId)}${lists.methods.filter((m) => !m.archived).map((m) => opt(m.id, m.label, m.id === r.methodId)).join("")}</select></label>
    <label>Person (retainer, salary)<select name="person">${opt("", "—", !r.personId)}${lists.people.map((p) => opt(p.id, p.name, p.id === r.personId)).join("")}</select></label>
    <label class="chk"><input type="checkbox" name="auto" value="1"${r.autoPost === false ? "" : " checked"}> Post each bill automatically</label>
    <label>Posted as<select name="post_status">${opt("paid", "Paid (charged automatically)", (r.postStatus ?? "paid") === "paid")}${opt("unpaid", "Unpaid (I pay it by hand)", r.postStatus === "unpaid")}</select></label>
    <label class="chk"><input type="checkbox" name="active" value="1"${r.active === false ? "" : " checked"}> Active</label>
    <label class="w4"${fl(f, "channels")}>Channels<span style="font-weight:500">${splitEditor(r.splits ?? [])}</span></label>
    <label class="w4">Notes<input name="notes" value="${esc(r.notes ?? "")}"></label>
    <div class="fbtns"><button class="clear">${r.id ? "Save" : "Add"}</button></div>
  </form>`;
}

export function renderSubscriptions(shell: Shell, d: SubscriptionsData): string {
  const active = d.list.filter((r) => r.active);
  const subs = active.filter((r) => r.kind === "subscription");
  const other = active.filter((r) => r.kind === "recurring");
  const sum = (l: Recurring[]) => l.reduce((a, r) => a + r.monthly, 0);
  const table = (list: Recurring[], empty: string) =>
    list.length
      ? `<div class="fscroll"><table class="ftable"><thead><tr><th class="l">Service</th><th class="l">Category</th><th class="l">Channel</th><th>Cost</th><th class="l">Billed</th><th>Monthly</th><th class="l">Next bill</th><th></th></tr></thead><tbody>
        ${list
          .map((r) => {
            const cat = d.lists.categories.find((c) => c.id === r.categoryId);
            return `<tr id="r${r.id}"${r.active ? "" : ' style="opacity:.55"'}><td class="l"><b>${esc(r.vendor)}</b>${checkMark(r.review)}${r.personName ? ` <small class="fnote">${esc(r.personName)}</small>` : ""}${r.active ? "" : ' <span class="fpill">Paused</span>'}</td>
              <td class="l">${cat ? `<span class="fch" style="--ch:${cat.colour}"><i></i>${esc(cat.label)}</span>` : ""}</td><td class="l">${splitsText(r.splits)}</td>
              <td>${money(r.amount)}</td><td class="l"><small>${esc(FREQUENCY.get(r.frequency)?.label ?? r.frequency)}</small></td><td>${money(r.monthly)}</td>
              <td class="l">${r.nextBill ? esc(usDay(r.nextBill)) : "—"}${r.autoPost ? "" : ' <small class="fnote">by hand</small>'}</td>
              <td><div class="flist-actions"><form method="post" action="/finance/subscriptions/${r.id}/bill"><button class="linkbtn" title="Post the next bill as an expense now">Billed now</button></form>
                <form method="post" action="/finance/subscriptions/${r.id}/toggle"><button class="linkbtn">${r.active ? "Pause" : "Resume"}</button></form>
                <a class="linkbtn" href="/finance/subscriptions?edit=${r.id}#edit">Edit</a></div></td></tr>`;
          })
          .join("")}</tbody><tfoot><tr><td>Total</td><td></td><td></td><td></td><td></td><td>${money(sum(list))}</td><td></td><td></td></tr></tfoot></table></div>`
      : `<div class="empty">${esc(empty)}</div>`;
  const editing = d.editing ? d.list.find((r) => r.id === d.editing) : null;
  const paused = d.list.filter((r) => !r.active);
  const body = `${saved(d.msg)}${voiceBox("subscription", "/finance/subscriptions", d.voice)}
    <div class="ftiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      ${tile(money(sum(active)), "Recurring a month", "true monthly cost: annual ÷ 12, quarterly ÷ 3…", "hero")}
      ${tile(money(sum(subs)), "Subscriptions", `${subs.length} running`)}
      ${tile(money(sum(active) * 12), "A year at this rate", `other recurring ${esc(fmtMoney(sum(other)))} a month`)}
    </div>
    <section class="panel"><h2>Subscriptions</h2>${table(subs, "No subscriptions yet.")}</section>
    <section class="panel"><h2>Other recurring costs <span class="sub">— rent, retainers, salaries: anything fixed that isn't a subscription</span></h2>${table(other, "None yet.")}</section>
    ${paused.length ? `<section class="panel"><h2>Paused</h2>${table(paused, "")}</section>` : ""}
    <section class="panel" id="edit"><h2>${editing ? `Edit ${esc(editing.vendor)}` : "Add a subscription or recurring cost"} <span class="sub">— each bill is posted as an expense on its date, so the months it was charged count it; this page shows what it costs a month</span></h2>
      ${editing ? "" : voiceBanner(d.prefill?.voice)}
      ${recurringForm(d.lists, editing ?? d.prefill?.r ?? {}, editing ? `/finance/subscriptions/${editing.id}` : "/finance/subscriptions", editing ? { missing: [], unsure: editing.review } : d.prefill?.voice.flags, editing ? undefined : d.prefill?.voice.ref)}
      ${editing ? `<form method="post" action="/finance/subscriptions/${editing.id}/delete" style="margin-top:10px"><button class="linkbtn danger" onclick="return confirm('Delete it? Bills already posted stay as expenses.')">Delete</button></form>` : ""}
    </section>`;
  return financePage(shell, "subscriptions", "Subscriptions", body);
}

// ── contractors ────────────────────────────────────────────────────────────

export function renderContractors(shell: Shell, d: { people: Person[]; msg: string; voice: VoiceNote[] }): string {
  const rows = d.people
    .map(
      (p) => `<tr${p.active ? "" : ' style="opacity:.55"'}><td class="l"><a href="/finance/contractors/${p.id}" style="color:var(--ink);font-weight:700">${esc(p.name)}</a>${p.role ? ` <small class="fnote">${esc(p.role)}</small>` : ""}</td>
        <td class="l"><small>${esc(describePay(p.current))}</small></td><td>${money(p.cashThisMonth)}</td><td>${money(p.cashPaid)}</td>
        <td>${p.outstanding ? money(p.outstanding) : `<span class="m mut">$0</span>`}</td><td>${p.advancePaid ? money(p.advanceBalance) : `<span class="m mut">—</span>`}</td>
        <td class="l">${p.lastWork ? esc(usDay(p.lastWork)) : "—"}</td></tr>`,
    )
    .join("");
  const owed = d.people.reduce((a, p) => a + p.outstanding, 0);
  const body = `${saved(d.msg)}${voiceBox("contractor", "/finance/contractors", d.voice)}
    <div class="ftiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      ${tile(money(d.people.reduce((a, p) => a + p.cashThisMonth, 0)), "Paid this month", "cash")}
      ${tile(money(owed), "Outstanding", "work done, not paid yet", owed ? "hero" : "")}
      ${tile(money(d.people.reduce((a, p) => a + Math.max(0, p.advanceBalance), 0)), "Advance balances", "prepaid, not yet worked off")}
    </div>
    <section class="panel"><h2>People</h2>${
      rows
        ? `<div class="fscroll"><table class="ftable"><thead><tr><th class="l">Name</th><th class="l">Pay model</th><th>Paid this month</th><th>Lifetime cash</th><th>Outstanding</th><th>Advance left</th><th class="l">Last work</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="empty">No one yet. Add your editors, writers and voice actors below with how each is paid.</div>`
    }</section>
    <section class="panel" id="add"><h2>Add a person</h2><form class="fform" method="post" action="/finance/contractors">
      <label class="w2">Name<input name="name" required></label><label class="w2">Role<input name="role" placeholder="Editor, scriptwriter, thumbnail artist…"></label>
      <div class="fbtns"><button class="clear">Add</button><span class="fnote" style="margin:0">Then set how they're paid on their page.</span></div></form></section>`;
  return financePage(shell, "contractors", "Contractors", body);
}

export interface PersonData {
  person: Person;
  work: Expense[];
  lists: Lists;
  records: Array<{ id: number; label: string; channel: string | null }>;
  msg: string;
  today: string;
  voice: VoiceNote[];
}

function modelForm(p: Person): string {
  const cur = p.current;
  const v = (k: string) => {
    const x = cur?.params as Record<string, unknown> | undefined;
    const val = x?.[k];
    if (val === undefined || val === null) return "";
    if (k === "pct") return String(Number(val) * 100);
    if (["rate", "base", "amount"].includes(k)) return dollars(Number(val));
    return String(val);
  };
  return `<form class="fform" method="post" action="/finance/contractors/${p.id}/model" data-modelform>
    <label class="w2">Pay model<select name="model" data-model-select>${PAY_MODELS.map((m) => opt(m.id, m.label, m.id === (cur?.model ?? "per_video"))).join("")}</select></label>
    <label>From<input type="date" name="from" required value="${dateIn(ORG_TZ)}"></label>
    <label data-for="per_video per_minute prepaid">Rate ($)<input name="rate" inputmode="decimal" value="${esc(v("rate"))}" placeholder="per video / per minute"></label>
    <label data-for="prepaid">Rate is per<select name="per">${opt("video", "Video", v("per") !== "minute")}${opt("minute", "Minute", v("per") === "minute")}</select></label>
    <label data-for="tiered">Base per video ($)<input name="base" inputmode="decimal" value="${esc(v("base"))}" placeholder="optional"></label>
    <label class="w2" data-for="tiered">Tiers — minutes = $ per minute<textarea name="tiers" rows="3" placeholder="10 = 15&#10;rest = 10">${esc(tiersText(cur?.model === "tiered" ? cur.params.tiers : []))}</textarea></label>
    <label data-for="retainer salary">Amount ($)<input name="amount" inputmode="decimal" value="${esc(v("amount"))}"></label>
    <label data-for="retainer salary">Paid<select name="frequency">${FREQUENCIES.map((f) => opt(f.id, f.label, f.id === (v("frequency") || "monthly"))).join("")}</select></label>
    <label class="chk" data-for="retainer salary"><input type="checkbox" name="recurring" value="1" checked> Also set it up as a recurring cost</label>
    <label data-for="revenue_share">Share (%)<input name="pct" inputmode="decimal" value="${esc(v("pct"))}"></label>
    <label class="w4">Channels they work on <span data-for="revenue_share" style="font-weight:500">— the share is of these channels' revenue combined; none is the whole network</span>${channelChips("channels", payChannels(cur?.params), { none: "No channel set — the whole network" })}</label>
    <label class="w4">Note<input name="note" placeholder="Why it changed — optional"></label>
    <p class="fhint">Logged work goes to their channels unless you pick others. Work already logged keeps the rate it was worked out with. Tiers: "10 = 15" is the first 10 minutes at $15/min; "rest = 10" every minute after at $10.</p>
    <div class="fbtns"><button class="clear">Save pay model</button></div>
  </form>
  ${CHIPS_SCRIPT}
  <script>
  (function () {
    var f = document.querySelector("[data-modelform]"); if (!f) return;
    var s = f.querySelector("[data-model-select]");
    function sync() { f.querySelectorAll("[data-for]").forEach(function (el) { el.hidden = el.getAttribute("data-for").split(" ").indexOf(s.value) < 0; }); }
    s.addEventListener("change", sync); sync();
  })();
  </script>`;
}

export function renderPerson(shell: Shell, d: PersonData): string {
  const p = d.person;
  const cur = p.current;
  const prepaid = cur?.model === "prepaid" || p.advancePaid > 0;
  const work = d.work.filter((e) => !e.isAdvance);
  const history = d.work;
  const unpaidIds = d.work.filter((e) => e.status === "unpaid").map((e) => e.id);
  const tiles = `<div class="ftiles">
    ${tile(`<span class="txt">${esc(PAY_MODEL.get(cur?.model ?? "")?.label ?? "Not set")}</span>`, "Payment model", esc(describePay(cur)))}
    ${tile(money(p.cashThisMonth), "Paid this month", "cash")}
    ${tile(money(p.cashPaid), "Lifetime cash paid", "advances included")}
    ${tile(money(p.outstanding), "Outstanding", p.outstanding ? "work done, not paid" : "nothing owed", p.outstanding ? "hero" : "")}
  </div>`;
  const pipe = `<section class="panel"><h2>Work → earned → paid → outstanding</h2><div class="fpipe">
    <div><span>Work logged</span><b>${work.length}</b></div>
    <div><span>Earned</span><b>${esc(fmtMoney(p.earned))}</b></div>
    <div><span>Paid</span><b>${esc(fmtMoney(p.cashPaid - p.advancePaid + p.covered))}</b></div>
    <div><span>Outstanding</span><b>${esc(fmtMoney(p.outstanding))}</b></div></div>
    <p class="fnote">Paid counts cash for work plus work drawn from an advance.</p>
    ${
      prepaid
        ? `<dl class="fkv" style="margin-top:12px"><div><dt>Advance paid</dt><dd>${esc(fmtMoney(p.advancePaid))}</dd></div><div><dt>Work covered by it</dt><dd>${esc(fmtMoney(p.covered))}</dd></div>
            <div class="tot"><dt>Advance left</dt><dd>${money(p.advanceBalance, { sign: p.advanceBalance < 0 })}</dd></div>
            <div><dt>Current work</dt><dd>${p.advanceBalance > 0 ? "Covered by advance" : "Advance used up"}</dd></div>
            <div><dt>Additional amount due</dt><dd>${esc(fmtMoney(p.outstanding))}</dd></div></dl>`
        : ""
    }
    ${unpaidIds.length ? `<form method="post" action="/finance/contractors/${p.id}/pay" class="ffilters" style="margin:12px 0 0"><input type="date" name="on" value="${d.today}"><button class="clear">Pay all outstanding · ${esc(fmtMoney(p.outstanding))}</button></form>` : ""}
  </section>`;
  const logForm = `<form class="fform" method="post" action="/finance/contractors/${p.id}/work">
    <label>Date<input type="date" name="date" required value="${d.today}"></label>
    <label>Channels${channelChips("ch", payChannels(cur?.params), { none: "General" })}</label>
    <label class="w2">Video<input name="record" list="precords" placeholder="Search a video on the board…"></label>
    <datalist id="precords">${d.records.map((r) => `<option value="${esc(`#${r.id} · ${r.label}`)}">${esc(r.channel ?? "")}</option>`).join("")}</datalist>
    <label>Videos<input name="videos" inputmode="decimal" value="1"></label>
    <label>Finished minutes<input name="minutes" inputmode="decimal"></label>
    <label>Category<select name="category">${opt("", "—", true)}${d.lists.categories.filter((c) => !c.archived).map((c) => opt(c.id, c.label, false)).join("")}</select></label>
    <label>Amount ($)<input name="amount" inputmode="decimal" placeholder="blank = work it out"></label>
    <label class="w4">Notes<input name="notes" placeholder="Bonus, correction, what it was…"></label>
    <p class="fhint">Worked out with ${esc(describePay(cur))}. ${cur?.model === "prepaid" ? "Drawn from the advance while there's any left — no new cash. Whatever it doesn't cover is owed." : "Logged as owed until you pay it."} Type an amount to override.</p>
    <div class="fbtns"><button class="clear">Log work</button>${cur?.model === "revenue_share" ? `<button class="clear secondary" formaction="/finance/contractors/${p.id}/share">Work out this month's share</button>` : ""}</div>
  </form>`;
  const advForm = `<form class="fform" method="post" action="/finance/contractors/${p.id}/advance">
    <label>Advance ($)<input name="amount" inputmode="decimal" required></label><label>Paid on<input type="date" name="date" required value="${d.today}"></label>
    <label>Method<select name="method">${opt("", "—", true)}${d.lists.methods.map((m) => opt(m.id, m.label, false)).join("")}</select></label>
    <div class="fbtns" style="grid-column:auto"><button class="clear secondary">Record advance</button></div>
    <p class="fhint">Cash out now, not a cost: the cost is counted as the work it covers comes in.</p></form>`;
  const hist = history.length
    ? `<div class="fscroll"><table class="ftable"><thead><tr><th class="l">Date</th><th class="l">What</th><th class="l">Channel</th><th>Amount</th><th class="l">Worked out</th><th class="l">Status</th><th></th></tr></thead><tbody>${history
        .map(
          (e) => `<tr><td class="l">${esc(usDay(e.date))}</td><td class="l">${e.isAdvance ? "Advance" : esc(e.recordTitle ?? (e.notes || EXPENSE_TYPE.get(e.type)?.label || ""))}${e.unitsMinutes ? ` <small class="fnote">${e.unitsMinutes} min</small>` : ""}</td>
            <td class="l">${splitsText(e.splits)}</td><td>${money(e.amount)}</td>
            <td class="l"><small class="fnote" style="margin:0">${e.paySnapshot ? esc(`${describePay(e.paySnapshot)}${e.calculated !== null && e.calculated !== e.amount ? ` → ${fmtMoney(e.calculated)}, overridden` : ""}`) : ""}</small></td>
            <td class="l">${statusPill(e)}</td><td><a class="linkbtn" href="/finance/expenses/${e.id}">Edit</a></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : `<div class="empty">Nothing logged yet.</div>`;
  const models = p.models.length
    ? `<table class="ftable"><thead><tr><th class="l">From</th><th class="l">Model</th><th class="l">Note</th><th></th></tr></thead><tbody>${p.models
        .map((m) => `<tr><td class="l">${esc(usDay(m.effectiveFrom))}</td><td class="l">${esc(describePay(m))}${m === cur ? ' <span class="fpill paid">current</span>' : ""}</td><td class="l"><small>${esc(m.note)}</small></td>
          <td><form method="post" action="/finance/contractors/${p.id}/model/${m.id}/delete"><button class="linkbtn danger">Remove</button></form></td></tr>`)
        .join("")}</tbody></table>`
    : `<div class="empty">No pay model yet.</div>`;
  const body = `${saved(d.msg)}${tiles}${voiceBox("contractor", `/finance/contractors/${p.id}`, d.voice.filter((n) => n.entries.some((x) => x.entry.person?.toLowerCase() === p.name.toLowerCase())))}${pipe}
    <section class="panel"><h2>Log work</h2>${logForm}</section>
    <div class="fgrid2"><section class="panel"><h2>Pay model <span class="sub">— lives here, not on each expense</span></h2>${modelForm(p)}</section>
      <section class="panel"><h2>Pay history <span class="sub">— a new model never rewrites old work</span></h2>${models}<h2 style="margin-top:18px">Advance</h2>${advForm}</section></div>
    <section class="panel"><h2>Recent work &amp; payments</h2>${hist}</section>
    <section class="panel"><h2>Profile</h2><form class="fform" method="post" action="/finance/contractors/${p.id}/profile">
      <label>Name<input name="name" required value="${esc(p.name)}"></label><label>Role<input name="role" value="${esc(p.role)}"></label>
      <label class="w2">Notes<input name="notes" value="${esc(p.notes)}"></label>
      <label class="chk"><input type="checkbox" name="active" value="1"${p.active ? " checked" : ""}> Active</label>
      <div class="fbtns"><button class="clear secondary">Save profile</button></div></form></section>`;
  return financePage(shell, "contractors", p.name, body);
}

export const modelSummary = (m: PayModel | null) => describePay(m);

// ── settings ───────────────────────────────────────────────────────────────

export function renderFinanceSettings(shell: Shell, d: { lists: Lists; thresholds: Thresholds; msg: string }): string {
  const { lists, thresholds: t } = d;
  const listEditor = (title: string, sub: string, table: string, items: Array<{ id: string; label: string; archived: boolean; extra?: string; colour?: string }>, addForm: string) =>
    `<section class="panel"><h2>${esc(title)} <span class="sub">— ${esc(sub)}</span></h2>
      <div class="fbars" style="gap:4px">${items
        .map(
          (i) => `<form class="ffilters" method="post" action="/finance/settings/list" style="margin:0${i.archived ? ";opacity:.5" : ""}">
          <input type="hidden" name="table" value="${table}"><input type="hidden" name="id" value="${esc(i.id)}">
          ${i.colour ? `<span class="fch" style="--ch:${i.colour};margin:0"><i></i></span>` : ""}<input name="label" value="${esc(i.label)}" style="flex:1" aria-label="Name">${i.extra ?? ""}
          <button class="linkbtn" name="do" value="rename">Save</button><button class="linkbtn${i.archived ? "" : " danger"}" name="do" value="${i.archived ? "restore" : "archive"}">${i.archived ? "Restore" : "Archive"}</button></form>`,
        )
        .join("") || `<div class="empty">None yet.</div>`}</div>
      <div style="margin-top:12px">${addForm}</div></section>`;
  const companies = listEditor("Companies / LLCs", "every income and expense can belong to one", "fin_companies", lists.companies.map((c) => ({ id: String(c.id), label: c.name, archived: c.archived })),
    `<form class="ffilters" method="post" action="/finance/settings/company"><input name="name" required placeholder="Specular Industries LLC"><button class="clear secondary">Add company</button></form>`);
  const channelCompanies = lists.companies.length
    ? `<section class="panel"><h2>Which company each channel belongs to <span class="sub">— its income and costs default to it</span></h2>
      <form method="post" action="/finance/settings/channels"><div class="fsplitgrid">${CATEGORIES.map((c) => {
        const list = CHANNELS.filter((ch) => ch.category === c.id);
        return list.length
          ? `<fieldset><legend>${esc(c.label)}</legend>${list
              .map((ch) => `<label class="fsplit" style="--ch:${ch.color};grid-template-columns:8px minmax(0,1fr) 130px"><i></i><span>${esc(ch.name.replace(/^Specular (?=.)/, ""))}</span>
                <select name="c:${esc(ch.name)}" style="padding:5px 7px;border-radius:8px;border:0;background:var(--card);color:var(--ink);font:inherit;font-size:12px">${opt("", "—", !lists.channelCompany.has(ch.name))}${lists.companies.filter((x) => !x.archived).map((x) => opt(x.id, x.name, lists.channelCompany.get(ch.name) === x.id)).join("")}</select></label>`)
              .join("")}</fieldset>`
          : "";
      }).join("")}</div><div class="setsave"><button class="clear">Save channels</button></div></form></section>`
    : "";
  const cats = listEditor("Expense categories", "what an expense was for — separate from its channel", "fin_categories", lists.categories.map((c) => ({ id: c.id, label: c.label, archived: c.archived, colour: c.colour })),
    `<form class="ffilters" method="post" action="/finance/settings/category"><input name="label" required placeholder="New category"><input type="color" name="colour" value="#8f8fa0" aria-label="Colour" style="width:44px;padding:2px"><button class="clear secondary">Add category</button></form>`);
  const streams = listEditor("Revenue streams", "tick the ones an RPM is worked out from (AdSense)", "fin_streams",
    lists.streams.map((s) => ({ id: s.id, label: s.label, archived: s.archived, colour: s.colour, extra: `<label class="chk" style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--ink2)"><input type="checkbox" name="platform" value="1"${s.platform ? " checked" : ""}> RPM</label>` })),
    `<form class="ffilters" method="post" action="/finance/settings/stream"><input name="label" required placeholder="New stream — e.g. Patreon"><label class="chk" style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--ink2)"><input type="checkbox" name="platform" value="1"> counts toward RPM</label><button class="clear secondary">Add stream</button></form>`);
  const methods = listEditor("Payment methods", "how an expense was paid", "fin_methods", lists.methods.map((m) => ({ id: String(m.id), label: m.label, archived: m.archived })),
    `<form class="ffilters" method="post" action="/finance/settings/method"><input name="label" required placeholder="Chase business card, PayPal, Wise…"><button class="clear secondary">Add method</button></form>`);
  const flagBoxes = FLAGS.filter((f) => !["healthy", "no_data"].includes(f.id))
    .map((f) => `<label class="chk"><input type="checkbox" name="dash" value="${f.id}"${t.dashboard.includes(f.id) ? " checked" : ""}> ${esc(f.label)}</label>`)
    .join("");
  const thresholds = `<section class="panel" id="thresholds"><h2>Sustainability thresholds <span class="sub">— what counts as Healthy, Low Margin, Declining, Loss, Low Return on Time. Informational only: nothing changes because of them.</span></h2>
    <form class="fform" method="post" action="/finance/settings/thresholds">
      <label>Healthy at a margin of (%)<input name="healthy" inputmode="decimal" value="${Math.round(t.healthyMargin * 100)}"></label>
      <label>Low Margin below (%)<input name="min_margin" inputmode="decimal" value="${Math.round(t.minMargin * 100)}"></label>
      <label>Low Return on Time below ($ / owner hour)<input name="per_hour" inputmode="decimal" value="${dollars(t.minProfitPerHour)}"></label>
      <label>Persistent Loss after (months in a row)<input name="loss_months" inputmode="numeric" value="${t.lossMonths}"></label>
      <label>Declining after (months falling)<input name="decline_months" inputmode="numeric" value="${t.declineMonths}"></label>
      <div class="w4"><div class="fnote" style="margin:0 0 6px">Show these on the main dashboard:</div><div style="display:flex;gap:16px;flex-wrap:wrap">${flagBoxes}</div></div>
      <div class="fbtns"><button class="clear">Save thresholds</button></div>
    </form></section>`;
  const body = `${saved(d.msg)}${thresholds}<div class="fgrid2">${companies}${methods}</div>${channelCompanies}<div class="fgrid2">${cats}${streams}</div>`;
  return financePage(shell, "settings", "Settings", body);
}
