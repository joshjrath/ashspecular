/**
 * Specular compilations in Story Lab: the next Movie and the next Sleep,
 * each with ↻ Reroll and Use; a page per compilation with its output block
 * and editor package; and the catalog — history, exclusions, runtimes.
 */
import type { FastifyInstance } from "fastify";
import {
  compilationChannel, addExclusion, addSkip, discardCompilation, listCompilations, listExclusions, loadCatalog, loadPast, planCompilation,
  listSkips, removeExclusion, renameCompilation, savePackage, setRuntime, setSources, sourceTexts, syncPosted, takenDays, todayOrg, voiceSamples,
  type Compilation,
} from "../db/compilations.js";
import { moviePicks, nextMovieSlot, nextSleepSlot, sleepPicks, typicalRuntime, type Kind, type Pick, type Source } from "../compilations/engine.js";
import { canWritePackages, writePackage } from "../compilations/package.js";
import { usDate } from "../parse/derive.js";
import { channelColour, esc, layout, pageHeader, type Shell } from "./page.js";
import { compactViews } from "./performance.js";

const LABEL: Record<Kind, string> = { movie: "MOVIE", sleep: "SLEEP" };
const ICON: Record<Kind, string> = { movie: "🎬", sleep: "🌙" };
const SLEEP_NOTES =
  "Keep stories back to back, remove outros/end screens where needed, normalize audio, and make the result feel like one uninterrupted listening compilation.";

