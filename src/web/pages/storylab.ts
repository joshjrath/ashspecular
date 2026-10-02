/**
 * Story Lab: what each Stories channel should write next (the lore's ideas and
 * Claude's), the blueprint builder, the dice, the script library and the
 * draft checker.
 */
import type { AiIdeaRow } from "../../db/storylab.js";
import type { Blueprint, PlannedPart } from "../stories/blueprint.js";
import { CHANNELS } from "../../catalog.js";
import { type ChannelProfile, type SetFocus, type focusChoices, focusSource } from "../stories/domain.js";
import type { Contrast, LabIdea, PublicVideo, ScriptResult } from "../stories/lab.js";
import { DICE_LABELS, type DiceKind, type Shape } from "../stories/dice.js";
import type { DiceCard } from "../stories/roll.js";
import type { DraftCheck } from "../stories/check.js";
import { FORMAT_BY_ID, type Format } from "../stories/formats.js";
import { HEROES, type Hero, POWERS, WORLDS, type World } from "../stories/lore.js";
import type { Card as IdeaCard, IdeaMark, Neighbour } from "../stories/writenext.js";
import { type Norms, corpus } from "../stories/corpus.js";
import { type Shell, channelColour, colourOf, layout, liftText, pageHeader, scriptCard, scriptForm } from "../page.js";
import type { StoredScript } from "../../db/scripts.js";
import { compactViews, formatMultiple } from "../performance.js";
import { dayOf } from "../cadence.js";
import { esc, safeHref, safeUrl } from "../html.js";
import { usDate } from "../../parse/derive.js";

// ── Story Lab ─────────────────────────────────────────────────────────────

export interface StoryLabData {
  /** The Specular compilations panel, rendered (web/specular.ts). */
  specular?: string;
  scripts: number;
  words: number;
  matched: number;
  ideas: Array<{ idea: LabIdea; blueprint: Blueprint | null }>;
  blueprint: Blueprint | null;
  /** The public video the built blueprint would repeat, if any. */
  builtRepeats?: PublicVideo | null;
  /** How many ideas were held back because they're already public, out of how many public videos. */
  heldBack?: number;
  publicCount?: number;
  picked: { format: string; hero: string; world: string; power: string; target: string; shape?: string };
  check: { title: string; text: string; result: DraftCheck | null } | null;
  contrast: Contrast[] | null;
  results: ScriptResult[];
  coverage: { heroes: Hero[]; worlds: World[]; done: Set<string> };
  formats: Array<{ format: Format; norms: Norms; examples: string[] }>;
  /** Title shapes added from the dice. */
  shapes?: Shape[];
  /** Write next, channel by channel: the cards, the idea bucket, how many rerolled away. */
  writeNext?: Array<{
    channel: string;
    /** The channel's id, for its anchor and forms. */
    id?: string;
    cards: Array<IdeaCard & { blueprint: Blueprint | null }>;
    saved: Array<IdeaMark & { written?: AiIdeaRow | null }>;
    skipped: number;
    /** What it's about (domain.ts), and what was set by hand. */
    profile?: ChannelProfile;
    set?: SetFocus | null;
    /** Claude's ideas still waiting for it, and its last call's outcome. */
    writtenLeft?: number;
    lastRun?: { at: Date; ok: boolean; error: string | null } | null;
  }>;
  /** Claude's ideas: on or not, today's calls against the cap. */
  claude?: { on: boolean; today: number; cap: number; kept: number; want: number };
  /** Every focus a channel can be set to, grouped, for the picker. */
  focusChoices?: ReturnType<typeof focusChoices>;
  /** The scripts added on the board, and how many came from the Drive. */
  library?: { scripts: StoredScript[]; drive: number; error: string };
  /** Stories uploads with no script anywhere, newest first, to link one to. */
  unassigned?: {
    videos: Array<{ title: string; channel: string; url: string; publishedAt: Date; views: number | null }>;
    total: number;
    open: boolean;
    linked: string;
    error: string;
  };
  /** 🎲 What was rolled, what was just added, and what's been added so far. */
  dice?: {
    rolled: DiceCard | null;
    added: DiceCard | null;
    additions: Array<{ kind: DiceKind; id: string; name: string }>;
    left: Record<DiceKind, number>;
    group: DiceKind | null;
    nonce: string;
    rolledNothing: boolean;
  };
}

/** A score out of 100 as a colour: green for the best, amber in the middle, red for the weakest. */
const scoreColour = (n: number) => (n >= 70 ? "#3CCB84" : n >= 55 ? "#9BD35A" : n >= 40 ? "#E8C547" : "#E5534B");

const SOURCE_LABEL: Record<Neighbour["source"], string> = {
  uploaded: "uploaded",
  assigned: "on the board",
  script: "a written script",
  saved: "saved for later",
  card: "another card",
};

/**
 * Write next, channel by channel: two cards each, best score first. Every
 * card has its score out of 100, a warning when it's too close to something
 * made or planned on any channel, ↻ for a fresh idea in its place and 🔖 to
 * save it to the channel's idea bucket.
 */
