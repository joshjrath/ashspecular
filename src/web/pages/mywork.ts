/**
 * Ash's own work: My Day (the load, timers, Focus, Do Ahead, the time log),
 * the VO Queue and recording mode, and Forgotten work.
 */
import { CHANNELS } from "../../catalog.js";
import { type DayLoad, type FocusPick, type Forgotten, LOG_RANGES, type LogRange, type LoggedDay, MYDAY_GROUPS, TYPE_BY_ID, VO_WPM, WORK_TYPES, type WorkItem, type WorkType, batchType, channelEstimate, isBatch, itemKey, readMinutes, remaining, typeEstimate, whyNow } from "../work.js";
import { ORG_TZ, instantIn, usDate } from "../../parse/derive.js";
import { PAUSE_ICON, PLAY_ICON, SCRIPT_ICON, type Shell, channelColour, fmtMin, gapStrip, layout, pageHeader, row } from "../page.js";
import { PRIORITY, TASK_CATEGORY } from "../../tasks/parse.js";
import type { UploadGap } from "../gaps.js";
import { esc, safeHref } from "../html.js";
import { scriptFor } from "../scriptindex.js";

export interface TimerState {
  recordId: number | null;
  taskId?: number | null;
  startedAt: Date;
  title: string;
  est: number;
  spentBefore: number;
}

/** The timer that's running, as a bar with a live clock, Stop and Done. */
export function timerBar(t: TimerState | null, back: string): string {
  if (!t) return "";
  return `<div class="timerbar" role="status">
    <span class="tdot"></span>
    <span class="tlabel">Timing <b>${esc(t.title)}</b></span>
    <span class="tclock" data-start="${t.startedAt.getTime()}" data-before="${Math.round(t.spentBefore * 60)}">0:00</span>
    <span class="test">of ${esc(fmtMin(t.est))} est.</span>
    <form method="post" action="/timer/stop"><input type="hidden" name="back" value="${esc(back)}"><button class="clear secondary">Stop</button></form>
    ${t.recordId || t.taskId ? `<form method="post" action="/timer/done"><input type="hidden" name="id" value="${t.taskId ?? t.recordId}">${t.taskId ? '<input type="hidden" name="kind" value="task">' : ""}<input type="hidden" name="back" value="${esc(back)}"><button class="clear">✓ Done</button></form>` : ""}
  </div>
  <script>
  (function () {
    var el = document.querySelector(".tclock");
    if (!el) return;
    var start = Number(el.getAttribute("data-start")), before = Number(el.getAttribute("data-before"));
    function tick() {
      var s = Math.max(0, Math.floor((Date.now() - start) / 1000) + before);
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      el.textContent = (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
    }
    tick();
    setInterval(tick, 1000);
  })();
  </script>`;
}

/** The running timer's key, as itemKey gives it: "r12" for a record, "t5" for a task. */
const runKey = (t: TimerState | null) => (t?.taskId ? `t${t.taskId}` : t?.recordId ? `r${t.recordId}` : null);

/** Where a piece of work opens: its record, or its task on the Tasks page. */
const workHref = (i: WorkItem) => (i.task ? `/tasks#t${i.id}` : i.id ? `/r/${i.id}` : "/recurring");

/** A piece of work as a row: its kind, what it is, why now, estimate vs tracked, and start / done. */
function workRow(i: WorkItem, now: Date, running: string | null, back: string, extra = ""): string {
  const t = TYPE_BY_ID.get(i.type)!;
  const pct = Math.min(100, Math.round((i.spent / i.est) * 100));
  const over = i.spent > i.est;
  const why = i.task && !i.due ? PRIORITY.get(i.task.priority)!.label.toLowerCase() : whyNow(i, now);
  const late = why.endsWith("late");
  const on = i.id !== null && running === itemKey(i);
  const kind = i.task ? '<input type="hidden" name="kind" value="task">' : "";
  if (i.task) {
    const c = TASK_CATEGORY.get(i.task.category)!;
    extra = `<span class="wtcat">${c.emoji} ${esc(c.label)}</span>${i.task.person ? `<span>${esc(i.task.person)}</span>` : ""}${extra}`;
  }
  return `<div class="wrow${on ? " on" : ""}${late ? " late" : ""}" style="--wc:${t.colour}">
    <span class="wtype">${esc(t.short)}</span>
    <div class="wmain">
      <a class="wt" href="${workHref(i)}">${esc(i.title)}</a>
      <div class="wmeta">${i.channel && !isBatch(i.type) && i.type !== "longform" ? `<span class="wch" style="--ch:${channelColour(i.channel)}"><i></i>${esc(i.channel.replace(/^Specular /, ""))}</span>` : ""}<span class="wwhy${late ? " late" : ""}">${esc(why)}</span>${extra}</div>
    </div>
    <div class="wtime" title="${esc(`${fmtMin(i.spent)} tracked of ${fmtMin(i.est)} estimated`)}">
      <span class="wbar"><i style="width:${pct}%"${over ? ' class="over"' : ""}></i></span>
      <span class="wnum">${i.spent >= 1 ? `${esc(fmtMin(i.spent))} / ` : ""}${esc(fmtMin(i.est))}</span>
    </div>
    <div class="wacts">${
      i.id === null
        ? `<span class="wproj" title="Opens on its day">not open yet</span>`
        : `${
            on
              ? `<form method="post" action="/timer/stop"><input type="hidden" name="back" value="${esc(back)}"><button class="wbtn on" title="Stop the timer">${PAUSE_ICON}</button></form>`
              : `<form method="post" action="/timer/start"><input type="hidden" name="id" value="${i.id}">${kind}<input type="hidden" name="back" value="${esc(back)}"><button class="wbtn" title="Start the timer">${PLAY_ICON}</button></form>`
          }<form method="post" action="/timer/done"><input type="hidden" name="id" value="${i.id}">${kind}<input type="hidden" name="back" value="${esc(back)}"><button class="wbtn ok" title="Done — clear it">✓</button></form>`
    }</div>
  </div>`;
}

