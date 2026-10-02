/**
 * The dashboard: the deadline chart, the category columns, revisions, what
 * needs assigning next, and the bell's notices.
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { COLOURS, LABELS, REV_ICON, type Shell, actions, bell, channelColour, colourOf, daysOffStrip, displayTitle, fmtScore, gapStrip, layout, nextAssignStrip, pageHeader, pinnedFirst, revColour, row, rows } from "../page.js";
import type { DayBucket, Notice, Stats, StoredRecord } from "../../db/records.js";
import { ORG_TZ, REVIEW_HOURS, dateIn, renderIn, usDate } from "../../parse/derive.js";
import type { UploadGap } from "../gaps.js";
import { esc, safeUrl } from "../html.js";

/**
 * Work due per day, stacked by category.
 *
 * Inline SVG because the page is server-rendered and this is one small chart:
 * a charting library would be more bytes than the whole board. Segments carry
 * a 2px gap so adjacent categories stay separable for colour-blind readers,
 * the legend is always present, and each bar is directly labelled with its
 * total — colour alone never carries meaning here.
 */
/**
 * A filled shape whose top edge is a sine-like wave: from x0 to x1 at level
 * y, down to the floor. One wavelength per `lambda`, amplitude 3px.
 */
function wavePath(x0: number, x1: number, y: number, floor: number, lambda: number): string {
  const amp = 3;
  const half = lambda / 2;
  let d = `M${x0.toFixed(1)} ${floor.toFixed(1)} L${x0.toFixed(1)} ${y.toFixed(1)} q${(half / 2).toFixed(1)} ${-amp} ${half.toFixed(1)} 0`;
  for (let x = x0 + half; x < x1; x += half) d += ` t${half.toFixed(1)} 0`;
  return `${d} L${(x1 + half).toFixed(1)} ${floor.toFixed(1)} Z`;
}

/** Revisions' own colour, the blue-violet of their cards and tags. */
const REVISION_COLOUR = "#7D8AF5";
/** The chart's layers: every category, and revisions on their own. */
const CHART_COLOURS: Record<string, string> = { ...COLOURS, revisions: REVISION_COLOUR };
const CHART_LABELS: Record<string, string> = { ...LABELS, revisions: "Revisions" };

