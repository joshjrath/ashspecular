/**
 * The content calendar: Month, Week, 4 days and Day, by air date or by
 * deadline, with drag-to-move, the category and channel filters, days off,
 * and the Google Calendar subscription.
 */
import { CATEGORIES, CHANNELS, channelInk } from "../../catalog.js";
import type { CalendarEntry, CalendarMode, StoredRecord } from "../../db/records.js";
import { LABELS, type Shell, actions, channelColour, colourOf, displayTitle, gapDismiss, layout, offTag, offToggle, pageHeader, pinControl, scriptMark, titleOnDay } from "../page.js";
import { ORG_TZ, dateIn, relativeDay, renderIn, usDate } from "../../parse/derive.js";
import type { UploadGap } from "../gaps.js";
import { esc, jsonForScript } from "../html.js";

// ── the content calendar ──────────────────────────────────────────────────

/** Sunday-first, matching how the studio's week is written. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Adds whole months without the 31st-of-February problem. */
export function shiftMonth(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y! * 12 + (m! - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** YYYY-MM for a date, in the org's zone. */
export function monthOf(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TZ, year: "numeric", month: "2-digit",
  }).format(at);
}

/** Every day the grid shows: whole weeks covering the month, Sunday first. */
export function calendarGrid(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1, 12));
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());

  const last = new Date(Date.UTC(y!, m!, 0, 12));
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const days: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y!, m! - 1, 1, 12)));
}

const CHIPS_PER_CELL = 5;

/**
 * Each category is a toggle, and doubles as the legend. The choice is
 * remembered, so the calendar and the day view open the way they were left.
 */
function categoryToggles(hide: string[], href: (hide: string) => string, attrs = "") {
  const toggles = CATEGORIES.map((c) => {
    const off = hide.includes(c.id);
    const next = off ? hide.filter((id) => id !== c.id) : [...hide, c.id];
    return `<a class="cattoggle${off ? " off" : ""}" style="--c:${c.color}" aria-pressed="${!off}"
      title="${off ? "Show" : "Hide"} ${esc(c.label)}" ${attrs}
      href="${href(next.join(","))}"><i></i>${esc(c.label)}</a>`;
  }).join("");
  const showAll = hide.length ? `<a class="cattoggle all" ${attrs} href="${href("")}">Show all</a>` : "";
  return { toggles, showAll };
}

/**
 * Which statuses a calendar view hides: "done" hides complete work, "open"
 * hides incomplete. Empty — both shown — is the default, and it lives in the
 * address rather than a cookie, so the calendar always opens showing both.
 */
export type StatusHide = Array<"open" | "done">;

/** The query every calendar link carries: its mode, and any status filter. */
function calQuery(mode: CalendarMode, st: StatusHide): string {
  return `?mode=${mode}${st.length ? `&amp;st=${st.join(",")}` : ""}`;
}

/** Complete / Incomplete, beside the category toggles and styled like them. */
function statusToggles(st: StatusHide, href: (st: string) => string, attrs = ""): string {
  const items: Array<{ id: "done" | "open"; label: string; colour: string }> = [
    { id: "done", label: "Complete", colour: "var(--gm)" },
    { id: "open", label: "Incomplete", colour: "#9A9AA3" },
  ];
  return `<span class="tsep" aria-hidden="true"></span>${items
    .map(({ id, label, colour }) => {
      const off = st.includes(id);
      const next = off ? st.filter((x) => x !== id) : [...st, id];
      return `<a class="cattoggle st${off ? " off" : ""}" style="--c:${colour}" aria-pressed="${!off}"
        title="${off ? "Show" : "Hide"} ${label.toLowerCase()} work" ${attrs}
        href="${href(next.join(","))}"><i></i>${label}</a>`;
    })
    .join("")}`;
}

/** Month · Week · Day, each opening on the same stretch of time. */
function viewTabs(active: "month" | "week" | "4day" | "day", date: string, q: string, attrs = ""): string {
  const tab = (key: typeof active, href: string, label: string) =>
    `<a class="tab${active === key ? " on" : ""}" ${attrs} href="${href}${q}">${label}</a>`;
  return `<div class="tabs views">${tab("day", `/day/${date}`, "Day")}${tab("4day", `/4day/${date}`, "4 days")}${tab(
    "week",
    `/week/${date}`,
    "Week",
  )}${tab("month", `/calendar/${date.slice(0, 7)}`, "Month")}</div>`;
}

