/**
 * One record's own page (/r/:id): everything the message said, its dates and
 * the controls to change them, its script, and a revision's summary.
 */
import { LABELS, NOSCRIPT_ICON, PAUSE_ICON, PLAY_ICON, type Shell, UPLOAD_ICON, colourOf, displayTitle, fmtScore, layout, revColour, scriptCard, scriptForm } from "../page.js";
import { ORG_TZ, VO_BUFFER_DAYS, relativeDay, renderIn, usDate } from "../../parse/derive.js";
import type { RevisionReview } from "../../db/revisions.js";
import type { StoredRecord } from "../../db/records.js";
import type { StoredScript } from "../../db/scripts.js";
import { dayOf } from "../cadence.js";
import { esc, safeUrl } from "../html.js";
import { scriptFor } from "../scriptindex.js";
import { severityOf, themeLabel } from "../../revisions/score.js";

/**
 * A revision's Summary: its notes summed up, scored out of 10 with every point
 * explained, and the form to (re)summarize — Frame.io's comments pasted or
 * read through the API, your own summary, your own rating.
 */
function summaryPanel(r: StoredRecord, review: RevisionReview | null, opts: { frameio: boolean; error: string }): string {
  const b = review?.breakdown;
  const result = review && b
    ? `<div class="big">
        <div class="scoreball" style="--sc:${revColour(review.score)}">${esc(fmtScore(review.score))}<small>/10</small></div>
        <div class="sumtext">${esc(review.summary)}<div class="sumby">${review.summaryBy === "claude" ? "Summed up by Claude" : "Summed up by rules"} · ${esc(usDate(dayOf(review.summarizedAt)))} · ${
          review.ownScore !== null ? `the notes say ${esc(fmtScore(review.autoScore))}, you said ${esc(fmtScore(review.ownScore))} — half each` : `from the notes alone`
        }</div></div>
      </div>
      <ul class="sumpens">${b.penalties.map((p) => `<li><b>−${esc(fmtScore(p.points))}</b> ${esc(p.what === "frequency" ? "How many" : p.what === "type" ? "How big" : "Repeats")}: ${esc(p.why)}</li>`).join("") || "<li>Nothing taken off.</li>"}</ul>
      <div class="sumthemes">${b.themes.filter((t) => t.id !== "other").map((t) => `<span${b.repeats.some((x) => x.theme === t.id) ? ' class="rep" title="Also on this channel\'s recent videos"' : ""}>${esc(t.label)} · ${t.n}</span>`).join("")}</div>
      ${b.repeatedNotes.length ? `<p class="hint" style="padding:0">Told before: ${b.repeatedNotes.slice(0, 4).map((x) => `“${esc(x.note.slice(0, 90))}” (on ${esc(x.before)})`).join(" · ")}</p>` : ""}
      <details><summary class="hint" style="padding:0;cursor:pointer">All ${review.comments.length} notes ▾</summary>
        <ul class="sumnotes">${review.comments
          .map((c) => {
            const sev = c.severity ?? severityOf(c);
            return `<li><span class="sev ${c.source === "you" ? "you" : sev}">${c.source === "you" ? "you" : sev}</span>${c.timecode ? `<span class="tc">${esc(c.timecode)}</span>` : ""}${c.version ? `<span class="tc">v${c.version}</span>` : ""}<span>${esc(c.text)}${c.theme && c.theme !== "other" ? ` <span class="tc">· ${esc(themeLabel(c.theme))}</span>` : ""}</span></li>`;
          })
          .join("")}</ul></details>`
    : `<p class="hint" style="padding:0">Not summarized yet. Paste the cut's Frame.io comments${opts.frameio ? " — or leave it empty and they're read from Frame.io" : ""}, add your own take if you like, and get a summary and a score out of 10.</p>`;
  return `<section class="panel sumpanel" id="summary" style="padding:18px 20px"><h2>Summary</h2>
    ${opts.error ? `<div class="scripterr" role="alert">${esc(opts.error)}</div>` : ""}
    ${result}
    <details${review ? "" : " open"} style="margin-top:12px"><summary class="clear secondary" style="display:inline-block;cursor:pointer">${review ? "Summarize again" : "Summarize"}</summary>
      <form class="sform sumform" method="post" action="/r/${r.id}/summarize" style="padding:12px 0 0">
        <textarea name="comments" rows="6" placeholder="${opts.frameio ? "Leave empty to read the comments from Frame.io — or paste them" : "Paste the Frame.io comments: Comments panel ▸ ⋯ ▸ Export (CSV or text), or copy them off the page"}"></textarea>
        <textarea name="own" rows="3" placeholder="Your own summary (optional) — it counts as notes of its own">${esc(review?.ownSummary ?? "")}</textarea>
        <div class="row2"><label class="hint" style="padding:0">Your rating <input type="number" name="rating" min="1" max="10" step="0.5" value="${review?.ownScore ?? ""}" placeholder="1–10"></label>
          <span class="hint" style="padding:0">optional — half the score when given</span></div>
        ${review ? `<span class="hint" style="padding:0">Leave the comments empty to keep the ${review.comments.filter((c) => c.source !== "you").length} already here.</span>` : ""}
        <button class="clear">Summarize</button>
      </form>
    </details>
  </section>`;
}

