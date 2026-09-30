/**
 * The Bits Idea Feed's pages: the feed itself (a card per source, best
 * first), and Sources & settings (the tags watched per channel, the caps,
 * re-scoring). Every card links to its original post.
 */
import { ORG_TZ, dateIn, usDate } from "../../parse/derive.js";
import type { Feed, FeedTab, IdeaRow, IdeaSettings, SourceRow, UsageRow } from "../../db/ideas.js";
import type { ScoreBreakdown, SimilarMatch } from "../../ideas/score.js";
import {
  CLASSIFICATIONS, CLASSIFICATION_BY_ID, IDEA_STATUSES, REJECT_BY_ID, REJECT_REASONS, bitsChannels, engineLabel, shortChannel,
} from "../../ideas/types.js";
import { channelColour, esc, layout, pageHeader, timeAgo, type Shell } from "../page.js";
import { minutesIntoDay, pacedAllowance } from "../../ideas/pace.js";

const safeUrl = (u: unknown) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");
const pct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%` : "—");
const dayOf = (d: Date) => dateIn(ORG_TZ, d);
const scoreColour = (n: number) => (n >= 85 ? "#3CCB84" : n >= 70 ? "#9BD35A" : n >= 50 ? "#E8C547" : "#E5534B");
const classLabel = (c: string | null) => (c ? CLASSIFICATION_BY_ID.get(c)?.label ?? c : "Unclassified");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const matchDate = (d: string | null) => (d ? usDate(d) : "not made yet");
const kindLabel = (m: SimilarMatch) => (m.kind === "bit" ? "published Bit" : m.kind === "idea" ? (m.date ? "published idea" : "approved idea") : "rejected idea");

export const TAB_LABELS: Record<FeedTab, string> = {
  foryou: "For you", new: "New", high: "High priority", gems: "Hidden gems", saved: "Saved", approved: "Approved", used: "Used", rejected: "Rejected",
};

export interface FeedQuery {
  tab: FeedTab;
  channel: string | null;
  cls: string | null;
  canon: boolean;
  min: number | null;
  q: string;
  page: number;
}

export function feedHref(q: FeedQuery, change: Partial<FeedQuery> = {}): string {
  const n = { ...q, page: 0, ...change };
  const p = new URLSearchParams();
  if (n.tab !== "foryou") p.set("tab", n.tab);
  if (n.channel) p.set("ch", n.channel);
  if (n.cls) p.set("cls", n.cls);
  if (n.canon) p.set("canon", "1");
  if (n.min) p.set("min", String(n.min));
  if (n.q) p.set("q", n.q);
  if (n.page) p.set("page", String(n.page));
  const s = p.toString();
  return `/ideas${s ? `?${s}` : ""}`;
}

// ── a card ────────────────────────────────────────────────────────────────

function scoreBadge(s: SourceRow): string {
  if (s.decision === "archived") return `<div class="iscore dim"><b>—</b><small>duplicate</small></div>`;
  if (s.processingAt) return `<div class="iscore dim"><b class="spin">◌</b><small>reading now</small></div>`;
  if (s.stage === "error") return `<div class="iscore err"><b>!</b><small>analysis failed</small></div>`;
  if (s.stage === "filtered") return `<div class="iscore dim"><b>—</b><small>filtered</small></div>`;
  if (s.depth === "full" && s.score !== null) return `<div class="iscore" style="--sc:${scoreColour(s.score)}"><b>${s.score}</b><small>idea score</small></div>`;
  if (s.depth === "triage" && s.score !== null) {
    return `<div class="iscore quick" title="Only the quick look so far — scored 0–35 so every full read ranks above it"><b>${s.score}</b><small>${s.pending === "full" ? "full read queued" : "quick look"}</small></div>`;
  }
  return `<div class="iscore dim"><b>…</b><small>${s.pending ? "queued" : "new"}</small></div>`;
}

function similarityBlock(s: SourceRow): string {
  const a = s.analysis;
  if (!a || a.depth !== "full") return "";
  if (a.similarityStatus === "unavailable" || !a.similarity) {
    return `<div class="isim unavail" title="Nothing to compare with isn't the same as no match">⚠ Similarity check unavailable${
      (a.breakdown?.problems ?? []).find((p) => p.startsWith("Similarity check unavailable —"))?.replace("Similarity check unavailable", "") ?? ""
    }</div>`;
  }
  const list = a.similarity;
  const top = list[0];
  const eff = top ? top.effective : 0;
  const level = !top ? "clear" : top.similarity >= 0.85 && top.sameMechanism ? "major" : eff >= 0.5 ? "warn" : eff >= 0.25 ? "note" : "clear";
  const summary =
    level === "clear"
      ? `Recent similarity <b>${Math.round(eff * 100)}%</b> · no major conflicts`
      : `${level === "major" || level === "warn" ? "⚠ " : ""}<b>${Math.round(top!.similarity * 100)}% similar</b> to “${esc(top!.title)}” · ${esc(matchDate(top!.date))}`;
  if (!list.length) return `<div class="isim clear">${summary}</div>`;
  return `<details class="isim ${level}"><summary>${summary} <span class="more">${list.length > 1 ? `+${list.length - 1} more` : "why"}</span></summary>
    <ul>${list
      .map((m) => {
        const outside = safeUrl(m.href);
        const href = outside || (m.href?.startsWith("/") ? m.href : "");
        const title = href ? `<a href="${esc(href)}"${outside ? ' target="_blank" rel="noreferrer"' : ""}>${esc(m.title)}</a>` : esc(m.title);
        return `<li><span class="ssim">${Math.round(m.similarity * 100)}%</span><div><b>${title}</b><small>${esc(kindLabel(m))}${m.channel ? ` · ${esc(shortChannel(m.channel))}` : ""} · ${esc(matchDate(m.date))}${
          m.recency < 1 ? ` · counts ${Math.round(m.recency * 100)}% for its age` : ""
        }${m.sameMechanism ? " · same mechanism" : ""}</small><p>${esc(m.reason)}</p></div></li>`;
      })
      .join("")}</ul></details>`;
}

function breakdownBlock(b: ScoreBreakdown | null): string {
  if (!b) return "";
  const parts = b.parts
    .map((p) => `<li><span>${esc(p.label)}</span><i style="--w:${p.value}%;--sc:${scoreColour(p.value)}"></i><b>${p.value}</b><small>×${p.weight}</small></li>`)
    .join("");
  const adj = b.adjustments.map((a) => `<li class="${a.points > 0 ? "up" : "down"}"><span>${esc(a.label)}</span><b>${a.points > 0 ? "+" : ""}${a.points}</b></li>`).join("");
  return `<details class="ibreak"><summary>How the ${b.score} was reached</summary>
    <ul class="iparts">${parts}</ul>
    <p class="ibase">Weighted parts <b>${b.base}</b>${adj ? "" : " — no adjustments"}</p>
    ${adj ? `<ul class="iadj">${adj}</ul>` : ""}
    <p class="hint">A ranking, not a forecast: it says where this sits among the sources the feed has, not how the Short will do.</p>
  </details>`;
}

function sourceBlock(s: SourceRow, full: boolean): string {
  const imgs = s.media.slice(0, 3).filter((m) => safeUrl(m.url));
  const body = s.body.trim();
  const short = body.length > 700 ? `${body.slice(0, 700).replace(/\s+\S*$/, "")}…` : body;
  const via = s.discoveredVia === "manual" ? "added by hand" : "";
  const eng = [
    s.notes !== null ? plural(s.notes, "note") : null,
    s.likes !== null ? plural(s.likes, "like") : null,
    s.reblogs !== null ? plural(s.reblogs, "reblog") : null,
    s.replies !== null ? plural(s.replies, "reply", "replies") : null,
  ].filter(Boolean);
  const url = safeUrl(s.url);
  return `<div class="isrc">
    ${imgs.length ? `<div class="iimgs n${imgs.length}">${imgs.map((m) => `<a href="${esc(m.url)}" target="_blank" rel="noreferrer"><img src="${esc(m.url)}" alt="${esc(m.alt ?? "")}" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>` : ""}
    ${body ? (full || body.length <= 700 ? `<div class="ibody">${esc(body)}</div>` : `<details class="ibodyd"><summary><div class="ibody">${esc(short)}</div><span class="more">Show the whole post</span></summary><div class="ibody">${esc(body)}</div></details>`) : ""}
    <div class="ifrom">
      <span class="prov">${s.provider === "tumblr" ? "Tumblr" : s.provider === "manual" ? "Pasted in" : esc(s.provider)}</span>
      ${s.author ? `<span>@${esc(s.author)}</span>` : ""}
      ${eng.length ? `<span>${esc(eng.join(" · "))}</span>` : ""}
      ${s.postedAt ? `<span title="${esc(usDate(dayOf(s.postedAt)))}">posted ${esc(timeAgo(s.postedAt))}</span>` : ""}
      <span title="${esc(usDate(dayOf(s.ingestedAt)))}">found ${esc(timeAgo(s.ingestedAt))}${via ? ` · ${via}` : ""}</span>
      ${s.tags.length ? `<span class="itags">${s.tags.slice(0, 8).map((t) => `#${esc(t)}`).join(" ")}${s.tags.length > 8 ? ` +${s.tags.length - 8}` : ""}</span>` : ""}
      ${url ? `<a class="iview" href="${esc(url)}" target="_blank" rel="noreferrer">View original post ↗</a>` : `<span class="hint">no link</span>`}
    </div>
  </div>`;
}