function dueChart(buckets: DayBucket[]): string {
  const W = 780, H = 236;
  const PAD_T = 30;          // room for the total above the tallest bar
  const PAD_B = 52;          // two lines of label under each column
  const plotH = H - PAD_T - PAD_B;
  const slot = W / buckets.length;
  const barW = Math.min(34, slot - 10);
  const r = barW / 2;

  const max = Math.max(3, ...buckets.map((b) => b.total));
  // The categories, Stories first, then revisions as their own layer on top.
  const order = [...CATEGORIES.map((c) => c.id as string), "revisions"];
  // Revisions wear a stripe over their colour, so they never read as Stories' blue.
  const fill = (id: string) => (id === "revisions" ? "url(#revstripe)" : CHART_COLOURS[id] ?? "#8A8F98");
  const today = dateIn(ORG_TZ);

  const columns = buckets
    .map((b, i) => {
      const x = i * slot + (slot - barW) / 2;
      const base = PAD_T + plotH;
      const isToday = b.date === today;
      const isLate = b.date === null;

      // The track: every day keeps its slot whether or not anything is due,
      // so an empty week reads as empty rather than as missing.
      const track = `<rect class="track" x="${x.toFixed(1)}" y="${PAD_T}" width="${barW}"
        height="${plotH}" rx="${r}" fill="${
          isToday ? "#3A3721" : isLate ? "#3B2426" : "#26262C"
        }"/>`;

      // The work is liquid poured into the pill: clipped to the track's own
      // shape, so the bottom is always the pill's round end and the level is
      // a surface, never a shrunken capsule of its own. It rises into place
      // when the page loads; a pill that isn't full keeps a slow wave on top.
      const total = b.total;
      const level = (total / max) * plotH;
      const full = total >= max;
      const clipId = `pill${i}`;
      const clip = `<clipPath id="${clipId}"><rect x="${x.toFixed(1)}" y="${PAD_T}" width="${barW}"
        height="${plotH}" rx="${r}"/></clipPath>`;

      const layers = order.filter((id) => (b.counts[id] ?? 0) > 0);
      let y = base;
      const segs = layers
        .map((id, n) => {
          const count = b.counts[id] ?? 0;
          const h = (count / max) * plotH;
          y -= h;
          // A 2px seam of track shows between one layer and the one below.
          const floor = n === 0 ? base + 2 : y + h - 2;
          const tip = `<title>${esc(`${CHART_LABELS[id] ?? id}: ${count}`)}</title>`;
          const top = n === layers.length - 1;
          if (top && !full) {
            // The surface: a wave twice the pill's width, slid sideways by
            // one wavelength forever — seamless because it repeats.
            // A paler wave behind, half a wavelength out and drifting the
            // other way, gives the surface depth.
            return `<path class="wave back" d="${wavePath(x - barW * 1.5, x + barW * 2, y - 1.5, floor, barW)}"
              fill="${fill(id)}" opacity=".4"/>
              <path class="wave" d="${wavePath(x - barW, x + barW * 2, y, floor, barW)}"
              fill="${fill(id)}">${tip}</path>`;
          }
          // Full to the brim, the top layer runs past the rim and the clip
          // rounds it; below the surface, layers are flat.
          const yTop = top ? PAD_T - 2 : y;
          return `<rect x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${barW}"
            height="${Math.max(1, floor - yTop).toFixed(1)}" fill="${fill(id)}">${tip}</rect>`;
        })
        .join("");

      const liquid = total
        ? `${clip}<g clip-path="url(#${clipId})"><g class="liquid" style="--rise:${level.toFixed(1)}px;--d:${(
            i * 45
          ).toFixed(0)}ms">${segs}</g></g>`
        : "";

      // The count sits above its own level. No y-axis: the number is the
      // value, and a tick scale would only ask you to read one off the other.
      const count = total
        ? `<text class="total" x="${(x + barW / 2).toFixed(1)}" y="${(base - level - 11).toFixed(1)}"
            text-anchor="middle" style="--d:${(i * 45).toFixed(0)}ms">${total}</text>`
        : "";

      const at = b.date ? new Date(`${b.date}T12:00:00Z`) : null;
      const weekday = at
        ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(at)
        : "";
      const dayNum = at
        ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", day: "numeric" }).format(at)
        : "";
      const weekend = at ? [0, 6].includes(at.getUTCDay()) : false;

      const labels = isLate
        ? `<text class="lab late" x="${(x + barW / 2).toFixed(1)}" y="${base + 22}"
             text-anchor="middle">LATE</text>`
        : `<text class="lab wd${weekend ? " weekend" : ""}${isToday ? " on" : ""}"
             x="${(x + barW / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle">${esc(weekday)}</text>
           <text class="lab dn${isToday ? " on" : ""}" x="${(x + barW / 2).toFixed(1)}"
             y="${base + 38}" text-anchor="middle">${esc(dayNum)}</text>`;

      // The whole column — pill, count and date — opens that day's work.
      // The hit area is the full slot, so a thin empty pill is still easy
      // to press.
      const href = isLate ? "/late" : `/day/${b.date}?mode=deadlines&amp;st=done`;
      const label = isLate
        ? `${total} late — open the list`
        : `${weekday} ${usDate(b.date!)}: ${total} due — open the day`;
      return `<a class="col" href="${href}" aria-label="${esc(label)}">
        <title>${esc(label)}</title>
        <rect class="hit" x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent"/>
        ${track}${liquid}${count}${labels}</a>`;
    })
    .join("");

  // A rule after the overdue slot: what is late is a different kind of thing
  // from what is merely scheduled.
  const dividerX = slot;
  const divider = `<line x1="${dividerX.toFixed(1)}" x2="${dividerX.toFixed(1)}" y1="${PAD_T - 10}"
    y2="${(PAD_T + plotH + 44).toFixed(1)}" stroke="#3A3A42" stroke-width="1" stroke-dasharray="3 4"/>`;

  const ahead = buckets.reduce((n, b) => (b.date ? n + b.total : n), 0);
  const late = buckets.find((b) => b.date === null)?.total ?? 0;

  const legend = order
    .map((id) => `<span${id === "revisions" ? ' class="revkey"' : ""} style="--c:${CHART_COLOURS[id] ?? "#8A8F98"}"><i></i>${esc(CHART_LABELS[id] ?? id)}</span>`)
    .join("");
  const defs = `<defs><pattern id="revstripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" fill="${REVISION_COLOUR}"/><rect width="2.4" height="6" fill="#B9C1FA"/></pattern></defs>`;

  return `<div class="chart">
    <div class="chart-head">
      <div class="hero">
        <div class="n">${ahead}</div>
        <div class="l">due in the next 14 days${late ? ` · <b>${late} late</b>` : ""}</div>
      </div>
      <div class="legend">${legend}</div>
    </div>
    <div class="chartscroll">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="--lambda:${barW}px"
        aria-label="Work due by day, stacked by category with revisions on top. Press a day to open it.">${defs}${divider}${columns}</svg>
    </div>
  </div>`;
}