export function renderRecord(
  shell: Shell,
  r: StoredRecord,
  extra: {
    later?: number;
    moved?: { token: string; text: string } | null;
    scripts?: StoredScript[];
    scriptError?: string;
    review?: RevisionReview | null;
    frameio?: boolean;
    summaryError?: string;
    /** The posting check pushed it: when it was due, where it went. */
    missed?: { id: number; day: string; pushedTo: string; moved: number } | null;
  } = {},
): string {
  const later = extra.later ?? 0;
  const c = colourOf(r.category);
  const facts: Array<[string, string]> = [];
  if (r.code) facts.push(["Code", r.code]);
  if (r.channel) facts.push(["Channel", r.channel]);
  facts.push(["Category", LABELS[r.category] ?? r.category]);
  if (r.tag) facts.push(["Tag", r.tag]);
  if (r.stage) facts.push(["Stage", r.stage]);
  if (r.airDate) facts.push(["Airs", `${usDate(r.airDate)} · ${relativeDay(r.airDate)}`]);
  if (r.scriptDue) facts.push(["Script due", renderIn(r.scriptDue, ORG_TZ, "ET")]);
  if (r.voDue) {
    facts.push([
      "VO due",
      `${renderIn(r.voDue, ORG_TZ, "ET")}${r.voSource === "calculated" ? `  (set ${VO_BUFFER_DAYS} days before air)` : "  (stated)"}`,
    ]);
  }
  if (r.wordCount) facts.push(["Word count", r.wordCount.toLocaleString()]);
  if (r.assignee) facts.push(["Assigned", r.assignee]);
  if (r.version) facts.push(["Version", `v${r.version}`]);
  if (r.pausedAt) facts.unshift(["Paused", `since ${usDate(dayOf(r.pausedAt))} · no deadline until it's resumed`]);
  if (!r.batchNo && r.kind !== "review") {
    const hit = scriptFor({ id: r.id, code: r.code, title: r.title });
    facts.push(["Script", hit ? `found: ${hit.where.join(" · ")}` : "none found — not attached, not in Story Lab, not delivered on the Scripts tab"]);
  }
  if (r.uploadedAt) facts.unshift(["Uploaded", `marked ${usDate(dayOf(r.uploadedAt))} · live on the channel`]);
  if (r.noScriptAt && r.status === "open") facts.unshift(["No script", `waiting on the script since ${usDate(dayOf(r.noScriptAt))}`]);
  facts.push(["Read by", r.parsedBy === "pattern" ? "pattern (no API call)" : r.parsedBy]);

  const table = facts
    .map(
      ([k, v]) =>
        `<div class="row" style="--c:${c}"><div class="title">${esc(v)}</div><div class="meta">${esc(k)}</div></div>`,
    )
    .join("");

  const links = r.links.length
    ? `<section><h2>Links</h2><div class="links">${r.links
        .map(
          (l) =>
            `<a class="${esc(l.kind)}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noreferrer">${esc(l.url)}</a>`,
        )
        .join("")}</div></section>`
    : "";

  return layout(
    displayTitle(r),
    shell,
    `<section>
      <h2>${esc(r.kind)}${r.status === "done" ? " · cleared" : r.status === "removed" ? " · removed" : ""}</h2>
      <h1 style="font-size:34px;font-weight:800;letter-spacing:-0.04em;margin:0 0 12px;line-height:1.02">${esc(displayTitle(r))}</h1>
      ${r.note && r.title ? `<p style="color:var(--dim);margin:-8px 0 14px;font-size:13.5px">${esc(r.note)}</p>` : ""}
      <div class="rows">${table}</div>
    </section>
    <section>
      <form class="airform" method="post" action="/r/${r.id}/air">
        <label for="air">Air date</label>
        <input type="date" id="air" name="air" value="${esc(r.airDate ?? "")}">
        <button class="clear">Save</button>
        <span class="hint">${
          r.voSource === "stated"
            ? "The VO time was stated, so it stays where it is."
            : r.batchNo
              ? "Moves this batch's day."
              : `The VO deadline follows it, ${VO_BUFFER_DAYS} days before.`
        }</span>
        ${
          later && r.channel
            ? `<label class="restbox"><input type="checkbox" name="rest" value="1" checked>
                 Move ${later === 1 ? "the later" : `the ${later} later`} ${esc(r.channel)} video${later === 1 ? "" : "s"} by the same number of days</label>`
            : ""
        }
      </form>
    </section>
    ${
      extra.missed && !r.uploadedAt
        ? `<div class="mtoast missed" role="status"><span>Not seen on ${esc(r.channel ?? "its channel")} on ${esc(usDate(extra.missed.day))}, so it was pushed to ${esc(usDate(extra.missed.pushedTo))}${
            extra.missed.moved ? ` with ${extra.missed.moved} later video${extra.missed.moved === 1 ? "" : "s"}` : ""
          }.</span>
             <form method="post" action="/missed/${extra.missed.id}/undo"><button title="Put the schedule back as it was and mark this uploaded">It was posted</button></form></div>`
        : ""
    }
    ${
      extra.moved
        ? `<div class="mtoast" role="status"><span>${esc(extra.moved.text)}</span>
             <form method="post" action="/moves/undo"><input type="hidden" name="token" value="${esc(extra.moved.token)}"><button>Undo</button></form>
             <a class="x" href="/r/${r.id}" aria-label="Dismiss">×</a></div>`
        : ""
    }
    ${links}
    ${r.brief ? `<section><h2>Story brief</h2><div class="brief">${esc(r.brief)}</div></section>` : ""}
    ${
      r.kind === "review"
        ? summaryPanel(r, extra.review ?? null, { frameio: Boolean(extra.frameio), error: extra.summaryError ?? "" })
        : `<section id="script"><h2>Script</h2>
      ${extra.scriptError ? `<div class="scripterr" role="alert">${esc(extra.scriptError)}</div>` : ""}
      ${extra.scripts?.length ? `<div class="scripts">${extra.scripts.map((sc) => scriptCard(sc, c)).join("")}</div>` : ""}
      ${scriptForm(`/r/${r.id}/scripts`, {
        again: Boolean(extra.scripts?.length),
        // The doc already linked on the video, ready to read.
        url: extra.scripts?.length ? "" : (r.links.find((l) => l.kind === "docs" && l.url.includes("/document/"))?.url ?? ""),
      })}
    </section>`
    }
    ${r.warnings.length ? `<section><h2>Warnings</h2><div class="empty warn">${esc(r.warnings.join(" · "))}</div></section>` : ""}
    <section>
      ${
        r.status === "removed"
          ? ""
          : `<form class="inline" method="post" action="/r/${r.id}/${r.pinnedAt ? "unpin" : "pin"}" style="margin-right:8px">
               <button class="clear secondary">${r.pinnedAt ? "Unpin" : "Pin to top of category"}</button>
             </form>`
      }
      ${
        r.kind === "review" || r.status === "removed"
          ? ""
          : `<form class="inline" method="post" action="/r/${r.id}/${r.uploadedAt ? "notuploaded" : "uploaded"}" style="margin-right:8px">
               <button class="clear secondary uploadbtn${r.uploadedAt ? " on" : ""}" title="${r.uploadedAt ? "Take the uploaded mark off" : "It's live on the channel — clears it and turns it green on the calendar"}">${UPLOAD_ICON} ${r.uploadedAt ? "Uploaded ✓" : "Uploaded"}</button>
             </form>`
      }
      <form class="inline" method="post" action="/r/${r.id}/${r.status === "open" ? "done" : "open"}">
        <button class="clear" style="--c:${c}">${
          r.status === "open" ? "Clear this" : r.status === "removed" ? "Restore" : "Reopen"
        }</button>
      </form>
      ${
        r.status === "open"
          ? `<form class="inline" method="post" action="/r/${r.id}/remove" style="margin-left:8px">
               <button class="clear secondary" title="Take it off the board without counting it as cleared">Remove</button>
             </form>
             <div class="recacts2">
               <form class="inline" method="post" action="/r/${r.id}/${r.pausedAt ? "resume" : "pause"}">
                 <button class="clear secondary pausebtn" title="${r.pausedAt ? "Its deadline comes back as it was" : "Off every deadline, the late list and the calendar until you resume it"}">${r.pausedAt ? `${PLAY_ICON} Resume` : `${PAUSE_ICON} Pause`}</button>
               </form>
               ${
                 r.batchNo
                   ? ""
                   : `<form class="inline" method="post" action="/r/${r.id}/${r.noScriptAt ? "script" : "noscript"}" style="margin-left:8px">
                        <button class="clear secondary noscriptbtn${r.noScriptAt ? " on" : ""}" title="${r.noScriptAt ? "The script has arrived" : "The VO is needed but the script hasn't been sent"}">${NOSCRIPT_ICON} ${r.noScriptAt ? "Script arrived" : "No script"}</button>
                      </form>`
               }
             </div>`
          : ""
      }
      ${
        r.parsedBy !== "recurring" && r.raw.trim()
          ? `<form class="inline" method="post" action="/r/${r.id}/reread" style="margin-left:8px">
               <button class="clear secondary" title="Read the original message again with the current parser">Re-read</button>
             </form>`
          : ""
      }
      ${r.sourceUrl ? `<a class="back" style="margin-left:10px" href="${esc(safeUrl(r.sourceUrl))}">open in Discord →</a>` : ""}
    </section>
    <a class="back" href="/">← everything</a>`,
  );
}
