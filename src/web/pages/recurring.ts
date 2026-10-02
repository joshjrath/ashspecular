/**
 * Recurring: today's daily batches (Bits, Reading, Specular) and working
 * ahead on the days to come.
 */
import { CATEGORIES, CHANNELS, isLongFormRecurring } from "../../catalog.js";
import { PAUSE_ICON, type Shell, channelColour, channelPauseButton, colourOf, layout, pageHeader, rows } from "../page.js";
import type { StoredRecord } from "../../db/records.js";
import { esc } from "../html.js";
import { usDate } from "../../parse/derive.js";

/** The Recurring page: today's batches per channel, and working ahead. */
export function renderRecurring(
  shell: Shell,
  today: { date: string; rows: Array<{ channel: string; total: number; done: number; removed: number; date?: string; paused?: boolean }> },
  ahead: { date: string; rows: Array<{ channel: string; total: number; done: number; removed: number; paused?: boolean }> },
  list: StoredRecord[],
  strip: Array<{ date: string; channels: number; total: number; done: number }> = [],
  maxAhead = 90,
): string {
  const categoryOf = (channel: string) => CHANNELS.find((ch) => ch.name === channel)?.category ?? "bits";

  const line = (
    r: { channel: string; total: number; done: number; removed?: number; date?: string; paused?: boolean },
    sectionDate?: string,
  ) => {
    // A paused channel keeps its row, marked, with the way back.
    if (r.paused) {
      return `<div class="batch chpaused" style="--c:${colourOf(categoryOf(r.channel))};--ch:${channelColour(r.channel)}">
      <a class="who" href="/channel/${encodeURIComponent(r.channel)}"><span class="dot"></span><span class="name">${esc(r.channel)}</span></a>
      <span class="chpausetag">${PAUSE_ICON}Paused${shell.pausedChannels?.[r.channel] ? ` since ${esc(usDate(shell.pausedChannels[r.channel]!))}` : ""}</span>
      ${channelPauseButton(shell, r.channel, "compact")}
    </div>`;
    }
    // A long-form channel's today can be a calendar day ahead of the Shorts
    // day (midnight to 3 AM), so its row carries its own date.
    const date = sectionDate ? r.date ?? sectionDate : undefined;
    const lf = isLongFormRecurring(CHANNELS.find((ch) => ch.name === r.channel));
    const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    const state =
      r.total === 0
        ? r.removed ? "removed" : "not open"
        : lf
          ? r.done === r.total ? "video up" : "video due"
          : r.done === r.total ? "cleared" : `${r.done}/${r.total}`;
    const clearAll =
      date && r.total > r.done
        ? `<form class="tick" method="post" action="/recurring/clear">
             <input type="hidden" name="channel" value="${esc(r.channel)}">
             <input type="hidden" name="date" value="${esc(date)}">
             <button aria-label="Clear ${esc(r.channel)}" title="Clear the whole day">✓</button>
           </form>`
        : `<span class="tick-space"></span>`;

    // One segment per upload — five, three, or a single one — so every row
    // reads the same way. Tapping the third marks three done; tapping the
    // last filled one again steps back one, so a mis-tap is one more tap.
    const progress =
      date && r.total > 0
        ? `<span class="pips" role="group" aria-label="${esc(r.channel)} uploads done">${Array.from(
            { length: r.total },
            (_, i) => {
              const n = i + 1;
              const filled = n <= r.done;
              const target = n === r.done ? n - 1 : n;
              return `<form method="post" action="/recurring/progress">
                <input type="hidden" name="channel" value="${esc(r.channel)}">
                <input type="hidden" name="date" value="${esc(date)}">
                <input type="hidden" name="done" value="${target}">
                <button class="pip${filled ? " on" : ""}"
                  aria-label="${n === r.done ? `Undo — back to ${n - 1} of ${r.total}` : `${n} of ${r.total} done`}"
                  title="${n === r.done ? `Back to ${n - 1}` : `${n} of ${r.total} done`}"></button>
              </form>`;
            },
          ).join("")}</span>`
        : `<span class="bar"><span style="width:${pct}%"></span></span>`;

    return `<div class="batch${r.total && r.done === r.total ? " done" : ""}" style="--c:${colourOf(categoryOf(r.channel))};--ch:${channelColour(r.channel)}">
      <a class="who" href="/channel/${encodeURIComponent(r.channel)}">
        <span class="dot"></span><span class="name">${esc(r.channel)}</span>${lf ? `<span class="lfbadge" title="Long-form — one video a day, midnight to midnight">LF</span>` : ""}
      </a>
      ${progress}
      <span class="state">${esc(state)}</span>
      ${clearAll}
    </div>`;
  };

  const pretty = (d: string) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));

  // A channel is missing on a day when nothing of it is there — not even a
  // batch someone removed on purpose, which must stay removed.
  const missing = ahead.rows.filter((r) => r.total === 0 && r.removed === 0 && !r.paused).length;
  const channelCount = ahead.rows.filter((r) => !r.paused).length;
  // A day off has no batches.
  const offDays = new Set(shell.daysOff ?? []);
  const offNote = (date: string, rows_: unknown[]) =>
    offDays.has(date) && !rows_.length ? `<div class="empty">🌙 A day off — no batches.</div>` : "";
  const firstAhead = strip[0]?.date ?? ahead.date;
  const shift = (d: string, by: number) => {
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + by);
    return x.toISOString().slice(0, 10);
  };
  const lastAllowed = shift(firstAhead, maxAhead - 1);

  // Two weeks at a glance: how much of each day is open, and how much is done.
  const chips = strip
    .map((d) => {
      const at = new Date(`${d.date}T12:00:00Z`);
      const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(at);
      const isOff = offDays.has(d.date) && d.channels === 0;
      const state = isOff ? "none dayoff" : d.channels === 0 ? "none" : d.channels < channelCount ? "part" : "full";
      const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
      return `<a class="daychip ${state}${d.date === ahead.date ? " on" : ""}" href="/recurring?day=${d.date}"
          title="${esc(usDate(d.date))}: ${
            isOff ? "a day off — no batches" : d.channels === 0 ? "not open" : `${d.channels}/${channelCount} channels open · ${d.done}/${d.total} uploads done`
          }">
        <b>${esc(wd)}</b><span>${esc(usDate(d.date).replace(/\/\d{4}$/, ""))}</span>
        <i><em style="width:${pct}%"></em></i>
        <small>${isOff ? "day off" : d.channels === 0 ? "not open" : d.channels < channelCount ? `${d.channels}/${channelCount} open` : `${d.done}/${d.total}`}</small>
      </a>`;
    })
    .join("");

  // One labelled block per recurring category — Reading, then Bits — so a
  // dozen lines read as two short lists rather than one long one.
  type Row_ = { channel: string; total: number; done: number; removed: number; paused?: boolean };
  const sections = (list_: Row_[], date: string) =>
    CATEGORIES.filter((cat) => list_.some((r) => categoryOf(r.channel) === cat.id))
      .map((cat) => {
        const mine = list_.filter((r) => categoryOf(r.channel) === cat.id);
        // A paused channel keeps its row but not its count.
        const live = mine.filter((r) => !r.paused);
        const done = live.reduce((n, r) => n + r.done, 0);
        const total = live.reduce((n, r) => n + r.total, 0);
        const longForm = mine.every((r) => isLongFormRecurring(CHANNELS.find((ch) => ch.name === r.channel)));
        const unit = longForm
          ? total === 1 ? "long-form video" : "long-form videos"
          : mine.some((r) => (CHANNELS.find((ch) => ch.name === r.channel)?.recurring?.units ?? 1) > 1)
            ? "uploads"
            : "cleared";
        return `<div class="batch-group" style="--c:${cat.color}">
          <div class="batch-head"><span class="dot"></span>${esc(cat.label)}${
            longForm ? `<span class="sub">long-form · midnight to midnight</span>` : ""
          }
            <span class="n">${done}/${total} ${unit}</span></div>
          <div class="batches">${mine.map((r) => line(r, date)).join("")}</div>
        </div>`;
      })
      .join("");

  return layout(
    "Recurring",
    shell,
    `${pageHeader("Recurring")}
    <div class="panel" style="margin-bottom:14px">
      <h2>Today · ${esc(pretty(today.date))}</h2>
      ${offNote(today.date, today.rows)}${sections(today.rows, today.date)}
    </div>

    <div class="panel ahead" style="margin-bottom:14px">
      <h2>Ahead</h2>
      <div class="aheadbar">
        <a class="nav" href="/recurring?day=${shift(ahead.date, -1)}" aria-label="Previous day"${
          ahead.date <= firstAhead ? ' aria-disabled="true" tabindex="-1"' : ""
        }>←</a>
        <form method="get" action="/recurring" class="daypick">
          <input type="date" name="day" value="${ahead.date}" min="${firstAhead}" aria-label="Pick a day"
            onchange="this.form.submit()">
        </form>
        <a class="nav" href="/recurring?day=${shift(ahead.date, 1)}" aria-label="Next day">→</a>
        <form method="post" action="/recurring/ahead" class="quick">
          <span>Open the next</span>
          <button class="chipbtn" name="days" value="7">7 days</button>
          <button class="chipbtn" name="days" value="14">14 days</button>
          <button class="chipbtn" name="days" value="30">30 days</button>
        </form>
        <form method="post" action="/recurring/ahead" class="quick">
          <span>or through</span>
          <input type="date" name="through" min="${firstAhead}" max="${lastAllowed}" value="${shift(firstAhead, 6)}" aria-label="Open every day through">
          <button class="chipbtn go">Open</button>
        </form>
      </div>
      <div class="daychips">${chips}</div>

      <div class="aheadday">
        <h3>${esc(pretty(ahead.date))}</h3>
        ${
          missing && !offDays.has(ahead.date)
            ? `<form method="post" action="/recurring/ahead" class="openday">
                 <input type="hidden" name="day" value="${ahead.date}">
                 <button class="clear">${
                   missing === channelCount ? "Open this day" : `Open the ${missing} channel${missing === 1 ? "" : "s"} not open yet`
                 }</button>
               </form>`
            : ""
        }
      </div>
      ${
        missing === channelCount && offDays.has(ahead.date)
          ? `<div class="empty">🌙 A day off — no batches. Make it a working day again on the calendar and they open.</div>`
          : missing === channelCount
          ? `<p class="hint">Nothing open for this day yet. It opens by itself that morning — or open it now to work ahead.</p>`
          : `${sections(ahead.rows, ahead.date)}
             <p class="hint">Clear anything you get ahead on and it stays cleared — the morning run finds
             these and leaves them alone.</p>`
      }
    </div>

    <div class="group">
      <div class="head" style="--c:${colourOf("reading")}">
        <span class="dot"></span><span class="name">Today's batches</span>
        <span class="sub">${esc(pretty(today.date))}</span>
        <span class="n">${list.length}</span>
      </div>
      ${rows(list, "Nothing open yet today.")}
    </div>
    <script>
    // Ticking a segment or clearing a channel saves in the background: the
    // segment fills at once, then the page's numbers refresh in place. No
    // reload, so no flash of the dark background between taps.
    (function () {
      var busy = Promise.resolve();
      function fill(form) {
        var row = form.closest(".batch");
        if (!row) return;
        var pips = row.querySelectorAll(".pip");
        var total = pips.length;
        var done = new URL(form.action, location.href).pathname === "/recurring/clear" ? total : Number(form.elements.done.value);
        pips.forEach(function (p, i) {
          p.classList.toggle("on", i < done);
          // Tapping the last filled segment again steps back one — so a quick
          // second tap works before the refresh lands.
          var input = p.form && p.form.elements.done;
          if (input) input.value = String(i + 1 === done ? i : i + 1);
        });
        var state = row.querySelector(".state");
        if (state && total) state.textContent = done === total ? "cleared" : done + "/" + total;
        row.classList.toggle("done", total > 0 && done === total);
      }
      function refresh() {
        return fetch(location.href, { headers: { Accept: "text/html" } })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var fresh = new DOMParser().parseFromString(html, "text/html").querySelector("main");
            var main = document.querySelector("main");
            if (!fresh || !main) return;
            main.querySelectorAll(".panel, .group").forEach(function (el, i) {
              var next = fresh.querySelectorAll(".panel, .group")[i];
              if (next) el.innerHTML = next.innerHTML;
            });
            var nav = fresh.ownerDocument.querySelector("aside nav");
            if (nav) document.querySelector("aside nav").innerHTML = nav.innerHTML;
          });
      }
      document.addEventListener("submit", function (e) {
        var form = e.target;
        var path = new URL(form.action, location.href).pathname;
        if (path !== "/recurring/progress" && path !== "/recurring/clear") return;
        e.preventDefault();
        // Read what was tapped before fill() turns the segment into "step back one".
        var body = new URLSearchParams(new FormData(form));
        fill(form);
        busy = busy.then(function () {
          return fetch(form.action, { method: "POST", body: body, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        }).then(function (r) {
          if (!r.ok) throw new Error("save failed");
          return refresh();
        }).catch(function () { location.reload(); });
      });
    })();
    </script>`,
  );
}