/**
 * The channel dropdown on every calendar view: tick or untick any channel
 * (grouped by category, with All, None and "only this category"), then Show.
 * What's unticked is remembered, like the category toggles.
 */
function channelPicker(chide: string[]): string {
  const off = new Set(chide);
  const total = CHANNELS.length + 1;
  const shown = total - CHANNELS.filter((c) => off.has(c.id)).length - (off.has("nochannel") ? 1 : 0);
  const groups = CATEGORIES.map((cat) => {
    const list = CHANNELS.filter((c) => c.category === cat.id);
    return `<div class="chgroup" style="--c:${cat.color}">
      <div class="chcat"><i></i>${esc(cat.label)}<button type="button" data-only="${cat.id}">only</button></div>
      ${list
        .map((c) => `<label><input type="checkbox" value="${c.id}" data-cat="${cat.id}"${off.has(c.id) ? "" : " checked"}>
          <span class="cdot" style="--ch:${c.color}"></span>${esc(c.name.replace(/^Specular /, "") || c.name)}</label>`)
        .join("")}
    </div>`;
  }).join("");
  return `<details class="chanpick" id="chanpick">
    <summary>Channels <b id="chancount">${shown === total ? "all" : `${shown}/${total}`}</b></summary>
    <div class="chanmenu">
      <div class="chanbtns">
        <button type="button" data-set="all">All</button>
        <button type="button" data-set="none">None</button>
        <button type="button" class="go" id="chango">Show</button>
      </div>
      <div class="chgroups">${groups}
        <div class="chgroup"><label><input type="checkbox" value="nochannel"${off.has("nochannel") ? "" : " checked"}>No channel</label></div>
      </div>
    </div>
    <script>
    (function () {
      var pick = document.getElementById("chanpick"), count = document.getElementById("chancount");
      var boxes = Array.prototype.slice.call(pick.querySelectorAll("input[type=checkbox]"));
      var start = JSON.stringify(hidden());
      function hidden() { return boxes.filter(function (b) { return !b.checked; }).map(function (b) { return b.value; }); }
      function tally() {
        var n = boxes.length - hidden().length;
        count.textContent = n === boxes.length ? "all" : n + "/" + boxes.length;
      }
      function go() {
        var off = hidden();
        if (JSON.stringify(off) === start) { pick.open = false; return; }
        var u = new URL(location.href);
        u.searchParams.set("chide", off.join(","));
        location.href = u.toString();
      }
      boxes.forEach(function (b) { b.addEventListener("change", tally); });
      pick.querySelectorAll("[data-set]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var on = btn.getAttribute("data-set") === "all";
          boxes.forEach(function (b) { b.checked = on; });
          tally();
        });
      });
      pick.querySelectorAll("[data-only]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var cat = btn.getAttribute("data-only");
          boxes.forEach(function (b) { b.checked = b.getAttribute("data-cat") === cat; });
          tally();
        });
      });
      document.getElementById("chango").addEventListener("click", go);
      // Closing the menu shows what's ticked, the same as pressing Show.
      // Keep the menu on screen: pull it left when it would run off the right edge.
      var menu = pick.querySelector(".chanmenu");
      pick.addEventListener("toggle", function () {
        if (!pick.open) { go(); return; }
        if (getComputedStyle(menu).position !== "absolute") return;
        menu.style.left = "0px";
        var over = menu.getBoundingClientRect().right - (document.documentElement.clientWidth - 16);
        if (over > 0) menu.style.left = -over + "px";
      });
      document.addEventListener("click", function (e) { if (pick.open && !pick.contains(e.target)) pick.open = false; });
    })();
    </script>
  </details>`;
}

