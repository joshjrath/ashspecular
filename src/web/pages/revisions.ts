/**
 * Revisions: the cuts waiting for review, and each channel's history of
 * scores with its flag or trophy.
 */
import type { ChannelHistory, HistorySort } from "../../revisions/history.js";
import { REVIEW_HOURS, usDate } from "../../parse/derive.js";
import { REV_ICON, type Shell, channelColour, displayTitle, fmtScore, layout, pageHeader, revColour, rows, timeAgo } from "../page.js";
import { type SortState, sortBar, sortRecords } from "./lists.js";
import type { StoredRecord } from "../../db/records.js";
import { dayOf } from "../cadence.js";
import { esc } from "../html.js";

/**
 * Revisions: every cut waiting for review, soonest first, each due
 * REVIEW_HOURS after it came in unless its message said otherwise. Below,
 * other open work that carries a Frame.io link, so a link never goes missing.
 */
export function renderRevisions(
  shell: Shell,
  revisions: StoredRecord[],
  sort?: SortState,
  history?: { channels: ChannelHistory[]; all: string[]; ch: string; sort: HistorySort; reviewed?: Array<StoredRecord & { reviewedAt: Date | null }> } | null,
): string {
  const shown = sort ? sortRecords(revisions, sort.key, sort.dir) : revisions;
  const tabs = `<div class="tabs revtabs"><a class="tab${history ? "" : " on"}" href="/revisions">Waiting <span class="n">${revisions.length}</span></a><a class="tab${
    history ? " on" : ""
  }" href="/revisions?view=history">History</a></div>`;
  if (history) {
    return layout("Revision history", shell, `${pageHeader("Revisions")}${tabs}${revisionHistoryHtml(history)}`);
  }
  return layout(
    "Revisions",
    shell,
    `${pageHeader("Revisions")}${tabs}
    <p class="labsub">Each revision is due for review ${REVIEW_HOURS} hours after it comes in, unless its message gives a
      deadline. ✓ marks it reviewed and moves it to <a href="/revisions?view=history">History</a>. ★ summarizes its Frame.io notes and
      scores the cut out of 10 — the scores build each channel's timeline there.</p>
    ${revisions.length > 1 ? sortBar(sort) : ""}
    ${rows(shown, "No revisions waiting. Forward a Frame.io link into the intake channel.")}`,
  );
}

/** Each channel's scores as a line through the red (5 and below) and green (8 and up) bands. */
function timelineSvg(h: ChannelHistory): string {
  const n = h.points.length;
  const padX = 34;
  // Across the whole panel; past about twenty videos it scrolls sideways instead of crowding.
  const w = Math.max(1000, padX * 2 + (n - 1) * 48);
  const step = n > 1 ? (w - padX * 2) / (n - 1) : 0;
  const top = 24;
  const plotH = 140;
  const y = (s: number) => top + ((10 - s) / 9) * plotH;
  const x = (i: number) => (n === 1 ? w / 2 : padX + i * step);
  const line = h.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const grid = [1, 5, 8, 10]
    .map((s) => `<line x1="${padX - 14}" x2="${w - 8}" y1="${y(s)}" y2="${y(s)}" class="tlgrid"/><text x="4" y="${y(s) + 4}" class="tlaxis">${s}</text>`)
    .join("");
  const dots = h.points
    .map((p, i) => `<a href="/r/${p.recordId}#summary"><circle cx="${x(i)}" cy="${y(p.score)}" r="7" fill="${revColour(p.score)}" class="tldot"><title>${esc(p.title)}${p.version ? ` (v${p.version})` : ""} — ${esc(fmtScore(p.score))}/10 · ${esc(usDate(dayOf(p.at)))}</title></circle>
      <text x="${x(i)}" y="${y(p.score) - 12}" class="tlval">${esc(fmtScore(p.score))}</text>
      <text x="${x(i)}" y="${top + plotH + 22}" class="tlaxis mid">${esc(usDate(dayOf(p.at)).replace(/\/\d{4}$/, ""))}</text></a>`)
    .join("");
  return `<div class="tlwrap"><svg class="timeline" viewBox="0 0 ${w} ${top + plotH + 30}" width="100%" style="min-width:${Math.max(320, n * 44 + 80)}px" role="img" aria-label="${esc(h.channel)} revision scores">
    <rect x="${padX - 14}" y="${y(5)}" width="${w - padX + 6}" height="${y(1) - y(5)}" class="tlbad"/>
    <rect x="${padX - 14}" y="${y(10)}" width="${w - padX + 6}" height="${y(8) - y(10)}" class="tlgood"/>
    ${grid}<path d="${line}" class="tlline"/>${dots}</svg></div>`;
}

/**
 * Every revision marked reviewed, newest first: its score, or a way to give
 * it one. A revision ✓'d without a summary has no score for the timeline, and
 * this is where it's kept, so nothing reviewed disappears.
 */
