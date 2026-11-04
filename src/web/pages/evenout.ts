/**
 * Even out uploads: what it would do before anything changes — uploads a
 * day before and after, each channel's new start, every move — and the one
 * button that does it (with Undo for a day after).
 */
import { esc } from "../html.js";
import { channelColour, layout, pageHeader, type Shell } from "../page.js";
import { ORG_TZ, usDate } from "../../parse/derive.js";
import { EVEN_BOUNDS, EVEN_WINDOW_DAYS, type EvenPlan } from "../evenout.js";

export interface EvenView {
  /** At most this many uploads a day (a channel may wait to keep to it), or null: exact frequency, nobody waits. */
  cap: number | null;
  plan: EvenPlan | null;
  undo: { at: Date; text: string } | null;
  done: string;
  undone: boolean;
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
const short = (day: string) => {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  return `${name} ${usDate(day).replace(/\/\d{4}$/, "")}`;
};
const md = (day: string) => usDate(day).replace(/\/\d{4}$/, "");
const when = (d: Date) => `${new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d)} ET`;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** Uploads a day, a week a row (Sunday first): before → after. */
function weeks(p: EvenPlan): string {
  if (!p.days.length) return "";
  const cells: string[] = Array.from({ length: weekday(p.days[0]!.day) }, () => `<div class="evday pad"></div>`);
  for (const d of p.days) {
    const cls = d.after > d.before ? " up" : d.after < d.before ? " down" : "";
    cells.push(`<div class="evday${cls}" title="${esc(short(d.day))}: ${d.before} → ${d.after} upload${d.after === 1 ? "" : "s"}"><span>${esc(md(d.day))}</span><b>${d.after}</b>${d.after !== d.before ? `<s>${d.before}</s>` : ""}</div>`);
  }
  const most = (k: "before" | "after") => Math.max(...p.days.map((d) => d[k]));
  return `<section class="panel"><h2>Uploads a day <span class="sub">— the big number is after, the struck one before · busiest day ${most("before")} → ${most("after")}</span></h2>
    <div class="evweek evhead">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div>${d}</div>`).join("")}</div>
    <div class="evweek">${cells.join("")}</div>
  </section>`;
}

export function renderEvenOut(shell: Shell, v: EvenView): string {
  const p = v.plan;
  const undoForm = (label: string) =>
    `<form method="post" action="/calendar/even/undo" class="rsinline"><button class="clear secondary" onclick="return confirm('Put every upload and its deadlines back as they were before evening out?')">${esc(label)}</button></form>`;
  const notes = [
    v.done ? `<div class="rsnote ok"><p><b>Done.</b> ${esc(v.done)}</p>${undoForm("Undo")}<a class="clear secondary" href="/calendar?mode=posting">Open the calendar</a></div>` : "",
    v.undone ? `<div class="rsnote"><p>Undone: every upload and its deadlines are back as they were.</p></div>` : "",
    !v.done && v.undo ? `<div class="rsnote"><p>Last evened out ${esc(when(v.undo.at))}: ${esc(v.undo.text)}</p>${undoForm("Undo it")}</div>` : "",
  ].join("");

  const capOptions = [`<option value=""${v.cap === null ? " selected" : ""}>No limit: every channel exactly on its frequency</option>`]
    .concat(Array.from({ length: EVEN_BOUNDS.max - EVEN_BOUNDS.min + 1 }, (_, i) => i + EVEN_BOUNDS.min).map((n) => `<option value="${n}"${v.cap === n ? " selected" : ""}>At most ${n} a day</option>`)).join("");
  const intro = `<section class="panel rsintro">
    <p><b>Lines the upcoming uploads up with each channel's upload frequency</b> (Settings → Channels): every channel's next upload goes its frequency after its last one that went up (posted 11/2 on every 7 days: next 11/9), and each after that the same distance on. Only uploads from today on move, never ones already up, paused or daily batches, and nothing goes nearer than ${EVEN_WINDOW_DAYS} days from today unless it already was. Each video's VO and script deadlines move with its upload; a VO that would fall before today is due today.</p>
    <p><b>Uploads a day:</b> with no limit nobody waits. Pick a limit and, only where a day would go over it, a channel starts a few days later, once; after that its gaps are its frequency again. Nothing changes until you press the button at the bottom, and Undo puts everything back for a day after.</p>
    <form method="get" action="/calendar/even" class="rsper"><label>Uploads a day <select name="cap" onchange="this.form.submit()">${capOptions}</select></label><noscript><button class="clear secondary">Show</button></noscript></form>
  </section>`;

  const header = pageHeader("Even out uploads", `<a class="clear secondary" href="/calendar?mode=posting">← Calendar</a>`);
  if (!p || !p.moves.length) {
    return layout("Even out uploads", shell, `${header}${notes}${intro}${p ? weeks(p) : ""}
      <section class="panel"><div class="empty">${p && p.channels.length ? "Every channel's uploads are already on their frequency, so there's nothing to move." : "No channel with an upload frequency has uploads coming up."}</div></section>`);
  }

  const channels = `<section class="panel"><h2>Channels <span class="sub">— where each one's run starts now</span></h2>
    <div class="rsrows">${p.channels.map((c) => `<div class="rsrow${c.moved ? "" : " stays"}" style="--ch:${channelColour(c.channel)}"><i></i>
      <div class="rsmain"><b>${esc(c.channel)}</b><small>every ${days(c.every)} · ${c.last ? `last up ${esc(short(c.last))}` : "nothing up yet"} · ${c.videos} upcoming</small></div>
      <div class="rsair">next <b>${esc(short(c.first))}</b>${c.delay ? ` <small>+${days(c.delay)} to keep to ${v.cap} a day</small>` : ""}<br><small>${c.moved ? `${c.moved} move${c.moved === 1 ? "s" : ""}` : "already on it"}</small></div>
    </div>`).join("")}</div>
  </section>`;

  const moves = `<details class="panel rsrest" open><summary><b>${p.moves.length} upload${p.moves.length === 1 ? "" : "s"} move</b> <span class="sub">— soonest first</span></summary>
    <div class="rsrows">${p.moves.map((m) => `<div class="rsrow" style="--ch:${channelColour(m.channel)}"><i></i><div class="rsmain"><a href="/r/${m.id}">${esc(m.label)}</a><small>${esc(m.channel)}</small></div><div class="rsair"><s>${esc(short(m.from))}</s> → <b>${esc(short(m.to))}</b> <small>${m.shift > 0 ? "+" : "−"}${Math.abs(m.shift)}d</small></div></div>`).join("")}</div>
  </details>`;

  const n = new Set(p.moves.map((m) => m.channel)).size;
  const apply = `<form method="post" action="/calendar/even" class="panel rsapply">
    <input type="hidden" name="cap" value="${v.cap ?? ""}">
    <p>${p.moves.length} upload${p.moves.length === 1 ? "" : "s"} on ${n} channel${n === 1 ? "" : "s"} move to their upload frequency, each with its VO and script deadlines.</p>
    <label class="rsconfirm"><input type="checkbox" name="confirm" value="1" required> I understand this moves uploads and deadlines across ${n} channel${n === 1 ? "" : "s"}.</label>
    <button class="clear">Even out the uploads</button>
  </form>`;

  return layout("Even out uploads", shell, `${header}${notes}${intro}${weeks(p)}${channels}${moves}${apply}`);
}