/** The Sunday a week starts on — the month grid starts on Sunday too. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftDay(date, -dow);
}

/** One day as a column of cards: the day view's strip and the week's grid. */
/** The gaps the calendar's category toggles and channel dropdown leave showing. */
function visibleGaps(gaps: UploadGap[] | undefined, hide: string[], chide: string[]): UploadGap[] {
  return (gaps ?? []).filter((g) => {
    const ch = CHANNELS.find((c) => c.name === g.channel);
    return !ch || (!hide.includes(ch.category) && !chide.includes(ch.id));
  });
}

function dayColumn(
  d: string,
  list: StoredRecord[],
  mode: CalendarMode,
  q: string,
  cls: string,
  off = false,
  gaps: UploadGap[] = [],
): string {
  // Nothing assigned: a dashed slot for each channel expected to post this day.
  const holes = mode === "posting"
    ? gaps.filter((g) => g.date === d).map((g) => `<div class="gapcard" style="--ch:${channelColour(g.channel)}"><a href="/channel/${encodeURIComponent(g.channel)}" title="Expected: its last video is ${esc(usDate(g.after))}"><i></i>Nothing assigned · ${esc(g.channel.replace(/^Specular /, ""))}</a>${gapDismiss(g.channel, [g.date], `Clear ${g.channel} on ${usDate(g.date)}`)}</div>`).join("")
    : "";
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${d}T12:00:00Z`),
  );
  return `<section class="daycol${cls}${off ? " off" : ""}" data-date="${d}" data-pretty="${esc(`${weekday} ${usDate(d)}`)}">
    <header>
      <a class="dname" href="/day/${d}${q}" title="Open ${esc(weekday)} in the day view">
        <span class="wk">${esc(weekday)}</span>
        <span class="dt">${esc(usDate(d))}</span>
      </a>
      <span class="rel">${esc(relativeDay(d))}</span>
      ${offToggle(d, off)}
      <span class="cnt">${list.length}</span>
    </header>
    <div class="daybody">${holes}${
      list.length || holes ? list.map((r) => dayCard(r, mode)).join("") :
      `<div class="dayempty">${
        off && mode === "deadlines" ? "Day off — nothing can be due." : `Nothing ${mode === "posting" ? "airing" : "due"}.`
      }</div>`
    }</div>
  </section>`;
}

/**
 * After a drop: the board says what else moved (the rest of the channel's
 * schedule) with an Undo, across the reload that follows every move.
 * `rememberMove` keeps the server's answer for the next page; the rest shows
 * it. Shift held on the drop moves only the one.
 */
const MOVED_JS = `
      var KEY = "board-moved";
      function rememberMove(res) {
        return res.json().then(function (j) {
          if (j && j.text) {
            try { sessionStorage.setItem(KEY, JSON.stringify({ text: j.text, token: j.undo || "" })); } catch (e) {}
          }
        }, function () {});
      }
      function saveMove(id, date, only) {
        return fetch("/r/" + id + "/move", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
          body: new URLSearchParams({ date: date, mode: mode, only: only ? "1" : "" }),
        }).then(function (res) {
          if (!res.ok) { alert("Couldn't move that — nothing was changed."); return; }
          return rememberMove(res);
        }, function () {
          alert("Couldn't reach the board — nothing was changed.");
        }).then(function () { location.reload(); });
      }
      (function () {
        var info = null;
        try { info = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (e) {}
        if (!info || !info.text) return;
        var toast = document.createElement("div");
        toast.className = "mtoast";
        toast.setAttribute("role", "status");
        var text = document.createElement("span");
        text.textContent = info.text;
        var hint = document.createElement("small");
        hint.textContent = "Hold Shift as you drop to move just the one.";
        text.appendChild(hint);
        var undo = document.createElement("button");
        undo.type = "button";
        undo.className = "undo";
        undo.textContent = "Undo";
        undo.addEventListener("click", function () {
          undo.disabled = true;
          fetch("/moves/undo", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
            body: new URLSearchParams({ token: info.token }),
          }).then(function (res) {
            if (!res.ok) alert("Too late to undo that one — it's been over 15 minutes, or the board restarted.");
            location.reload();
          }, function () {
            alert("Couldn't reach the board — nothing was changed.");
            undo.disabled = false;
          });
        });
        var close = document.createElement("button");
        close.type = "button";
        close.className = "x";
        close.setAttribute("aria-label", "Dismiss");
        close.textContent = "×";
        close.addEventListener("click", function () { toast.remove(); });
        if (!info.token) hint.remove();
        toast.appendChild(text);
        if (info.token) toast.appendChild(undo);
        toast.appendChild(close);
        document.body.appendChild(toast);
      })();`;

/**
 * Drag a card onto another day's column. Saved at once, then the page
 * reloads — onto the same day, since the address follows the view.
 */
function columnDragScript(mode: CalendarMode): string {
  return `<script>
    (function () {
      var mode = ${jsonForScript(mode)};
      var dragging = null;
      document.querySelectorAll(".dcard[draggable]").forEach(function (card) {
        card.addEventListener("dragstart", function (e) {
          dragging = card;
          card.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", card.dataset.id);
        });
        card.addEventListener("dragend", function () {
          card.classList.remove("dragging");
          dragging = null;
          document.querySelectorAll(".daycol.over").forEach(function (c) { c.classList.remove("over"); });
        });
      });
      document.querySelectorAll(".daycol[data-date]").forEach(function (col) {
        col.addEventListener("dragover", function (e) {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          col.classList.add("over");
        });
        col.addEventListener("dragleave", function (e) {
          if (!col.contains(e.relatedTarget)) col.classList.remove("over");
        });
        col.addEventListener("drop", function (e) {
          e.preventDefault();
          col.classList.remove("over");
          var card = dragging;
          if (!card || card.closest(".daycol") === col) return;
          var body = col.querySelector(".daybody");
          var empty = body.querySelector(".dayempty");
          if (empty) empty.remove();
          body.appendChild(card);
          card.classList.add("saving");
          saveMove(card.dataset.id, col.dataset.date, e.shiftKey);
        });
      });
      ${MOVED_JS}
    })();
    </script>`;
}

/**
 * "Add to Google Calendar": the private feed link, a few switches for what it
 * carries, and the three steps to subscribe. Google then keeps it in step on
 * its own schedule — every few hours.
 */
function subscribePanel(feedUrl: string): string {
  return `<details class="subscribe">
    <summary>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2.5"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4"/></svg>
      Google Calendar
    </summary>
    <div class="subpanel">
      <b>Keep Google Calendar in step</b>
      <p>Air dates and deadlines from this board, updated as the board changes. Google refreshes
      subscribed calendars every few hours.</p>
      <div class="subopts" role="group" aria-label="What the calendar carries">
        <label><input type="checkbox" data-opt="airs" checked> Air dates</label>
        <label><input type="checkbox" data-opt="due" checked> Deadlines</label>
        <label><input type="checkbox" data-opt="batches"> Daily batches</label>
      </div>
      <div class="subcopy">
        <input type="text" readonly id="feedurl" value="${esc(feedUrl)}" aria-label="Calendar link" onclick="this.select()">
        <button type="button" class="chipbtn go" id="feedcopy">Copy</button>
      </div>
      <ol>
        <li>Copy the link.</li>
        <li><a href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl" target="_blank" rel="noopener">Open Google Calendar → From URL ↗</a></li>
        <li>Paste it and press <b>Add calendar</b>.</li>
      </ol>
      <p class="fine">Apple Calendar: <a id="feedwebcal" href="${esc(feedUrl.replace(/^https?:/, "webcal:"))}">subscribe here</a>.
      Keep the link private — anyone with it can read the calendar. Changing the board's password retires it.</p>
    </div>
  </details>
  <script>
  (function () {
    var base = ${jsonForScript(feedUrl)};
    var input = document.getElementById("feedurl"), webcal = document.getElementById("feedwebcal");
    function update() {
      var u = new URL(base);
      document.querySelectorAll(".subopts input").forEach(function (b) {
        var o = b.dataset.opt;
        if (o === "batches") { if (b.checked) u.searchParams.set("batches", "1"); }
        else if (!b.checked) u.searchParams.set(o, "0");
      });
      input.value = u.toString();
      webcal.href = u.toString().replace(/^https?:/, "webcal:");
    }
    document.querySelectorAll(".subopts input").forEach(function (b) { b.addEventListener("change", update); });
    document.getElementById("feedcopy").addEventListener("click", function () {
      var btn = this;
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject()).then(
        function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy"; }, 1500); },
        function () { input.select(); document.execCommand("copy"); btn.textContent = "Copied"; });
    });
    document.addEventListener("click", function (e) {
      var d = document.querySelector(".subscribe");
      if (d && d.open && !d.contains(e.target)) d.open = false;
    });
  })();
  </script>`;
}

export function renderCalendar(
  shell: Shell,
  ym: string,
  mode: CalendarMode,
  entries: CalendarEntry[],
  hide: string[] = [],
  st: StatusHide = [],
  feedUrl = "",
  chide: string[] = [],
): string {
  const q = calQuery(mode, st);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day)!.push(e);
  }

  const today = dateIn(ORG_TZ);
  const thisMonth = ym;
  const grid = calendarGrid(ym);
  const offDays = new Set(shell.daysOff ?? []);

  const cells = grid
    .map((day) => {
      const list = byDay.get(day) ?? [];
      const outside = !day.startsWith(thisMonth);
      const isToday = day === today;
      const num = Number(day.slice(8));

      // Five fit a cell; the rest are one click away, in the day view, rather
      // than crushed into unreadable slivers. Each chip can be dragged to
      // another day.
      const chips = list
        .slice(0, CHIPS_PER_CELL)
        .map(
          (e) => `<a class="chip${e.record.status === "done" ? " done" : ""}${e.record.uploadedAt ? " uploaded" : ""}${e.record.noScriptAt && e.record.status === "open" ? " noscript" : ""}" draggable="true" data-id="${e.record.id}"
            style="--c:${colourOf(e.record.category)};--ch:${channelColour(e.record.channel)}"
            href="/r/${e.record.id}" title="${esc(displayTitle(e.record))} — drag to move">
            <span class="dot"></span><span class="t">${esc(titleOnDay(e.record))}</span>
          </a>`,
        )
        .join("");

      const more =
        list.length > CHIPS_PER_CELL
          ? `<a class="more" href="/day/${day}${q}">+${list.length - CHIPS_PER_CELL} more</a>`
          : "";

      const off = offDays.has(day);
      return `<div class="cell${outside ? " outside" : ""}${isToday ? " today" : ""}${off ? " off" : ""}" data-date="${day}">
        <a class="num" href="/day/${day}${q}">${num}${
          isToday ? `<span class="tag">today</span>` : ""
        }</a>
        ${offToggle(day, off)}
        ${
          mode === "posting"
            ? visibleGaps(shell.gaps, hide, chide).filter((g) => g.date === day).map((g) => `<div class="gapslot" style="--ch:${channelColour(g.channel)}"><a href="/day/${day}${q}" title="Nothing assigned — ${esc(g.channel)} is expected to post"><i></i><span class="t">${esc(g.channel.replace(/^Specular /, ""))} · nothing</span></a>${gapDismiss(g.channel, [day], `Clear ${g.channel} on ${usDate(day)}`)}</div>`).join("")
            : ""
        }
        ${chips}${more}
      </div>`;
    })
    .join("");

  const heads = WEEKDAYS.map((d) => `<div class="wd">${d}</div>`).join("");

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" href="/calendar/${ym}${calQuery(value, st)}">${label}</a>`;

  const { toggles, showAll } = categoryToggles(hide, (h) => `/calendar/${ym}${q}&amp;hide=${h}`);
  const statuses = statusToggles(st, (x) => `/calendar/${ym}?mode=${mode}&amp;st=${x}`);
  const today0 = dateIn(ORG_TZ);
  const anchor = today0.startsWith(ym) ? today0 : `${ym}-01`;

  return layout(
    "Calendar",
    shell,
    `${pageHeader("Calendar")}
    <div class="calbar">
      <a class="nav" href="/calendar/${shiftMonth(ym, -1)}${q}" aria-label="Previous month">←</a>
      <span class="month">${esc(monthName(ym))}</span>
      <a class="nav" href="/calendar/${shiftMonth(ym, 1)}${q}" aria-label="Next month">→</a>
      <a class="nav today" href="/calendar${q}">Today</a>
      ${viewTabs("month", anchor, q)}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
      ${feedUrl ? subscribePanel(feedUrl) : ""}
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}${channelPicker(chide)}
      <span class="draghint">Drag anything to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      } — the channel's later videos follow. Shift-drop moves just the one.</span>
    </div>
    <div class="cal">${heads}${cells}</div>
    ${
      entries.some((e) => e.day.startsWith(ym))
        ? ""
        : `<div class="empty" style="margin-top:16px">Nothing ${
            mode === "posting" ? "airing" : "due"
          } this month${hide.length || st.length ? " in what's shown" : ""}.</div>`
    }
    <script>
    // Drag a chip onto another day: it moves there at once, the change is
    // saved, and the page reloads so every count on it agrees.
    (function () {
      var mode = ${jsonForScript(mode)};
      var dragging = null;
      document.querySelectorAll(".cal .chip[draggable]").forEach(function (chip) {
        chip.addEventListener("dragstart", function (e) {
          dragging = chip;
          chip.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", chip.dataset.id);
        });
        chip.addEventListener("dragend", function () {
          chip.classList.remove("dragging");
          dragging = null;
          document.querySelectorAll(".cal .cell.over").forEach(function (c) { c.classList.remove("over"); });
        });
      });
      document.querySelectorAll(".cal .cell[data-date]").forEach(function (cell) {
        cell.addEventListener("dragover", function (e) {
          if (!dragging) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          cell.classList.add("over");
        });
        cell.addEventListener("dragleave", function (e) {
          if (!cell.contains(e.relatedTarget)) cell.classList.remove("over");
        });
        cell.addEventListener("drop", function (e) {
          e.preventDefault();
          cell.classList.remove("over");
          var chip = dragging;
          if (!chip) return;
          var from = chip.closest(".cell");
          if (from && from.dataset.date === cell.dataset.date) return;
          cell.insertBefore(chip, cell.querySelector(".more"));
          chip.classList.add("saving");
          saveMove(chip.dataset.id, cell.dataset.date, e.shiftKey);
        });
      });
      ${MOVED_JS}
    })();
    </script>`,
  );
}

