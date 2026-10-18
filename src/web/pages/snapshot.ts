/**
 * Calendar → Snapshot: pick a range and Posting or Deadlines, see the poster,
 * and save it as a PNG (drawn in the browser from the SVG), copy it, or keep
 * the SVG.
 */
import { esc } from "../html.js";
import { layout, pageHeader, type Shell } from "../page.js";
import { shiftDate } from "../../parse/derive.js";
import { SNAP_MAX_DAYS, type SnapMode, layoutFor, rangeTitle } from "../snapshot.js";

export interface SnapshotView {
  mode: SnapMode;
  from: string;
  to: string;
  today: string;
  svg: string;
  /** The range was longer than SNAP_MAX_DAYS and was cut to it. */
  capped: boolean;
}

const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const monthEnd = (d: string) => shiftDate(`${shiftDate(monthStart(d), 32).slice(0, 7)}-01`, -1);
const sunday = (d: string) => shiftDate(d, -new Date(`${d}T12:00:00Z`).getUTCDay());

export function renderSnapshot(shell: Shell, v: SnapshotView): string {
  const t = v.today;
  const presets: Array<[string, string, string]> = [
    ["This week", sunday(t), shiftDate(sunday(t), 6)],
    ["Next 7 days", t, shiftDate(t, 6)],
    ["Next week", shiftDate(sunday(t), 7), shiftDate(sunday(t), 13)],
    ["Next 2 weeks", t, shiftDate(t, 13)],
    ["This month", monthStart(t), monthEnd(t)],
    ["Next month", monthStart(shiftDate(monthEnd(t), 1)), monthEnd(shiftDate(monthEnd(t), 1))],
    ["Next 90 days", t, shiftDate(t, 89)],
  ];
  const href = (o: { mode?: SnapMode; from?: string; to?: string }) =>
    `/calendar/snapshot?mode=${o.mode ?? v.mode}&amp;from=${o.from ?? v.from}&amp;to=${o.to ?? v.to}`;
  const tab = (m: SnapMode, label: string) => `<a class="nt-tab${v.mode === m ? " on" : ""}" href="${href({ mode: m })}">${label}</a>`;
  const chips = presets.map(([label, f, to]) => `<a class="fchip${v.from === f && v.to === to ? " on" : ""}" href="${href({ from: f, to })}">${esc(label)}</a>`).join("");
  const days = Math.round((Date.parse(`${v.to}T12:00:00Z`) - Date.parse(`${v.from}T12:00:00Z`)) / 86_400_000) + 1;
  const kind = { columns: "a column a day", grid: "a calendar grid", timeline: "channels by week" }[layoutFor(days)];
  const name = `specular-${v.mode}-${v.from}-to-${v.to}`;

  return layout(
    "Calendar snapshot",
    shell,
    `${pageHeader("Snapshot", `<a class="clear secondary" href="/calendar${v.mode === "deadlines" ? "?mode=deadlines" : ""}">← Calendar</a>`)}
    <section class="panel snapctl">
      <div class="snaprow"><div class="nt-tabs">${tab("posting", "Posting")}${tab("deadlines", "Deadlines")}</div>
        <form method="get" action="/calendar/snapshot" class="snapdates">
          <input type="hidden" name="mode" value="${v.mode}">
          <label>From <input type="date" name="from" value="${esc(v.from)}" required></label>
          <label>To <input type="date" name="to" value="${esc(v.to)}" required></label>
          <button class="clear secondary">Show</button>
        </form></div>
      <div class="fchips snapchips">${chips}</div>
      <p class="hint" style="padding:0;margin:8px 0 0">${esc(rangeTitle(v.from, v.to))} · ${days} day${days === 1 ? "" : "s"}, drawn as ${esc(kind)}. ${v.mode === "posting" ? "Videos by the day they air." : "Work by the day it's due, with which deadline and when."} Daily batches are counted, not drawn.${v.capped ? ` Cut to ${SNAP_MAX_DAYS} days.` : ""}</p>
      <div class="snapacts">
        <button class="clear" type="button" id="snap-png">Download PNG</button>
        <button class="clear secondary" type="button" id="snap-copy">Copy image</button>
        <button class="clear secondary" type="button" id="snap-svg">Download SVG</button>
        <span class="snapmsg" id="snap-msg" role="status"></span>
      </div>
    </section>
    <div class="snapframe" id="snap" data-name="${esc(name)}">${v.svg}</div>
    <script>
    (function () {
      var box = document.getElementById("snap"), msg = document.getElementById("snap-msg");
      var name = box.getAttribute("data-name");
      function svgText() { return new XMLSerializer().serializeToString(box.querySelector("svg")); }
      function save(blob, file) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }
      // The SVG drawn onto a canvas at twice its size, for a sharp PNG.
      function png() {
        return new Promise(function (ok, fail) {
          var svg = box.querySelector("svg"), w = svg.viewBox.baseVal.width, h = svg.viewBox.baseVal.height;
          var img = new Image();
          img.onload = function () {
            var c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2;
            var x = c.getContext("2d"); x.scale(2, 2); x.drawImage(img, 0, 0, w, h);
            c.toBlob(function (b) { b ? ok(b) : fail(new Error("no image")); }, "image/png");
          };
          img.onerror = function () { fail(new Error("couldn't draw it")); };
          img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText());
        });
      }
      function say(t) { msg.textContent = t; setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 4000); }
      document.getElementById("snap-png").addEventListener("click", function () {
        png().then(function (b) { save(b, name + ".png"); say("Saved."); }, function () { say("Couldn't make the PNG here. Try Download SVG."); });
      });
      document.getElementById("snap-svg").addEventListener("click", function () {
        save(new Blob([svgText()], { type: "image/svg+xml" }), name + ".svg"); say("Saved.");
      });
      document.getElementById("snap-copy").addEventListener("click", function () {
        if (!navigator.clipboard || !window.ClipboardItem) { say("This browser can't copy images. Use Download PNG."); return; }
        navigator.clipboard.write([new ClipboardItem({ "image/png": png() })]).then(function () { say("Copied. Paste it anywhere."); }, function () { say("Couldn't copy. Use Download PNG."); });
      });
    })();
    </script>`,
  );
}
