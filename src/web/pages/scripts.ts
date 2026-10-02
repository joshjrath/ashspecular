/**
 * The Scripts tab: the scriptwriter's board, read through its report (or
 * framed, when there's no view-only password).
 */
import { ORG_TZ, TEAM_TZ, daysUntil, relativeDay, renderIn, usDate } from "../../parse/derive.js";
import type { ScriptReport, ScriptRow, ScriptStatus } from "../scriptcheck.js";
import { type Shell, layout, pageHeader, timeAgo } from "../page.js";
import { esc, safeUrl } from "../html.js";

/**
 * The scriptwriter's board, inside this one. Shown in a frame when his site
 * allows it; when it doesn't (many sites refuse to be framed, and a login
 * inside a frame can be blocked by the browser), a clear way to open it.
 */
export function renderScripts(shell: Shell, url: string, embeddable: boolean, why = ""): string {
  const open = `<a class="clear" href="${esc(url)}" target="_blank" rel="noopener">Open in a new tab ↗</a>`;
  return layout(
    "Scripts",
    shell,
    `${pageHeader("Scripts", open)}
    ${
      embeddable
        ? `<div class="scriptsframe"><iframe src="${esc(url)}" title="Scripts board"
             referrerpolicy="no-referrer" allow="clipboard-write"></iframe></div>
           <p class="hint">This is Josh's board, live. If it asks you to sign in and the
           sign-in doesn't stick, use <b>Open in a new tab</b> — some browsers block logins inside another site.</p>`
        : `<div class="panel scriptsblocked">
             <h2>Josh's board can't be shown inside this one</h2>
             <p class="hint">${esc(why || "The site doesn't allow being embedded in another page.")}
             It opens in its own tab instead, and stays signed in there.</p>
             <p style="margin-top:18px">${open}</p>
           </div>`
    }`,
  );
}

/** His statuses, in the order they need you, with a label and a colour each. */
const SCRIPT_GROUPS: Array<{ status: ScriptStatus; label: string; colour: string }> = [
  { status: "OVERDUE", label: "Overdue", colour: "#F2685E" },
  { status: "DUE_TODAY", label: "Due today", colour: "#EE9A55" },
  { status: "DUE_SOON", label: "Due soon", colour: "#F3E96C" },
  { status: "NO_DEADLINE", label: "No deadline found", colour: "#94949E" },
  { status: "PENDING", label: "Pending", colour: "#8D9BF2" },
  { status: "SUBMITTED_LATE", label: "Delivered late", colour: "#56C990" },
  { status: "SUBMITTED", label: "Delivered", colour: "#56C990" },
];

/**
 * The Scripts tab, from his board's own data: every script grouped by where
 * it stands, in this board's rows, with its air date, deadline, the script
 * doc he delivered and the Discord thread.
 */
export function renderScriptBoard(shell: Shell, url: string, report: ScriptReport): string {
  const open = `<a class="clear" href="${esc(url)}" target="_blank" rel="noopener">Open Josh's board ↗</a>`;
  const counts = SCRIPT_GROUPS.map((g) => ({ ...g, n: report.rows.filter((r) => r.status === g.status).length }));

  const scriptRow = (r: ScriptRow, colour: string) => {
    const done = r.status === "SUBMITTED" || r.status === "SUBMITTED_LATE";
    const meta: string[] = [];
    if (r.code) meta.push(`<span class="code">${esc(r.code)}</span>`);
    if (r.airDate) {
      const n = daysUntil(r.airDate);
      meta.push(`<span class="airs${!done && n >= 0 && n <= 3 ? " soon" : ""}">airs ${esc(usDate(r.airDate))} · ${esc(relativeDay(r.airDate))}</span>`);
    }
    if (r.role) meta.push(`<span>${esc(r.role.toLowerCase())}</span>`);
    r.delivered.slice(-1).forEach((l) => meta.push(`<a class="lnk" href="${esc(safeUrl(l))}" target="_blank" rel="noreferrer">Script doc ↗</a>`));
    if (r.discordUrl) meta.push(`<a class="lnk" href="${esc(safeUrl(r.discordUrl))}" target="_blank" rel="noreferrer">Discord ↗</a>`);
    if (r.needsReview) meta.push(`<span class="warn">needs a look</span>`);

    let pill = `<span class="due none">no deadline</span>`;
    if (done) {
      pill = `<span class="due delivered"><b>${r.status === "SUBMITTED_LATE" ? "Late" : "Sent"}</b>${
        r.deliveredAt ? esc(renderIn(r.deliveredAt, ORG_TZ, "ET").split(" @ ")[0] ?? "") : "delivered"
      }</span>`;
    } else if (r.deadline) {
      const ms = r.deadline.getTime() - Date.now();
      const h = Math.round(Math.abs(ms) / 3_600_000);
      const span = h < 1 ? "<1h" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
      const [date, time] = renderIn(r.deadline, ORG_TZ, "ET").split(" @ ");
      pill = `<span class="due${ms < 0 ? " late" : ms < 86_400_000 ? " soon" : ""}" title="${esc(renderIn(r.deadline, TEAM_TZ, "IST"))}"><b>Due</b>${esc(date ?? "")}<span class="tm">${esc((time ?? "").replace(/ ET$/, ""))}</span>${
        ms < 0 ? `<em>${span} late</em>` : ms < 86_400_000 ? `<em>in ${span}</em>` : ""
      }</span>`;
    }
    return `<div class="row${done ? " cleared" : ""}" style="--c:${colour}">
      <div class="title"><span class="swatch" style="border-radius:50%"></span><span class="t">${esc(r.title)}</span></div>
      <div class="meta">${meta.join("")}</div>
      ${pill}
    </div>`;
  };

  const groups = counts
    .filter((g) => g.n)
    .map((g) => {
      const list = report.rows
        .filter((r) => r.status === g.status)
        .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity));
      return `<div class="group" id="s-${g.status.toLowerCase()}">
        <div class="head" style="--c:${g.colour}"><span class="dot" style="border-radius:50%"></span>
          <span class="name">${esc(g.label)}</span><span class="n">${g.n}</span></div>
        <div class="rows">${list.map((r) => scriptRow(r, g.colour)).join("")}</div>
      </div>`;
    })
    .join("");

  const chips = counts
    .filter((g) => g.n)
    .map((g) => `<a class="cattoggle" href="#s-${g.status.toLowerCase()}" style="--c:${g.colour}"><i style="border-radius:50%"></i>${esc(g.label)} <b>${g.n}</b></a>`)
    .join("");

  return layout(
    "Scripts",
    shell,
    `${pageHeader("Scripts", open)}
    ${
      report.error
        ? `<div class="panel"><h2>Couldn't read Josh's board</h2><p class="hint">${esc(report.error)}</p></div>`
        : `<div class="cattoggles">${chips || ""}<span class="draghint">From Josh's board${
            report.generatedAt ? ` · updated ${esc(timeAgo(report.generatedAt))}` : ""
          }</span></div>
          ${groups || `<div class="empty">No scripts on Josh's board right now.</div>`}`
    }`,
  );
}