/** How far either side of the clicked day the day view reaches. */
export const DAY_SPAN = 21;

/**
 * One day, and the days either side of it, as columns you scroll through
 * sideways. The clicked day is centred on arrival; scrolling moves the
 * address with you, so a reload, a ✓ or a shared link lands where you were.
 */
export function renderDay(
  shell: Shell,
  date: string,
  mode: CalendarMode,
  days: Array<{ date: string; list: StoredRecord[] }>,
  hide: string[] = [],
  st: StatusHide = [],
  chide: string[] = [],
): string {
  const q = calQuery(mode, st);
  const today = dateIn(ORG_TZ);
  const off = new Set(shell.daysOff ?? []);
  const first = days[0]?.date ?? date;
  const last = days[days.length - 1]?.date ?? date;

  const columns = days
    .map(({ date: d, list }) =>
      dayColumn(d, list, mode, q, `${d === today ? " today" : ""}${d === date ? " focus" : ""}`, off.has(d), visibleGaps(shell.gaps, hide, chide)),
    )
    .join("");

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" data-dayhref href="/day/${date}${calQuery(value, st)}">${label}</a>`;
  const { toggles, showAll } = categoryToggles(
    hide,
    (h) => `/day/${date}${q}&amp;hide=${h}`,
    "data-dayhref",
  );
  const statuses = statusToggles(st, (x) => `/day/${date}?mode=${mode}&amp;st=${x}`, "data-dayhref");

  return layout(
    usDate(date),
    shell,
    `${pageHeader("Days")}
    <div class="calbar">
      <button class="nav" type="button" data-step="-1" aria-label="Previous day">←</button>
      <span class="month" id="dayname">${esc(
        new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)),
      )} ${esc(usDate(date))}</span>
      <button class="nav" type="button" data-step="1" aria-label="Next day">→</button>
      <a class="nav" href="/day/${today}${q}">Today</a>
      ${viewTabs("day", date, q, "data-dayhref")}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}${channelPicker(chide)}
      <span class="draghint">Scroll sideways, or ← → keys. Drag a card to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      } — the channel's later videos follow; Shift-drop moves just the one.</span>
    </div>
    <div class="daystrip" id="daystrip">
      <a class="dayedge" href="/day/${shiftDay(first, -1)}${q}">← Earlier</a>
      ${columns}
      <a class="dayedge" href="/day/${shiftDay(last, 1)}${q}">Later →</a>
    </div>
    <script>
    (function () {
      var mode = ${jsonForScript(mode)};
      var strip = document.getElementById("daystrip");
      var cols = Array.prototype.slice.call(strip.querySelectorAll(".daycol"));
      var focus = strip.querySelector(".daycol.focus") || cols[0];

      function centre(col, smooth) {
        var left = col.offsetLeft - (strip.clientWidth - col.offsetWidth) / 2;
        strip.scrollTo({ left: left, behavior: smooth ? "smooth" : "auto" });
      }

      // Whichever column sits in the middle is "the day": it names the page,
      // and the address follows it.
      function settle() {
        var mid = strip.scrollLeft + strip.clientWidth / 2, best = focus, gap = Infinity;
        cols.forEach(function (c) {
          var d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
          if (d < gap) { gap = d; best = c; }
        });
        if (best !== focus) setFocus(best);
      }

      function setFocus(col) {
        focus.classList.remove("focus");
        col.classList.add("focus");
        focus = col;
        var d = col.dataset.date;
        document.getElementById("dayname").textContent = col.dataset.pretty;
        document.querySelectorAll("[data-dayhref]").forEach(function (a) {
          a.href = a.getAttribute("href")
            .replace(new RegExp("/(day|4day|week)/[0-9]{4}-[0-9]{2}-[0-9]{2}"), "/$1/" + d)
            .replace(new RegExp("/calendar/[0-9]{4}-[0-9]{2}"), "/calendar/" + d.slice(0, 7));
        });
        try { history.replaceState(null, "", "/day/" + d + location.search); } catch (e) {}
      }

      centre(focus, false);
      var timer;
      strip.addEventListener("scroll", function () {
        clearTimeout(timer);
        timer = setTimeout(settle, 90);
      }, { passive: true });

      function step(by) {
        var i = cols.indexOf(focus) + by;
        if (i < 0 || i >= cols.length) {
          var edge = strip.querySelectorAll(".dayedge")[by < 0 ? 0 : 1];
          if (edge) location.href = edge.href;
          return;
        }
        setFocus(cols[i]);
        centre(focus, true);
      }
      document.querySelectorAll("[data-step]").forEach(function (b) {
        b.addEventListener("click", function () { step(Number(b.dataset.step)); });
      });
      document.addEventListener("keydown", function (e) {
        var t = e.target && e.target.tagName;
        if (t === "INPUT" || t === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      });

    })();
    </script>
    ${columnDragScript(mode)}`,
  );
}

