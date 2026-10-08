/**
 * The pieces every Finance page is built from: its own tab bar inside the
 * board, a month switcher, money that reads + / −, bar lists, the trend
 * chart, flag pills, and the channel split editor.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { addMonths, fmtMoney, fmtPct, monthLabel } from "../../finance/money.js";
import { FLAG, type Flag } from "../../finance/metrics.js";
import { TIP_SCRIPT, channelColour, layout, niceStep, pageHeader, type Shell } from "../page.js";
import { esc } from "../html.js";

export const FIN_TABS = [
  { id: "overview", label: "Overview", href: "/finance" },
  { id: "income", label: "Income", href: "/finance/income" },
  { id: "expenses", label: "Expenses", href: "/finance/expenses" },
  { id: "subscriptions", label: "Subscriptions", href: "/finance/subscriptions" },
  { id: "contractors", label: "Contractors", href: "/finance/contractors" },
  { id: "channels", label: "Channels", href: "/finance/channels" },
  { id: "reports", label: "Reports", href: "/finance/reports" },
  { id: "settings", label: "Settings", href: "/finance/settings" },
] as const;
export type FinTab = (typeof FIN_TABS)[number]["id"];

/** A Finance page: the board's shell, Finance's own tabs, then the page. */
export function financePage(shell: Shell, tab: FinTab, title: string, body: string, extra = ""): string {
  const nav = `<nav class="fnav" aria-label="Finance">${FIN_TABS.map(
    (t) => `<a href="${t.href}"${t.id === tab ? ' class="on" aria-current="page"' : ""}>${esc(t.label)}</a>`,
  ).join("")}</nav>`;
  return layout(`${title} · Finance`, shell, `${pageHeader(title === "Finance" ? "Finance" : `Finance · ${title}`, extra)}${nav}<style>${FIN_CSS}</style>${body}${TIP_SCRIPT}`);
}

/** ‹ September 2026 › — each side a link to the month before or after. */
export function monthSwitch(month: string, href: (m: string) => string): string {
  return `<div class="fmonth"><a href="${esc(href(addMonths(month, -1)))}" aria-label="Previous month">‹</a><b>${esc(monthLabel(month))}</b><a href="${esc(href(addMonths(month, 1)))}" aria-label="Next month">›</a></div>`;
}

/** Money as a cell: positive and negative read differently, never by colour alone. */
export function money(cents: number, opts: { sign?: boolean; compact?: boolean; muted?: boolean } = {}): string {
  const cls = opts.sign ? (cents > 0 ? "pos" : cents < 0 ? "neg" : "") : "";
  return `<span class="m${cls ? ` ${cls}` : ""}${opts.muted ? " mut" : ""}">${esc(fmtMoney(cents, { sign: opts.sign, compact: opts.compact }))}</span>`;
}

export const pct = (x: number | null) => `<span class="m${x !== null && x < 0 ? " neg" : ""}">${esc(fmtPct(x))}</span>`;

/** A figure tile: the big number, its label, and an optional line under it. */
export function tile(value: string, label: string, sub = "", tone = ""): string {
  return `<div class="ftile${tone ? ` ${tone}` : ""}"><div class="fv">${value}</div><div class="fl">${esc(label)}</div>${sub ? `<div class="fs">${sub}</div>` : ""}</div>`;
}

