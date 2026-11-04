/**
 * Even out deadlines: what it would do before anything changes — VOs a day
 * before and after, each VO whose day changes, each upload that moves — and
 * the one button that does it (with Undo for a day after).
 */
import { esc } from "../html.js";
import { channelColour, dayLoads, layout, pageHeader, type Shell } from "../page.js";
import { ORG_TZ, VO_BUFFER_DAYS, usDate } from "../../parse/derive.js";
import { RESET_BOUNDS } from "../reset.js";
import { EVEN_WINDOW_DAYS } from "../evenout.js";
import type { EvenDuePlan } from "../evendeadlines.js";

export interface EvenDueView {
  perDay: number;
  from: "today" | "tomorrow";
  starts: { today: string; tomorrow: string };
  plan: EvenDuePlan | null;
  daysOff: Set<string>;
  undo: { at: Date; text: string } | null;
  done: string;
  undone: boolean;
}

const short = (day: string) => {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  return `${name} ${usDate(day).replace(/\/\d{4}$/, "")}`;
};
const when = (d: Date) => `${new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} ET`;
const WHY: Record<string, string> = { late: "was due", earlier: "moved up from", later: "matched to its upload, was", stays: "stays" };

export function renderEvenDeadlines(shell: Shell, v: EvenDueView): string {
  const p = v.plan;
  const undoForm = (label: string) =>
    `<form method="post" action="/calendar/even-deadlines/undo" class="rsinline"><button class="clear secondary" onclick="return confirm('Put every VO day and upload back as they were before evening out?')">${esc(label)}</button></form>`;
  const notes = [
    v.done ? `<div class="rsnote ok"><p><b>Done.</b> ${esc(v.done)}</p>${undoForm("Undo")}<a class="clear secondary" href="/calendar?mode=deadlines">Open the calendar</a></div>` : "",
    v.undone ? `<div class="rsnote"><p>Undone: every VO day and upload is back as it was.</p></div>` : "",
    !v.done && v.undo ? `<div class="rsnote"><p>Last evened out ${esc(when(v.undo.at))}: ${esc(v.undo.text)}</p>${undoForm("Undo it")}</div>` : "",
  ].join("");

  const intro = `<section class="panel rsintro">
    <p><b>Lines every pending VO up with its upload:</b> each is due ${VO_BUFFER_DAYS} days before its upload, no more than ${v.perDay} a day (days off get none). Where a day's full, a VO moves to the nearest earlier day with room; if there's none, it can be due ${EVEN_WINDOW_DAYS} days before its upload, and failing that it goes to the next day with room and <b>its upload moves</b> to ${VO_BUFFER_DAYS} days after it, with the channel's later uploads.</p>
    <p>Best after <a href="/calendar/even">Even out uploads</a>: line the uploads up first, then the VOs follow them. Late VOs go first, biggest channels first, as in Future reset. Nothing changes until you press the button at the bottom, and Undo puts everything back for a day after.</p>
    <form method="get" action="/calendar/even-deadlines" class="rsper"><label>VOs a day <select name="per" onchange="this.form.submit()">${Array.from({ length: RESET_BOUNDS.max - RESET_BOUNDS.min + 1 }, (_, i) => i + RESET_BOUNDS.min).map((n) => `<option${n === v.perDay ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Start <select name="from" onchange="this.form.submit()"><option value="today"${v.from === "today" ? " selected" : ""}>Today, ${esc(short(v.starts.today))}</option><option value="tomorrow"${v.from === "tomorrow" ? " selected" : ""}>Tomorrow, ${esc(short(v.starts.tomorrow))}</option></select></label><noscript><button class="clear secondary">Show</button></noscript></form>
  </section>`;

  const header = pageHeader("Even out deadlines", `<a class="clear secondary" href="/calendar/reset">Future reset</a><a class="clear secondary" href="/calendar?mode=deadlines">← Calendar</a>`);
  if (!p || (!p.assign.size && !p.moves.length)) {
    return layout("Even out deadlines", shell, `${header}${notes}${intro}${p ? dayLoads(p.days, "VOs a day", "VO", v.daysOff) : ""}
      <section class="panel"><div class="empty">${p && p.vos.length ? "Every VO is already due when its upload needs it, within the day's limit: nothing to move." : "No VOs are pending."}</div></section>`);
  }

  const changed = p.vos.filter((x) => x.to !== x.voDay);
  const byDay = [...new Set(changed.map((x) => x.to))].map((d) => {
    const list = changed.filter((x) => x.to === d);
    return `<section class="panel rsday"><h2>${esc(short(d))} <span class="sub">— ${list.length} VO${list.length === 1 ? "" : "s"} moved here · ${p.vos.filter((x) => x.to === d).length} due that day</span></h2>
    <div class="rsrows">${list.map((x) => `<div class="rsrow" style="--ch:${channelColour(x.channel)}"><i></i>
      <div class="rsmain"><a href="/r/${x.id}">${esc(x.title)}</a><small>${esc(x.channel)} · ${esc(WHY[x.kind]!)} ${esc(short(x.voDay))}</small></div>
      <div class="rsair">${x.airDate && x.newAir && x.newAir !== x.airDate ? `upload <s>${esc(short(x.airDate))}</s> → <b>${esc(short(x.newAir))}</b>` : x.airDate ? `upload ${esc(short(x.airDate))}` : "no upload day"}</div>
    </div>`).join("")}</div>
  </section>`;
  }).join("");

  const listed = new Set(changed.map((x) => x.id));
  const others = p.moves.filter((m) => !listed.has(m.id));
  const rest = others.length
    ? `<details class="panel rsrest"><summary><b>${others.length} more upload${others.length === 1 ? "" : "s"} move with their channels</b> <span class="sub">— later, behind an upload that moved</span></summary>
        <div class="rsrows">${others.map((m) => `<div class="rsrow" style="--ch:${channelColour(m.channel)}"><i></i><div class="rsmain"><a href="/r/${m.id}">${esc(m.label)}</a><small>${esc(m.channel)}</small></div><div class="rsair"><s>${esc(short(m.from))}</s> → <b>${esc(short(m.to))}</b> <small>+${m.shift}d</small></div></div>`).join("")}</div>
      </details>`
    : "";

  const late = p.vos.filter((x) => x.kind === "late").length;
  const apply = `<form method="post" action="/calendar/even-deadlines" class="panel rsapply">
    <input type="hidden" name="per" value="${v.perDay}">
    <input type="hidden" name="from" value="${v.from}">
    <p>${p.assign.size} VO day${p.assign.size === 1 ? "" : "s"} change${late ? ` (${late} late)` : ""}; ${p.moves.length ? `${p.moves.length} upload${p.moves.length === 1 ? "" : "s"} move later to make room for theirs` : "no upload moves"}.</p>
    <label class="rsconfirm"><input type="checkbox" name="confirm" value="1" required> I understand this moves VO deadlines${p.moves.length ? " and uploads" : ""}.</label>
    <button class="clear">Even out the deadlines</button>
  </form>`;

  return layout("Even out deadlines", shell, `${header}${notes}${intro}${dayLoads(p.days, "VOs a day", "VO", v.daysOff)}${byDay}${rest}${apply}`);
}