/** One category's slice of the queue, headed and counted. */
function group(id: string, list: StoredRecord[], sub = ""): string {
  const c = colourOf(id);
  return `<div class="group">
    <div class="head" style="--c:${c}">
      <span class="dot"></span>
      <span class="name">${esc(LABELS[id] ?? "Unsorted")}</span>
      ${sub ? `<span class="sub">${esc(sub)}</span>` : ""}
      <span class="n">${list.length}</span>
    </div>
    ${rows(list, "Nothing open here.")}
  </div>`;
}

/**
 * Revisions on the dashboard: their own section, each due for review
 * REVIEW_HOURS after it came in unless its message said otherwise, soonest
 * first. The columns below are the work to voice.
 */
function revisionsSection(list: StoredRecord[], hidden: boolean): string {
  const late = list.filter((r) => {
    const at = r.deadline ?? r.voDue ?? r.scriptDue;
    return at !== null && at.getTime() < Date.now();
  }).length;
  return `<section class="panel revpanel dashpart" data-part="revisions"${hidden ? " hidden" : ""}>
    <div class="revhead">
      <h2>${REV_ICON}Revisions</h2>
      <a class="seeall" href="/revisions">All →</a>
    </div>
    <div class="sub">${
      list.length
        ? `${list.length} to review${late ? ` · <b class="late">${late} past ${late === 1 ? "its" : "their"} time</b>` : ""}`
        : `Nothing to review. Each new one is due ${REVIEW_HOURS} hours after it comes in.`
    }</div>
    ${list.length ? `<div class="revlist">${list.map(revMini).join("")}</div>` : ""}
  </section>`;
}

/**
 * A revision as the dashboard's side panel shows it: the title on up to two
 * lines, one row of chips, then the review time and the buttons on a line of
 * their own — the same size on every card, however long the title.
 */
function revMini(r: StoredRecord): string {
  const at = r.deadline ?? r.voDue ?? r.scriptDue;
  const ms = at ? at.getTime() - Date.now() : null;
  const span = (n: number) => {
    const h = Math.round(Math.abs(n) / 3_600_000);
    return h < 1 ? "<1h" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
  };
  const state = ms === null ? "none" : ms < 0 ? "late" : ms < 86_400_000 ? "soon" : "";
  const [date, time] = at ? renderIn(at, ORG_TZ, "ET").split(" @ ") : ["", ""];
  const when = at
    ? `<span class="rwhen ${state}" title="${esc(`Review by ${renderIn(at, ORG_TZ, "ET")}`)}"><b>${esc((date ?? "").replace(/\/\d{4}$/, ""))}</b><span class="tm">${esc((time ?? "").replace(/ ET$/, ""))}</span>${
        ms === null ? "" : `<em>${ms < 0 ? `${span(ms)} late` : `in ${span(ms)}`}</em>`
      }</span>`
    : `<span class="rwhen none">no review time</span>`;
  const frame = r.links.find((l) => l.kind === "frameio");
  const chips = [
    `<span class="rv">${REV_ICON}v${r.version ?? 1}</span>`,
    typeof r.reviewScore === "number" ? `<a class="rscore" href="/r/${r.id}#summary" style="--sc:${revColour(r.reviewScore)}">${esc(fmtScore(r.reviewScore))}/10</a>` : "",
    r.channel ? `<span class="rch" style="--ch:${channelColour(r.channel)}"><i></i>${esc(r.channel.replace(/^Specular /, ""))}</span>` : "",
    frame ? `<a class="rframe" href="${esc(safeUrl(frame.url))}" target="_blank" rel="noreferrer" title="Open on Frame.io">Frame.io ↗</a>` : "",
  ].join("");
  return `<article class="revmini${state === "late" ? " late" : ""}${r.pinnedAt ? " pinned" : ""}">
    <a class="rt" href="/r/${r.id}" title="${esc(displayTitle(r))}">${esc(displayTitle(r))}</a>
    <div class="rchips">${chips}</div>
    <div class="rfoot">${when}${actions(r)}</div>
  </article>`;
}