/** A ranked list of bars: label, a bar sized to the largest, the amount, and its share. */
export function barList(rows: Array<{ label: string; value: number; colour: string; href?: string; note?: string }>, opts: { total?: number; empty?: string } = {}): string {
  const list = rows.filter((r) => r.value !== 0).sort((a, b) => b.value - a.value);
  if (!list.length) return `<div class="empty">${esc(opts.empty ?? "Nothing yet.")}</div>`;
  const max = Math.max(...list.map((r) => Math.abs(r.value)));
  const total = opts.total ?? list.reduce((a, r) => a + r.value, 0);
  return `<div class="fbars">${list
    .map((r) => {
      const name = r.href ? `<a href="${esc(r.href)}">${esc(r.label)}</a>` : esc(r.label);
      return `<div class="fbar" style="--c:${r.colour}"><span class="fbn"><i></i>${name}${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>
        <span class="fbt"><i style="width:${((Math.abs(r.value) / max) * 100).toFixed(1)}%"></i></span>
        <span class="fba">${money(r.value)}</span><span class="fbp">${total ? esc(fmtPct(r.value / total, 0)) : ""}</span></div>`;
    })
    .join("")}</div>`;
}

/** A sustainability flag as a pill: an icon and its name, the colour only backing it up. */
export function flagPill(f: Pick<Flag, "id" | "why">): string {
  const d = FLAG.get(f.id)!;
  const icon = d.tone === "ok" ? "✓" : d.tone === "late" ? "▼" : d.tone === "warn" ? "⚠" : "·";
  return `<span class="fflag ${d.tone}" title="${esc(f.why)}">${icon} ${esc(d.label)}</span>`;
}

/** A flag as an alert card: what, why, and the figures behind it. */
export function flagCard(channel: string, f: Flag, href: string, also: Flag[] = []): string {
  const d = FLAG.get(f.id)!;
  return `<a class="falert ${d.tone}" href="${esc(href)}" style="--ch:${channelColour(channel)}">
    <div class="fah">${flagPill(f)}<b>${esc(channel)}</b>${also.map((x) => flagPill(x)).join("")}</div>
    <div class="faw">${esc(f.why)}</div>
    ${f.figures.length ? `<dl>${f.figures.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
  </a>`;
}

/**
 * The main dashboard's Finance strip: each alert as a card with its figures.
 * Carries its own styles — the dashboard doesn't load Finance's.
 */
export function dashboardAlerts(alerts: Array<{ channel: string; flag: Flag; month: string }>): string {
  if (!alerts.length) return "";
  const shown = groupAlerts(alerts).slice(0, 6);
  return `<section class="panel finstrip"><h2>Finance <span class="sub">— ${esc(monthLabel(alerts[0]!.month))}, against your thresholds</span><span class="fh-r"><a href="/finance">Open Finance →</a></span></h2>
    <style>${ALERT_CSS}</style>
    <div class="falerts">${shown.map((a) => flagCard(a.channel, a.flags[0]!, `/finance/channels/${encodeURIComponent(a.channel)}?m=${a.month}`, a.flags.slice(1))).join("")}</div>
    ${groupAlerts(alerts).length > shown.length ? `<p class="fnote"><a href="/finance/channels">${groupAlerts(alerts).length - shown.length} more →</a></p>` : ""}
  </section>`;
}

/** One entry per channel, its most serious flag first (the list arrives most serious first). */
export function groupAlerts<T extends { channel: string; flag: Flag }>(alerts: T[]): Array<T & { flags: Flag[] }> {
  const by = new Map<string, T & { flags: Flag[] }>();
  for (const a of alerts) {
    const g = by.get(a.channel);
    if (g) g.flags.push(a.flag);
    else by.set(a.channel, { ...a, flags: [a.flag] });
  }
  return [...by.values()];
}

// ── the trend chart ────────────────────────────────────────────────────────

/** Revenue, expenses, profit: aqua, orange, blue — validated for the dark surface, colourblind-safe as a set. */
export const SERIES = { revenue: "#199e70", expenses: "#d95926", profit: "#3987e5" } as const;

/**
 * Revenue and expenses as paired bars per month, profit as a line — one
 * dollar axis. Every month has a hover target with all three figures.
 */
export function trendChart(points: Array<{ month: string; revenue: number; expenses: number; profit: number }>, opts: { height?: number; label?: string } = {}): string {
  if (!points.some((p) => p.revenue || p.expenses)) return `<div class="empty">No revenue or expenses in these months yet.</div>`;
  const W = 720, H = opts.height ?? 220, L = 52, R = 10, T = 12, B = 26;
  const vals = points.flatMap((p) => [p.revenue, p.expenses, p.profit]);
  const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
  const step = niceStep((hi - lo) / 4);
  const top = Math.ceil(hi / step) * step || step, bot = Math.floor(lo / step) * step;
  const y = (v: number) => T + ((top - v) / (top - bot)) * (H - T - B);
  const bw = (W - L - R) / points.length;
  const bar = Math.max(3, Math.min(16, bw * 0.3));
  const ticks: number[] = [];
  for (let v = bot; v <= top + 1; v += step) ticks.push(v);
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v === 0 ? "zero" : "grid"}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" class="ax" text-anchor="end">${esc(fmtMoney(v, { compact: true }))}</text>`).join("");
  const rect = (x: number, v: number, c: string) => {
    const y0 = y(Math.max(0, v)), h = Math.max(1, Math.abs(y(v) - y(0)));
    return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${c}"/>`;
  };
  const cols = points.map((p, i) => {
    const cx = L + bw * i + bw / 2;
    const tip = `${monthLabel(p.month)}|Revenue ${fmtMoney(p.revenue)}|Expenses ${fmtMoney(p.expenses)}|Profit ${fmtMoney(p.profit, { sign: true })}${p.revenue ? ` · ${fmtPct(p.profit / p.revenue)}` : ""}`;
    return `<g>${rect(cx - bar - 1, p.revenue, SERIES.revenue)}${rect(cx + 1, p.expenses, SERIES.expenses)}
      <text x="${cx.toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(monthLabel(p.month, points.length > 8 ? "short" : "shortYear"))}</text>
      <rect class="hit" x="${(L + bw * i).toFixed(1)}" y="${T}" width="${bw.toFixed(1)}" height="${H - T - B}" data-tip="${esc(tip)}"/></g>`;
  }).join("");
  const line = points.map((p, i) => `${(L + bw * i + bw / 2).toFixed(1)},${y(p.profit).toFixed(1)}`).join(" ");
  const dots = points.map((p, i) => `<circle cx="${(L + bw * i + bw / 2).toFixed(1)}" cy="${y(p.profit).toFixed(1)}" r="4" fill="${SERIES.profit}" stroke="#18181C" stroke-width="2"/>`).join("");
  return `<figure class="fchart">
    <div class="flegend"><span style="--c:${SERIES.revenue}"><i></i>Revenue</span><span style="--c:${SERIES.expenses}"><i></i>Expenses</span><span class="ln" style="--c:${SERIES.profit}"><i></i>Profit</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label ?? "Revenue, expenses and profit by month")}" preserveAspectRatio="none">${grid}${cols}
      <polyline points="${line}" fill="none" stroke="${SERIES.profit}" stroke-width="2" stroke-linejoin="round" pointer-events="none"/><g pointer-events="none">${dots}</g></svg>
  </figure>`;
}



// ── voice notes ────────────────────────────────────────────────────────────

/** How a field reads to a person: "next_bill" → "next bill". */
export const fieldName = (f: string) => ({ next_bill: "next bill", expense_type: "type", pay_model: "pay model", payee: "who / vendor" } as Record<string, string>)[f] ?? f.replace(/_/g, " ");

/** A row that came from a voice note and guessed at something: an amber mark saying what to check. */
export function checkMark(review: string[] | undefined): string {
  if (!review?.length) return "";
  return ` <span class="fcheck" title="From a voice note — check ${esc(review.map(fieldName).join(", "))}">● check ${esc(review.map(fieldName).slice(0, 2).join(", "))}${review.length > 2 ? "…" : ""}</span>`;
}

const MIC_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3"/><path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5"/></svg>`;

const VOICE_HINT: Record<string, string> = {
  expense: "“Paid Divas 250 for the Anime edit on the Chase card” · “Bought a mic for 180 yesterday”",
  income: "“September AdSense was 8 thousand on Studios” · “NordVPN paid 1,000 for the Studios sponsorship”",
  subscription: "“Adobe is 90 a month, next bill October 3rd” · “Epidemic Sound, 299 a year, for music”",
  contractor: "“Divas did two Anime edits, 12 and 14 minutes” · “Gave Vyasa a 5k advance” · “Divas is 12 a minute now”",
};

/**
 * A tab's voice box: say it (the browser transcribes), or type it, and it's
 * logged. Below, recent notes and what came of each entry — logged, logged
 * but guessing at something (amber), or missing something it needs (red).
 */
export function voiceBox(tab: string, back: string, notes: import("../../db/finance.js").VoiceNote[]): string {
  const items = notes
    .map((n) => {
      const rows = n.entries
        .map((x, i) => {
          const state = x.logged ? (x.entry.unsure.length && !x.checked ? "unsure" : "ok") : "missing";
          const act = (path: string, label: string, cls = "linkbtn") => `<form method="post" action="/finance/voice/${n.id}/${i}/${path}"><input type="hidden" name="back" value="${esc(back)}"><button class="${cls}">${esc(label)}</button></form>`;
          const unknownPerson = x.missing.includes("person") && x.entry.person;
          const fill = x.logged ? "" : fillHref(n.tab, n.id, i, x.entry.person);
          return `<div class="fvent ${state}">
            <span class="fvdot" aria-hidden="true"></span>
            <div class="fvtxt"><b>${esc(x.logged?.label ?? x.entry.summary)}</b>
              ${state === "unsure" ? `<small>Check: ${esc(x.entry.unsure.map(fieldName).join(", "))}</small>` : ""}
              ${state === "missing" ? `<small>Needs: ${esc(x.missing.map(fieldName).join(", "))}${unknownPerson ? ` — “${esc(x.entry.person!)}” isn't on the board yet` : ""}</small>` : ""}
              ${state === "ok" ? `<small>${x.checked ? "Checked" : "Logged"}</small>` : ""}
            </div>
            <div class="fvacts">${x.logged && x.logged.type !== "person" ? `<a class="linkbtn" href="${esc(loggedHref(x.logged))}">Open</a>` : ""}
              ${state === "unsure" ? act("ok", "Looks right ✓") : ""}
              ${unknownPerson ? act("person", `Add ${x.entry.person} & log`, "linkbtn strong") : ""}
              ${fill ? `<a class="linkbtn strong" href="${esc(fill)}">Fill in</a>` : ""}</div>
          </div>`;
        })
        .join("");
      return `<div class="fvnote"><div class="fvq"><span>“${esc(n.transcript.length > 180 ? `${n.transcript.slice(0, 177)}…` : n.transcript)}”</span>
          <form method="post" action="/finance/voice/${n.id}/dismiss"><input type="hidden" name="back" value="${esc(back)}"><button class="linkbtn" title="Hide this note (what it logged stays)" aria-label="Hide note">×</button></form></div>
        ${rows || `<div class="fvent missing"><span class="fvdot"></span><div class="fvtxt"><b>Nothing to log was found in that.</b></div></div>`}</div>`;
    })
    .join("");
  return `<section class="panel fvoice" data-voice>
    <form method="post" action="/finance/voice" data-voice-form>
      <input type="hidden" name="tab" value="${esc(tab)}"><input type="hidden" name="back" value="${esc(back)}">
      <div class="fvrow">
        <button type="button" class="fmic" data-mic aria-label="Record a voice note" title="Record — tap again to stop and log">${MIC_ICON}</button>
        <textarea name="text" rows="2" required maxlength="4000" placeholder="Say or type it — ${esc(VOICE_HINT[tab] ?? "")}" aria-label="Voice note"></textarea>
        <button class="clear" data-voice-send>Log it</button>
      </div>
      <p class="fvstatus" data-vstatus aria-live="polite"></p>
    </form>
    ${items ? `<div class="fvnotes">${items}</div>` : ""}
  </section>
  <script>
  (function () {
    var box = document.querySelector("[data-voice]"); if (!box) return;
    var form = box.querySelector("[data-voice-form]"), ta = form.querySelector("textarea"), mic = form.querySelector("[data-mic]"), status = form.querySelector("[data-vstatus]");
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { mic.hidden = true; status.textContent = "Tip: tap the microphone on your keyboard to dictate."; return; }
    var rec = null, base = "", stopped = false;
    function stop() { stopped = true; if (rec) rec.stop(); }
    mic.addEventListener("click", function () {
      if (rec) { stop(); return; }
      rec = new SR(); rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
      base = ta.value ? ta.value.trim() + " " : ""; stopped = false;
      rec.onresult = function (e) {
        var done = "", live = "";
        for (var i = 0; i < e.results.length; i++) { if (e.results[i].isFinal) done += e.results[i][0].transcript; else live += e.results[i][0].transcript; }
        ta.value = (base + done).trim(); status.textContent = live ? "… " + live : "Listening — tap the mic again when you're done.";
      };
      rec.onerror = function (e) { status.textContent = e.error === "not-allowed" ? "Microphone blocked — allow it for this site, or type instead." : "Couldn't hear that (" + e.error + ")."; };
      rec.onend = function () {
        rec = null; box.classList.remove("rec");
        if (ta.value.trim()) { status.textContent = "Logging…"; form.submit(); }
        else if (!stopped) status.textContent = "Didn't catch anything — try again.";
      };
      rec.start(); box.classList.add("rec"); status.textContent = "Listening — tap the mic again when you're done.";
    });
    form.addEventListener("submit", function () { status.textContent = "Logging…"; });
  })();
  </script>`;
}

/** Where a logged entry lives. */
export function loggedHref(l: { type: string; id: number }): string {
  return l.type === "expense" ? `/finance/expenses/${l.id}` : l.type === "income" ? `/finance/income#i${l.id}` : l.type === "recurring" ? `/finance/subscriptions?edit=${l.id}#edit` : `/finance/contractors/${l.id}`;
}

/** Where a draft is finished: its tab's form, filled in from the note. */
function fillHref(tab: string, id: number, i: number, person: string | null): string {
  const v = `voice=${id}:${i}`;
  if (tab === "expense") return `/finance/expenses/new?${v}`;
  if (tab === "income") return `/finance/income?${v}#add`;
  if (tab === "subscription") return `/finance/subscriptions?${v}#edit`;
  return person ? "/finance/contractors" : "/finance/contractors#add";
}

// ── form pieces ────────────────────────────────────────────────────────────

export const opt = (value: string | number, label: string, selected: boolean) =>
  `<option value="${esc(String(value))}"${selected ? " selected" : ""}>${esc(label)}</option>`;

/** Every channel, grouped by category, with General first when asked for. */
export function channelSelect(name: string, selected: string | null, opts: { general?: string; any?: string } = {}): string {
  const groups = CATEGORIES.map((c) => {
    const list = CHANNELS.filter((ch) => ch.category === c.id);
    return list.length ? `<optgroup label="${esc(c.label)}">${list.map((ch) => opt(ch.name, ch.name, ch.name === selected)).join("")}</optgroup>` : "";
  }).join("");
  return `<select name="${esc(name)}">${opts.any !== undefined ? opt("", opts.any, !selected) : ""}${opts.general !== undefined ? opt("general", opts.general, selected === "general" || (opts.any === undefined && !selected)) : ""}${groups}</select>`;
}

/**
 * Several channels at once, compactly: a summary line that opens to every
 * channel as a pill, grouped by category. Ticked ones submit as `name`.
 */
export function channelChips(name: string, selected: string[], opts: { none?: string } = {}): string {
  const on = new Set(selected);
  const label = (list: string[]) => (list.length ? list.map((c) => c.replace(/^Specular (?=.)/, "")).join(", ") : opts.none ?? "None");
  const groups = CATEGORIES.map((c) => {
    const list = CHANNELS.filter((ch) => ch.category === c.id);
    return list.length
      ? `<div class="fchipgrp"><span>${esc(c.label)}</span>${list
          .map((ch) => `<label class="fchip2" style="--ch:${ch.color}"><input type="checkbox" name="${esc(name)}" value="${esc(ch.name)}"${on.has(ch.name) ? " checked" : ""}><i></i>${esc(ch.name.replace(/^Specular (?=.)/, ""))}</label>`)
          .join("")}</div>`
      : "";
  }).join("");
  return `<details class="fchips" data-chips data-none="${esc(opts.none ?? "None")}"><summary><span data-chips-label>${esc(label(selected))}</span> <b>▾</b></summary><div class="fchipbox">${groups}</div></details>`;
}

/** Keeps every channelChips summary in step with what's ticked. Include once per page. */
export const CHIPS_SCRIPT = `<script>
(function () {
  document.querySelectorAll("[data-chips]").forEach(function (d) {
    var out = d.querySelector("[data-chips-label]");
    d.addEventListener("change", function () {
      var names = [];
      d.querySelectorAll("input:checked").forEach(function (i) { names.push(i.value.replace(/^Specular (?=.)/, "")); });
      out.textContent = names.length ? names.join(", ") : d.getAttribute("data-none");
    });
  });
})();
</script>`;

/**
 * Which channels an expense belongs to. None ticked is General /
 * network-wide; several share it by their weights (equal by default).
 */
export function splitEditor(splits: Array<{ channel: string; weight: number }>): string {
  const on = new Map(splits.map((s) => [s.channel, s.weight]));
  const total = splits.reduce((a, s) => a + s.weight, 0);
  const groups = CATEGORIES.map((c) => {
    const list = CHANNELS.filter((ch) => ch.category === c.id);
    if (!list.length) return "";
    return `<fieldset><legend>${esc(c.label)}</legend>${list
      .map((ch) => {
        const w = on.get(ch.name);
        return `<label class="fsplit${w ? " on" : ""}" style="--ch:${ch.color}"><input type="checkbox" name="ch" value="${esc(ch.name)}"${w ? " checked" : ""}><i></i><span>${esc(ch.name.replace(/^Specular (?=.)/, ""))}</span>
          <input type="number" name="w:${esc(ch.name)}" min="0.01" step="any" value="${w ? +(total ? (w / total) * 100 : 100).toFixed(2) : ""}" placeholder="%" aria-label="${esc(ch.name)} share, percent"></label>`;
      })
      .join("")}</fieldset>`;
  }).join("");
  return `<div class="fsplits" data-splits>
    <p class="hint" style="margin:0 0 8px">Tick the channels this belongs to — none is <b>General / network-wide</b>. Several split it evenly unless you give each a %. <span class="fsplitsum" data-sum></span></p>
    <div class="fsplitgrid">${groups}</div>
  </div>
  <script>
  (function () {
    var box = document.querySelector("[data-splits]");
    if (!box) return;
    function sync() {
      var ticked = box.querySelectorAll('input[type=checkbox]:checked'), sum = 0, blanks = 0;
      box.querySelectorAll(".fsplit").forEach(function (l) {
        var c = l.querySelector("input[type=checkbox]"), w = l.querySelector("input[type=number]");
        l.classList.toggle("on", c.checked);
        if (c.checked) { if (w.value) sum += Number(w.value); else blanks++; }
      });
      var out = box.querySelector("[data-sum]");
      out.textContent = !ticked.length ? "Now: General." : ticked.length === 1 ? "Now: all to one channel." : blanks === ticked.length ? "Now: split evenly across " + ticked.length + "." : "Now: " + Math.round(sum) + "% given" + (blanks ? ", " + blanks + " share the rest" : "") + ".";
    }
    box.addEventListener("input", sync);
    box.addEventListener("change", function (e) {
      var l = e.target.closest(".fsplit");
      if (l && e.target.type === "number" && e.target.value) l.querySelector("input[type=checkbox]").checked = true;
      sync();
    });
    sync();
  })();
  </script>`;
}

/**
 * Splits from a submitted form: ticked channels, each with its %; blanks share
 * what's left evenly. Nothing ticked → General.
 */
export function readSplits(body: Record<string, unknown>): Array<{ channel: string; weight: number }> {
  const raw = body.ch;
  const names = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter((c) => CHANNELS.some((ch) => ch.name === c));
  if (!names.length) return [];
  const given = names.map((c) => ({ channel: c, w: Number(body[`w:${c}`]) }));
  const set = given.filter((g) => Number.isFinite(g.w) && g.w > 0);
  const blanks = given.filter((g) => !(Number.isFinite(g.w) && g.w > 0));
  if (!set.length) return names.map((c) => ({ channel: c, weight: 1 }));
  const used = set.reduce((a, g) => a + g.w, 0);
  const each = blanks.length ? Math.max(0, 100 - used) / blanks.length : 0;
  return [...set.map((g) => ({ channel: g.channel, weight: g.w })), ...blanks.filter(() => each > 0).map((g) => ({ channel: g.channel, weight: each }))];
}

/** "Specular Anime · Specular FNAF (60/40)" — or General. */
export function splitsText(splits: Array<{ channel: string; weight: number }>): string {
  if (!splits.length) return `<span class="fgen">General</span>`;
  const total = splits.reduce((a, s) => a + s.weight, 0);
  const even = splits.every((s) => Math.abs(s.weight - splits[0]!.weight) < 1e-9);
  return splits
    .map((s) => `<span class="fch" style="--ch:${channelColour(s.channel)}"><i></i>${esc(s.channel.replace(/^Specular (?=.)/, ""))}${splits.length > 1 && !even ? ` <small>${Math.round((s.weight / total) * 100)}%</small>` : ""}</span>`)
    .join("");
}

/** Alert cards and flag pills — used on Finance pages and the main dashboard. */
const ALERT_CSS = `
.fflag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; }
.fflag.ok { background: rgba(86,201,144,.16); color: #8FE3B6; }
.fflag.warn { background: rgba(238,154,85,.16); color: #F5B98A; }
.fflag.late { background: rgba(242,104,94,.18); color: #FF9C94; }
.fflag.dim { background: var(--sunk); color: var(--ink3); }
.falerts { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.falert { display: block; padding: 14px 16px; border-radius: 16px; background: var(--sunk); box-shadow: inset 3px 0 0 var(--ch); color: var(--ink); }
.falert:hover { background: var(--raised); }
.falert .fah { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.falert .fah b { font-family: var(--display); font-size: 14.5px; }
.falert .faw { margin-top: 6px; font-size: 12.5px; color: var(--ink2); }
.falert dl { margin: 10px 0 0; display: grid; gap: 3px; }
.falert dl div { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
.falert dt { color: var(--ink3); } .falert dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.panel h2 .fh-r { float: right; font-family: var(--ui); font-size: 12.5px; font-weight: 700; letter-spacing: 0; }
.panel h2 .fh-r a { color: var(--ink2); } .panel h2 .fh-r a:hover { color: var(--ink); }
.fnote { font-size: 12px; color: var(--ink3); margin: 10px 0 0; }
`;

const FIN_CSS = ALERT_CSS + `
.fnav { display: flex; gap: 4px; flex-wrap: wrap; margin: -4px 0 16px; padding: 5px; border-radius: 16px; background: var(--card); width: fit-content; max-width: 100%; }
.fnav a { padding: 8px 14px; border-radius: 11px; font-size: 13px; font-weight: 700; color: var(--ink2); white-space: nowrap; }
.fnav a:hover { background: var(--sunk); color: var(--ink); }
.fnav a.on { background: var(--salmon); color: #1A0F0C; }
.fmonth { display: inline-flex; align-items: center; gap: 4px; padding: 4px; border-radius: 999px; background: var(--card); }
.fmonth a { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; color: var(--ink2); font-size: 18px; font-weight: 700; }
.fmonth a:hover { background: var(--sunk); color: var(--ink); }
.fmonth b { font-family: var(--display); font-size: 14px; padding: 0 8px; white-space: nowrap; }
.m { font-variant-numeric: tabular-nums; white-space: nowrap; }
.m.pos { color: #7FE0AE; } .m.neg { color: #FF8F86; } .m.mut { color: var(--ink3); }
.ftiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.ftile { background: var(--card); border-radius: 22px; padding: 18px 20px; min-width: 0; }
.ftile .fv { font-family: var(--display); font-size: clamp(22px, 2.6vw, 34px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; }
.ftile .fl { margin-top: 6px; font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); }
.ftile .fs { margin-top: 6px; font-size: 12px; color: var(--ink3); }
.ftile .fv .txt { display: block; font-size: 20px; line-height: 1.2; }
.fform [hidden] { display: none !important; }
.ftile.hero { background: #F3E96C; color: #141414; } .ftile.hero .fl, .ftile.hero .fs { color: #4A4636; }
.ftile.hero .m.pos, .ftile.hero .m.neg { color: inherit; }
.fgrid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; align-items: start; }
.fgrid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; align-items: start; }
.fgrid2 > .panel, .fgrid3 > .panel { margin: 0; min-width: 0; }
.fbars { display: flex; flex-direction: column; gap: 7px; }
.fbar { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 88px 42px; align-items: center; gap: 10px; font-size: 13px; }
.fbn { display: flex; align-items: center; gap: 7px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-weight: 600; }
.fbn a { color: var(--ink); } .fbn a:hover { text-decoration: underline; }
.fbn i { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 1px var(--ring); }
.fbn small { color: var(--ink3); font-weight: 500; margin-left: 4px; }
.fbt { height: 8px; border-radius: 999px; background: #26262C; overflow: hidden; }
.fbt i { display: block; height: 100%; border-radius: 999px; background: var(--c); }
.fba { text-align: right; font-weight: 700; } .fbp { text-align: right; color: var(--ink3); font-size: 12px; font-variant-numeric: tabular-nums; }
.ftable { width: 100%; border-collapse: collapse; font-size: 13px; }
.ftable th { text-align: right; font-size: 10.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); padding: 6px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.ftable th:first-child, .ftable td:first-child { text-align: left; }
.ftable td { text-align: right; padding: 8px; border-bottom: 1px solid #26262C; vertical-align: middle; }
.ftable td.l, .ftable th.l { text-align: left; }
.ftable tr:hover td { background: rgba(255,255,255,.02); }
.ftable tfoot td { font-weight: 800; border-bottom: 0; border-top: 1px solid var(--line); }
.ftable .fchn { display: inline-flex; align-items: center; gap: 7px; font-weight: 650; color: var(--ink); }
.ftable .fchn i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.ftable a.fchn:hover { text-decoration: underline; }
.fscroll { overflow-x: auto; margin: 0 -4px; padding: 0 4px; }
.fch, .fgen { display: inline-flex; align-items: center; gap: 5px; margin-right: 8px; font-size: 12px; font-weight: 600; color: var(--ink2); white-space: nowrap; }
.fch i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.fch small { color: var(--ink3); }
.fgen { color: var(--ink3); font-style: italic; }
.fpill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; white-space: nowrap; background: var(--sunk); color: var(--ink2); }
.fpill.paid { background: rgba(86,201,144,.14); color: #8FE3B6; }
.fpill.unpaid { background: rgba(242,104,94,.16); color: #FF9C94; }
.fpill.covered { background: rgba(125,138,245,.18); color: #B4BCFF; }
.fpill.adv { background: rgba(243,233,108,.16); color: #F3E96C; }
.ffilters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.ffilters select, .ffilters input, .fform input, .fform select, .fform textarea {
  min-width: 0; padding: 9px 11px; border-radius: 10px; border: 1px solid transparent; background: var(--sunk); color: var(--ink);
  font: inherit; font-size: 13px; color-scheme: dark; }
.ffilters select:focus, .ffilters input:focus, .fform input:focus, .fform select:focus, .fform textarea:focus { outline: 0; border-color: var(--salmon); }
.fform { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 12px; align-items: end; }
.fform label { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; font-weight: 700; color: var(--ink3); min-width: 0; }
.fform label.w2 { grid-column: span 2; } .fform label.w4, .fform .w4 { grid-column: 1 / -1; }
.fform label.chk { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; color: var(--ink2); font-weight: 600; }
.fform label.chk input { width: 16px; height: 16px; }
.fform textarea { resize: vertical; min-height: 60px; }
.fform .fbtns { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.fform .fhint { grid-column: 1 / -1; font-size: 12px; color: var(--ink3); margin: -4px 0 0; }
.fsplitgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.fsplitgrid fieldset { border: 0; margin: 0; padding: 8px; border-radius: 12px; background: var(--sunk); }
.fsplitgrid legend { float: left; width: 100%; font-size: 10.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); padding: 0 4px 4px; }
.fsplit { clear: both; display: grid !important; grid-template-columns: 16px 8px minmax(0, 1fr) 62px; align-items: center; gap: 7px !important; padding: 4px; border-radius: 8px;
  font-size: 12.5px !important; font-weight: 600 !important; color: var(--ink2) !important; cursor: pointer; }
.fsplit.on { background: rgba(255,255,255,.05); color: var(--ink) !important; }
.fsplit > i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.fsplit span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fsplit input[type=number] { width: 62px; padding: 5px 7px !important; text-align: right; background: var(--card) !important; }
.fchips { position: relative; width: 100%; align-self: stretch; }
.fchips > summary { box-sizing: border-box; width: 100%; }
.fchips > summary { list-style: none; cursor: pointer; padding: 9px 11px; border-radius: 10px; background: var(--sunk); font-size: 13px; color: var(--ink); font-weight: 600;
  display: flex; justify-content: space-between; gap: 8px; }
.fchips > summary::-webkit-details-marker { display: none; }
.fchips > summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fchips > summary b { color: var(--ink3); }
.fchips[open] > summary { border: 1px solid var(--salmon); padding: 8px 10px; }
.fchipbox { margin-top: 6px; padding: 10px; border-radius: 12px; background: var(--sunk); display: flex; flex-direction: column; gap: 8px; }
.fchipgrp { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.fchipgrp > span { width: 100%; font-size: 10.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); }
.fchip2 { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 6px !important; padding: 5px 10px; border-radius: 999px; background: var(--card);
  font-size: 12px !important; font-weight: 600 !important; color: var(--ink2) !important; cursor: pointer; }
.fchip2 input { position: absolute; opacity: 0; width: 0; height: 0; }
.fchip2 i { width: 7px; height: 7px; border-radius: 50%; background: var(--ch); box-shadow: 0 0 0 1px var(--ring); }
.fchip2:has(input:checked) { background: color-mix(in srgb, var(--ch) 28%, var(--card)); color: var(--ink) !important; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ch) 70%, #fff); }
.fchip2:has(input:focus-visible) { outline: 2px solid var(--salmon); }
.fvoice { padding: 16px 18px; }
.fvrow { display: flex; gap: 10px; align-items: center; }
.fvrow textarea { flex: 1; min-width: 0; resize: vertical; padding: 11px 14px; border-radius: 14px; border: 1px solid transparent; background: var(--sunk); color: var(--ink);
  font: inherit; font-size: 14px; line-height: 1.4; }
.fvrow textarea:focus { outline: 0; border-color: var(--salmon); }
.fmic { flex: none; width: 48px; height: 48px; border-radius: 50%; border: 0; background: var(--salmon); color: #1A0F0C; cursor: pointer; display: grid; place-items: center; }
.fmic svg { width: 22px; height: 22px; }
.fvoice.rec .fmic { background: var(--late); color: #fff; animation: fvpulse 1.2s ease-in-out infinite; }
@keyframes fvpulse { 50% { box-shadow: 0 0 0 8px rgba(242,104,94,.25); } }
@media (prefers-reduced-motion: reduce) { .fvoice.rec .fmic { animation: none; } }
.fvstatus { margin: 8px 0 0 58px; font-size: 12.5px; color: var(--ink3); min-height: 1em; }
.fvstatus:empty { display: none; }
.fvnotes { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.fvnote { border-radius: 14px; background: var(--sunk); padding: 10px 12px; }
.fvq { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: var(--ink3); font-style: italic; }
.fvq span { flex: 1; }
.fvq form { margin: 0; } .fvq .linkbtn { font-size: 16px; line-height: 1; font-style: normal; }
.fvent { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 0 2px; }
.fvdot { width: 10px; height: 10px; border-radius: 50%; }
.fvent.ok .fvdot { background: var(--ok); }
.fvent.unsure .fvdot { background: var(--warn); box-shadow: 0 0 0 3px rgba(238,154,85,.2); }
.fvent.missing .fvdot { background: var(--late); box-shadow: 0 0 0 3px rgba(242,104,94,.2); }
.fvtxt { min-width: 0; font-size: 13px; }
.fvtxt b { font-weight: 650; color: var(--ink); }
.fvtxt small { display: block; font-size: 12px; margin-top: 1px; color: var(--ink3); }
.fvent.unsure small { color: #F5B98A; } .fvent.missing small { color: #FF9C94; }
.fvacts { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
.fvacts form { margin: 0; }
.linkbtn.strong { color: var(--salmon); }
.fcheck { display: inline-block; margin-left: 4px; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 800; white-space: nowrap;
  background: rgba(238,154,85,.16); color: #F5B98A; font-style: normal; vertical-align: 1px; }
.fform label[data-flag] { position: relative; }
.fform label[data-flag] > input, .fform label[data-flag] > select, .fform label[data-flag] > textarea, .fform label[data-flag] .fchips > summary, .fform label[data-flag] .fsplitgrid { box-shadow: 0 0 0 1.5px var(--fl); }
.fform label[data-flag="unsure"] { --fl: var(--warn); }
.fform label[data-flag="missing"] { --fl: var(--late); }
.fform label[data-flag]::after { content: attr(data-flag-text); position: absolute; top: 0; right: 0; font-size: 10.5px; font-weight: 800; color: var(--fl); }
.fvbanner { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; margin-bottom: 14px; background: rgba(238,154,85,.1);
  box-shadow: inset 3px 0 0 var(--warn); font-size: 13px; color: var(--ink2); }
.fvbanner b { color: var(--ink); }
@media (max-width: 760px) { .fvrow { flex-wrap: wrap; } .fvrow textarea { flex-basis: calc(100% - 58px); } .fvrow .clear { margin-left: 58px; } .fvstatus { margin-left: 0; } .fvent { grid-template-columns: 10px minmax(0, 1fr); } .fvacts { grid-column: 2; justify-content: flex-start; } }
.fsplitsum { color: var(--ink2); font-weight: 700; }
.fkv { display: grid; gap: 4px; margin: 0; }
.fkv div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid #26262C; font-size: 13.5px; }
.fkv div:last-child { border-bottom: 0; }
.fkv dt { color: var(--ink2); } .fkv dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; }
.fkv div.tot { border-top: 1px solid var(--line); border-bottom: 0; margin-top: 4px; padding-top: 9px; }
.fkv div.tot dt { color: var(--ink); font-weight: 800; } .fkv div.tot dd { font-size: 15px; }
.fbasis { margin: 10px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--ink2); }
.fbasis li { margin: 3px 0; }
.fwin { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: var(--card); }
.fwin a { padding: 6px 12px; border-radius: 999px; font-size: 12.5px; font-weight: 700; color: var(--ink2); }
.fwin a.on { background: var(--yellow); color: #111; }
.fheadrow { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
.fheadrow .sp { flex: 1; }
.fpipe { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border-radius: 16px; overflow: hidden; background: var(--sunk); }
.fpipe div { padding: 12px 14px; position: relative; }
.fpipe div + div { box-shadow: inset 1px 0 0 var(--line); }
.fpipe b { display: block; font-family: var(--display); font-size: 20px; font-variant-numeric: tabular-nums; }
.fpipe span { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); }
.flist-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
.flist-actions form { margin: 0; }
.linkbtn { background: none; border: 0; padding: 0; color: var(--ink2); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.linkbtn:hover { color: var(--ink); text-decoration: underline; }
.linkbtn.danger:hover { color: #FF8F86; }
.fgridin input { width: 110px; padding: 7px 9px; border-radius: 9px; border: 1px solid transparent; background: var(--sunk); color: var(--ink); font: inherit; font-size: 13.5px;
  font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; color-scheme: dark; }
.fgridin input::placeholder { font-weight: 500; color: #5E5E68; }
.fgridin input:focus { outline: 0; border-color: var(--salmon); }
.fgridcat td { padding-top: 16px !important; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); border-bottom: 0 !important; }
details.fedit > summary { list-style: none; cursor: pointer; }
details.fedit > summary::-webkit-details-marker { display: none; }
details.fedit[open] { background: var(--sunk); border-radius: 14px; padding: 12px; margin: 6px 0; }
@media (max-width: 1000px) {
  .ftiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fgrid2, .fgrid3 { grid-template-columns: minmax(0, 1fr); }
  .fform { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .fnav { flex-wrap: nowrap; overflow-x: auto; width: auto; scrollbar-width: none; }
  .fbar { grid-template-columns: minmax(0, 1fr) 70px 74px; } .fbar .fbp { display: none; }
  .fform { grid-template-columns: minmax(0, 1fr); } .fform label.w2 { grid-column: auto; }
  .fpipe { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .fpipe div:nth-child(3) { box-shadow: inset 0 1px 0 var(--line); } .fpipe div:nth-child(4) { box-shadow: inset 1px 0 0 var(--line), inset 0 1px 0 var(--line); }
  .ftable { font-size: 12.5px; }
}
`;