function writeNextPanel(
  list: NonNullable<StoryLabData["writeNext"]>,
  shapes: Shape[],
  publicCount: number,
  claude: StoryLabData["claude"] | null,
  choices: NonNullable<StoryLabData["focusChoices"]>,
): string {
  const shapeName = (id: string | null | undefined) => (id ? shapes.find((x) => x.id === id)?.name ?? id : "");
  const hidden = (m: Record<string, string | null | number>) =>
    Object.entries(m)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v ?? "")}">`)
      .join("");
  const idFields = (channel: string, i: IdeaCard["idea"], score: number) =>
    hidden({ channel, key: i.key, title: i.title, format: i.format, hero: i.hero?.id ?? null, world: i.world?.id ?? null, power: i.power?.id ?? null, target: i.target?.id ?? null, shape: i.shape ?? null, score });
  const writtenCard = (channel: string, c: IdeaCard & { blueprint: Blueprint | null }) => {
    const w = c.idea.ai!;
    return `<li class="wncard written"><details class="isg labidea">
      <summary>
        <span class="wnscore" style="--sc:${scoreColour(c.score)}" title="Predicted ${c.predicted}× the channel's usual, from how the network's videos like it did">${c.score}<small>/100</small></span>
        <span class="ikind written" title="Written by Claude for this channel, from its own videos and how they did">✨ Claude's idea</span>
        <span class="iidea">${esc(c.idea.title)}</span>
        ${
          c.similar
            ? `<span class="wnsim" title="Still an option — ↻ for another">Too close to “${esc(c.similar.title)}”${c.similar.channel ? ` · ${esc(c.similar.channel.replace(/^Specular /, ""))}` : ""} · ${esc(SOURCE_LABEL[c.similar.source])} (${esc(c.similar.why)})</span>`
            : ""
        }
        <span class="iwhy">${esc(w.premise)}</span>
        <span class="imore">The idea ▾</span>
      </summary>
      <div class="idetail">
        ${w.beats.length ? `<h4>How it goes</h4><ol class="wnbeats">${w.beats.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
        <h4>Why this one</h4>
        <ul class="labwhy">${[
          w.why ? `<li><b class="up">Claude</b> ${esc(w.why)}</li>` : "",
          ...w.modelledOn.map((m) => `<li><b class="${m.multiple !== null && m.multiple < 1 ? "down" : "up"}">${m.multiple !== null ? `${m.multiple.toFixed(1)}×` : "new"}</b> builds on “${esc(m.title)}”</li>`),
          ...c.idea.reasons.map((r) => `<li><b class="${r.lift >= 1 ? "up" : "down"}">${esc(liftText(r.lift))}</b> ${esc(r.text)}</li>`),
        ].join("")}</ul>
        ${c.blueprint ? blueprintHtml(c.blueprint) : `<p class="hint">Claude wrote this one from the channel's own videos; its title isn't one of the lore's formats, so there's no blueprint — the beats above are the outline.</p>`}
      </div>
    </details>
    <div class="wnacts">
      <form method="post" action="/story-lab/idea" data-swap>${idFields(channel, c.idea, c.score)}<input type="hidden" name="do" value="reroll"><button class="wnbtn" title="A fresh idea in its place — this one won't come back to this channel">↻ Reroll</button></form>
      <form method="post" action="/story-lab/idea" data-swap>${idFields(channel, c.idea, c.score)}<input type="hidden" name="do" value="save"><button class="wnbtn" title="Keep it in this channel's idea bucket, and get a fresh card">🔖 Save for later</button></form>
    </div></li>`;
  };
  const card = (channel: string, c: IdeaCard & { blueprint: Blueprint | null }) => c.idea.ai ? writtenCard(channel, c) : `<li class="wncard"><details class="isg labidea">
      <summary>
        <span class="wnscore" style="--sc:${scoreColour(c.score)}" title="Predicted ${c.predicted}× the channel's usual">${c.score}<small>/100</small></span>
        <span class="ikind ${c.idea.format}">${esc(FORMAT_BY_ID.get(c.idea.format)?.name ?? c.idea.format)}${c.idea.shape ? ` · ${esc(shapeName(c.idea.shape))}` : ""}</span>
        <span class="iidea">${esc(c.idea.title)}</span>
        ${
          c.similar
            ? `<span class="wnsim" title="Still an option — ↻ for another">Too close to “${esc(c.similar.title)}”${c.similar.channel ? ` · ${esc(c.similar.channel.replace(/^Specular /, ""))}` : ""} · ${esc(SOURCE_LABEL[c.similar.source])} (${esc(c.similar.why)})</span>`
            : ""
        }
        <span class="iwhy">${[...c.fit.slice(0, 1), ...c.idea.reasons.slice(0, 2).map((r) => r.text)].map(esc).join(" · ")}</span>
        <span class="imore">Blueprint ▾</span>
      </summary>
      <div class="idetail">
        <h4>Why this one</h4>
        <ul class="labwhy">${[
          ...c.fit.map((f) => `<li><b class="up">fit</b> ${esc(f)}</li>`),
          ...c.idea.reasons.map((r) => `<li><b class="${r.lift >= 1 ? "up" : "down"}">${esc(liftText(r.lift))}</b> ${esc(r.text)}</li>`),
        ].join("")}</ul>
        ${c.blueprint ? blueprintHtml(c.blueprint) : ""}
      </div>
    </details>
    <div class="wnacts">
      <form method="post" action="/story-lab/idea" data-swap>${idFields(channel, c.idea, c.score)}<input type="hidden" name="do" value="reroll"><button class="wnbtn" title="A fresh idea in its place — this one won't come back to this channel">↻ Reroll</button></form>
      <form method="post" action="/story-lab/idea" data-swap>${idFields(channel, c.idea, c.score)}<input type="hidden" name="do" value="save"><button class="wnbtn" title="Keep it in this channel's idea bucket, and get a fresh card">🔖 Save for later</button></form>
    </div></li>`;
  const focusText = (p: ChannelProfile | undefined) =>
    !p
      ? ""
      : p.open
        ? "Anything goes (set by hand)"
        : p.focus.length
          ? `${p.focus.map((f) => f.label).join(" + ")} · ${focusSource(p.focus[0]!)}`
          : "No single focus — ideas that share its characters or worlds";
  const focusEdit = (w: (typeof list)[number]) => {
    const setValue = w.set?.kind === "any" ? "any" : w.set?.kind && w.set.value ? `${w.set.kind}:${w.set.value}` : "";
    const options = choices
      .map((g) => `<optgroup label="${esc(g.group)}">${g.options.map((o) => `<option value="${esc(`${o.kind}:${o.value}`)}"${setValue === `${o.kind}:${o.value}` ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</optgroup>`)
      .join("");
    return `<details class="wnedit"><summary title="What this channel's videos are about: only ideas that fit it are offered here">✎ Focus</summary>
      <form method="post" action="/story-lab/focus" data-swap>
        ${hidden({ channel: w.channel })}
        <label>What its videos are about<select name="focus">
          <option value=""${setValue ? "" : " selected"}>Read it from its videos</option>
          <option value="any"${setValue === "any" ? " selected" : ""}>Anything — no focus</option>
          ${options}
        </select></label>
        <label>In your words <span class="hint">— Claude reads this when it writes ideas for the channel</span><textarea name="note" rows="2" maxlength="600" placeholder="e.g. anime characters in other worlds and fights; never western cartoons">${esc(w.set?.note ?? "")}</textarea></label>
        <button class="wnbtn">Save focus</button>
      </form></details>`;
  };
  const section = (w: (typeof list)[number]) => {
    const ch = CHANNELS.find((c) => c.name === w.channel);
    const saved = w.saved.length
      ? `<details class="wnbucket"><summary>🔖 Idea bucket <b>${w.saved.length}</b></summary><ul>${w.saved
          .map((m) => {
            const unsave = `<form method="post" action="/story-lab/idea" data-swap>${hidden({ channel: w.channel, key: m.key, do: "unsave" })}<button class="wnx" title="Take it out of the bucket">×</button></form>`;
            if (m.written) {
              return `<li class="wnbw"><span class="wnscore sm" style="--sc:${scoreColour(m.score)}">${m.score}</span><details><summary>✨ ${esc(m.title)}</summary>
                <p>${esc(m.written.premise)}</p>${m.written.beats.length ? `<ol class="wnbeats">${m.written.beats.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}</details>
                <span class="wnwhen">saved ${esc(usDate(dayOf(m.markedAt)))}</span>${unsave}</li>`;
            }
            const q = new URLSearchParams({ format: m.shape ? "" : m.format, ...(m.hero ? { hero: m.hero } : {}), ...(m.world ? { world: m.world } : {}), ...(m.power ? { power: m.power } : {}), ...(m.target ? { target: m.target } : {}), ...(m.shape ? { shape: m.shape } : {}) });
            return `<li><span class="wnscore sm" style="--sc:${scoreColour(m.score)}">${m.score}</span><a href="/story-lab?${esc(q.toString())}#blueprint">${esc(m.title)}</a><span class="wnwhen">saved ${esc(usDate(dayOf(m.markedAt)))}</span>${unsave}</li>`;
          })
          .join("")}</ul></details>`
      : "";
    const waiting =
      claude?.on && w.lastRun && !w.lastRun.ok && !(w.writtenLeft ?? 0)
        ? `<span class="wnai bad" title="${esc(w.lastRun.error ?? "")}">✨ Claude couldn't write ideas for it just now — trying again shortly</span>`
        : claude?.on && (w.writtenLeft ?? 0) > 0
          ? `<span class="wnai">✨ ${w.writtenLeft} of Claude's ideas waiting</span>`
          : "";
    return `<section class="wnchan" id="wn-${esc(ch?.id ?? w.channel)}" style="--ch:${channelColour(w.channel)}">
      <header><i></i><b>${esc(w.channel)}</b>${w.skipped ? `<span class="wnskip">${w.skipped} rerolled away</span>` : ""}${saved}</header>
      <div class="wnfocusrow"><span class="wnfocus" title="Only ideas that fit this are offered on this channel">📌 ${esc(focusText(w.profile))}</span>${waiting}${focusEdit(w)}</div>
      ${
        w.cards.length
          ? `<ul class="isugg">${w.cards.map((c) => card(w.channel, c)).join("")}</ul>`
          : `<p class="hint">Nothing left that fits ${esc(w.channel)} — ${claude?.on ? "Claude is writing more for it" : "add a Claude key in Settings for Claude's own ideas, or add something from the dice"}.</p>`
      }
    </section>`;
  };
  return `<div class="panel ideas" id="writenext"><h2>Write next <span class="sub">— two for every channel, only ideas that fit it, best score first · the score predicts how it'll do against the channel's usual (50 = its usual)${
    publicCount ? ` · checked against ${publicCount.toLocaleString("en-US")} public videos` : ""
  }</span></h2>
    <p class="wnclaude">${
      claude?.on
        ? `✨ Beside the lore's ideas, Claude writes ideas for each channel from its own videos and how they did — any character, world or format that fits it, not just the lore's. Each is checked against every public video and scored from the network's results. ${claude.today} of ${claude.cap} calls today.`
        : "✨ Add a Claude key in <a href='/settings#key-anthropic'>Settings → Connections &amp; API keys</a> and Claude writes ideas for each channel from its own videos, beyond the lore's heroes, worlds and formats."
    }</p>
    <div class="wnlist">${list.map(section).join("")}</div>
    <script>
    (function () {
      // Reroll, save and unsave without losing your place: the new section swaps in.
      document.getElementById("writenext").addEventListener("submit", function (e) {
        var form = e.target;
        if (!form.hasAttribute("data-swap") || !window.fetch || !window.DOMParser) return;
        e.preventDefault();
        var sec = form.closest(".wnchan");
        sec.classList.add("busy");
        fetch(form.action, { method: "POST", body: new URLSearchParams(new FormData(form)), headers: { Accept: "text/html" } })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var doc = new DOMParser().parseFromString(html, "text/html");
            var next = doc.getElementById(sec.id);
            if (next) sec.replaceWith(document.importNode(next, true)); else location.reload();
          })
          .catch(function () { form.submit(); });
      });
    })();
    </script>
  </div>`;
}

/**
 * The scripts Story Lab learns from: the Drive's, plus every one added on the
 * board — a Stories video's own, or one added here on its own.
 */
/**
 * Unassigned videos: every Stories upload with no script anywhere, newest
 * first — collapsed to one line until opened. Each can have its script linked
 * right there (a Google Doc or pasted in), filed under the video's title, which
 * is how the board finds a video's script; it then leaves this list.
 */
function unassignedPanel(u: NonNullable<StoryLabData["unassigned"]>): string {
  const LIMIT = 60;
  const channels = [...new Set(u.videos.map((v) => v.channel))].sort((a, b) => a.localeCompare(b));
  const rowsHtml = u.videos
    .map((v, i) => `<li class="uarow" data-ch="${esc(v.channel)}"${i >= LIMIT ? " hidden data-more" : ""}>
      <div class="uahead">
        <span class="cdot" style="--ch:${channelColour(v.channel)}"></span>
        <a class="uat" href="${esc(safeUrl(v.url))}" target="_blank" rel="noreferrer" title="${esc(v.title)} — on YouTube">${esc(v.title)}</a>
        <span class="uach">${esc(v.channel.replace(/^Specular /, ""))}</span>
        <span class="uad">${esc(usDate(dayOf(v.publishedAt)))}${v.views !== null ? ` · ${esc(compactViews(v.views))} views` : ""}</span>
        <details class="ualink"><summary>Link a script</summary>
          <form class="sform uaform" method="post" action="/story-lab/scripts">
            <input type="hidden" name="from" value="unassigned">
            <input type="hidden" name="title" value="${esc(v.title)}">
            <input type="text" name="url" placeholder="Its Google Doc link — shared as “Anyone with the link can view”" autocomplete="off">
            <div class="or">or</div>
            <textarea name="text" rows="4" placeholder="Paste the script, with its INTRO / PART 1 / … / OUTRO headers"></textarea>
            <button class="clear">Link to this video</button>
          </form>
        </details>
      </div>
    </li>`)
    .join("");
  return `<details class="panel ideas unassigned" id="unassigned"${u.open ? " open" : ""}>
    <summary><h2>Unassigned videos <span class="uacount">${u.videos.length}</span> <span class="sub">— Stories uploads with no script attached, ${u.total ? `${u.total - u.videos.length} of ${u.total} have one` : "none uploaded yet"}</span></h2></summary>
    ${u.linked ? `<div class="ualinked" role="status">✓ Script linked to <b>${esc(u.linked)}</b>. It's that video's script now, and Story Lab learns from it once it's 150 words or more.</div>` : ""}
    ${u.error ? `<div class="scripterr" role="alert">${esc(u.error)}</div>` : ""}
    ${
      u.videos.length
        ? `<div class="uabar">
            <label>Channel <select class="uapick"><option value="">Every channel</option>${channels.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label>
            <span class="hint-inline">Linking files the script under the video's title — how the board finds a video's script — and it joins what Story Lab learns from.</span>
          </div>
          <ul class="ualist">${rowsHtml}</ul>
          ${u.videos.length > LIMIT ? `<button type="button" class="clear secondary uamore">Show all ${u.videos.length}</button>` : ""}
          <script>
          (function () {
            var box = document.getElementById("unassigned");
            var pick = box.querySelector(".uapick"), more = box.querySelector(".uamore"), all = false;
            function draw() {
              var ch = pick.value, n = 0;
              box.querySelectorAll(".uarow").forEach(function (row) {
                var show = !ch || row.getAttribute("data-ch") === ch;
                if (show) n += 1;
                row.hidden = !show || (!all && !ch && n > ${LIMIT});
              });
              if (more) more.hidden = all || !!ch;
            }
            pick.addEventListener("change", draw);
            if (more) more.addEventListener("click", function () { all = true; draw(); });
          })();
          </script>`
        : `<p class="hint">Every Stories upload has its script. New uploads land here until theirs is linked.</p>`
    }
  </details>`;
}

function libraryPanel(lib: NonNullable<StoryLabData["library"]>): string {
  const learning = lib.scripts.filter((sc) => corpus().some((c) => c.board?.id === sc.id)).length;
  const cards = lib.scripts
    .slice()
    .reverse()
    .map((sc) => scriptCard(sc, colourOf(sc.category ?? "stories"), sc.recordId ? ` · <a href="/r/${sc.recordId}#script">its video</a>` : " · added here"))
    .join("");
  return `<div class="panel ideas" id="scripts"><h2>Scripts it learns from <span class="sub">— ${lib.drive} from the Drive${
    lib.scripts.length ? ` · ${learning} added on the board` : ""
  }</span></h2>
    <p class="hint" style="padding:0 14px">Every Stories script added to a video (on its page) or here joins the ${lib.drive + learning} Story Lab reads: format norms, blueprints' reference parts, the draft check, what the best scripts did differently and what's been done. Any category's script also gives its video's opening to the Uploads idea hooks.</p>
    <div style="padding:0 14px 14px">
      ${lib.error ? `<div class="scripterr" role="alert">${esc(lib.error)}</div>` : ""}
      ${cards ? `<div class="scripts">${cards}</div>` : ""}
      <details class="addscript"><summary class="clear secondary" style="display:inline-block;cursor:pointer">+ Add a script</summary><div style="margin-top:10px">${scriptForm("/story-lab/scripts", { title: true })}</div></details>
    </div></div>`;
}

/**
 * 🎲 Roll for something new: one new format, hero, world, power or target
 * per roll — what it is, the ideas it opens up — and Add to make it part of
 * Story Lab. Everything added is listed, and can come out again.
 */
function dicePanel(d: NonNullable<StoryLabData["dice"]>): string {
  const groups: DiceKind[] = ["shape", "hero", "world", "power", "target"];
  const total = groups.reduce((n, k) => n + d.left[k], 0);
  const rollHref = (g: DiceKind | null) => `/story-lab?roll=${d.nonce}${g ? `&amp;dice=${g}` : ""}#dice`;
  const card = (c: DiceCard, action: "add" | "added") => `<div class="dicecard ${c.kind}">
      <div class="dchead">
        <span class="dcgroup">${esc(c.group)}</span>
        <h3>${esc(c.name)}</h3>
        <span class="dcfrom">${esc(c.from)}</span>
      </div>
      <dl class="dcfacts">${c.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      ${
        c.opens.length
          ? `<h4>${action === "added" ? "Now in Story Lab — ideas it makes" : "What it opens up"}</h4>
             <ul class="dcopens">${c.opens.map((o) => `<li><a href="${esc(safeHref(o.href))}"><span class="ikind">${esc(o.format)}</span>${esc(o.title)}</a></li>`).join("")}</ul>`
          : `<p class="hint">Every idea it makes is already public or written — it'll still show in the builder.</p>`
      }
      ${
        action === "add"
          ? `<div class="dcacts">
              <form method="post" action="/story-lab/add"><input type="hidden" name="kind" value="${c.kind}"><input type="hidden" name="id" value="${esc(c.id)}">
                <button class="clear">Add to Story Lab</button></form>
              <a class="clear secondary" href="${rollHref(d.group)}">🎲 Roll again</a>
            </div>`
          : `<div class="dcacts"><a class="clear" href="${rollHref(null)}">🎲 Roll another</a></div>`
      }
    </div>`;
  return `<div class="panel ideas dice" id="dice">
    <h2>🎲 Roll for something new <span class="sub">— one new format, hero, world, power or target a roll, none already in Story Lab; add the ones worth writing</span></h2>
    <div class="dicebar">
      <a class="clear" href="${rollHref(null)}">🎲 Roll</a>
      <span class="dgroups">${groups
        .map((g) => d.left[g]
          ? `<a class="${d.group === g ? "on" : ""}" href="${rollHref(g)}">${esc(DICE_LABELS[g])} <small>${d.left[g]}</small></a>`
          : `<span class="none">${esc(DICE_LABELS[g])} <small>all in</small></span>`)
        .join("")}</span>
    </div>
    ${d.rolledNothing ? `<p class="hint">${total ? "Nothing left in that group — roll any." : "Everything on the dice is in Story Lab now."}</p>` : ""}
    ${d.added ? `<p class="saved dcsaved" role="status">Added ${esc(d.added.name)}.</p>${card(d.added, "added")}` : ""}
    ${d.rolled ? card(d.rolled, "add") : ""}
    ${
      d.additions.length
        ? `<div class="dcadded"><h4>Added from the dice</h4>${d.additions
            .map((a) => `<form method="post" action="/story-lab/remove" class="dcchip">
              <input type="hidden" name="kind" value="${a.kind}"><input type="hidden" name="id" value="${esc(a.id)}">
              <span><small>${esc(DICE_LABELS[a.kind])}</small> ${esc(a.name)}</span>
              <button aria-label="Take ${esc(a.name)} out of Story Lab" title="Take it out again">×</button></form>`)
            .join("")}</div>`
        : ""
    }
  </div>`;
}

function blueprintHtml(b: Blueprint): string {
  const refLine = (p: PlannedPart) =>
    p.ref ? `<div class="bpref">Modelled on <b>${esc(p.ref.title)}</b>, ${esc(p.ref.part)}: <i>“${esc(p.ref.line)}”</i></div>` : "";
  return `<div class="bp">
    <div class="bphead">
      <span class="ikind ${b.format.id}">${esc(b.format.name)}</span>
      <h3>${esc(b.title)}</h3>
      ${b.alternates.length ? `<p class="imeta">Or: ${b.alternates.map(esc).join(" · ")}</p>` : ""}
      <p class="bppitch">${esc(b.premise)}</p>
    </div>
    ${b.versionLock ? `<div class="bpblock"><h4>Version lock</h4><p>${esc(b.versionLock)}</p></div>` : ""}
    ${b.intro.length ? `<div class="bpblock"><h4>Intro — about ${b.norms.introWords[0]}–${b.norms.introWords[1]} words, three moves</h4>
      <blockquote class="shook">${b.intro.map((l) => esc(l)).join(" ")}</blockquote>
      <ol class="bpmoves"><li><b>Open</b> ${esc(b.format.intro.open)}</li><li><b>Build</b> ${esc(b.format.intro.build)}</li><li><b>Hook</b> ${esc(b.format.intro.hook)}</li></ol></div>` : ""}
    <div class="bpblock"><h4>The parts — ${b.parts.length} of about ${b.norms.partWords[1]} words each (${b.norms.partWords[0]}–${b.norms.partWords[2]})</h4>
      <ol class="bpparts">${b.parts
        .map((p) => `<li><div class="bpn">${p.n}</div><div><b>${esc(p.name)}</b><p>${esc(p.plan)}</p>${refLine(p)}</div></li>`)
        .join("")}</ol></div>
    ${b.outro ? `<div class="bpblock"><h4>Outro</h4><p>${esc(b.outro)}</p></div>` : ""}
    ${b.caveats.length ? `<div class="bpblock"><h4>Stay honest about</h4><ul class="icav">${b.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
    <div class="bpblock"><h4>Rules for this format</h4><ul class="icav">${b.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
    <p class="imeta">Target about ${b.norms.words.toLocaleString("en-US")} words · sentences around ${b.norms.sentence} words · paragraphs of about ${b.norms.paragraph} sentences · reasoned in “would / could”, not narrated.
      Closest scripts: ${b.refs.map((r) => esc(r.title)).join(" · ") || "none yet"}.</p>
  </div>`;
}