function channelOptions(selected: string | null): string {
  return bitsChannels().map((c) => `<option value="${esc(c)}"${c === selected ? " selected" : ""}>${esc(shortChannel(c))}</option>`).join("");
}
function classOptions(selected: string | null): string {
  return CLASSIFICATIONS.map((c) => `<option value="${c.id}"${c.id === selected ? " selected" : ""}>${esc(c.label)}</option>`).join("");
}

function actions(s: SourceRow, r: Record<string, unknown>, back: string): string {
  const form = (path: string, label: string, cls = "", extra = "", title = "") =>
    `<form method="post" action="/ideas/s/${s.id}/${path}" data-act><input type="hidden" name="back" value="${esc(back)}">${extra}<button class="ibtn ${cls}"${title ? ` title="${esc(title)}"` : ""}>${label}</button></form>`;
  if (s.decision === "archived") {
    return `<footer class="iacts">${s.duplicateOf ? `<a class="ibtn" href="/ideas?tab=new#s-${s.duplicateOf}">See the post it repeats</a>` : ""}${form("analyze", "Analyze anyway", "", "", "Read this one on its own after all")}</footer>`;
  }
  const full = s.depth === "full";
  const title = String(r.suggested_title ?? "");
  const approveForm = `<details class="idev"><summary class="ibtn ${full && title ? "" : "go"}">${full && title ? "Edit & develop" : "Approve as…"}</summary>
    <form method="post" action="/ideas/s/${s.id}/approve" class="idevf" data-act>
      <input type="hidden" name="back" value="${esc(back)}">
      <label>Title<input name="title" value="${esc(title)}" required maxlength="200"></label>
      <label>Premise<textarea name="premise" rows="3" maxlength="2000">${esc(String(r.suggested_premise ?? ""))}</textarea></label>
      <label>Direction<textarea name="direction" rows="2" maxlength="2000">${esc(String(r.suggested_direction ?? ""))}</textarea></label>
      <div class="idevrow">
        <label>Channel<select name="channel">${channelOptions(s.channel ?? s.channels[0] ?? null)}</select></label>
        <label>Classification<select name="classification">${classOptions(s.classification ?? "CANON_INSPIRED")}</select></label>
      </div>
      <label>Notes<input name="notes" maxlength="500" placeholder="Anything for production"></label>
      <button class="ibtn go">Approve with these</button>
    </form></details>`;
  const reject = `<details class="irej"><summary class="ibtn">Reject</summary>
    <form method="post" action="/ideas/s/${s.id}/reject" data-act>
      <input type="hidden" name="back" value="${esc(back)}">
      <div class="ireasons">${REJECT_REASONS.map((x) => `<button class="ibtn" name="reason" value="${x.id}">${esc(x.label)}</button>`).join("")}</div>
      <input name="note" maxlength="300" placeholder="Optional note — say why, in your words">
    </form></details>`;
  const decided =
    s.decision === "saved"
      ? form("unsave", "★ Saved", "on", "", "Take it out of Saved")
      : s.decision === "rejected"
        ? form("restore", "Restore", "", "", "Undo the rejection")
        : s.decision === "approved" || s.decision === "used"
          ? `<a class="ibtn" href="/ideas?tab=approved#i-${s.ideaId ?? ""}">${s.decision === "used" ? "Used — see the idea" : "Approved — see the idea"}</a>`
          : form("save", "☆ Save", "", "", "Keep it for later — it isn't marked used");
  return `<footer class="iacts">
    ${decided}
    ${!s.decision || s.decision === "saved" ? `${full && title ? form("approve", "✓ Approve", "go", "", "Approve the suggested Bit as it is") : ""}${approveForm}${reject}` : ""}
    ${!full && !s.pending && s.stage !== "error" ? form("analyze", "Analyze fully", "", "", "Read it in full now: suggestion, classification, similarity and score") : ""}
    ${s.stage === "error" ? form("analyze", "Retry analysis", "go") : ""}
    ${full && !s.pending ? form("analyze", "↻ Re-analyze", "subtle", "", "Run the current analysis on it again") : ""}
  </footer>`;
}