const scoreColour = (n: number) => (n >= 70 ? "#3CCB84" : n >= 55 ? "#9BD35A" : n >= 40 ? "#E8C547" : "#E5534B");
/** 1:36:20, or 24:10 under an hour. */
export function clock(secs: number): string {
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
const shortChannel = (c: string) => c.replace(/^Specular /, "");
const num3 = (n: number | null) => (n === null ? "###" : String(n).padStart(3, "0"));

// ── state ──────────────────────────────────────────────────────────────────

interface KindState {
  kind: Kind;
  pick: Pick | null;
  /** How many other picks are waiting behind this one. */
  more: number;
  slot: string;
  upcoming: Compilation[];
}
export interface SpecularState {
  movie: KindState;
  sleep: KindState;
  typical: number;
  catalog: number;
  excluded: number;
  unknown: number;
}

async function picksFor(kind: Kind, catalog: Source[]): Promise<{ picks: Pick[]; slot: string }> {
  const today = todayOrg();
  const [past, skips, days] = await Promise.all([loadPast(), listSkips(kind), takenDays(kind)]);
  const picks = kind === "movie" ? moviePicks(catalog, past, { today, skipped: skips, limit: 30 }) : sleepPicks(catalog, past, { today, skipped: skips, limit: 30 });
  const slot = kind === "movie" ? nextMovieSlot(today, days.taken, days.daysOff) : nextSleepSlot(today, days.last, days.taken);
  return { picks, slot };
}

export async function specularState(): Promise<SpecularState> {
  const { sources, excluded } = await loadCatalog();
  await syncPosted(sources);
  const today = todayOrg();
  const planned = (await listCompilations({ statuses: ["planned"], limit: 60 })).filter((c) => (c.slotDate ?? "") >= today);
  const one = async (kind: Kind): Promise<KindState> => {
    const { picks, slot } = await picksFor(kind, sources);
    return { kind, pick: picks[0] ?? null, more: Math.max(0, picks.length - 1), slot, upcoming: planned.filter((c) => c.kind === kind).reverse() };
  };
  const [movie, sleep] = [await one("movie"), await one("sleep")];
  return { movie, sleep, typical: typicalRuntime(sources), catalog: sources.length, excluded: excluded.length, unknown: sources.filter((s) => s.runtime === null).length };
}

// ── editor packages, written in the background ─────────────────────────────

const writing = new Set<number>();
const failed = new Map<number, string>();

/** The sources of a compilation with no script to read yet. */
async function missingTexts(c: Compilation): Promise<Compilation["sources"]> {
  const texts = await sourceTexts(c.sources.map((s) => s.id));
  return c.sources.filter((s) => !texts.has(s.id));
}

export function startPackage(id: number): void {
  if (writing.has(id)) return;
  writing.add(id);
  failed.delete(id);
  void (async () => {
    const [c] = await listCompilations({ id });
    if (!c || c.kind !== "movie") return;
    const texts = await sourceTexts(c.sources.map((s) => s.id));
    const missing = c.sources.filter((s) => !texts.has(s.id));
    if (missing.length) throw new Error(`No script yet for: ${missing.map((s) => s.title).join("; ")}`);
    const pkg = await writePackage(c.title, c.sources.map((s) => ({ id: s.id, title: s.title, text: texts.get(s.id)! })), voiceSamples());
    await savePackage(id, {
      order: pkg.order, intro: pkg.intro, transitions: pkg.transitions,
      note: JSON.stringify({ fits: pkg.titleFits, note: pkg.titleNote, better: pkg.betterTitle }),
    });
  })()
    .catch((err) => {
      console.error(`[specular] package for #${id} failed:`, err);
      failed.set(id, err instanceof Error ? err.message : String(err));
    })
    .finally(() => writing.delete(id));
}

// ── Story Lab panel ────────────────────────────────────────────────────────

function sourceRow(s: { title: string; channel: string; runtime: number | null; runtimeFrom?: string | null }, typical: number, i: number): string {
  const rt = s.runtime !== null ? clock(s.runtime) : `~${Math.round(typical / 60)}m`;
  const est = s.runtime === null ? ` <em title="Runtime not known yet — the catalog's typical length is used">est.</em>` : s.runtimeFrom && s.runtimeFrom !== "youtube" && s.runtimeFrom !== "manual" ? ` <em title="From its ${esc(s.runtimeFrom)}">≈</em>` : "";
  return `<li><span class="spn">${i + 1}</span><span class="spt">${esc(s.title)}</span><span class="spch" style="--ch:${channelColour(s.channel)}">${esc(shortChannel(s.channel))}</span><span class="sprt">${rt}${est}</span></li>`;
}

function pickCard(k: KindState, typical: number): string {
  const head = `<header><span class="spkind">${ICON[k.kind]} ${k.kind === "movie" ? "Movie" : "Sleep"}</span><span class="spslot">next slot · ${esc(usDate(k.slot))}</span></header>`;
  if (!k.pick) {
    return `<article class="spcard" id="sp-${k.kind}" style="--ch:${channelColour(compilationChannel(k.kind))}">${head}
      <p class="hint">Nothing left that fits without repeating an earlier ${k.kind === "movie" ? "Movie" : "Sleep"} — rerolled picks come back after three weeks.</p></article>`;
  }
  const p = k.pick;
  const hidden = `<input type="hidden" name="kind" value="${k.kind}"><input type="hidden" name="combo" value="${esc(p.combo)}">`;
  return `<article class="spcard" id="sp-${k.kind}" style="--ch:${channelColour(compilationChannel(k.kind))}">${head}
    <div class="sptitle"><h3>${esc(p.title)}</h3><span class="wnscore" style="--sc:${scoreColour(p.score)}">${p.score}<small>/100</small></span></div>
    <ol class="splist">${p.sources.map((s, i) => sourceRow(s, typical, i)).join("")}</ol>
    <p class="sptotal">Total source runtime <b>${clock(p.runtime)}</b> · ${p.sources.length} videos${p.estimated ? ` · ${p.estimated} estimated` : ""}${
      p.overlap ? ` · shares ${p.overlap} with an earlier ${k.kind === "movie" ? "Movie" : "Sleep"}` : ""
    }</p>
    ${p.why.length ? `<p class="spwhy">${p.why.map(esc).join(" · ")}</p>` : ""}
    <div class="wnacts">
      <form method="post" action="/story-lab/specular/reroll" data-swap>${hidden}<button class="wnbtn" title="A different combination — this one won't come back for three weeks">↻ Reroll</button></form>
      <form method="post" action="/story-lab/specular/use">${hidden}<button class="wnbtn go" title="Put it on the calendar on ${esc(usDate(k.slot))}${k.kind === "movie" ? " and write the intro and transitions" : ""}">✓ Use</button></form>
      ${k.more ? `<span class="wnskip">${k.more} more combinations behind it</span>` : ""}
    </div>
  </article>`;
}

export function specularPanel(s: SpecularState): string {
  const upcoming = [...s.movie.upcoming, ...s.sleep.upcoming].sort((a, b) => (a.slotDate ?? "").localeCompare(b.slotDate ?? ""));
  return `<div class="panel ideas spanel" id="specular"><h2>Specular compilations <span class="sub">— a Movie every day, a Sleep every 4 days, from all ${s.catalog.toLocaleString("en-US")} long-form Stories videos${
    s.excluded ? ` (${s.excluded} excluded)` : ""
  } · <a href="/story-lab/specular">history, exclusions &amp; runtimes</a></span></h2>
    ${s.unknown ? `<p class="hint sphint">${s.unknown} videos have no runtime yet — they count as ~${Math.round(s.typical / 60)} minutes until YouTube's (read with the YouTube API key) or their script's length fills it in — or set one by hand.</p>` : ""}
    <div class="spgrid">${pickCard(s.movie, s.typical)}${pickCard(s.sleep, s.typical)}</div>
    ${
      upcoming.length
        ? `<div class="spnext"><h4>Planned</h4><ul>${upcoming
            .map((c) => `<li><a href="/story-lab/specular/${c.id}"><span class="spd">${esc(usDate(c.slotDate!))}</span><span class="spk ${c.kind}">${LABEL[c.kind]} ${num3(c.number)}</span><span class="spt">${esc(c.title)}</span>${
              c.kind === "movie" ? (c.packagedAt ? `<span class="spok">✓ package</span>` : writing.has(c.id) ? `<span class="spwait">writing…</span>` : `<span class="spwait">no package</span>`) : ""
            }</a></li>`)
            .join("")}</ul></div>`
        : ""
    }
    <script>
    (function () {
      var panel = document.getElementById("specular");
      panel.addEventListener("submit", function (e) {
        var form = e.target;
        if (!form.hasAttribute("data-swap") || !window.fetch || !window.DOMParser) return;
        e.preventDefault();
        var card = form.closest(".spcard");
        card.classList.add("busy");
        fetch(form.action, { method: "POST", body: new URLSearchParams(new FormData(form)), headers: { Accept: "text/html" } })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var next = new DOMParser().parseFromString(html, "text/html").getElementById(card.id);
            if (next) card.replaceWith(document.importNode(next, true)); else location.reload();
          })
          .catch(function () { form.submit(); });
      });
    })();
    </script>
  </div>`;
}

// ── one compilation ────────────────────────────────────────────────────────

interface TitleNote { fits: boolean; note: string; better: string | null }
const readNote = (s: string | null): TitleNote | null => {
  try {
    return s ? (JSON.parse(s) as TitleNote) : null;
  } catch {
    return null;
  }
};

/** The output block, as the seed lays it out: header, numbered sources, total. */
export function outputBlock(c: Compilation, typical: number): string {
  const order = c.playOrder?.length ? c.playOrder : c.sources.map((s) => s.id);
  const byId = new Map(c.sources.map((s) => [s.id, s]));
  const list = order.map((id) => byId.get(id)).filter((s): s is Compilation["sources"][number] => Boolean(s));
  const total = list.reduce((a, s) => a + (s.runtime ?? typical), 0);
  const est = list.some((s) => s.runtime === null);
  return [
    `${c.slotDate ? usDate(c.slotDate) : "—"} | ${LABEL[c.kind]} ${num3(c.number)} | ${c.title}`,
    "",
    ...list.map((s, i) => `${i + 1}. ${s.title} — ${s.runtime !== null ? clock(s.runtime) : `~${clock(typical)} (est.)`}`),
    "",
    `Total Source Runtime: ${clock(total)}${est ? " (some estimated)" : ""}`,
  ].join("\n");
}

/** The editor package as one script: intro, then each source with the transition into it. */
export function packageBlock(c: Compilation): string {
  if (c.kind === "sleep") return `Editor Notes:\n${SLEEP_NOTES}`;
  if (!c.intro || !c.playOrder) return "";
  const byId = new Map(c.sources.map((s) => [s.id, s]));
  const out = ["INTRO", c.intro, ""];
  c.playOrder.forEach((id, i) => {
    if (i > 0) out.push(`TRANSITION ${i}`, c.transitions?.[i - 1] ?? "", "");
    out.push(`[ ${i + 1}. ${byId.get(id)?.title ?? id} ]`, "");
  });
  return out.join("\n").trim();
}

const copyBox = (id: string, text: string) =>
  `<div class="spcopy"><pre id="${id}">${esc(text)}</pre><button class="wnbtn" type="button" onclick="var t=document.getElementById('${id}').innerText;navigator.clipboard&&navigator.clipboard.writeText(t).then(()=>{this.textContent='✓ Copied'})">Copy</button></div>`;

export function renderCompilation(shell: Shell, c: Compilation, d: { typical: number; missing: Compilation["sources"]; writing: boolean; error: string | null; canWrite: boolean }): string {
  const note = readNote(c.packageNote);
  const status = c.status === "posted" ? `<span class="spok">Posted${c.inferred ? " · read back from its title" : ""}</span>` : c.status === "planned" ? `<span class="spwait">Planned</span>` : `<span class="spwait">Discarded</span>`;
  let pkg = "";
  if (c.kind === "sleep") pkg = `<section class="panel"><h2>Editor notes</h2><p>${esc(SLEEP_NOTES)}</p><p class="hint" style="padding:0">No intro, transitions or narration for a Sleep.</p></section>`;
  else {
    const body = d.writing
      ? `<p class="spwait big">Reading the ${c.sources.length} scripts and writing the intro and transitions… this page refreshes itself.</p><meta http-equiv="refresh" content="8">`
      : d.missing.length
        ? `<p class="hint" style="padding:0">These sources have no script to read yet — the intro and transitions are written from the stories themselves, never from titles alone:</p>
           <ul class="spmiss">${d.missing.map((s) => `<li>${esc(s.title)}</li>`).join("")}</ul>
           <p class="hint" style="padding:0">Link each one's script under <a href="/story-lab?open=unassigned#unassigned">Unassigned videos</a>, then write the package.</p>`
        : !d.canWrite
          ? `<p class="hint" style="padding:0">Writing the intro and transitions needs <code>ANTHROPIC_API_KEY</code> set on the server (Railway → Variables).</p>`
          : "";
    const note$ = note
      ? note.fits
        ? `<p class="spfit ok">✓ Title checked against all ${c.sources.length} scripts: ${esc(note.note)}</p>`
        : `<div class="spfit bad"><p>⚠ The title doesn't fit every source: ${esc(note.note)}</p>${
            note.better
              ? `<form method="post" action="/story-lab/specular/${c.id}/rename"><input type="hidden" name="title" value="${esc(note.better)}"><button class="wnbtn">Use “${esc(note.better)}”</button></form>`
              : ""
          }</div>`
      : "";
    pkg = `<section class="panel"><h2>Editor package <span class="sub">— the play order, one intro, a transition into each story after the first</span></h2>
      ${d.error ? `<div class="scripterr" role="alert">${esc(d.error)}</div>` : ""}
      ${body}
      ${c.intro && !d.writing ? `${note$}${copyBox("sppkg", packageBlock(c))}` : ""}
      ${
        !d.writing && !d.missing.length && d.canWrite
          ? `<form method="post" action="/story-lab/specular/${c.id}/write" class="spform"><button class="wnbtn go">${c.intro ? "↻ Write it again" : "✍ Write the intro & transitions"}</button></form>`
          : ""
      }
    </section>`;
  }
  const sources = c.sources.length
    ? `<ol class="splist">${(c.playOrder?.length ? c.playOrder.map((id) => c.sources.find((s) => s.id === id)).filter(Boolean) as Compilation["sources"] : c.sources)
        .map((s, i) => sourceRow(s, d.typical, i))
        .join("")}</ol>`
    : `<p class="hint" style="padding:0">Its sources couldn't be read from the title — add them below so later picks don't repeat them.</p>`;
  return layout(
    `${LABEL[c.kind]} ${num3(c.number)}`,
    shell,
    `${pageHeader(`${ICON[c.kind]} ${c.kind === "movie" ? "Movie" : "Sleep"} ${num3(c.number)}`, `<a class="clear secondary" href="/story-lab#specular">Story Lab</a>`)}
    <section class="panel"><h2>${esc(c.title)} ${status}</h2>
      ${copyBox("spout", outputBlock(c, d.typical))}
      ${sources}
      <details class="spedit"><summary>Rename${c.status === "posted" ? " · fix its sources" : ""}${c.status === "planned" ? " · discard" : ""}</summary>
        <form method="post" action="/story-lab/specular/${c.id}/rename" class="spform"><input type="text" name="title" value="${esc(c.title)}" maxlength="300"><button class="wnbtn">Rename</button></form>
        ${
          c.status === "posted"
            ? `<form method="post" action="/story-lab/specular/${c.id}/sources" class="spform col"><label>Its sources — one YouTube link or video id a line</label><textarea name="ids" rows="5">${esc(c.sources.map((s) => s.id).join("\n"))}</textarea><button class="wnbtn">Save sources</button></form>`
            : ""
        }
        ${
          c.status === "planned"
            ? `<form method="post" action="/story-lab/specular/${c.id}/discard" class="spform" onsubmit="return confirm('Discard this ${c.kind === "movie" ? "Movie" : "Sleep"}? Its slot on the calendar opens again.')"><button class="wnbtn warn">Discard</button></form>`
            : ""
        }
      </details>
    </section>
    ${pkg}`,
  );
}

// ── the catalog page ───────────────────────────────────────────────────────

export function renderSpecularCatalog(
  shell: Shell,
  d: { history: Compilation[]; exclusions: Awaited<ReturnType<typeof listExclusions>>; sources: Source[]; excluded: Array<Source & { reason: string }>; typical: number; msg: string },
): string {
  const titles = [...d.sources, ...d.excluded].sort((a, b) => a.title.localeCompare(b.title));
  const hist = d.history
    .map((c) => `<li><a href="/story-lab/specular/${c.id}"><span class="spd">${c.slotDate ? esc(usDate(c.slotDate)) : "—"}</span><span class="spk ${c.kind}">${LABEL[c.kind]} ${num3(c.number)}</span><span class="spt">${esc(c.title)}</span><span class="spwait">${
      c.status === "planned" ? "planned" : c.inferred ? (c.sources.length ? `${c.sources.length} sources read from title` : "sources unknown") : `${c.sources.length} sources`
    }</span></a></li>`)
    .join("");
  const rows = [...d.sources]
    .sort((a, b) => b.published.localeCompare(a.published))
    .map((s) => `<tr><td class="t">${esc(s.title)}</td><td><span class="spch" style="--ch:${channelColour(s.channel)}">${esc(shortChannel(s.channel))}</span></td><td>${esc(usDate(s.published))}</td><td>${
      s.runtime !== null ? `${clock(s.runtime)}${s.runtimeFrom && s.runtimeFrom !== "youtube" ? ` <em>${esc(s.runtimeFrom)}</em>` : ""}` : `<em>unknown</em>`
    }</td><td>${s.views !== null ? esc(compactViews(s.views)) : "—"}</td><td>${s.movieUses || ""}</td><td>${s.sleepUses || ""}</td></tr>`)
    .join("");
  return layout(
    "Specular compilations",
    shell,
    `${pageHeader("Specular compilations", `<a class="clear secondary" href="/story-lab#specular">Story Lab</a>`)}
    ${d.msg ? `<div class="ualinked" role="status">${esc(d.msg)}</div>` : ""}
    <datalist id="sptitles">${titles.map((s) => `<option value="${esc(s.title)}">`).join("")}</datalist>
    <section class="panel"><h2>Permanent exclusions <span class="sub">— never selected, for either kind</span></h2>
      <ul class="spex">${d.exclusions
        .map((e) => `<li><b>${esc(e.title ?? e.videoId ?? "")}</b>${e.reason ? `<span>${esc(e.reason)}</span>` : ""}<form method="post" action="/story-lab/specular/exclude/${e.id}/remove"><button class="wnx" title="Take it off the list">×</button></form></li>`)
        .join("") || `<li class="hint">None.</li>`}</ul>
      <form method="post" action="/story-lab/specular/exclude" class="spform"><input type="text" name="title" list="sptitles" placeholder="Video title" required maxlength="300"><input type="text" name="reason" placeholder="Why — e.g. Demonetized" maxlength="200"><button class="wnbtn">Exclude</button></form>
    </section>
    <section class="panel"><h2>Set a runtime <span class="sub">— wins over YouTube's and the script's estimate</span></h2>
      <form method="post" action="/story-lab/specular/runtime" class="spform"><input type="text" name="title" list="sptitles" placeholder="Video title" required maxlength="300"><input type="text" name="runtime" placeholder="24:10" inputmode="numeric" maxlength="9"><button class="wnbtn">Save</button></form>
      <p class="hint" style="padding:0">Minutes:seconds or plain minutes. Leave it empty to clear a runtime typed in by hand.</p>
    </section>
    <section class="panel"><h2>History <span class="sub">— every Movie and Sleep, planned and posted, newest first</span></h2><ul class="sphist">${hist || `<li class="hint">Nothing yet.</li>`}</ul></section>
    <details class="panel spcat"><summary><h2>The catalog <span class="sub">— ${d.sources.length} eligible · typical runtime ${clock(d.typical)}</span></h2></summary>
      <div class="sptable"><table><thead><tr><th>Video</th><th>Channel</th><th>Posted</th><th>Runtime</th><th>Views</th><th>Movies</th><th>Sleeps</th></tr></thead><tbody>${rows}</tbody></table></div>
    </details>`,
  );
}

// ── routes ─────────────────────────────────────────────────────────────────

const KINDS: Kind[] = ["movie", "sleep"];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
/** "24:10", "1:02:03" or "24" (minutes) → seconds. */
export function parseRuntime(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60);
  const parts = t.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n)) || parts.length > 3) return null;
  return parts.reduce((a, n) => a * 60 + n, 0);
}
/** A YouTube link or a bare id → the id. */
export function videoIdOf(s: string): string | null {
  const t = s.trim();
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/.exec(t);
  if (m) return m[1]!;
  return /^[\w-]{11}$/.test(t) ? t : null;
}

