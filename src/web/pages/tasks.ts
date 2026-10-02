/**
 * Tasks: anything forwarded into #tasks or added here, with snooze, repeat
 * and a timer like any other work.
 */
import { ORG_TZ, dateIn } from "../../parse/derive.js";
import { PAUSE_ICON, PLAY_ICON, type Shell, fmtMin, layout, pageHeader } from "../page.js";
import { PRIORITIES, PRIORITY, TASK_CATEGORIES, TASK_CATEGORY } from "../../tasks/parse.js";
import { REPEAT, REPEATS } from "../../tasks/repeat.js";
import type { Task } from "../../db/tasks.js";
import { type TimerState, timerBar } from "./mywork.js";
import { esc, safeUrl } from "../html.js";
import { taskCategoryEstimate } from "../work.js";

// ── Tasks ─────────────────────────────────────────────────────────────────

export interface TasksData {
  now: Date;
  todo: Task[];
  snoozed: Task[];
  done: Task[];
  running: TimerState | null;
}

/** "9/28 3:00 PM" in the studio's zone. */
function taskWhen(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

/** When a task is due, in words: late, today, or a date. */
function taskDue(t: Task, now: Date): string {
  if (!t.due) return "";
  const h = (t.due.getTime() - now.getTime()) / 3_600_000;
  const at = taskWhen(t.due);
  if (h < 0) return `<span class="late">late · was due ${esc(at)}</span>`;
  if (dateIn(ORG_TZ, t.due) === dateIn(ORG_TZ, now)) return `<span class="soon">due today ${esc(at.split(", ")[1] ?? at)}</span>`;
  return `<span>due ${esc(at)}</span>`;
}

const SNOOZE_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="11" r="6"/><path d="M10 8v3l2 1.5M4 4.5 6 3M16 4.5 14 3"/></svg>`;

const hidden = (name: string, value: string | number) => `<input type="hidden" name="${name}" value="${esc(String(value))}">`;

/** One task: title · category, who and when, and Complete / Snooze / Open Discord / timer / Edit. */
function taskRow(t: Task, now: Date, running: string | null): string {
  const c = TASK_CATEGORY.get(t.category) ?? TASK_CATEGORY.get("general")!;
  const p = PRIORITY.get(t.priority) ?? PRIORITY.get("normal")!;
  const est = t.estMin ?? taskCategoryEstimate(t.category);
  const on = running === `t${t.id}`;
  const back = hidden("back", `/tasks#t${t.id}`);
  const discord = t.sourceUrl ?? t.captureUrl;
  const post = (action: string, label: string, extra = "") => `<form method="post" action="/tasks/${t.id}/${action}">${extra}${hidden("back", "/tasks")}<button>${label}</button></form>`;
  const localDay = t.due ? dateIn(ORG_TZ, t.due) : "";
  const localTime = t.due ? new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t.due) : "";
  const meta = [
    t.person ? `<span>${esc(t.person)}</span>` : "",
    taskDue(t, now),
    `<span>~${esc(fmtMin(est))}</span>`,
    t.snoozedUntil && t.snoozedUntil.getTime() > now.getTime() ? `<span>back ${esc(taskWhen(t.snoozedUntil))}</span>` : "",
    t.status === "done" && t.doneAt ? `<span>done ${esc(taskWhen(t.doneAt))}</span>` : "",
    t.repeat ? `<span class="trep">↻ ${esc(REPEAT.get(t.repeat)?.label ?? t.repeat)}</span>` : "",
  ].filter(Boolean).join("");
  const firstNote = t.notes.split("\n").find((l) => l.trim())?.trim() ?? "";

  const acts =
    t.status === "done"
      ? `<form method="post" action="/tasks/${t.id}/reopen">${back}<button class="wbtn" title="Reopen">↺</button></form>
         <form method="post" action="/tasks/${t.id}/delete">${hidden("back", "/tasks")}<button class="wbtn" title="Delete for good">×</button></form>`
      : `${
          on
            ? `<form method="post" action="/timer/stop">${back}<button class="wbtn on" title="Stop the timer">${PAUSE_ICON}</button></form>`
            : `<form method="post" action="/timer/start">${hidden("id", t.id)}${hidden("kind", "task")}${back}<button class="wbtn" title="Start the timer">${PLAY_ICON}</button></form>`
        }
        ${discord ? `<a class="wbtn" href="${esc(safeUrl(discord))}" target="_blank" rel="noopener" title="Open in Discord">↗</a>` : ""}
        <details class="tmenu"><summary class="wbtn" title="Snooze">${SNOOZE_ICON}</summary><div class="tpop">
          ${post("snooze", "1 hour", hidden("for", "1h"))}${post("snooze", "3 hours", hidden("for", "3h"))}${post("snooze", "Tomorrow 9 AM", hidden("for", "tomorrow"))}${post("snooze", "Next week", hidden("for", "week"))}${
            t.snoozedUntil ? post("snooze", "Back now", hidden("for", "now")) : ""
          }
        </div></details>
        <form method="post" action="/tasks/${t.id}/done">${hidden("back", "/tasks")}<button class="wbtn ok" title="Complete">✓</button></form>`;

  return `<div class="task${on ? " on" : ""}${t.status === "done" ? " done" : ""}" id="t${t.id}" style="--pc:${p.colour}">
    <div class="trow">
      <div class="tmain">
        <div class="ttitle">${esc(t.title)} <span class="tcat">· ${c.emoji} ${esc(c.label)}</span></div>
        <div class="tmeta">${meta}</div>
        ${firstNote ? `<div class="tnote" title="${esc(t.notes)}">${esc(firstNote.length > 140 ? `${firstNote.slice(0, 137)}…` : firstNote)}${t.notes.trim().includes("\n") ? " …" : ""}</div>` : ""}
      </div>
      <div class="tacts">${acts}
        <details class="tmenu"><summary class="wbtn" title="Edit">✎</summary><div class="tpop tedit-pop"></div></details>
      </div>
    </div>
    <div class="tedit" data-for="${t.id}" hidden>
      <form method="post" action="/tasks/${t.id}/edit">${back}
        <label class="wide">Title<input name="title" value="${esc(t.title)}" required maxlength="200"></label>
        <label class="half">Person<input name="person" value="${esc(t.person ?? "")}" maxlength="60"></label>
        <label>Minutes<input name="est" type="number" min="1" max="600" value="${t.estMin ?? ""}" placeholder="${taskCategoryEstimate(t.category)} (${esc(c.label)})"></label>
        <label class="half">Category<select name="category">${TASK_CATEGORIES.map((x) => `<option value="${x.id}"${x.id === t.category ? " selected" : ""}>${x.emoji} ${esc(x.label)}</option>`).join("")}</select></label>
        <label>Priority<select name="priority">${PRIORITIES.map((x) => `<option value="${x.id}"${x.id === t.priority ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
        <label class="half">Due date<input name="due_date" type="date" value="${esc(localDay)}"></label>
        <label>Time<input name="due_time" type="time" value="${esc(localTime)}"></label>
        <label class="half">Repeats<select name="repeat"><option value="">Doesn't repeat</option>${REPEATS.map((r) => `<option value="${r.id}"${r.id === t.repeat ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</select></label>
        <label class="full">Notes<textarea name="notes" rows="3" maxlength="4000" placeholder="Anything to remember about it">${esc(t.notes)}</textarea></label>
        ${t.body && t.body.trim() !== t.title ? `<pre class="tbody">${esc(t.body)}</pre>` : ""}
        <div class="tbtns"><button class="clear">Save</button>
          <button class="clear secondary" formaction="/tasks/${t.id}/delete" formnovalidate>Delete</button></div>
      </form>
    </div>
  </div>`;
}

/**
 * Tasks: everything forwarded into #tasks, grouped by priority — Complete,
 * Snooze, Open Discord, a timer, and every field editable. Snoozed ones come
 * back on their own; done ones stay a while to reopen.
 */
export function renderTasks(shell: Shell, d: TasksData): string {
  const running = d.running?.taskId ? `t${d.running.taskId}` : null;
  // Repeating tasks have their own section; the priority groups are one-offs.
  const oneOff = d.todo.filter((t) => !t.repeat);
  const recurring = [...d.todo, ...d.snoozed].filter((t) => t.repeat).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
  const groups = PRIORITIES.map((p) => {
    const list = oneOff.filter((t) => t.priority === p.id);
    if (!list.length) return "";
    return `<section class="tgroup"><div class="tghead" style="--pc:${p.colour}"><span class="tpri">${p.dot} ${esc(p.label)}</span><span class="n">${list.length}</span></div>
      <div class="tlist">${list.map((t) => taskRow(t, d.now, running)).join("")}</div></section>`;
  }).join("");
  const minutes = d.todo.filter((t) => !t.repeat).reduce((n, t) => n + (t.estMin ?? taskCategoryEstimate(t.category)), 0);
  const body = `${pageHeader(`To do · ${oneOff.length}`, `<a class="clear secondary" href="/my-day">My Day</a>`)}
    ${timerBar(d.running, "/tasks")}
    <section class="panel">
      <form class="tadd" method="post" action="/tasks">
        <div class="taddrow">
          <label class="taddbox"><span class="taddplus" aria-hidden="true">+</span>
            <input name="text" placeholder="New task — try “Pay Divas by Friday”" aria-label="New task" autocomplete="off" required maxlength="500"></label>
          <button class="clear">Add task</button>
        </div>
        <details class="taddmore"><summary>Notes &amp; repeat</summary>
          <div class="taddopts">
            <textarea name="notes" rows="2" maxlength="4000" placeholder="Notes (optional)" aria-label="Notes"></textarea>
            <select name="repeat" aria-label="Repeats"><option value="">Doesn't repeat</option>${REPEATS.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join("")}</select>
          </div>
        </details>
      </form>
      <p class="taddhint">Due dates, priority, people and repeats (“every Monday”) are picked up as you type. You can also forward anything to <b>#tasks</b> in Discord.${
        oneOff.length ? ` About <b>${esc(fmtMin(minutes))}</b> open.` : ""
      }</p>
      ${groups || `<div class="empty">You're all caught up.</div>`}
      ${
        recurring.length
          ? `<section class="tgroup trecur"><div class="tghead"><span class="tpri">↻ RECURRING</span><span class="n">${recurring.length}</span><span class="sub">— done opens the next one</span></div>
             <div class="tlist">${recurring.map((t) => taskRow(t, d.now, running)).join("")}</div></section>`
          : ""
      }
      ${
        d.snoozed.some((t) => !t.repeat)
          ? `<details class="tfold"><summary>Snoozed · ${d.snoozed.filter((t) => !t.repeat).length}</summary><div class="tlist">${d.snoozed.filter((t) => !t.repeat).map((t) => taskRow(t, d.now, running)).join("")}</div></details>`
          : ""
      }
      ${
        d.done.length
          ? `<details class="tfold"><summary>Done · ${d.done.length}</summary><div class="tlist">${d.done.map((t) => taskRow(t, d.now, running)).join("")}</div></details>`
          : ""
      }
    </section>
    <script>
    (function () {
      // ✎ opens the task's edit form under it; the other menus close when one opens.
      document.querySelectorAll(".tmenu").forEach(function (m) {
        m.addEventListener("toggle", function () {
          var pop = m.querySelector(".tedit-pop");
          if (pop) {
            var task = m.closest(".task"), form = task && task.querySelector(".tedit");
            if (form) form.hidden = !m.open;
            if (m.open) { var f = form && form.querySelector("input"); if (f) f.focus(); }
            return;
          }
          if (m.open) document.querySelectorAll(".tmenu[open]").forEach(function (o) { if (o !== m && !o.querySelector(".tedit-pop")) o.open = false; });
        });
      });
      document.addEventListener("click", function (e) {
        document.querySelectorAll(".tmenu[open]").forEach(function (o) { if (!o.querySelector(".tedit-pop") && !o.contains(e.target)) o.open = false; });
      });
    })();
    </script>`;
  return layout("Tasks", shell, body);
}