export function ideaCard(s: SourceRow, back = "/ideas"): string {
  const a = s.analysis;
  const r = (a?.result ?? {}) as Record<string, unknown>;
  const full = a?.depth === "full";
  const b = full ? a!.breakdown : null;
  const channel = s.channel ?? s.channels[0] ?? null;
  const cls = s.classification;
  const tag = cls ? CLASSIFICATION_BY_ID.get(cls)?.tag ?? null : null;
  const canonWarn = s.canonCheck && !s.canonVerifiedAt;
  const headline = full ? String(r.headline || r.suggested_title || "") : String(r.hook || "") || s.title || s.body.split("\n")[0]!.slice(0, 140);
  const why = b?.why ?? [];
  const problems = b?.problems ?? [];
  const status =
    s.decision === "rejected"
      ? `<span class="idec rej">Rejected${s.rejectReason ? ` · ${esc(REJECT_BY_ID.get(s.rejectReason) ?? s.rejectReason)}` : ""}</span>`
      : s.decision === "saved"
        ? `<span class="idec sav">Saved</span>`
        : s.decision === "approved"
          ? `<span class="idec app">Approved</span>`
          : s.decision === "used"
            ? `<span class="idec used">Used</span>`
            : s.decision === "archived"
              ? `<span class="idec">Duplicate</span>`
              : "";
  const note =
    s.stage === "error"
      ? `<p class="ierr">Analysis failed: ${esc(s.error ?? "unknown error")}. The post is kept — retry when ready.</p>`
      : s.stage === "filtered"
        ? `<p class="ifilt">Filtered before analysis: ${esc(s.filterReason ?? "")}. Kept here in case it's wrong.</p>`
        : s.decision === "archived"
          ? `<p class="ifilt">${esc(s.filterReason ?? "Duplicate")}</p>`
          : s.pending && !s.processingAt
            ? `<p class="ifilt">Waiting for ${s.pending === "full" ? "the full read" : "the quick look"}${s.error ? ` — last try: ${esc(s.error)}` : ""}.</p>`
            : "";
  return `<article class="icard${s.decision ? ` d-${s.decision}` : ""}${full ? " full" : ""}" id="s-${s.id}" style="--ch:${channelColour(channel)}">
    <header class="ihead">
      ${scoreBadge(s)}
      <div class="ipills">
        ${channel ? `<span class="ich"><i></i>${esc(shortChannel(channel))}</span>` : ""}
        ${
          full || cls
            ? `<form method="post" action="/ideas/s/${s.id}/classify" class="iclsf" data-act title="The clarification tag on the Short: ${tag ? esc(tag) : "none (canon)"}">
                <input type="hidden" name="back" value="${esc(back)}">
                <select name="classification" class="icls ${cls === "CANON" ? "canon" : ""}" onchange="this.form.requestSubmit ? this.form.requestSubmit() : this.form.submit()">${classOptions(cls)}</select>
              </form>`
            : ""
        }
        ${canonWarn ? `<span class="icanon" title="${esc(((r.canon_checks as string[]) ?? []).join(" · ") || "A lore assumption needs checking")}">⚠ Canon verification needed</span>` : ""}
        ${s.canonVerifiedAt ? `<span class="icanon ok">✓ Canon checked</span>` : ""}
        ${status}
      </div>
    </header>
    ${note}
    ${headline ? `<h3 class="ihl">${esc(headline)}</h3>` : ""}
    ${
      full
        ? `${r.irreplaceable_detail ? `<div class="iobs"><h4>Original observation</h4><p>${esc(String(r.irreplaceable_detail))}</p></div>` : ""}
          ${
            r.suggested_title
              ? `<div class="ibit"><h4>Suggested Bit</h4><p class="ibt">${esc(String(r.suggested_title))}</p>
                  ${r.suggested_premise ? `<p>${esc(String(r.suggested_premise))}</p>` : ""}
                  ${r.suggested_direction ? `<p class="idir"><b>Direction</b> ${esc(String(r.suggested_direction))}</p>` : ""}
                  ${Array.isArray(r.comedy_engines) && r.comedy_engines.length ? `<p class="ieng">${(r.comedy_engines as string[]).map((e) => `<span>${esc(engineLabel(e))}</span>`).join("")}</p>` : ""}
                </div>`
              : ""
          }
          ${
            why.length || problems.length
              ? `<div class="iwhy">
                  ${why.length ? `<div><h4>Why this ranked high</h4><ul class="plus">${why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
                  ${problems.length ? `<div><h4>Potential problems</h4><ul class="minus">${problems.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
                </div>`
              : ""
          }
          <div class="imeta">
            <span class="iconf" title="The AI's estimate of how accurate the canon facts behind the premise are. An estimate, never a verification.">Canon confidence <b>${pct(r.canon_confidence)}</b> <small>AI estimate</small></span>
            ${
              s.canonCheck
                ? `<form method="post" action="/ideas/s/${s.id}/canon" data-act><input type="hidden" name="back" value="${esc(back)}"><input type="hidden" name="on" value="${s.canonVerifiedAt ? "0" : "1"}"><button class="ibtn subtle">${s.canonVerifiedAt ? "Undo canon check" : "Mark canon checked"}</button></form>`
                : ""
            }
            ${similarityBlock(s)}
          </div>
          ${breakdownBlock(b)}`
        : r.reason
          ? `<p class="iquick">${esc(String(r.reason))}</p>`
          : ""
    }
    ${sourceBlock(s, false)}
    ${actions(s, r, back)}
  </article>`;
}

// ── approved ideas ────────────────────────────────────────────────────────

export function ideaRowCard(i: IdeaRow): string {
  const tag = CLASSIFICATION_BY_ID.get(i.classification)?.tag ?? null;
  const url = safeUrl(i.sourceUrl);
  const top = i.similarity?.[0];
  return `<article class="icard idea" id="i-${i.id}" style="--ch:${channelColour(i.channel)}">
    <header class="ihead">
      <div class="ipills">
        <span class="ich"><i></i>${esc(shortChannel(i.channel))}</span>
        <span class="icls-static">${esc(classLabel(i.classification))}${tag ? ` · tag: ${esc(tag)}` : " · no tag"}</span>
        ${i.canonChecks.length && !i.canonVerifiedAt ? `<span class="icanon" title="${esc(i.canonChecks.join(" · "))}">⚠ Canon verification needed</span>` : ""}
      </div>
      <form method="post" action="/ideas/i/${i.id}/status" class="istatus" data-act>
        <input type="hidden" name="back" value="/ideas?tab=approved">
        <select name="status" onchange="this.form.requestSubmit ? this.form.requestSubmit() : this.form.submit()">${IDEA_STATUSES.map((st) => `<option value="${st.id}"${st.id === i.status ? " selected" : ""}>${esc(st.label)}</option>`).join("")}</select>
      </form>
    </header>
    <h3 class="ihl">${esc(i.title)}</h3>
    ${i.premise ? `<p>${esc(i.premise)}</p>` : ""}
    ${i.direction ? `<p class="idir"><b>Direction</b> ${esc(i.direction)}</p>` : ""}
    ${i.observation ? `<div class="iobs"><h4>Original observation</h4><p>${esc(i.observation)}</p></div>` : ""}
    ${i.canonChecks.length ? `<p class="hint">Canon checks: ${esc(i.canonChecks.join(" · "))}</p>` : ""}
    ${top ? `<p class="hint">Closest existing work when approved: “${esc(top.title)}” (${Math.round(top.similarity * 100)}%, ${esc(matchDate(top.date))})</p>` : ""}
    ${i.notes ? `<p class="hint">Notes: ${esc(i.notes)}</p>` : ""}
    <div class="ifrom">
      ${i.approvedAt ? `<span>approved ${esc(usDate(dayOf(i.approvedAt)))}</span>` : ""}
      ${i.sourceAuthor ? `<span>from @${esc(i.sourceAuthor)}</span>` : ""}
      ${url ? `<a class="iview" href="${esc(url)}" target="_blank" rel="noreferrer">View original post ↗</a>` : ""}
      ${i.sourceId ? `<a href="/ideas?src=${i.sourceId}">the source card</a>` : ""}
    </div>
  </article>`;
}

// ── the feed page ─────────────────────────────────────────────────────────

export interface FeedPageData {
  query: FeedQuery;
  rows: SourceRow[];
  total: number;
  counts: Record<FeedTab, number>;
  pulse: { scanned: number; strong: number; high: number; waiting: number; errors: number; filtered: number };
  ideas?: IdeaRow[];
  status: { tumblr: boolean; ai: boolean; lastRead: Date | null; feeds: number; failing: number; aiCapped: boolean; paused: string };
  flash?: string;
  error?: string;
}

export function renderIdeaFeed(shell: Shell, d: FeedPageData): string {
  const q = d.query;
  const tabs = (Object.keys(TAB_LABELS) as FeedTab[])
    .map((t) => `<a class="${t === q.tab ? "on" : ""}" href="${esc(feedHref(q, { tab: t }))}">${esc(TAB_LABELS[t])}<span>${d.counts[t]}</span></a>`)
    .join("");
  const chips = [null, ...bitsChannels()]
    .map((c) => `<a class="ifchip${q.channel === c ? " on" : ""}" style="--ch:${c ? channelColour(c) : "var(--ink3)"}" href="${esc(feedHref(q, { channel: c }))}"><i></i>${esc(c ? shortChannel(c) : "All channels")}</a>`)
    .join("");
  const warnings = [
    !d.status.tumblr ? `Not reading Tumblr yet: set <code>TUMBLR_API_KEY</code> (an app's OAuth consumer key from tumblr.com/oauth/apps). Pasting posts in works meanwhile.` : "",
    !d.status.ai ? `Not analysing yet: set <code>ANTHROPIC_API_KEY</code>. Posts are stored and wait.` : "",
    d.status.paused ? `Reading paused: ${esc(d.status.paused)}.` : "",
    d.status.failing ? `${plural(d.status.failing, "tag")} failed on the last read — see <a href="/ideas/sources">Sources</a>.` : "",
    d.status.aiCapped ? `Today's analysis cap is reached; the rest wait for tomorrow (<a href="/ideas/sources#settings">raise it</a>).` : "",
  ].filter(Boolean);
  const pulse = `<section class="ipulse">
      <div class="ipnums">
        <div><b>${d.pulse.scanned.toLocaleString("en-US")}</b><span>posts scanned · 24h</span></div>
        <div class="strong"><b>${d.pulse.strong}</b><span>strong candidates</span></div>
        <div class="high"><b>${d.pulse.high}</b><span>high priority</span></div>
        <div><b>${d.pulse.waiting}</b><span>waiting for analysis</span></div>
      </div>
      <p class="ipline">${d.status.lastRead ? `Tumblr read ${esc(timeAgo(d.status.lastRead))}` : d.status.tumblr ? "Tumblr not read yet" : "Tumblr not connected"} · ${plural(d.status.feeds, "tag")} watched${
        d.pulse.filtered ? ` · ${d.pulse.filtered} filtered today (in New)` : ""
      }${d.pulse.errors ? ` · <a href="${esc(feedHref(q, { tab: "new" }))}">${plural(d.pulse.errors, "analysis", "analyses")} failed</a>` : ""}</p>
      ${warnings.length ? `<ul class="iwarn">${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>` : ""}
    </section>`;
  const add = `<details class="iadd"${d.error ? " open" : ""}><summary class="ibtn">+ Add a post by link</summary>
      <form method="post" action="/ideas/add" class="iaddf">
        <label>Link to the post<input name="url" type="url" placeholder="https://www.tumblr.com/blog/123456789…" maxlength="2000"></label>
        <label>Its text <small>(needed for non-Tumblr links, or without a Tumblr key)</small><textarea name="text" rows="3" maxlength="20000"></textarea></label>
        <label>For channel <select name="channel"><option value="">Let the analysis decide</option>${channelOptions(null)}</select></label>
        <button class="ibtn go">Add and analyse</button>
        ${d.error ? `<p class="ierr">${esc(d.error)}</p>` : ""}
      </form></details>`;
  const filters = `<form class="ifilters" method="get" action="/ideas">
      ${q.tab !== "foryou" ? `<input type="hidden" name="tab" value="${q.tab}">` : ""}
      ${q.channel ? `<input type="hidden" name="ch" value="${esc(q.channel)}">` : ""}
      <input type="search" name="q" value="${esc(q.q)}" placeholder="Search posts and ideas — Gojo, Flowey, Omnitrix…" aria-label="Search">
      <select name="cls" aria-label="Classification"><option value="">Any classification</option>${classOptions(q.cls)}</select>
      <select name="min" aria-label="Minimum score"><option value="">Any score</option>${[50, 70, 85].map((n) => `<option value="${n}"${q.min === n ? " selected" : ""}>${n}+</option>`).join("")}</select>
      <label class="ifcheck"><input type="checkbox" name="canon" value="1"${q.canon ? " checked" : ""}> Needs canon check</label>
      <button class="ibtn">Filter</button>
      ${q.q || q.cls || q.min || q.canon ? `<a class="ibtn subtle" href="${esc(feedHref({ ...q, q: "", cls: null, min: null, canon: false }))}">Clear</a>` : ""}
    </form>`;
  const back = feedHref(q, { page: q.page });
  const empty: Record<FeedTab, string> = {
    foryou: "Nothing fully analysed yet. New posts get a quick look first; the promising ones get the full read — they'll appear here.",
    new: "No posts yet. Once Tumblr is connected, each watched tag is read on its own schedule.",
    high: "Nothing scoring 85+ right now.",
    gems: "No hidden gems yet: high scores on posts with few notes, or older posts.",
    saved: "Nothing saved. ☆ Save keeps a source here without marking it used.",
    approved: "Nothing approved yet.",
    used: "No sources have become a published Bit yet. Set an approved idea's status to Published and its source moves here.",
    rejected: "Nothing rejected.",
  };
  const list =
    q.tab === "approved" && d.ideas
      ? d.ideas.length
        ? d.ideas.map(ideaRowCard).join("")
        : `<p class="empty">${empty.approved}</p>`
      : d.rows.length
        ? d.rows.map((s) => ideaCard(s, back)).join("")
        : `<p class="empty">${esc(empty[q.tab])}</p>`;
  const more = q.tab !== "approved" && d.total > (q.page + 1) * 30 ? `<a class="ibtn imore" href="${esc(feedHref(q, { page: q.page + 1 }))}">Next ${Math.min(30, d.total - (q.page + 1) * 30)} →</a>` : "";
  return layout(
    "Bits Idea Feed",
    shell,
    `${pageHeader("Bits Idea Feed", `<a class="clear secondary" href="/ideas/sources">Sources &amp; settings</a>`)}
    <style>${FEED_CSS}</style>
    ${d.flash ? `<div class="iflash" role="status">${esc(d.flash)}</div>` : ""}
    ${pulse}
    <div class="ibar">${add}</div>
    <nav class="itabs" aria-label="Feed">${tabs}</nav>
    <div class="ifchips">${chips}</div>
    ${filters}
    <div class="igrid">${list}</div>
    ${more}
    ${CARD_SCRIPT}`,
  );
}

// ── Sources & settings ────────────────────────────────────────────────────

export interface SourcesPageData {
  feeds: Feed[];
  settings: IdeaSettings;
  usage: Map<string, UsageRow>;
  tumblr: boolean;
  ai: boolean;
  model: string;
  reader: { pausedUntil: Date | null; reason: string; callsThisHour: number };
  flash?: string;
}

/** Rough cost from list prices, for models whose prices are known; per million tokens. */
const PRICES: Record<string, { in: number; out: number; cache: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, cache: 0.2 },
  "claude-opus-5": { in: 5, out: 25, cache: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10, cache: 0.2 },
  "claude-sonnet-5": { in: 2, out: 10, cache: 0.2 },
  "claude-haiku-4-5": { in: 1, out: 5, cache: 0.1 },
};
export function estimateCost(model: string, u: { input: number; output: number; cacheRead: number }): number | null {
  const p = PRICES[model];
  return p ? (u.input * p.in + u.output * p.out + u.cacheRead * p.cache) / 1_000_000 : null;
}

export function renderIdeaSources(shell: Shell, d: SourcesPageData): string {
  const t = d.usage.get("tumblr");
  const tri = d.usage.get("ai-triage");
  const full = d.usage.get("ai-full");
  const tokens = { input: (tri?.input ?? 0) + (full?.input ?? 0), output: (tri?.output ?? 0) + (full?.output ?? 0), cacheRead: (tri?.cacheRead ?? 0) + (full?.cacheRead ?? 0) };
  const cost = estimateCost(d.model, tokens);
  const status = `<section class="panel isrcstat">
      <div class="istat ${d.tumblr ? "ok" : "off"}"><h3>Tumblr</h3>${
        d.tumblr
          ? `<p>Connected · <b>${(t?.calls ?? 0).toLocaleString("en-US")}</b> of ${d.settings.tumblrDailyCap.toLocaleString("en-US")} calls today · ${d.reader.callsThisHour} this hour (Tumblr allows 1,000 an hour, 5,000 a day)</p>
             <p class="hint">Spread across the day: up to ${pacedAllowance(d.settings.tumblrDailyCap, minutesIntoDay(ORG_TZ)).toLocaleString("en-US")} by this hour, so busy tags can't use the day up early.</p>${
              d.reader.pausedUntil ? `<p class="ierr">Paused until ${esc(d.reader.pausedUntil.toLocaleTimeString("en-US", { timeZone: ORG_TZ, hour: "numeric", minute: "2-digit" }))} ET — ${esc(d.reader.reason)}</p>` : ""
            }`
          : `<p>Not connected. Register an app at <a href="https://www.tumblr.com/oauth/apps" target="_blank" rel="noreferrer">tumblr.com/oauth/apps</a>, then set its <b>OAuth consumer key</b> as <code>TUMBLR_API_KEY</code> on Railway. No login or secret is needed — the feed only reads public posts.</p>`
      }</div>
      <div class="istat ${d.ai ? "ok" : "off"}"><h3>Analysis</h3>${
        d.ai
          ? `<p><code>${esc(d.model)}</code> · quick look <b>${tri?.items ?? 0}</b>/${d.settings.triageCap} posts today (${plural(tri?.calls ?? 0, "batch", "batches")}) · full read <b>${full?.items ?? 0}</b>/${d.settings.fullCap}</p>
             <p class="hint">${(tokens.input + tokens.cacheRead).toLocaleString("en-US")} tokens in (${tokens.cacheRead.toLocaleString("en-US")} from cache), ${tokens.output.toLocaleString("en-US")} out today${cost !== null ? ` · about $${cost.toFixed(2)} at list prices` : ""}</p>`
          : `<p>Waiting for <code>ANTHROPIC_API_KEY</code>. Posts are stored meanwhile and analysed once it's set.</p>`
      }</div>
    </section>`;
  const s = d.settings;
  const settings = `<section class="panel" id="settings"><h2>Settings <span class="sub">— caps keep the spend predictable; anything over waits for tomorrow</span></h2>
      <form method="post" action="/ideas/sources/settings" class="isetf">
        <label class="ifcheck"><input type="checkbox" name="polling" value="on"${s.polling ? " checked" : ""}> Read Tumblr</label>
        <label class="ifcheck"><input type="checkbox" name="ai" value="on"${s.ai ? " checked" : ""}> Analyse posts</label>
        <label>Quick looks a day<input type="number" name="triageCap" min="0" max="20000" value="${s.triageCap}"></label>
        <label>Full reads a day<input type="number" name="fullCap" min="0" max="2000" value="${s.fullCap}"></label>
        <label>Full read from quick-look score<input type="number" name="fullThreshold" min="0" max="1" step="0.05" value="${s.fullThreshold}"></label>
        <label>Tumblr calls a day<input type="number" name="tumblrDailyCap" min="0" max="4900" value="${s.tumblrDailyCap}"></label>
        <button class="ibtn go">Save settings</button>
      </form></section>`;
  const byChannel = new Map<string, Feed[]>();
  for (const f of d.feeds) {
    const key = f.channels[0] ?? "(no channel)";
    byChannel.set(key, [...(byChannel.get(key) ?? []), f]);
  }
  const channelChecks = (name: string, selected: string[]) =>
    bitsChannels()
      .map((c) => `<label class="ichk" style="--ch:${channelColour(c)}"><input type="checkbox" name="${name}" value="${esc(c)}"${selected.includes(c) ? " checked" : ""}><i></i>${esc(shortChannel(c))}</label>`)
      .join("");
  const feedRow = (f: Feed) => `<li class="ifeed${f.enabled ? "" : " off"}${f.lastError ? " bad" : ""}" id="f-${f.id}">
      <form method="post" action="/ideas/sources/feed/${f.id}" class="ifeedf">
        <div class="ifq"><b>#${esc(f.query)}</b>
          <span class="hint">${f.lastSuccessAt ? `read ${esc(timeAgo(f.lastSuccessAt))}` : "not read yet"}${f.lastPostAt ? ` · newest post ${esc(timeAgo(f.lastPostAt))}` : ""} · ${f.found24h} found today, ${f.found7d} this week · every ${f.pollMinutes} min${
            f.enabled ? ` · next ${f.nextPollAt.getTime() <= Date.now() ? "now" : `in ${Math.max(1, Math.round((f.nextPollAt.getTime() - Date.now()) / 60000))} min`}` : ""
          }</span>
          ${f.lastError ? `<span class="ierr">Last read failed ${f.lastAttemptAt ? esc(timeAgo(f.lastAttemptAt)) : ""}: ${esc(f.lastError)} — its place is kept.</span>` : ""}
        </div>
        <div class="ifchans">${channelChecks("channels", f.channels)}</div>
        <div class="ifopts">
          <label class="ifcheck"><input type="checkbox" name="enabled" value="on"${f.enabled ? " checked" : ""}> On</label>
          <label>Weight<select name="weight">${[5, 4, 3, 2, 1].map((w) => `<option value="${w}"${w === f.weight ? " selected" : ""}>${w} — every ${({ 5: "10 min", 4: "15 min", 3: "30 min", 2: "hour", 1: "2 hours" } as Record<number, string>)[w]}</option>`).join("")}</select></label>
          <label>Exclude<input name="exclusions" value="${esc(f.exclusions.join(", "))}" placeholder="words or tags, comma-separated"></label>
          <label>Min notes<input type="number" name="minNotes" min="0" value="${f.minNotes}"></label>
          <button class="ibtn">Save</button>
        </div>
      </form>
      <div class="ifacts">
        <form method="post" action="/ideas/sources/feed/${f.id}/poll"><button class="ibtn subtle"${f.enabled ? "" : " disabled"}>Read now</button></form>
        <form method="post" action="/ideas/sources/feed/${f.id}/delete" onsubmit="return confirm('Stop watching #${esc(f.query).replace(/'/g, "")}? Posts it found stay.')"><button class="ibtn subtle">Remove</button></form>
      </div>
    </li>`;
  const groups = [...byChannel]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ch, list]) => `<div class="ifgroup" style="--ch:${channelColour(ch)}"><h3><i></i>${esc(shortChannel(ch))} <span class="hint">${plural(list.length, "tag")}</span></h3><ul>${list.map(feedRow).join("")}</ul></div>`)
    .join("");
  const addFeed = `<form method="post" action="/ideas/sources/feed" class="iaddfeed">
      <label>Tag<input name="query" required maxlength="120" placeholder="e.g. jujutsu kaisen"></label>
      <div class="ifchans">${channelChecks("channels", [])}</div>
      <label>Weight<select name="weight">${[5, 4, 3, 2, 1].map((w) => `<option value="${w}"${w === 3 ? " selected" : ""}>${w}</option>`).join("")}</select></label>
      <button class="ibtn go">Watch this tag</button>
    </form>`;
  const rescore = `<section class="panel" id="rescore"><h2>Re-score <span class="sub">— run the current analysis again on posts already stored, without reading Tumblr again</span></h2>
      <form method="post" action="/ideas/rescore" class="isetf">
        <label>Which posts<select name="scope">
          <option value="24h">Last 24 hours</option><option value="7d" selected>Last 7 days</option><option value="30d">Last 30 days</option><option value="unused">All unused</option>
        </select></label>
        <label>Channel<select name="channel"><option value="">Every channel</option>${channelOptions(null)}</select></label>
        <label>How<select name="depth"><option value="triage">From the quick look</option><option value="full">Full read for all (uses the full-read cap)</option></select></label>
        <button class="ibtn">Re-score</button>
      </form>
      <form method="post" action="/ideas/retry-errors" class="isetf"><button class="ibtn subtle">Retry every failed analysis</button></form>
    </section>`;
  return layout(
    "Idea Feed sources",
    shell,
    `${pageHeader("Idea Feed · Sources", `<a class="clear secondary" href="/ideas">Back to the feed</a>`)}
    <style>${FEED_CSS}</style>
    ${d.flash ? `<div class="iflash" role="status">${esc(d.flash)}</div>` : ""}
    ${status}
    <section class="panel"><h2>Watched tags <span class="sub">— Tumblr's API searches by tag only (there's no keyword search), one tag per call</span></h2>
      ${addFeed}
      ${groups || `<p class="empty">No tags watched.</p>`}
    </section>
    ${settings}
    ${rescore}`,
  );
}

// ── behaviour ─────────────────────────────────────────────────────────────

/** Card actions in place: the card is swapped for its new state, no reload, no jump. */
const CARD_SCRIPT = `<script>
(function () {
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.hasAttribute || !form.hasAttribute("data-act") || !window.fetch) return;
    e.preventDefault();
    var card = form.closest(".icard");
    var data = new URLSearchParams(new FormData(form));
    if (e.submitter && e.submitter.name) data.set(e.submitter.name, e.submitter.value);
    if (card) card.classList.add("busy");
    fetch(form.action, { method: "POST", body: data, headers: { "x-fetch": "1" } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.error) {
          if (card) card.classList.remove("busy");
          alert(res.error);
          return;
        }
        if (!card) return location.reload();
        if (res.html) {
          var t = document.createElement("template");
          t.innerHTML = res.html.trim();
          card.replaceWith(t.content.firstElementChild);
        } else card.remove();
      })
      .catch(function () { form.submit(); });
  });
})();
</script>`;

const FEED_CSS = `
.ipulse { background: var(--card); border-radius: var(--r); padding: 16px 18px; margin: 0 0 14px; }
.ipnums { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ipnums div { background: var(--sunk); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ipnums b { font-family: var(--display); font-size: 24px; line-height: 1.1; }
.ipnums span { font-size: 11.5px; color: var(--ink3); }
.ipnums .strong b { color: #9BD35A; } .ipnums .high b { color: #3CCB84; }
.ipline { margin: 10px 0 0; font-size: 12.5px; color: var(--ink3); }
.ipline a { color: var(--ink2); text-decoration: underline; }
.iwarn { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.iwarn li { background: #3A2A14; color: #FFD29A; border-radius: 10px; padding: 8px 12px; font-size: 13px; }
.iwarn a { color: #FFE2B8; text-decoration: underline; }
.iflash { background: rgba(60,203,132,.12); color: #BFF3D6; border-radius: 12px; padding: 10px 14px; margin: 0 0 12px; font-size: 13.5px; }
.ibar { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
.iadd { flex: 1 1 100%; }
.iadd > summary { list-style: none; display: inline-flex; }
.iadd > summary::-webkit-details-marker { display: none; }
.iaddf, .idevf { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; background: var(--card); border-radius: 14px; padding: 14px; max-width: 720px; }
.iaddf label, .idevf label, .isetf label, .iaddfeed label, .ifopts label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink3); font-weight: 700; }
.iaddf input, .iaddf textarea, .iaddf select, .idevf input, .idevf textarea, .idevf select, .ifilters input, .ifilters select,
.isetf input, .isetf select, .iaddfeed input, .iaddfeed select, .ifopts input, .ifopts select, .irej input {
  background: var(--sunk); border: 1px solid var(--line); color: var(--ink); border-radius: 10px; padding: 8px 10px; font: 13.5px var(--ui); min-width: 0; }
.idevrow { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.itabs { display: flex; gap: 4px; flex-wrap: wrap; margin: 0 0 10px; }
.itabs a { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; background: var(--card); color: var(--ink2); font-weight: 600; font-size: 13px; }
.itabs a span { font-size: 11px; color: var(--ink3); font-weight: 700; }
.itabs a.on { background: var(--ink); color: #0B0B0D; } .itabs a.on span { color: #3A3A44; }
.ifchips { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
.ifchip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: var(--card); color: var(--ink2); font-size: 12.5px; font-weight: 600; }
.ifchip i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); }
.ifchip.on { background: var(--sunk); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--ch); }
.ifilters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 14px; }
.ifilters input[type=search] { flex: 1 1 260px; }
.ifcheck { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 6px; font-size: 13px !important; color: var(--ink2) !important; font-weight: 600 !important; }
.ibtn { border: 0; cursor: pointer; border-radius: 999px; padding: 7px 13px; background: var(--sunk); color: var(--ink2); font: 600 12.5px var(--ui); white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.ibtn:hover { background: var(--line); color: var(--ink); }
.ibtn.go { background: #1E3A2C; color: #8FE3B6; } .ibtn.go:hover { background: #25503A; color: #BFF3D6; }
.ibtn.on { background: #3A3214; color: #FFD66B; }
.ibtn.subtle { background: transparent; color: var(--ink3); box-shadow: inset 0 0 0 1px var(--line); }
.ibtn[disabled] { opacity: .45; cursor: default; }
.igrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 14px; align-items: start; }
.icard { background: var(--card); border-radius: 18px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; border-top: 3px solid var(--ch); min-width: 0; transition: opacity .15s; }
.icard.busy { opacity: .45; pointer-events: none; }
.icard.d-rejected, .icard.d-archived { opacity: .75; }
.ihead { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.iscore { display: flex; flex-direction: column; align-items: center; min-width: 64px; padding: 6px 8px; border-radius: 14px; background: var(--sunk); }
.iscore b { font-family: var(--display); font-size: 30px; line-height: 1; color: var(--sc, var(--ink)); }
.iscore small { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); font-weight: 800; margin-top: 3px; text-align: center; }
.iscore.quick b { color: var(--ink3); font-size: 22px; } .iscore.dim b { color: var(--ink3); font-size: 22px; }
.iscore.err b { color: #FF9C94; }
.spin { display: inline-block; animation: ispin 1.2s linear infinite; }
@keyframes ispin { to { transform: rotate(360deg); } }
.ipills { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; justify-content: flex-end; flex: 1; }
.ich { display: inline-flex; align-items: center; gap: 6px; background: var(--sunk); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; color: var(--ink); }
.ich i { width: 8px; height: 8px; border-radius: 50%; background: var(--ch); }
.iclsf { margin: 0; }
.icls { background: #2A2440; color: #CFC4FF; border: 0; border-radius: 999px; padding: 4px 8px; font: 700 11.5px var(--ui); cursor: pointer; }
.icls.canon { background: rgba(60,203,132,.14); color: #8FE3B6; }
.icls-static { background: #2A2440; color: #CFC4FF; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; }
.icanon { background: #3A2A14; color: #FFD29A; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; }
.icanon.ok { background: rgba(60,203,132,.12); color: #8FE3B6; }
.idec { border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; background: var(--sunk); color: var(--ink2); }
.idec.rej { color: #FF9C94; } .idec.sav { color: #FFD66B; } .idec.app { color: #8FE3B6; } .idec.used { color: #9BB7FF; }
.ihl { margin: 0; font-family: var(--display); font-size: 18px; line-height: 1.25; letter-spacing: -0.01em; text-transform: none; }
.icard h4 { margin: 0 0 3px; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink3); }
.icard p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink2); }
.iobs p { color: var(--ink); }
.ibit { background: var(--sunk); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; }
.ibt { font-weight: 800; color: var(--ink) !important; font-size: 14.5px !important; }
.idir b { color: var(--ink3); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-right: 4px; }
.ieng { display: flex; gap: 4px; flex-wrap: wrap; }
.ieng span { font-size: 11px; background: var(--card); color: var(--ink3); border-radius: 6px; padding: 2px 7px; font-weight: 700; }
.iwhy { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.iwhy ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--ink2); line-height: 1.4; }
.iwhy .plus li::before { content: "+ "; color: #8FE3B6; font-weight: 800; }
.iwhy .minus li::before { content: "− "; color: #FF9C94; font-weight: 800; }
.imeta { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; font-size: 12.5px; color: var(--ink2); }
.imeta form { margin: 0; }
.iconf small { color: var(--ink3); }
.isim { flex: 1 1 100%; background: var(--sunk); border-radius: 10px; padding: 7px 10px; font-size: 12.5px; }
.isim summary { cursor: pointer; list-style: none; } .isim summary::-webkit-details-marker { display: none; }
.isim .more { color: var(--ink3); font-size: 11.5px; margin-left: 6px; text-decoration: underline; }
.isim.major { background: #3A1E1D; color: #FFC2BC; } .isim.warn { background: #3A2A14; color: #FFD29A; }
.isim.unavail { background: #2A2A30; color: #FFD29A; }
.isim ul { list-style: none; margin: 8px 0 2px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.isim li { display: flex; gap: 10px; }
.ssim { font-family: var(--display); font-weight: 800; min-width: 38px; }
.isim li small { display: block; color: var(--ink3); font-size: 11.5px; }
.isim li p { font-size: 12.5px; color: inherit; opacity: .9; }
.isim a { color: inherit; text-decoration: underline; }
.ibreak summary { cursor: pointer; font-size: 12px; color: var(--ink3); font-weight: 700; }
.iparts { list-style: none; margin: 8px 0 4px; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.iparts li { display: grid; grid-template-columns: 170px minmax(0, 1fr) 30px 36px; gap: 8px; align-items: center; font-size: 12px; color: var(--ink2); }
.iparts i { height: 6px; border-radius: 3px; background: linear-gradient(to right, var(--sc) var(--w), var(--sunk) var(--w)); }
.iparts b { text-align: right; color: var(--ink); } .iparts small { color: var(--ink3); }
.ibase { font-size: 12px !important; }
.iadj { list-style: none; margin: 4px 0; padding: 0; font-size: 12px; }
.iadj li { display: flex; justify-content: space-between; gap: 8px; } .iadj .up b { color: #8FE3B6; } .iadj .down b { color: #FF9C94; }
.iquick { font-size: 12.5px !important; color: var(--ink3) !important; font-style: italic; }
.ierr { color: #FF9C94 !important; font-size: 12.5px !important; }
.ifilt { color: var(--ink3) !important; font-size: 12.5px !important; }
.isrc { border-top: 1px solid var(--line); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.iimgs { display: grid; gap: 4px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.iimgs.n1 { grid-template-columns: minmax(0, 1fr); } .iimgs.n2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.iimgs img { width: 100%; max-height: 220px; object-fit: cover; border-radius: 10px; display: block; background: var(--sunk); }
.iimgs.n1 img { max-height: 320px; object-fit: contain; }
.ibody { white-space: pre-wrap; font-size: 13px; line-height: 1.5; color: var(--ink2); overflow-wrap: anywhere; }
.ibodyd summary { list-style: none; cursor: pointer; } .ibodyd summary::-webkit-details-marker { display: none; }
.ibodyd .more { font-size: 11.5px; color: var(--ink3); text-decoration: underline; }
.ibodyd[open] summary { display: none; }
.ifrom { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12px; color: var(--ink3); }
.ifrom .prov { font-weight: 800; color: var(--ink2); }
.itags { color: var(--ink3); }
.iview { margin-left: auto; background: var(--ink); color: #0B0B0D !important; border-radius: 999px; padding: 6px 12px; font-weight: 800; font-size: 12.5px; white-space: nowrap; }
.iview:hover { filter: brightness(.9); }
.iacts { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-start; }
.iacts form { margin: 0; }
.idev, .irej { position: relative; }
.idev > summary, .irej > summary { list-style: none; } .idev > summary::-webkit-details-marker, .irej > summary::-webkit-details-marker { display: none; }
.idev[open] { flex: 1 1 100%; }
.irej[open] { flex: 1 1 100%; }
.irej form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.ireasons { display: flex; flex-wrap: wrap; gap: 6px; }
.idevf { max-width: none; background: var(--sunk); }
.imore { margin: 14px auto 0; display: flex; width: max-content; }
.empty { color: var(--ink3); padding: 20px; background: var(--card); border-radius: 16px; }
.istatus select { background: var(--sunk); color: var(--ink); border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; font: 700 12px var(--ui); }
.isrcstat { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.istat h3 { margin: 0 0 6px; font-family: var(--display); font-size: 16px; }
.istat p { margin: 0 0 4px; font-size: 13px; color: var(--ink2); line-height: 1.5; }
.istat.off h3::after { content: " · off"; color: #FF9C94; font-size: 13px; }
.istat.ok h3::after { content: " · on"; color: #8FE3B6; font-size: 13px; }
.isetf { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
.iaddfeed { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin: 0 0 16px; padding: 12px; background: var(--sunk); border-radius: 14px; }
.ifchans { display: flex; flex-wrap: wrap; gap: 4px; }
.ichk { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 5px; background: var(--card); border-radius: 999px; padding: 4px 9px 4px 7px; font-size: 11.5px !important; color: var(--ink3) !important; cursor: pointer; }
.ichk input { position: absolute; opacity: 0; pointer-events: none; }
.ichk i { width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--ch); }
.ichk:has(input:checked) { color: var(--ink) !important; } .ichk:has(input:checked) i { background: var(--ch); }
.ifgroup { margin: 0 0 14px; }
.ifgroup h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 14px; }
.ifgroup h3 i { width: 10px; height: 10px; border-radius: 50%; background: var(--ch); }
.ifgroup ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ifeed { background: var(--sunk); border-radius: 12px; padding: 10px 12px; display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.ifeed.off { opacity: .6; } .ifeed.bad { box-shadow: inset 3px 0 0 #E5534B; }
.ifeedf { display: flex; flex-direction: column; gap: 8px; flex: 1 1 520px; min-width: 0; }
.ifq { display: flex; flex-direction: column; gap: 2px; } .ifq b { font-size: 14px; }
.ifopts { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
.ifopts input[name=exclusions] { min-width: 220px; }
.ifopts input[type=number] { width: 90px; }
.ifacts { display: flex; gap: 6px; } .ifacts form { margin: 0; }
@media (max-width: 760px) {
  .ipnums { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .iwhy { grid-template-columns: minmax(0, 1fr); }
  .isrcstat { grid-template-columns: minmax(0, 1fr); }
  .iparts li { grid-template-columns: 120px minmax(0, 1fr) 28px; } .iparts small { display: none; }
  .idevrow { grid-template-columns: minmax(0, 1fr); }
  .iview { margin-left: 0; }
}
`;