export function renderStoryLab(shell: Shell, d: StoryLabData): string {
  const opt = (value: string, label: string, sel: string) => `<option value="${esc(value)}"${value === sel ? " selected" : ""}>${esc(label)}</option>`;
  const builder = `<form method="get" action="/story-lab#blueprint" class="labform">
      <label>Format<select name="format" onchange="var s=this.form.querySelector('[name=shape]');if(s)s.value=''">${d.formats
        .filter((f) => ["insert", "survive", "power", "hunt", "versus", "reborn", "you"].includes(f.format.id))
        .map((f) => opt(f.format.id, f.format.name, d.picked.shape ? "" : d.picked.format))
        .join("")}</select></label>
      ${
        d.shapes?.length
          ? `<label>Title shape<select name="shape"><option value="">— the format's own</option>${d.shapes
              .map((sh) => opt(sh.id, `${sh.name} (${FORMAT_BY_ID.get(sh.base)?.name ?? sh.base})`, d.picked.shape ?? ""))
              .join("")}</select></label>`
          : ""
      }
      <label>Hero<select name="hero"><option value="">—</option>${HEROES.map((h) => opt(h.id, `${h.name}${h.fresh ? " (new)" : ""}`, d.picked.hero)).join("")}</select></label>
      <label>World or setting<select name="world"><option value="">—</option>${WORLDS.map((w) => opt(w.id, `${w.name}${w.fresh ? " (new)" : ""}`, d.picked.world)).join("")}</select></label>
      <label>Power<select name="power"><option value="">—</option>${POWERS.map((p) => opt(p.id, p.name, d.picked.power)).join("")}</select></label>
      <label>Target / opponent<select name="target"><option value="">—</option>${HEROES.map((h) => opt(h.id, h.name, d.picked.target)).join("")}</select></label>
      <button class="clear">Build blueprint</button>
    </form>`;

  const ideaCard = ({ idea, blueprint }: StoryLabData["ideas"][number]) => `<li><details class="isg labidea">
      <summary>
        <span class="ikind ${idea.format}">${esc(FORMAT_BY_ID.get(idea.format)?.name ?? idea.format)}${
          idea.shape ? ` · ${esc(d.shapes?.find((x) => x.id === idea.shape)?.name ?? idea.shape)}` : ""
        }</span>
        <span class="iidea">${esc(idea.title)}</span>
        <span class="iwhy">${idea.reasons.slice(0, 2).map((r) => esc(r.text)).join(" · ")}</span>
        <span class="imore">Blueprint ▾</span>
      </summary>
      <div class="idetail">
        <h4>Why this one</h4>
        <ul class="labwhy">${idea.reasons.map((r) => `<li><b class="${r.lift >= 1 ? "up" : "down"}">${esc(liftText(r.lift))}</b> ${esc(r.text)}</li>`).join("")}</ul>
        ${blueprint ? blueprintHtml(blueprint) : ""}
      </div>
    </details></li>`;

  const check = d.check;
  const checker = `<form method="post" action="/story-lab/check#check" class="sform labcheck">
      <input type="text" name="title" value="${esc(check?.title ?? "")}" placeholder="Title — e.g. What If Gojo Was In Invincible?" autocomplete="off">
      <textarea name="script" rows="10" placeholder="Paste the draft with its INTRO / PART 1 / … / OUTRO headers">${esc(check?.text ?? "")}</textarea>
      <button class="clear">Check the structure</button>
    </form>
    ${
      check
        ? check.result
          ? `<div class="labresult">
              <p class="imeta">Read as a <b>${esc(check.result.format.name)}</b>${check.result.hero ? ` with ${esc(check.result.hero.name)}` : ""}${check.result.world ? ` in ${esc(check.result.world.name)}` : ""} · ${check.result.words.toLocaleString("en-US")} words · ${check.result.sections.map((s) => `${esc(s.name.replace("PART ", "P"))} ${s.words}`).join(" · ")}</p>
              <ul class="labfind">${check.result.findings
                .sort((a, b) => ["fix", "note", "good"].indexOf(a.level) - ["fix", "note", "good"].indexOf(b.level))
                .map((f) => `<li class="${f.level}"><span class="lf">${f.level === "fix" ? "Fix" : f.level === "note" ? "Note" : "Good"}</span><b>${esc(f.label)}</b><span>${esc(f.detail)}</span></li>`)
                .join("")}</ul>
            </div>`
          : `<p class="hint">That's too short to check — paste the whole draft.</p>`
        : ""
    }`;

  const contrast = d.contrast
    ? `<table class="labtable"><thead><tr><th></th><th>Top third</th><th>Bottom third</th></tr></thead><tbody>${d.contrast
        .map((c) => `<tr><td>${esc(c.label)}</td><td>${esc(c.hits)}</td><td>${esc(c.misses)}</td></tr>`)
        .join("")}</tbody></table>`
    : `<p class="hint">${d.matched} of the scripts are matched to their uploads so far — this needs six. It fills in as the scripts' videos go up and get judged against their channel's usual.</p>`;
  const results = d.results.length
    ? `<ul class="ivids">${[...d.results]
        .sort((a, b) => b.multiple - a.multiple)
        .slice(0, 8)
        .map((r) => `<li><a><span class="vm ${r.multiple >= 1 ? "up" : "down"}">${esc(formatMultiple(r.multiple))}</span><span class="vt">${esc(r.script.title)}</span><span class="vc">${esc(FORMAT_BY_ID.get(r.script.format)?.name ?? "")} · ${r.script.metrics.parts} parts · ${r.script.words.toLocaleString("en-US")} words</span></a></li>`)
        .join("")}</ul>`
    : "";

  const coverage = `<div class="labcov"><table><thead><tr><th></th>${d.coverage.worlds
    .map((w) => `<th title="${esc(w.name)}"><span>${esc(w.name.replace(/^The /, ""))}</span></th>`)
    .join("")}</tr></thead><tbody>${d.coverage.heroes
    .map(
      (h) => `<tr><th>${esc(h.name)}</th>${d.coverage.worlds
        .map((w) => {
          const done = d.coverage.done.has(`${h.id}|${w.id}`) || h.home === w.id;
          const href = `/story-lab?format=${w.kind === "setting" ? "survive" : "insert"}&amp;hero=${h.id}&amp;world=${w.id}#blueprint`;
          return done ? `<td class="done" title="${esc(`${h.name} × ${w.name}: done`)}">●</td>` : `<td><a href="${href}" title="${esc(`Blueprint: ${h.name} × ${w.name}`)}">+</a></td>`;
        })
        .join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;

  const formats = d.formats
    .map(
      (f) => `<li><details class="isg">
        <summary><span class="ikind ${f.format.id}">${esc(f.format.name)}</span><span class="iwhy">${f.norms.scripts} scripts · ${f.norms.parts} parts · ~${f.norms.words.toLocaleString("en-US")} words — ${esc(f.format.pitch)}</span><span class="imore">How it's built ▾</span></summary>
        <div class="idetail">
          <h4>Intro</h4><ol class="bpmoves"><li><b>Open</b> ${esc(f.format.intro.open)}</li><li><b>Build</b> ${esc(f.format.intro.build)}</li><li><b>Hook</b> ${esc(f.format.intro.hook)}</li></ol>
          <h4>Beats, in order</h4><ol class="bpbeats">${f.format.beats.map((b) => `<li><b>${esc(b.name)}</b> <small>part ${b.at.join("–")}</small><p>${esc(b.does)}</p></li>`).join("")}</ol>
          <h4>Outro</h4><p>${esc(f.format.outro)}</p>
          <h4>Rules</h4><ul class="icav">${f.format.rules.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          ${f.examples.length ? `<h4>In the corpus</h4><p class="imeta">${f.examples.map(esc).join(" · ")}</p>` : ""}
        </div>
      </details></li>`,
    )
    .join("");

  return layout(
    "Story Lab",
    shell,
    `${pageHeader("Story Lab", `<a class="clear secondary" href="/uploads?cat=stories">Stories uploads</a>`)}
    <p class="labsub">Learned from ${d.scripts} Stories scripts (${Math.round(d.words / 1000)}K words): how each format is built part by part, how every world's institution, roster and apex are used, and each hero's ability ladder. Ideas are ranked on the channel's own results${d.matched ? ` (${d.matched} scripts matched to their uploads)` : ""}, fit and freshness.</p>
    ${d.unassigned ? unassignedPanel(d.unassigned) : ""}
    ${
      d.blueprint
        ? `<div class="panel" id="blueprint"><h2>Blueprint</h2>${
            d.builtRepeats
              ? `<p class="labrepeat">Already on YouTube: <a href="${esc(safeUrl(d.builtRepeats.url))}" target="_blank" rel="noreferrer">${esc(d.builtRepeats.title)}</a> (${esc(d.builtRepeats.channel)}). This would repeat it — pick a different world or format.</p>`
              : ""
          }${blueprintHtml(d.blueprint)}</div>`
        : d.picked.format && d.picked.hero
          ? `<div class="panel" id="blueprint"><p class="hint">That combination needs a ${d.picked.format === "power" ? "power" : d.picked.format === "hunt" || d.picked.format === "versus" ? "target" : "world"} too.</p></div>`
          : ""
    }
    ${d.specular ?? ""}
    ${
      d.writeNext
        ? writeNextPanel(d.writeNext, d.shapes ?? [], d.publicCount ?? 0, d.claude ?? null, d.focusChoices ?? [])
        : `<div class="panel ideas"><h2>Write next <span class="sub">— open one for the full blueprint${
            d.publicCount ? ` · checked against ${d.publicCount.toLocaleString("en-US")} public videos${d.heldBack ? `, ${d.heldBack} already done and left out` : ""}` : ""
          }</span></h2>
      <ul class="isugg">${d.ideas.map(ideaCard).join("")}</ul></div>`
    }
    ${d.dice ? dicePanel(d.dice) : ""}
    <div class="panel ideas"><h2>Build any blueprint</h2>${builder}</div>
    <div class="panel ideas" id="check"><h2>Check a draft <span class="sub">— against the ${d.scripts} scripts, format by format</span></h2>${checker}</div>
    ${d.library ? libraryPanel(d.library) : ""}
    <div class="panel ideas"><h2>What the best-performing scripts did differently</h2>${contrast}${results}</div>
    <div class="panel ideas"><h2>The formats <span class="sub">— how each one is actually built</span></h2><ul class="isugg labformats">${formats}</ul></div>
    <div class="panel ideas"><h2>What's been done <span class="sub">— ● written · + opens a blueprint</span></h2>${coverage}</div>`,
  );
}