/** Seven days, Sunday to Saturday, every item as a card you can drag. */
export function renderWeek(
  shell: Shell,
  start: string,
  mode: CalendarMode,
  days: Array<{ date: string; list: StoredRecord[] }>,
  hide: string[] = [],
  st: StatusHide = [],
  chide: string[] = [],
  /** 7 for a week (Sunday to Saturday), 4 for the 4-day view (from any day). */
  span: 7 | 4 = 7,
): string {
  const q = calQuery(mode, st);
  const today = dateIn(ORG_TZ);
  const off = new Set(shell.daysOff ?? []);
  const end = shiftDay(start, span - 1);
  const anchor = today >= start && today <= end ? today : start;
  const path = span === 4 ? "4day" : "week";

  const tab = (value: CalendarMode, label: string) =>
    `<a class="tab${mode === value ? " on" : ""}" href="/${path}/${start}${calQuery(value, st)}">${label}</a>`;
  const { toggles, showAll } = categoryToggles(hide, (h) => `/${path}/${start}${q}&amp;hide=${h}`);
  const statuses = statusToggles(st, (x) => `/${path}/${start}?mode=${mode}&amp;st=${x}`);
  const total = days.reduce((n, d) => n + d.list.length, 0);

  return layout(
    span === 4 ? `${usDate(start)} – ${usDate(end)}` : `Week of ${usDate(start)}`,
    shell,
    `${pageHeader(span === 4 ? "4 days" : "Week")}
    <div class="calbar">
      <a class="nav" href="/${path}/${shiftDay(start, -span)}${q}" aria-label="${span === 4 ? "Previous 4 days" : "Previous week"}">←</a>
      <span class="month">${esc(usDate(start))} – ${esc(usDate(end))}</span>
      <a class="nav" href="/${path}/${shiftDay(start, span)}${q}" aria-label="${span === 4 ? "Next 4 days" : "Next week"}">→</a>
      <a class="nav" href="/${path}/${today}${q}">${span === 4 ? "Today" : "This week"}</a>
      ${viewTabs(span === 4 ? "4day" : "week", anchor, q)}
      <div class="tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
    </div>
    <div class="cattoggles">${toggles}${showAll}${statuses}${channelPicker(chide)}
      <span class="draghint">${total} ${span === 4 ? "in these 4 days" : "this week"} · drag a card to another day to move its ${
        mode === "posting" ? "air date" : "deadline"
      } — the channel's later videos follow; Shift-drop moves just the one.</span>
    </div>
    <div class="weekgrid${span === 4 ? " span4" : ""}">${days
      .map(({ date: d, list }) => dayColumn(d, list, mode, q, d === today ? " today" : "", off.has(d), visibleGaps(shell.gaps, hide, chide)))
      .join("")}</div>
    ${columnDragScript(mode)}`,
  );
}