/** The dashboard's columns until you pick your own. */
export const DEFAULT_DASH_COLS = ["stories", "gaming", "bits"];

/** The categories in the dashboard's column order: the saved order, then any it doesn't name. */
export function dashOrder(saved: string[] = []): typeof CATEGORIES {
  const byId = new Map(CATEGORIES.map((c) => [c.id as string, c]));
  const first = [...new Set(saved)].map((id) => byId.get(id)).filter((c): c is (typeof CATEGORIES)[number] => Boolean(c));
  return [...first, ...CATEGORIES.filter((c) => !first.includes(c))];
}

const GRIP_ICON = `<svg viewBox="0 0 10 16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.3"/><circle cx="7.5" cy="3" r="1.3"/><circle cx="2.5" cy="8" r="1.3"/><circle cx="7.5" cy="8" r="1.3"/><circle cx="2.5" cy="13" r="1.3"/><circle cx="7.5" cy="13" r="1.3"/></g></svg>`;

export function renderDashboard(
  shell: Shell,
  data: {
    stats: Stats;
    byDay: DayBucket[];
    grouped: Map<string, StoredRecord[]>;
    channels: Record<string, number>;
    notices?: Notice[];
    seen?: number;
    /** Which categories show as columns, from the dash_cols cookie. */
    cols?: string[];
    /** The columns' order, every category, from the dash_order cookie. */
    order?: string[];
    /** Parts of the dashboard switched off ("unsorted", "channels"), from dash_hide. */
    hideParts?: string[];
    /** Open work a day off brought forward. */
    shifted?: StoredRecord[];
    /** Open revisions, soonest review first — their own section, never in the columns. */
    revisions?: StoredRecord[];
    /** Upload slots in the next eight days with nothing assigned. */
    gaps?: UploadGap[];
    /** Finance's sustainability alerts, already drawn (finance/ui dashboardAlerts). */
    finance?: string;
    /** Each channel's first upload with nothing assigned, soonest first: the next to assign. */
    nextUp?: UploadGap[];
  },
): string {
  const tiles = [
    { n: data.stats.late, l: "late", alert: data.stats.late > 0 },
    { n: data.stats.dueToday, l: "due today", alert: false },
    { n: data.stats.voToRecord, l: "VO to record", alert: false },
    { n: data.stats.shippedThisWeek, l: "cleared this week", alert: false },
  ]
    .map(
      (t) => `<div class="stat${t.alert ? " alert" : t.n === 0 ? " zero" : ""}">
        <div class="n">${t.n}</div><div class="l">${esc(t.l)}</div>
      </div>`,
    )
    .join("");

  const today = data.byDay[1];
  const todayLines = [...CATEGORIES.map((c) => ({ id: c.id as string, label: c.label, color: c.color })), { id: "revisions", label: "Revisions", color: REVISION_COLOUR }]
    .map((c) => {
      const n = today?.counts[c.id] ?? 0;
      return `<div class="line" style="--c:${c.color}">
      <span class="dot"></span>${esc(c.label)}<span class="n">${n}</span>
    </div>`;
    })
    .join("");

  // Categories side by side, in the order they were last arranged. Every
  // category is rendered; the ones not picked are hidden, so ticking one in
  // the Columns menu shows it at once.
  const picked = new Set(data.cols ?? DEFAULT_DASH_COLS);
  const cats = dashOrder(data.order);
  const shown = cats.filter((c) => picked.has(c.id)).length;
  const hideParts = new Set(data.hideParts ?? []);
  const columns = cats.map((c) => {
    const list = pinnedFirst(data.grouped.get(c.id) ?? []);
    const channels = CHANNELS.filter((ch) => ch.category === c.id).length;
    return `<section class="catcol" data-cat="${c.id}" style="--c:${c.color}"${picked.has(c.id) ? "" : " hidden"}>
      <div class="colhead">
        <span class="grip" draggable="true" title="Drag to move this column" aria-hidden="true">${GRIP_ICON}</span>
        <span class="dot"></span>
        <a class="name" href="/category/${c.id}">${esc(c.label)}</a>
        ${channels > 1 ? `<span class="sub">${channels} channels</span>` : ""}
        <span class="n">${list.length}</span>
      </div>
      ${list.length ? `<div class="rows">${list.slice(0, 10).map(row).join("")}</div>` : `<div class="empty">Nothing open.</div>`}
      ${list.length > 10 ? `<a class="seeall" href="/category/${c.id}">See all ${list.length} →</a>` : ""}
    </section>`;
  }).join("");

  const colPicker = `<details class="colpick">
    <summary>Columns <b id="colcount">${shown}</b></summary>
    <div class="colmenu" role="group" aria-label="Categories to show, in order">
      <div class="colorder" id="colorder">${cats
        .map(
          (c) => `<div class="colopt" data-cat="${c.id}" style="--c:${c.color}">
          <label><input type="checkbox" value="${c.id}"${picked.has(c.id) ? " checked" : ""}>
            <i></i>${esc(c.label)}<span>${(data.grouped.get(c.id) ?? []).length}</span></label>
          <button type="button" class="mv" data-d="-1" aria-label="Move ${esc(c.label)} left">↑</button>
          <button type="button" class="mv" data-d="1" aria-label="Move ${esc(c.label)} right">↓</button>
        </div>`,
        )
        .join("")}</div>
      <p class="colhint">Drag a column by its ⠿, or use the arrows. First is leftmost.</p>
      <div class="colparts">
        <b>Also show</b>
        <label><input type="checkbox" data-part="revisions"${hideParts.has("revisions") ? "" : " checked"}> Revisions</label>
        <label><input type="checkbox" data-part="unsorted"${hideParts.has("unsorted") ? "" : " checked"}> Unsorted</label>
        <label><input type="checkbox" data-part="channels"${hideParts.has("channels") ? "" : " checked"}> Channels</label>
      </div>
    </div>
  </details>`;

  const unsorted = pinnedFirst(data.grouped.get("unknown") ?? []);

  const chanList = CHANNELS.map((ch) => {
    const n = data.channels[ch.name] ?? 0;
    return `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${ch.color}">
      <span class="dot"></span>${esc(ch.name)}<span class="n">${n}</span></a>`;
  }).join("");

  return layout(
    "Dashboard",
    shell,
    `${pageHeader("Dashboard", `<a class="clear nextbtn" href="/my-day?next=1#focus" title="The most pressing piece of your work, from My Day">What should I do next?</a>${bell(data.notices ?? [], data.seen ?? 0)}`)}
    ${nextAssignStrip(data.nextUp ?? [])}
    <div class="stats">${tiles}</div>
    ${gapStrip(data.gaps ?? [])}
    ${data.finance ?? ""}
    ${daysOffStrip(shell.daysOff ?? [], data.shifted ?? [])}

    <div class="split withrev">
      <div class="panel">
        <h2>Work due by day</h2>
        ${dueChart(data.byDay)}
      </div>
      ${revisionsSection(data.revisions ?? [], hideParts.has("revisions"))}
      <div class="panel today">
        <div class="date">${esc(
          new Intl.DateTimeFormat("en-US", {
            timeZone: ORG_TZ, weekday: "short", day: "numeric", month: "short",
          }).format(new Date()),
        )}</div>
        <div class="due">${today?.total ?? 0} due today</div>
        ${todayLines}
      </div>
    </div>

    <div class="colbar">
      <h2 class="section-title">Open work</h2>
      ${colPicker}
    </div>
    <div class="catcols" id="catcols" data-n="${shown}" style="--n:${Math.max(shown, 1)}">${columns}</div>
    <div class="empty nocols"${shown ? " hidden" : ""}>Pick a category under Columns to see its work here.</div>
    <script>
    // Tick a category and its column appears; drag a column by its grip (or
    // use the arrows in the menu) to put it where you want. Both are kept in
    // cookies so the dashboard opens the same way next time.
    (function () {
      var grid = document.getElementById("catcols"), count = document.getElementById("colcount");
      var list = document.getElementById("colorder");
      var none = document.querySelector(".nocols");
      var YEAR = "; path=/; max-age=31536000; samesite=lax";
      function ticked() {
        var on = [];
        list.querySelectorAll(".colopt input").forEach(function (b) {
          grid.querySelector('[data-cat="' + b.value + '"]').hidden = !b.checked;
          if (b.checked) on.push(b.value);
        });
        grid.dataset.n = String(on.length);
        grid.style.setProperty("--n", String(Math.max(on.length, 1)));
        count.textContent = String(on.length);
        none.hidden = on.length > 0;
        document.cookie = "dash_cols=" + (on.join(".") || "none") + YEAR;
      }
      // One order for both: the menu's rows and the columns follow it.
      function arrange(ids) {
        ids.forEach(function (id) {
          grid.appendChild(grid.querySelector('.catcol[data-cat="' + id + '"]'));
          list.appendChild(list.querySelector('.colopt[data-cat="' + id + '"]'));
        });
        document.cookie = "dash_order=" + ids.join(".") + YEAR;
        ticked();
      }
      function order(root, sel) {
        return Array.prototype.map.call(root.querySelectorAll(sel), function (el) { return el.dataset.cat; });
      }
      list.querySelectorAll(".colopt input").forEach(function (box) { box.addEventListener("change", ticked); });
      list.querySelectorAll(".mv").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var ids = order(list, ".colopt");
          var id = btn.closest(".colopt").dataset.cat, i = ids.indexOf(id), j = i + Number(btn.dataset.d);
          if (j < 0 || j >= ids.length) return;
          ids.splice(i, 1);
          ids.splice(j, 0, id);
          arrange(ids);
          btn.focus();
        });
      });
      var dragging = null;
      grid.querySelectorAll(".catcol .grip").forEach(function (grip) {
        grip.addEventListener("dragstart", function (e) {
          dragging = grip.closest(".catcol");
          dragging.classList.add("moving");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", dragging.dataset.cat);
        });
        grip.addEventListener("dragend", function () {
          if (dragging) dragging.classList.remove("moving");
          dragging = null;
          arrange(order(grid, ".catcol"));
        });
      });
      grid.addEventListener("dragover", function (e) {
        if (!dragging) return;
        e.preventDefault();
        var over = e.target.closest && e.target.closest(".catcol");
        if (!over || over === dragging) return;
        var box = over.getBoundingClientRect();
        grid.insertBefore(dragging, e.clientX > box.left + box.width / 2 ? over.nextSibling : over);
      });
      grid.addEventListener("drop", function (e) { if (dragging) e.preventDefault(); });
      // Unsorted and Channels: shown or not, remembered the same way.
      document.querySelectorAll(".colparts input").forEach(function (box) {
        box.addEventListener("change", function () {
          var off = [];
          document.querySelectorAll(".colparts input").forEach(function (b) {
            document.querySelectorAll('[data-part="' + b.dataset.part + '"]').forEach(function (el) {
              if (el !== b) el.hidden = !b.checked;
            });
            if (!b.checked) off.push(b.dataset.part);
          });
          document.cookie = "dash_hide=" + (off.join(".") || "none") + YEAR;
        });
      });
      document.addEventListener("click", function (e) {
        var menu = document.querySelector(".colpick");
        if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
      });
    })();
    </script>
    <div class="dashpart" data-part="unsorted"${hideParts.has("unsorted") ? " hidden" : ""}>${
      unsorted.length ? group("unknown", unsorted.slice(0, 8), "needs a category") : ""
    }</div>

    <div class="group dashpart" data-part="channels"${hideParts.has("channels") ? " hidden" : ""}>
      <h2 class="section-title">Channels</h2>
      <div class="chanlist">${chanList}</div>
    </div>`,
  );
}