export function registerSpecular(app: FastifyInstance, shell: (active: string) => Promise<Shell>, storyLabHtml: () => Promise<string>): void {
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/specular/reroll", async (request, reply) => {
    const kind = request.body?.kind as Kind;
    const combo = str(request.body?.combo).slice(0, 2000);
    if (KINDS.includes(kind) && combo) await addSkip(kind, combo);
    // A fetch gets the page back to swap the card in; a plain form goes back to the panel.
    if (String(request.headers.accept ?? "").startsWith("text/html") && request.headers["sec-fetch-mode"] === "cors") return reply.type("text/html").send(await storyLabHtml());
    return reply.redirect("/story-lab#specular");
  });

  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/specular/use", async (request, reply) => {
    const kind = request.body?.kind as Kind;
    const combo = str(request.body?.combo);
    if (!KINDS.includes(kind) || !combo) return reply.redirect("/story-lab#specular");
    const { sources } = await loadCatalog();
    const { picks, slot } = await picksFor(kind, sources);
    const pick = picks.find((p) => p.combo === combo);
    if (!pick) return reply.redirect("/story-lab#specular");
    const id = await planCompilation(pick, slot);
    if (kind === "movie" && canWritePackages()) {
      const [c] = await listCompilations({ id });
      if (c && !(await missingTexts(c)).length) startPackage(id);
    }
    return reply.redirect(`/story-lab/specular/${id}`);
  });

  app.get("/story-lab/specular", async (request, reply) => {
    const [s, history, exclusions, catalog] = await Promise.all([shell("storylab"), listCompilations({ limit: 400 }), listExclusions(), loadCatalog()]);
    const msg = str((request.query as Record<string, unknown>)?.msg).slice(0, 200);
    return reply.type("text/html").send(
      renderSpecularCatalog(s, { history: history.filter((c) => c.status !== "discarded"), exclusions, sources: catalog.sources, excluded: catalog.excluded, typical: typicalRuntime(catalog.sources), msg }),
    );
  });

  app.get<{ Params: { id: string } }>("/story-lab/specular/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [c] = Number.isInteger(id) && id > 0 ? await listCompilations({ id }) : [];
    if (!c) return reply.redirect("/story-lab/specular");
    const [s, catalog, missing] = await Promise.all([shell("storylab"), loadCatalog(), c.kind === "movie" ? missingTexts(c) : Promise.resolve([])]);
    // The catalog's runtime where YouTube's isn't known: the script's length, or one typed in.
    const known = new Map([...catalog.sources, ...catalog.excluded].map((x) => [x.id, x]));
    c.sources = c.sources.map((x) => (x.runtime === null && known.get(x.id)?.runtime ? { ...x, runtime: known.get(x.id)!.runtime, runtimeFrom: known.get(x.id)!.runtimeFrom } : x));
    return reply.type("text/html").send(
      renderCompilation(s, c, { typical: typicalRuntime(catalog.sources), missing, writing: writing.has(id), error: failed.get(id) ?? null, canWrite: canWritePackages() }),
    );
  });

  app.post<{ Params: { id: string } }>("/story-lab/specular/:id/write", async (request, reply) => {
    const id = Number(request.params.id);
    if (Number.isInteger(id) && id > 0 && canWritePackages()) startPackage(id);
    return reply.redirect(`/story-lab/specular/${id}`);
  });

  app.post<{ Params: { id: string }; Body: Record<string, string | undefined> }>("/story-lab/specular/:id/rename", async (request, reply) => {
    const id = Number(request.params.id);
    const title = str(request.body?.title).slice(0, 300);
    if (Number.isInteger(id) && id > 0 && title) await renameCompilation(id, title);
    return reply.redirect(`/story-lab/specular/${id}`);
  });

  app.post<{ Params: { id: string } }>("/story-lab/specular/:id/discard", async (request, reply) => {
    const id = Number(request.params.id);
    if (Number.isInteger(id) && id > 0) await discardCompilation(id);
    return reply.redirect("/story-lab#specular");
  });

  app.post<{ Params: { id: string }; Body: Record<string, string | undefined> }>("/story-lab/specular/:id/sources", async (request, reply) => {
    const id = Number(request.params.id);
    const { sources, excluded } = await loadCatalog();
    const known = new Set([...sources, ...excluded].map((s) => s.id));
    const ids = [...new Set(str(request.body?.ids).split(/[\s,]+/).map(videoIdOf).filter((v): v is string => Boolean(v && known.has(v))))];
    if (Number.isInteger(id) && id > 0) await setSources(id, ids.slice(0, 40));
    return reply.redirect(`/story-lab/specular/${id}`);
  });

  const findByTitle = async (title: string) => {
    const { sources, excluded } = await loadCatalog();
    const t = title.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return [...sources, ...excluded].find((s) => s.title.toLowerCase().replace(/[^a-z0-9]+/g, "") === t) ?? null;
  };
  const back = (msg: string) => `/story-lab/specular?msg=${encodeURIComponent(msg)}`;

  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/specular/exclude", async (request, reply) => {
    const title = str(request.body?.title).slice(0, 300);
    if (!title) return reply.redirect("/story-lab/specular");
    const found = await findByTitle(title);
    await addExclusion({ videoId: found?.id ?? null, title: found?.title ?? title, reason: str(request.body?.reason).slice(0, 200) });
    return reply.redirect(back(`Excluded “${found?.title ?? title}”${found ? "" : " — not in the catalog yet; it'll be left out when it is"}.`));
  });
  app.post<{ Params: { id: string } }>("/story-lab/specular/exclude/:id/remove", async (request, reply) => {
    const id = Number(request.params.id);
    if (Number.isInteger(id) && id > 0) await removeExclusion(id);
    return reply.redirect("/story-lab/specular");
  });

  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/specular/runtime", async (request, reply) => {
    const found = await findByTitle(str(request.body?.title));
    if (!found) return reply.redirect(back("No video with that title in the catalog."));
    const raw = str(request.body?.runtime);
    const secs = parseRuntime(raw);
    if (raw && (secs === null || secs < 60 || secs > 6 * 3600)) return reply.redirect(back("That runtime didn't read — try 24:10 or 24."));
    await setRuntime(found.id, secs);
    return reply.redirect(back(secs ? `${found.title}: ${clock(secs)}.` : `${found.title}: back to its own runtime.`));
  });
}
