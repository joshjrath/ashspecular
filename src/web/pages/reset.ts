/**
 * Future reset: what it would do, day by day, before anything changes, and
 * the one button that does it (with Undo for a day after).
 */
import { esc } from "../html.js";
import { channelColour, layout, pageHeader, type Shell } from "../page.js";
import { ORG_TZ, VO_BUFFER_DAYS, usDate } from "../../parse/derive.js";
import { RESET_BOUNDS, type ResetPlan } from "../reset.js";

export interface ResetView {
  perDay: number;
  plan: ResetPlan | null;
  /** The first day VOs would go to. */
  start: string;
  lateCount: number;
  undo: { at: Date; text: string } | null;
  done: string;
  undone: boolean;
}

const short = (day: string) => {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  return `${name} ${usDate(day).replace(/\/\d{4}$/, "")}`;
};
const fmtViews = (n: number | null) => (n === null ? "no long-form views yet" : `${new Intl.NumberFormat("en-US", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n)} avg views`);
const when = (d: Date) => `${new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} ET`;

export function renderReset(shell: Shell, v: ResetView): string {
  const p = v.plan;
  const undoForm = (label: string) =>
    `<form method="post" action="/calendar/reset/undo" class="rsinline"><button class="clear secondary" onclick="return confirm('Put every upload and VO day back as it was before the reset?')">${esc(label)}</button></form>`;
  const notes = [
    v.done ? `<div class="rsnote ok"><p><b>Done.</b> ${esc(v.done)}</p>${undoForm("Undo the reset")}<a class="clear secondary" href="/calendar">Open the calendar</a></div>` : "",
    v.undone ? `<div class="rsnote"><p>The reset is undone: every upload and VO day is back as it was.</p></div>` : "",
    !v.done && v.undo ? `<div class="rsnote"><p>Last reset ${esc(when(v.undo.at))}: ${esc(v.undo.text)}</p>${undoForm("Undo it")}</div>` : "",
  ].join("");

  const intro = `<section class="panel rsintro">
    <p><b>A last resort for when work is far behind.</b> Every overdue VO gets a new day, ${v.perDay} a day from ${esc(short(v.start))} (days off skipped; a day already carrying VOs takes fewer). Each video's upload moves to at least ${VO_BUFFER_DAYS} days after its VO, and the rest of that channel's schedule moves with it, spacing kept.</p>
    <p>Channels with the most average long-form views go first, in rounds: every channel's first late VO before any channel's second. Nothing changes until you press the button at the bottom, and Undo puts everything back for a day after.</p>
    <form method="get" action="/calendar/reset" class="rsper"><label>VOs a day <select name="per" onchange="this.form.submit()">${Array.from({ length: RESET_BOUNDS.max - RESET_BOUNDS.min + 1 }, (_, i) => i + RESET_BOUNDS.min).map((n) => `<option${n === v.perDay ? " selected" : ""}>${n}</option>`).join("")}</select></label><noscript><button class="clear secondary">Show</button></noscript></form>
  </section>`;

  if (!p || !p.assign.size) {
    return layout("Future reset", shell, `${pageHeader("Future reset", `<a class="clear secondary" href="/calendar">← Calendar</a>`)}${notes}${intro}
      <section class="panel"><div class="empty">No VOs are overdue, so there's nothing to reset.</div></section>`);
  }

  const order = `<section class="panel"><h2>Order <span class="sub">— most average long-form views first (their last ten long-form videos a week old or more)</span></h2>
    <ol class="rsorder">${p.channels.map((c) => `<li style="--ch:${channelColour(c.channel)}"><i></i><b>${esc(c.channel)}</b> <span>${esc(fmtViews(c.avgViews))} · ${c.late} late</span></li>`).join("")}</ol>
  </section>`;

  const days = p.days.map((d) => `<section class="panel rsday"><h2>${esc(short(d.day))} <span class="sub">— ${d.vos.length} late VO${d.vos.length === 1 ? "" : "s"}${d.total > d.vos.length ? ` · ${d.total} VOs that day in all` : ""}</span></h2>
    <div class="rsrows">${d.vos.map((x) => `<div class="rsrow" style="--ch:${channelColour(x.channel)}"><i></i>
      <div class="rsmain"><a href="/r/${x.id}">${esc(x.title)}</a><small>${esc(x.channel)} · VO was due ${esc(short(x.voDay))}</small></div>
      <div class="rsair">${x.airDate && x.newAir && x.newAir !== x.airDate ? `upload <s>${esc(short(x.airDate))}</s> → <b>${esc(short(x.newAir))}</b>` : x.airDate ? `upload stays ${esc(short(x.airDate))}` : "no upload day"}</div>
    </div>`).join("")}</div>
  </section>`).join("");

  const late = new Set(p.assign.keys());
  const others = p.moves.filter((m) => !late.has(m.id));
  const rest = others.length
    ? `<details class="panel rsrest"><summary><b>${others.length} more upload${others.length === 1 ? "" : "s"} move with their channels</b> <span class="sub">— later by the same days, so each channel keeps its spacing</span></summary>
        <div class="rsrows">${others.map((m) => `<div class="rsrow" style="--ch:${channelColour(m.channel)}"><i></i><div class="rsmain"><a href="/r/${m.id}">${esc(m.label)}</a><small>${esc(m.channel)}</small></div><div class="rsair"><s>${esc(short(m.from))}</s> → <b>${esc(short(m.to))}</b> <small>+${m.shift}d</small></div></div>`).join("")}</div>
      </details>`
    : "";

  const channels = new Set(p.moves.map((m) => m.channel)).size;
  const apply = `<form method="post" action="/calendar/reset" class="panel rsapply">
    <input type="hidden" name="per" value="${v.perDay}">
    <p>${v.lateCount} overdue VO${v.lateCount === 1 ? "" : "s"} over ${p.days.length} day${p.days.length === 1 ? "" : "s"} (${esc(short(p.days[0]!.day))} to ${esc(short(p.days[p.days.length - 1]!.day))}); ${p.moves.length} upload${p.moves.length === 1 ? "" : "s"} on ${channels} channel${channels === 1 ? "" : "s"} move later.</p>
    <label class="rsconfirm"><input type="checkbox" name="confirm" value="1" required> I understand this moves uploads and VO days across ${channels || "these"} channel${channels === 1 ? "" : "s"}.</label>
    <button class="clear rsgo">Reset the upcoming calendar</button>
  </form>`;

  return layout(
    "Future reset",
    shell,
    `${pageHeader("Future reset", `<a class="clear secondary" href="/calendar">← Calendar</a>`)}${notes}${intro}${order}${days}${rest}${apply}`,
  );
}