/** A record as a card in a day column: what it is, whose it is, when, and ✓ ×. */
function dayCard(r: StoredRecord, mode: CalendarMode): string {
  const ch = r.channel ? channelColour(r.channel) : null;
  const at = mode === "deadlines" ? r.voDue ?? r.deadline ?? r.scriptDue : r.voDue;
  const label = r.kind === "review" ? "review" : r.voDue ? "VO" : r.deadline ? "due" : "script";
  const over = at && r.status === "open" && !r.batchNo && at.getTime() < Date.now();

  const bits: string[] = [];
  if (r.stage) bits.push(esc(r.stage));
  if (r.version) bits.push(`v${r.version}`);
  if (r.batchTarget && r.batchTarget > 1) {
    bits.push(`${r.status === "done" ? r.batchTarget : r.batchDone}/${r.batchTarget}`);
  }

  if (r.offFrom && r.status === "open" && mode === "deadlines") bits.push(offTag(r));

  return `<article class="dcard${r.kind === "review" ? " revision" : ""}${r.status === "done" ? " cleared" : ""}${r.uploadedAt ? " uploaded" : ""}${r.pinnedAt ? " pinned" : ""}${r.noScriptAt && r.status === "open" ? " noscript" : ""}" draggable="true" data-id="${r.id}"
      style="--c:${colourOf(r.category)}">
    <div class="top">
      <span class="swatch" title="${esc(LABELS[r.category] ?? "unsorted")}"></span>
      ${r.code ? `<span class="code">${esc(r.code)}</span>` : ""}
      ${bits.length ? `<span class="bits">${bits.join(" · ")}</span>` : ""}
      ${scriptMark(r, true)}
      ${pinControl(r)}
    </div>
    <a class="t" href="/r/${r.id}">${
      r.batchNo && ch ? `<i class="chdot" style="--ch:${ch}"></i>` : ""
    }${esc(titleOnDay(r))}</a>
    ${
      r.batchNo
        ? ""
        : r.channel && ch
        ? `<a class="chan" style="--ch:${ch};--ink:${channelInk(ch)}" href="/channel/${encodeURIComponent(r.channel)}"><i></i>${esc(r.channel)}</a>`
        : `<span class="pill">${esc(LABELS[r.category] ?? "unsorted")}</span>`
    }
    <div class="foot">
      <span class="at${over ? " over" : ""}">${
        at ? `${esc(label)} ${esc(renderIn(at, ORG_TZ, "ET"))}` : mode === "posting" ? "airs this day" : ""
      }</span>
      ${actions(r)}
    </div>
  </article>`;
}

/** Shift a YYYY-MM-DD by whole days, DST-proof via UTC noon. */
function shiftDay(date: string, by: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