/** 2:14 PM, from minutes after midnight. */
function clockOf(min: number): string {
  const m = Math.round(min) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const shortDay = (d: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
/** "VO 2h 10m · Revision 40m", biggest first. */
function typeSplit(byType: Partial<Record<WorkType, number>>): string {
  return WORK_TYPES.filter((t) => (byType[t.id] ?? 0) >= 1)
    .sort((a, b) => byType[b.id]! - byType[a.id]!)
    .map((t) => `${t.short} ${fmtMin(Math.round(byType[t.id]!))}`)
    .join(" · ");
}
/** Heatmap steps: one hue, darker to brighter as the day holds more. */
const LOG_HEAT = ["var(--sunk)", "#1D4A3E", "#1F6B52", "#2A9466", "#45BF80", "#8FE8B4"];
const heatStep = (min: number) => (min < 1 ? 0 : min < 30 ? 1 : min < 60 ? 2 : min < 120 ? 3 : min < 240 ? 4 : 5);
const HEAT_LABELS = ["none", "under 30m", "30m–1h", "1–2h", "2–4h", "4h+"];

/**
 * Time logged: what the timer actually saw. The week is a timeline — each day
 * a lane across the hours, every stretch of work where it happened, in its
 * kind's colour. A month is a bar a day, split by kind; three months and a
 * year are a calendar of squares, brighter the more was logged. The same
 * totals head every range, and everything has a hover.
 */
function timeLogPanel(log: NonNullable<MyDayData["log"]>, today: string, now: Date): string {
  const days = log.days;
  const past = days.filter((x) => x.day <= today);
  const total = past.reduce((n, x) => n + x.minutes, 0);
  const active = past.filter((x) => x.minutes >= 1);
  const busiest = active.reduce<LoggedDay | null>((b, x) => (!b || x.minutes > b.minutes ? x : b), null);
  const byType: Partial<Record<WorkType, number>> = {};
  for (const x of past) for (const [k, v] of Object.entries(x.byType)) byType[k as WorkType] = (byType[k as WorkType] ?? 0) + v!;
  const off = new Set(log.daysOff);
  const tabs = LOG_RANGES.map((r) => `<a class="fchip${r.id === log.range ? " on" : ""}" href="/my-day?log=${r.id}#logged">${esc(r.label)}</a>`).join("");
  const stats = [
    { n: fmtMin(Math.round(total)), l: "logged" },
    { n: `${active.length}`, l: `of ${past.length} days with time` },
    { n: active.length ? fmtMin(Math.round(total / active.length)) : "—", l: "a day, on days worked" },
    { n: busiest ? fmtMin(Math.round(busiest.minutes)) : "—", l: busiest ? `busiest · ${shortDay(busiest.day)} ${md(busiest.day)}` : "busiest day" },
  ].map((t) => `<div class="tlstat"><b>${esc(t.n)}</b><span>${esc(t.l)}</span></div>`).join("");
  const kinds = WORK_TYPES.filter((t) => (byType[t.id] ?? 0) >= 1).sort((a, b) => byType[b.id]! - byType[a.id]!);
  const mix = total >= 1
    ? `<div class="tlmix" role="img" aria-label="${esc(`By kind: ${typeSplit(byType)}`)}">${kinds
        .map((t) => `<i style="--wc:${t.colour};flex:${byType[t.id]!.toFixed(1)}" data-tip="${esc(`${t.label} · ${fmtMin(Math.round(byType[t.id]!))} · ${Math.round((byType[t.id]! / total) * 100)}%`)}"></i>`)
        .join("")}</div>
      <div class="tllegend">${kinds.map((t) => `<span style="--wc:${t.colour}"><i></i>${esc(t.label)} <b>${esc(fmtMin(Math.round(byType[t.id]!)))}</b></span>`).join("")}</div>`
    : "";

  let chart = "";
  if (log.range === "week") {
    // The hours worth showing: from the week's earliest start to its latest end, at least 9 to 6.
    const pieces = days.flatMap((x) => x.pieces);
    const lo = Math.max(0, Math.min(9 * 60, ...pieces.map((p) => Math.floor(p.from / 60) * 60)));
    const hi = Math.min(1440, Math.max(18 * 60, ...pieces.map((p) => Math.ceil(p.to / 60) * 60)));
    const span = hi - lo;
    const pct = (m: number) => (((m - lo) / span) * 100).toFixed(3);
    const step = span > 12 * 60 ? 180 : 120;
    const ticks: number[] = [];
    for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) ticks.push(m);
    const hourLabel = (m: number) => { const h = (m / 60) % 24; return `${h % 12 || 12}${h < 12 ? "a" : "p"}`; };
    const nowMin = (now.getTime() - instantIn(today, "00:00", ORG_TZ)!.getTime()) / 60_000;
    const rows = days.map((x) => {
      const future = x.day > today;
      const blocks = x.pieces
        .map((p) => {
          const t = TYPE_BY_ID.get(p.type)!;
          return `<i class="tlb" style="--wc:${t.colour};left:${pct(p.from)}%;width:max(3px,calc(${(((p.to - p.from) / span) * 100).toFixed(3)}% - 2px))" data-tip="${esc(`${t.label} · ${p.title} · ${clockOf(p.from)}–${clockOf(p.to)} · ${fmtMin(Math.max(1, Math.round(p.to - p.from)))}`)}"></i>`;
        })
        .join("");
      const nowLine = x.day === today && nowMin >= lo && nowMin <= hi ? `<span class="tlnow" style="left:${pct(nowMin)}%"></span>` : "";
      const note = off.has(x.day) ? `<span class="tlnote">Day off</span>` : future ? "" : x.pieces.length ? "" : `<span class="tlnote">Nothing logged</span>`;
      return `<div class="tlrow${x.day === today ? " today" : ""}${future ? " future" : ""}${off.has(x.day) ? " off" : ""}">
        <span class="tlday"><b>${esc(shortDay(x.day))}</b>${esc(md(x.day))}</span>
        <div class="tllane">${ticks.map((m) => `<span class="tlgrid" style="left:${pct(m)}%"></span>`).join("")}${blocks}${nowLine}${note}</div>
        <span class="tltot"${x.minutes >= 1 ? ` data-tip="${esc(typeSplit(x.byType))}"` : ""}>${future ? "" : x.minutes >= 1 ? esc(fmtMin(Math.round(x.minutes))) : "—"}</span>
      </div>`;
    }).join("");
    chart = `<div class="tlweek">
      <div class="tlrow tlaxis"><span></span><div class="tllane">${ticks.map((m) => `<span class="tltick" style="left:${pct(m)}%">${hourLabel(m)}</span>`).join("")}</div><span></span></div>
      ${rows}</div>`;
  } else if (log.range === "month") {
    const max = Math.max(60, ...days.map((x) => x.minutes));
    const top = Math.ceil(max / 60) * 60;
    chart = `<div class="tlbars" style="--n:${days.length}">
      <span class="tlymax">${esc(fmtMin(top))}</span><span class="tlyhalf">${esc(fmtMin(top / 2))}</span>
      ${days.map((x) => {
        const segs = WORK_TYPES.filter((t) => (x.byType[t.id] ?? 0) >= 0.5)
          .map((t) => `<i style="--wc:${t.colour};height:${((x.byType[t.id]! / top) * 100).toFixed(2)}%"></i>`)
          .join("");
        const tip = x.day > today ? "" : `${shortDay(x.day)} ${usDate(x.day)} · ${x.minutes >= 1 ? `${fmtMin(Math.round(x.minutes))} — ${typeSplit(x.byType)}` : off.has(x.day) ? "day off" : "nothing logged"}`;
        const monday = new Date(`${x.day}T12:00:00Z`).getUTCDay() === 1;
        return `<div class="tlcol${x.day === today ? " today" : ""}${x.day > today ? " future" : ""}"${tip ? ` data-tip="${esc(tip)}"` : ""}><div class="tlstack">${segs}</div>${monday ? `<span class="tlx">${esc(md(x.day))}</span>` : ""}</div>`;
      }).join("")}
    </div>`;
  } else {
    // Weeks as columns, Monday at the top — a calendar of squares.
    const weeks: LoggedDay[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    let lastMonth = "";
    let lastLabel = -9;
    const cols = weeks.map((w, wi) => {
      const month = w[0]!.day.slice(0, 7);
      // A month's name over its first week, unless the last name is too close to fit.
      const show = month !== lastMonth && wi - lastLabel >= 3;
      const label = show ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${w[0]!.day}T12:00:00Z`)) : "";
      if (show) lastLabel = wi;
      lastMonth = month;
      return `<div class="hmcol"><span class="hmm">${esc(label)}</span>${w.map((x) => {
        const step = heatStep(x.minutes);
        const tip = `${shortDay(x.day)} ${usDate(x.day)} · ${x.minutes >= 1 ? `${fmtMin(Math.round(x.minutes))} — ${typeSplit(x.byType)}` : off.has(x.day) ? "day off" : "nothing logged"}`;
        return `<i class="hmc${x.day === today ? " today" : ""}${off.has(x.day) ? " off" : ""}" style="--hc:${LOG_HEAT[step]}" data-tip="${esc(tip)}"></i>`;
      }).join("")}</div>`;
    }).join("");
    chart = `<div class="hmwrap ${log.range}"><div class="hmdays"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div><div class="hmgrid">${cols}</div></div>
      <script>(function () { var w = document.querySelector("#logged .hmwrap"); if (w) w.scrollLeft = w.scrollWidth; })();</script>
      <div class="hmlegend"><span>Less</span>${LOG_HEAT.map((c, i) => `<i style="--hc:${c}" title="${HEAT_LABELS[i]}"></i>`).join("")}<span>More</span><small>${HEAT_LABELS.slice(1).join(" · ")}</small></div>`;
  }

  const table = log.range === "week"
    ? ""
    : `<details class="tltable"><summary>As a table</summary><table><thead><tr><th>Day</th><th>Logged</th><th>By kind</th></tr></thead><tbody>${[...past]
        .reverse()
        .filter((x) => x.minutes >= 1)
        .map((x) => `<tr><td>${esc(`${shortDay(x.day)} ${usDate(x.day)}`)}</td><td>${esc(fmtMin(Math.round(x.minutes)))}</td><td>${esc(typeSplit(x.byType))}</td></tr>`)
        .join("") || `<tr><td colspan="3">Nothing logged.</td></tr>`}</tbody></table></details>`;

  return `<section class="panel tlog" id="logged">
    <div class="fhead"><h2>Time logged <span class="sub">— what the timer saw, ${log.range === "week" ? "this week" : `the last ${log.range === "month" ? "5 weeks" : log.range === "quarter" ? "13 weeks" : "year"}`}</span></h2><div class="fchips">${tabs}</div></div>
    <div class="tlstats">${stats}</div>
    ${mix}
    ${total >= 1 || log.range === "week" ? chart : `<div class="empty">No time logged in this range yet. Start a timer with ▶ on any piece of work.</div>`}
    ${table}
    <div class="tltip" role="tooltip" hidden></div>
    <script>
    (function () {
      var box = document.getElementById("logged"), tip = box.querySelector(".tltip");
      function show(el, x, y) {
        tip.textContent = el.getAttribute("data-tip"); tip.hidden = false;
        var r = box.getBoundingClientRect(), w = tip.offsetWidth;
        tip.style.left = Math.max(8, Math.min(r.width - w - 8, x - r.left - w / 2)) + "px";
        tip.style.top = (y - r.top - tip.offsetHeight - 12) + "px";
      }
      box.addEventListener("mousemove", function (e) {
        var el = e.target.closest("[data-tip]");
        if (el && el.getAttribute("data-tip")) show(el, e.clientX, e.clientY); else tip.hidden = true;
      });
      box.addEventListener("mouseleave", function () { tip.hidden = true; });
      box.addEventListener("click", function (e) {
        var el = e.target.closest("[data-tip]");
        if (!el) { tip.hidden = true; return; }
        var r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top);
      });
    })();
    </script>
  </section>`;
}

/** My Day's category switches, and whether batches show one row per upload. */
function mydaySwitches(hidden: string[], exploded: boolean): string {
  return `<form method="post" action="/my-day/show" class="mdsw" aria-label="What My Day shows">
    <span class="mdlab">Show</span>
    ${MYDAY_GROUPS.map((g) => {
      const colour = TYPE_BY_ID.get(g.types[0]!)!.colour;
      return `<label style="--wc:${colour}"><input type="checkbox" name="show" value="${g.id}"${hidden.includes(g.id) ? "" : " checked"} onchange="this.form.submit()"><i></i>${esc(g.label)}</label>`;
    }).join("")}
    <noscript><button class="mdpill">Apply</button></noscript>
    <button class="mdpill mdx" formaction="/my-day/explode" name="on" value="${exploded ? "0" : "1"}" title="${exploded ? "Fold the day's batches back into one row" : "Every batch channel as its own row in Today"}">${exploded ? "⤡ Group batches" : "⤢ Explode batches"}</button>
  </form>`;
}

/**
 * A list of work with the day's batches folded into one line ("12 batches ·
 * 2h left"), opened to tick them one by one — a dozen 10-minute rows would
 * bury the VOs.
 */
function groupBatches(items: WorkItem[], now: Date, running: string | null, back: string, exploded = false): string {
  // Exploded: each batch channel its own row, with how many of its uploads are done.
  if (exploded) {
    return items
      .map((i) => {
        const target = i.record?.batchTarget ?? 1;
        const extra = isBatch(i.type) && target > 1 ? `<span class="wunits">${Math.min(target, i.record?.batchDone ?? 0)}/${target} uploaded</span>` : "";
        return workRow(i, now, running, back, extra);
      })
      .join("");
  }
  const batches = items.filter((i) => isBatch(i.type));
  const rest = items.filter((i) => !isBatch(i.type));
  if (batches.length < 3) return items.map((i) => workRow(i, now, running, back)).join("");
  const est = batches.reduce((n, i) => n + i.est, 0);
  const spent = batches.reduce((n, i) => n + i.spent, 0);
  const left = batches.reduce((n, i) => n + remaining(i), 0);
  const t = TYPE_BY_ID.get(batches.every((i) => i.type === "reading") ? "reading" : "bits")!;
  const each = new Set(batches.map((i) => i.est)).size === 1 ? `${batches[0]!.est}m each` : `~${Math.round(est / batches.length)}m each`;
  const pct = Math.min(100, Math.round((spent / est) * 100));
  const group = `<details class="wgroup"${batches.some((i) => itemKey(i) === running) ? " open" : ""}>
    <summary class="wrow" style="--wc:${t.colour}"><span class="wtype">Batch</span>
      <div class="wmain"><span class="wt">${batches.length} Bits / Reading batches</span><div class="wmeta"><span class="wwhy">${esc(whyNow(batches[0]!, now))}</span><span>${esc(fmtMin(left))} left · ${esc(each)}</span></div></div>
      <div class="wtime"><span class="wbar"><i style="width:${pct}%"></i></span><span class="wnum">${spent >= 1 ? `${esc(fmtMin(spent))} / ` : ""}${esc(fmtMin(est))}</span></div>
      <div class="wacts"><form method="post" action="/my-day/explode"><input type="hidden" name="on" value="1"><button class="wbtn" title="Every batch channel as its own row">⤢</button></form><a class="wbtn" href="/recurring" title="Open Recurring to tick uploads">↗</a></div>
    </summary>
    <div class="wlist">${batches.map((i) => workRow(i, now, running, back)).join("")}</div>
  </details>`;
  // The group sits where its first batch would have.
  const at = items.indexOf(batches[0]!);
  const before = rest.filter((i) => items.indexOf(i) < at);
  const after = rest.filter((i) => items.indexOf(i) > at);
  return [...before.map((i) => workRow(i, now, running, back)), group, ...after.map((i) => workRow(i, now, running, back))].join("");
}

/** A kind of work's estimate for the legend: tasks and recurring channels can each have their own. */
function legendEstimate(id: WorkType): string {
  if (id === "task") return "per task";
  if (id === "reading" || id === "bits" || id === "longform") {
    const each = [...new Set(CHANNELS.filter((c) => c.recurring && batchType(c) === id).map((c) => channelEstimate(c.name)))];
    if (each.length > 1) return `${Math.min(...each)}–${Math.max(...each)}m`;
    if (each.length === 1) return `${each[0]}m`;
  }
  return `${typeEstimate(id)}m`;
}

/** One day's load as a stacked bar, by kind of work. */
function loadBar(d: DayLoad, max: number, today: string, trackedToday: number): string {
  const segs = WORK_TYPES.filter((t) => d.byType[t.id].est > 0)
    .map((t) => `<i style="--wc:${t.colour};width:${((d.byType[t.id].est / max) * 100).toFixed(2)}%" title="${esc(`${t.label}: ${d.byType[t.id].n} · ${fmtMin(d.byType[t.id].est)}`)}"></i>`)
    .join("");
  const at = new Date(`${d.day}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(at);
  const counts = WORK_TYPES.filter((t) => d.byType[t.id].n > 0)
    .map((t) => `<span style="--wc:${t.colour}"><i></i>${d.byType[t.id].n} ${esc(t.short)}</span>`)
    .join("");
  return `<a class="lrow${d.day === today ? " today" : ""}" href="/day/${d.day}?mode=deadlines">
    <span class="lday"><b>${esc(d.day === today ? "Today" : wd)}</b>${esc(usDate(d.day).replace(/\/\d{4}$/, ""))}</span>
    <span class="lbar">${segs || '<em>nothing due</em>'}</span>
    <span class="ltot"><b>${esc(fmtMin(d.est))}</b>${d.day === today && trackedToday >= 1 ? `<small>${esc(fmtMin(trackedToday))} tracked</small>` : ""}</span>
    <span class="lcounts">${counts}</span>
  </a>`;
}

export interface MyDayData {
  now: Date;
  today: string;
  required: WorkItem[];
  ahead: WorkItem[];
  done: WorkItem[];
  loads: DayLoad[];
  trackedToday: number;
  running: TimerState | null;
  focus: FocusPick | null;
  budget: number | null;
  asked: boolean;
  voLeft: { n: number; minutes: number };
  /** Category switches turned off (MYDAY_GROUPS ids). */
  hidden?: string[];
  /** Batches shown as one row per upload. */
  exploded?: boolean;
  /** Time logged over a range: the week's timeline, or a month, quarter or year. */
  log?: { range: LogRange; days: LoggedDay[]; daysOff: string[] };
}

/**
 * My Day: what today holds and how long it takes, the week ahead by kind of
 * work, a timer on anything, "What should I do next?", and what to do ahead
 * once today's is done.
 */
export function renderMyDay(shell: Shell, d: MyDayData): string {
  const running = runKey(d.running);
  const back = "/my-day";
  const estToday = d.loads.find((l) => l.day === d.today);
  const leftToday = d.required.reduce((n, i) => n + remaining(i), 0);
  const tiles = [
    { n: fmtMin(estToday?.est ?? 0), l: "today's load" },
    { n: fmtMin(leftToday), l: "left today" },
    { n: fmtMin(d.trackedToday), l: "tracked today" },
    { n: `${d.voLeft.n}`, l: `VOs left · ${fmtMin(d.voLeft.minutes)}` },
  ]
    .map((t) => `<div class="stat"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  const budgets = [15, 30, 60, 120];
  const chip = (b: number | null, label: string) =>
    `<a class="fchip${d.asked && d.budget === b ? " on" : ""}" href="/my-day?next=1${b ? `&amp;budget=${b}` : ""}#focus">${label}</a>`;
  const pick = d.focus;
  const focus = `<section class="panel focus" id="focus">
    <div class="fhead"><h2>What should I do next?</h2>
      <div class="fchips">${chip(null, "Just tell me")}${budgets.map((b) => chip(b, b < 60 ? `${b} min` : b === 60 ? "1 hr" : "2 hrs")).join("")}</div></div>
    ${
      !d.asked
        ? `<a class="clear fgo" href="/my-day?next=1#focus">What should I do next?</a>
           <p class="hint" style="padding:0">Picks the most pressing piece of your work: late first, then due soonest, VOs a little ahead since the editors are waiting on them. Choose a time and it finds work that fits.</p>`
        : pick
          ? `<p class="freason">${pick.ahead ? "Everything due is done, so this is from Do ahead. " : ""}${esc(pick.reason)} · <b>${esc(fmtMin(pick.minutes))}</b></p>
             <div class="wlist">${pick.items.map((i) => workRow(i, d.now, running, back)).join("")}</div>
             ${
               pick.items[0]?.id && running !== itemKey(pick.items[0])
                 ? `<form method="post" action="/timer/start" class="fstart"><input type="hidden" name="id" value="${pick.items[0].id}">${pick.items[0].task ? '<input type="hidden" name="kind" value="task">' : ""}<input type="hidden" name="back" value="${back}"><button class="clear">${PLAY_ICON} Start on it</button></form>`
                 : ""
             }`
          : `<p class="freason">Nothing to do. Everything open is done.</p>`
    }
  </section>`;

  const max = Math.max(60, ...d.loads.map((l) => l.est));
  const week = `<section class="panel"><h2>The week ahead <span class="sub">— estimated minutes a day, by kind of work</span></h2>
    <div class="llegend">${WORK_TYPES.map((t) => `<span style="--wc:${t.colour}"><i></i>${esc(t.label)} · ${esc(legendEstimate(t.id))}</span>`).join("")}<a class="lset" href="/settings#estimates">Edit estimates</a></div>
    <div class="lrows">${d.loads.map((l) => loadBar(l, max, d.today, d.trackedToday)).join("")}</div>
  </section>`;

  const todayList = `<section class="panel"><h2>Today <span class="sub">— ${d.required.length} to do · ${esc(fmtMin(leftToday))} left${
    d.required.some((i) => whyNow(i, d.now).endsWith("late")) ? ` · <b class="late">${d.required.filter((i) => whyNow(i, d.now).endsWith("late")).length} late</b>` : ""
  }</span></h2>
    ${d.required.length ? `<div class="wlist">${groupBatches(d.required, d.now, running, back, d.exploded ?? false)}</div>` : `<div class="empty">Everything due today is done. Do ahead is below.</div>`}
  </section>`;

  const estDone = d.done.filter((i) => !i.untracked).reduce((n, i) => n + i.est, 0);
  const spentDone = d.done.reduce((n, i) => n + i.spent, 0);
  const doneList = d.done.length
    ? `<section class="panel"><h2>Done today <span class="sub">— ${d.done.length} · estimated ${esc(fmtMin(estDone))}${
        spentDone >= 1 ? ` · tracked ${esc(fmtMin(spentDone))}` : ""
      }</span></h2>
      <div class="wlist done">${d.done
        .map((i) => {
          const t = TYPE_BY_ID.get(i.type)!;
          const diff = i.spent >= 1 ? Math.round(i.spent - i.est) : null;
          const kind = i.task ? '<input type="hidden" name="kind" value="task">' : "";
          return `<div class="wrow done${i.untracked ? " untracked" : ""}" style="--wc:${t.colour}"><span class="wtype">${esc(t.short)}</span>
            <div class="wmain"><a class="wt" href="${workHref(i)}">${esc(i.title)}</a></div>
            <div class="wnum">${
              i.untracked
                ? `<span class="wnt">logged · no time</span>`
                : `${i.spent >= 1 ? `${esc(fmtMin(i.spent))} of ${esc(fmtMin(i.est))}` : `${esc(fmtMin(i.est))} est.`}${
                    diff !== null ? ` <b class="${diff > 0 ? "late" : "ok"}">${diff > 0 ? `+${fmtMin(diff)}` : diff < 0 ? `−${fmtMin(-diff)}` : "on the dot"}</b>` : ""
                  }`
            }${
              !i.untracked && i.id !== null
                ? `<form method="post" action="/timer/clear" class="wclr" onsubmit="return confirm('Someone else did this? Its ${i.spent >= 1 ? esc(fmtMin(i.spent)) + " of tracked time goes" : "estimate stops counting as yours"}.')"><input type="hidden" name="id" value="${i.id}">${kind}<input type="hidden" name="back" value="/my-day"><button class="mdpill" title="Someone else did it: clear its tracked time and don't count it as yours">No time</button></form>`
                : ""
            }</div></div>`;
        })
        .join("")}</div></section>`
    : "";

  const ahead = `<section class="panel" id="ahead"><h2>Do ahead <span class="sub">— ${
    d.required.length ? "once today's is done" : "today's is done, so these are next"
  } · VOs first, since the editors can start once they're recorded</span></h2>
    ${d.ahead.length ? `<div class="wlist">${d.ahead.map((i) => workRow(i, d.now, running, back)).join("")}</div>` : `<div class="empty">Nothing ahead yet.</div>`}
  </section>`;

  return layout(
    "My Day",
    shell,
    `${pageHeader("My Day", `<a class="clear secondary" href="/vo">VO Queue</a>`)}
    ${timerBar(d.running, back)}
    ${mydaySwitches(d.hidden ?? [], d.exploded ?? false)}
    <div class="stats">${tiles}</div>
    ${focus}
    <div class="mydaygrid">${todayList}${week}</div>
    ${doneList}
    ${d.log ? timeLogPanel(d.log, d.today, d.now) : ""}
    ${ahead}`,
  );
}

export interface VoQueueData {
  now: Date;
  queue: WorkItem[];
  running: TimerState | null;
}

/** The VO queue: every open VO, Stories and Movies, most pressing first, with what it'll take. */
export function renderVoQueue(shell: Shell, d: VoQueueData): string {
  const words = d.queue.reduce((n, i) => n + (i.wordCount ?? 0), 0);
  const read = d.queue.reduce((n, i) => n + (readMinutes(i.wordCount) ?? 0), 0);
  const est = d.queue.reduce((n, i) => n + remaining(i), 0);
  const tiles = [
    { n: String(d.queue.length), l: "VOs to record" },
    { n: fmtMin(est), l: `left · Stories ${typeEstimate("vo")}m · Movies ${typeEstimate("moviesvo")}m a VO` },
    { n: words ? words.toLocaleString("en-US") : "—", l: "words" },
    { n: read ? fmtMin(read) : "—", l: `reading time · ${VO_WPM} wpm` },
  ]
    .map((t) => `<div class="stat"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");
  const running = runKey(d.running);
  const list = d.queue
    .map((i, n) => {
      const hit = i.id ? scriptFor({ id: i.id, code: i.code, title: i.title }) : null;
      const extra = [
        `<span class="wwords">${i.wordCount ? `${i.wordCount.toLocaleString("en-US")} words · ~${readMinutes(i.wordCount)}m read` : "no word count"}</span>`,
        i.airDate ? `<span class="wair">airs ${esc(usDate(i.airDate))}</span>` : "",
        hit ? `<a class="scriptmark has" href="${esc(safeHref(hit.href))}"${hit.href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""} title="Script: ${esc(hit.where.join(" · "))}">${SCRIPT_ICON}Script</a>` : "",
      ].join("");
      return `<div class="vorank"><span class="vn">${n + 1}</span>${workRow(i, d.now, running, "/vo", extra)}</div>`;
    })
    .join("");
  return layout(
    "VO Queue",
    shell,
    `${pageHeader("VO Queue", d.queue.length ? `<a class="clear" href="/vo/record">${PLAY_ICON} Recording mode</a>` : "")}
    ${timerBar(d.running, "/vo")}
    <div class="stats">${tiles}</div>
    <p class="labsub">Every open VO, Stories and Movies, most pressing first: late ones, then by VO deadline, then by air date. Recording mode takes them one at a time: it times each one, and ✓ Recorded clears it and moves to the next.</p>
    <section class="panel">${list ? `<div class="wlist">${list}</div>` : `<div class="empty">No VOs to record.</div>`}</section>`,
  );
}

export interface RecordingData {
  now: Date;
  current: WorkItem | null;
  position: number;
  total: number;
  next: WorkItem[];
  /** This VO's own timer, when it's the one running. */
  running: TimerState | null;
  skipped: number[];
  brief: string | null;
  /** Start this VO's timer as soon as the page is shown (by a POST from the page). */
  autoStart: boolean;
}

/** Recording mode: one VO at a time, timed, and on to the next when it's done. */
export function renderRecording(shell: Shell, d: RecordingData): string {
  const c = d.current;
  const skip = d.skipped.join(",");
  if (!c) {
    return layout(
      "Recording",
      shell,
      `${pageHeader("Recording mode", `<a class="clear secondary" href="/vo">← VO Queue</a>`)}
      <section class="panel recdone"><h2>That's every VO.</h2><p class="hint" style="padding:0">${d.skipped.length ? `${d.skipped.length} skipped — <a href="/vo/record">go back to them</a>.` : "Nothing left to record."}</p></section>`,
    );
  }
  const hit = c.id ? scriptFor({ id: c.id, code: c.code, title: c.title }) : null;
  const why = whyNow(c, d.now);
  return layout(
    "Recording",
    shell,
    `${pageHeader("Recording mode", `<a class="clear secondary" href="/vo">← VO Queue</a>`)}
    <section class="panel reccard" style="--wc:${TYPE_BY_ID.get("vo")!.colour}">
      <div class="recpos">VO ${d.position} of ${d.total}${d.skipped.length ? ` · ${d.skipped.length} skipped` : ""}</div>
      <h1 class="rectitle">${esc(c.title)}</h1>
      <div class="recmeta">
        ${c.channel ? `<span class="wch" style="--ch:${channelColour(c.channel)}"><i></i>${esc(c.channel)}</span>` : ""}
        <span class="wwhy${why.endsWith("late") ? " late" : ""}">VO ${esc(why)}</span>
        ${c.airDate ? `<span>airs ${esc(usDate(c.airDate))}</span>` : ""}
        <span>${c.wordCount ? `${c.wordCount.toLocaleString("en-US")} words · ~${readMinutes(c.wordCount)} min read` : "no word count"}</span>
        <span>${c.est} min est.</span>
      </div>
      ${hit ? `<a class="clear secondary recscript" href="${esc(safeHref(hit.href))}"${hit.href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""}>${SCRIPT_ICON} Open the script <small>(${esc(hit.where.join(" · "))})</small></a>` : `<p class="hint" style="padding:0">No script found for it — not attached, not in Story Lab, not on the Scripts tab.</p>`}
      ${d.brief ? `<details class="recbrief"><summary>Story brief</summary><div class="brief">${esc(d.brief)}</div></details>` : ""}
      <div class="recclock"><span class="tclock"${d.running ? ` data-start="${d.running.startedAt.getTime()}"` : ""} data-before="${Math.round((d.running?.spentBefore ?? c.spent) * 60)}">0:00</span><small>of ${c.est} min</small></div>
      <div class="recacts">
        <form method="post" action="/vo/record/done"><input type="hidden" name="id" value="${c.id}"><input type="hidden" name="skip" value="${esc(skip)}"><button class="clear recbig">✓ Recorded — next</button></form>
        <a class="clear secondary" href="/vo/record?skip=${esc([...d.skipped, c.id].join(","))}">Skip for now</a>
        ${d.running
          ? `<form method="post" action="/timer/stop"><input type="hidden" name="back" value="/vo"><button class="clear secondary">Stop</button></form>`
          : `<form method="post" action="/timer/start" class="recstart"><input type="hidden" name="id" value="${c.id}"><input type="hidden" name="kind" value="record"><input type="hidden" name="back" value="/vo/record?${skip ? `skip=${esc(skip)}&amp;` : ""}started=${c.id}"><button class="clear secondary">Start timer</button></form>`}
      </div>
    </section>
    ${d.next.length ? `<section class="panel"><h2>Up next</h2><div class="wlist">${d.next.map((i) => workRow(i, d.now, null, "/vo")).join("")}</div></section>` : ""}
    <script>
    (function () {
      ${d.autoStart && !d.running ? `var go = document.querySelector("form.recstart"); if (go) { go.submit(); return; }` : ""}
      var el = document.querySelector(".recclock .tclock");
      // Without a timer running the clock shows the time so far and stands still.
      var start = el.hasAttribute("data-start") ? Number(el.getAttribute("data-start")) : null, before = Number(el.getAttribute("data-before"));
      function tick() {
        var s = Math.max(0, (start === null ? 0 : Math.floor((Date.now() - start) / 1000)) + before);
        el.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      }
      tick();
      if (start !== null) setInterval(tick, 1000);
    })();
    </script>`,
  );
}

export interface ForgottenData {
  gaps: UploadGap[];
  flags: Forgotten[];
}

const FORGOTTEN_KINDS: Array<{ kind: Forgotten["kind"]; label: string; sub: string }> = [
  { kind: "overdue-vo", label: "Overdue VOs", sub: "past their VO time" },
  { kind: "overdue-revision", label: "Overdue revisions", sub: "past their review time" },
  { kind: "not-started", label: "Not started, and airing soon", sub: "airs within 7 days with no script anywhere and no cut on Frame.io yet" },
  { kind: "vo-close", label: "VO still open close to air", sub: "airs within 3 days" },
  { kind: "unsorted", label: "Unsorted", sub: "filed 2+ days ago and still not in a category" },
];

/** What's slipping through the cracks, on one page. */
export function renderForgotten(shell: Shell, d: ForgottenData): string {
  const byChannel = new Map<string, UploadGap[]>();
  for (const g of d.gaps) byChannel.set(g.channel, [...(byChannel.get(g.channel) ?? []), g]);
  const total = d.flags.length + d.gaps.length;
  const tiles = [
    { n: d.gaps.length, l: "nothing assigned" },
    ...FORGOTTEN_KINDS.slice(0, 3).map((k) => ({ n: d.flags.filter((f) => f.kind === k.kind).length, l: k.label.toLowerCase() })),
  ]
    .map((t) => `<div class="stat${t.n ? " alert" : " zero"}"><div class="n">${t.n}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");
  const gapsPanel = d.gaps.length
    ? `<section class="panel fgsec"><h2>Nothing assigned <span class="sub">— expected uploads in the next 8 days with no video on the day</span></h2>${gapStrip(d.gaps)}</section>`
    : "";
  const sections = FORGOTTEN_KINDS.map((k) => {
    const list = d.flags.filter((f) => f.kind === k.kind);
    if (!list.length) return "";
    return `<section class="panel fgsec"><h2>${esc(k.label)} <span class="sub">— ${list.length} · ${esc(k.sub)}</span></h2>
      <div class="rows">${list.map((f) => `<div class="fgrow"><span class="fgwhy">${esc(f.why)}</span>${row(f.record)}</div>`).join("")}</div></section>`;
  }).join("");
  return layout(
    "Forgotten work",
    shell,
    `${pageHeader("Forgotten work")}
    <p class="labsub">Checked on every page load: upcoming uploads with nothing assigned, overdue VOs and revisions, videos airing within a week with no script and no cut, VOs still open close to air, and anything left unsorted.</p>
    <div class="stats">${tiles}</div>
    ${total ? `${gapsPanel}${sections}` : `<div class="empty">Nothing's slipping. Every upload is covered and nothing's overdue.</div>`}`,
  );
}