function reviewedPanel(list: Array<StoredRecord & { reviewedAt: Date | null }>): string {
  const unscored = list.filter((r) => typeof r.reviewScore !== "number").length;
  const items = list
    .map((r) => {
      const score = typeof r.reviewScore === "number"
        ? `<a class="rscore" href="/r/${r.id}#summary" style="--sc:${revColour(r.reviewScore)}" title="Its summary">${esc(fmtScore(r.reviewScore))}/10</a>`
        : `<a class="rdscore" href="/r/${r.id}#summary" title="Summarize its notes and score it — it joins its channel's timeline">★ Score it</a>`;
      return `<li class="rdrow">
        <a class="rdt" href="/r/${r.id}" title="${esc(displayTitle(r))}">${esc(displayTitle(r))}</a>
        <span class="rv">${REV_ICON}v${r.version ?? 1}</span>
        ${r.channel ? `<span class="rch" style="--ch:${channelColour(r.channel)}"><i></i>${esc(r.channel.replace(/^Specular /, ""))}</span>` : `<span class="rch none">No channel</span>`}
        <span class="rdwhen">${r.reviewedAt ? `reviewed ${esc(usDate(dayOf(r.reviewedAt)))} · ${esc(timeAgo(r.reviewedAt))}` : "reviewed"}</span>
        ${score}
      </li>`;
    })
    .join("");
  return `<section class="panel revdone" id="reviewed">
    <h2>Reviewed <span class="sub">— every revision you've ✓'d, newest first${unscored ? ` · ${unscored} without a score: ★ Score it puts one on its channel's timeline` : ""}</span></h2>
    ${items ? `<ul class="rdlist">${items}</ul>` : `<p class="hint">Nothing reviewed yet. ✓ on a waiting revision moves it here.</p>`}
  </section>`;
}

function revisionHistoryHtml(d: { channels: ChannelHistory[]; all: string[]; ch: string; sort: HistorySort; reviewed?: Array<StoredRecord & { reviewedAt: Date | null }> }): string {
  const opt = (v: string, label: string, sel: string) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(label)}</option>`;
  const picker = `<form class="histpick" method="get" action="/revisions">
      <input type="hidden" name="view" value="history">
      <label>Channel <select name="ch" onchange="this.form.submit()">${opt("", "Every channel", d.ch)}${d.all.map((c) => opt(c, c, d.ch)).join("")}</select></label>
      <label>Sort <select name="sort" onchange="this.form.submit()">${opt("attention", "Needs attention first", d.sort)}${opt("best", "Best first", d.sort)}${opt("name", "A–Z", d.sort)}</select></label>
      <noscript><button class="clear secondary">Show</button></noscript>
    </form>`;
  const markForm = (channel: string, mark: "flag" | "trophy" | "clear", label: string, cls = "") =>
    `<form method="post" action="/revisions/mark" class="inline"><input type="hidden" name="channel" value="${esc(channel)}"><input type="hidden" name="mark" value="${mark}"><button class="clear secondary ${cls}">${label}</button></form>`;
  const section = (h: ChannelHistory) => {
    const last3 = h.points.slice(-3);
    const alert =
      h.streak === "concern" && h.mark !== "flag"
        ? `<div class="histalert bad">3 videos in a row at 5 or below (${last3.map((p) => esc(fmtScore(p.score))).join(", ")}) — cause for concern. Time to find a different editor for ${esc(h.channel)}? ${markForm(h.channel, "flag", "🚩 Flag the channel")}</div>`
        : h.streak === "trophy" && h.mark !== "trophy"
          ? `<div class="histalert good">3 videos in a row at 8 or higher (${last3.map((p) => esc(fmtScore(p.score))).join(", ")}). ${markForm(h.channel, "trophy", "🏆 Give it a trophy")}</div>`
          : "";
    return `<section class="panel histchan${h.mark ? ` ${h.mark}` : ""}" style="--ch:${channelColour(h.channel)}">
      <header>
        <i></i><b>${esc(h.channel)}</b>
        ${h.mark === "flag" ? `<span class="histmark flag" title="Flagged: time to find a different editor">🚩 Flagged</span>` : h.mark === "trophy" ? `<span class="histmark trophy">🏆 Trophy</span>` : ""}
        <span class="histavg" style="--sc:${revColour(h.average)}">average <b>${esc(fmtScore(h.average))}</b> · ${h.points.length} video${h.points.length === 1 ? "" : "s"}</span>
        <span class="histbtns">${h.mark !== "flag" ? markForm(h.channel, "flag", "🚩", "icon") : ""}${h.mark !== "trophy" ? markForm(h.channel, "trophy", "🏆", "icon") : ""}${h.mark ? markForm(h.channel, "clear", "Clear mark", "icon") : ""}</span>
      </header>
      ${alert}
      ${timelineSvg(h)}
    </section>`;
  };
  return `<p class="labsub">Every summarized revision's score, video by video (a video's latest version counts), for each channel. Red is 5 or below, green 8 and up. Three in a row at 5 or below is cause for concern; three at 8 or higher earns a trophy. Click a point for its summary.</p>
    ${picker}
    ${d.reviewed ? reviewedPanel(d.reviewed) : ""}
    ${d.channels.length ? d.channels.map(section).join("") : `<div class="empty">Nothing scored yet. Open a revision and press Summarize — its score starts the channel's timeline.</div>`}`;
}
