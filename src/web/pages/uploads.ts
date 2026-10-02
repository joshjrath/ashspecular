/**
 * Uploads: each category's pace against its target, how every video did
 * against its channel's usual, Shorts' daily view, ideas from what worked,
 * Gaming's series, and one channel on its own page.
 */
import { CATEGORIES, CHANNELS, type CategoryId, contrastRatio } from "../../catalog.js";
import { type ChannelCadence, type DailyCadence, type PaceState, STORIES_EVERY_DAYS, addDays, dayOf, daysBetween } from "../cadence.js";
import type { ChannelLink, Upload } from "../../jobs/youtube.js";
import type { ChannelShortHealth, ShortScore, ShortTier, SlotStat } from "../shorts-perf.js";
import { FORMAT_BY_ID } from "../stories/formats.js";
import type { FeatureStat, IdeaAnalysis, IdeaCheck, IdeaVideo, Suggestion } from "../ideas.js";
import type { LabIdea } from "../stories/lab.js";
import type { NextUp, Series } from "../gaming/series.js";
import { ORG_TZ, relativeDay, shortsDay, usDate } from "../../parse/derive.js";
import { type Performance, compactViews, formatMultiple } from "../performance.js";
import { type Shell, channelColour, channelPauseButton, channelPausedTag, layout, liftText, pageHeader, timeAgo, uploadScriptMark } from "../page.js";
import { UPLOAD_CATEGORIES, UPLOAD_TARGETS, describeTarget, everyFor, formatFor, isOwnPace } from "../targets.js";
import { esc, safeUrl } from "../html.js";

// ── uploads: the daily view (Bits, Reading) ───────────────────────────────

/** Five greens from nothing to on target: magnitude is one hue, dark to light. */
const HEAT = ["#26262C", "#1E3A2D", "#22553C", "#2A734F", "#3A9A6B", "#56C990"];

function dailyView(
  channels: string[],
  linkOf: Map<string, ChannelLink>,
  daily: DailyCadence[],
  range: number,
  typical: Map<string, { views: number; basis: string } | null>,
  category: CategoryId,
  now: Date,
  /** Where the range tabs point: the category, or one channel's own page. */
  base = `/uploads?cat=${category}&amp;`,
): string {
  // The Bits/Reading day: until 3 AM, "today" is still the day being finished.
  const today = shortsDay(now);
  const byName = new Map(daily.map((d) => [d.channel, d]));
  const linked = channels.filter((c) => linkOf.get(c)?.youtubeId);
  const live = linked.map((c) => byName.get(c)).filter((d): d is DailyCadence => Boolean(d));

  const todayDone = live.reduce((n, d) => n + Math.min(d.today, d.perDay), 0);
  const todayTarget = live.reduce((n, d) => n + d.perDay, 0);
  const onTargetToday = live.filter((d) => d.today >= d.perDay).length;
  const hits = live.filter((d) => d.hit30 !== null);
  const hit30 = hits.length ? Math.round((hits.reduce((n, d) => n + d.hit30!, 0) / hits.length) * 100) : null;
  const perDay7 = live.reduce((n, d) => n + (d.avg7 ?? 0), 0);
  const single = channels.length === 1 ? live[0] : undefined;
  const tiles = [
    { n: `${todayDone}/${todayTarget}`, l: "Shorts up today", cls: todayDone >= todayTarget && todayTarget ? "t-ok" : "" },
    single
      ? { n: String(single.streak), l: "days in a row on target", cls: single.streak >= 3 ? "t-ok" : "" }
      : { n: `${onTargetToday}/${live.length}`, l: "channels on target today", cls: "" },
    { n: hit30 === null ? "—" : `${hit30}%`, l: "days on target · 30 days", cls: "" },
    { n: perDay7.toFixed(1), l: `a day · last 7 · target ${todayTarget}`, cls: "" },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  const days: string[] = [];
  for (let i = range - 1; i >= 0; i -= 1) days.push(addDays(today, -i));
  const W = 1100, LABEL = 188, RIGHT = 70, ROW = 30, TOP = 30;
  const cw = (W - LABEL - RIGHT) / days.length;
  const H = TOP + channels.length * ROW + 6;
  const wd = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

  const heads = days
    .map((d, i) => {
      const cx = LABEL + i * cw + cw / 2;
      const isToday = d === today;
      const show = isToday || (i % 7 === 0 && days.length - i > 3);
      return show ? `<text x="${cx.toFixed(1)}" y="${TOP - 10}" class="tick${isToday ? " today-l" : ""}" text-anchor="middle">${isToday ? "Today" : esc(usDate(d).replace(/\/\d{4}$/, ""))}</text>` : "";
    })
    .join("");

  const rowsSvg = channels
    .map((name, r) => {
      const y = TOP + r * ROW;
      const d = byName.get(name);
      const link = linkOf.get(name);
      const label = `<a href="${chanHref(name)}" class="lane-a"><circle cx="12" cy="${y + ROW / 2}" r="5" fill="${channelColour(name)}" class="ring"/>
        <text x="24" y="${y + ROW / 2 + 4}" class="lname">${esc(name.replace(/^Specular /, ""))}</text><title>${esc(name)} on its own</title></a>`;
      if (!link?.youtubeId || !d) {
        return `${label}<text x="${LABEL + 8}" y="${y + ROW / 2 + 4}" class="nolink">${
          link?.error ? `Couldn't read: ${esc(link.error)}` : "No link yet — add it below"
        }</text>`;
      }
      const cells = days
        .map((day, i) => {
          const n = d.counts.get(day) ?? 0;
          const step = n === 0 ? 0 : n >= d.perDay ? 5 : 1 + Math.min(3, Math.floor((n / d.perDay) * 4));
          const cx = LABEL + i * cw;
          const tip = `${name} · ${wd.format(new Date(`${day}T12:00:00Z`))} ${usDate(day)}: ${n} of ${d.perDay}${n >= d.perDay ? " ✓" : ""}`;
          return `<g data-tip="${esc(tip)}"><rect x="${(cx + 1).toFixed(1)}" y="${y + 3}" width="${Math.max(2, cw - 2).toFixed(1)}" height="${ROW - 6}" rx="4"
            fill="${HEAT[step]}"${day === today ? ' class="hot-today"' : ""}/>${
              cw >= 16 && n > 0
                ? `<text x="${(cx + cw / 2).toFixed(1)}" y="${y + ROW / 2 + 4}" text-anchor="middle" class="hc${step >= 4 ? " dark" : ""}">${n}</text>`
                : ""
            }</g>`;
        })
        .join("");
      const met = d.today >= d.perDay;
      return `${label}${cells}<text x="${W - RIGHT + 12}" y="${y + ROW / 2 + 4}" class="lstate ${met ? "ok" : d.today ? "due" : ""}">${met ? "✓" : ""} ${d.today}/${d.perDay}</text>`;
    })
    .join("");

  const ranges = [14, 30, 60]
    .map((r) => `<a class="tab${range === r ? " on" : ""}" href="${base}range=${r}">${r} days</a>`)
    .join("");

  const heatmap = `<div class="panel uplanes">
    <div class="uphead">
      <h2>Shorts a day, per channel</h2>
      <div class="ulegend" aria-label="Legend">
        <span><i class="lg-cell" style="background:${HEAT[0]}"></i>None</span>
        <span><i class="lg-cell" style="background:${HEAT[2]}"></i><i class="lg-cell" style="background:${HEAT[3]}"></i>Part of the day's number</span>
        <span><i class="lg-cell" style="background:${HEAT[5]}"></i>✓ On target</span>
      </div>
      <div class="tabs">${ranges}</div>
    </div>
    <div class="upscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Shorts per channel per day over the last ${range} days, against each channel's daily number">
      ${heads}${rowsSvg}</svg></div>
    <div class="uptip" hidden></div>
  </div>`;

  const tableRows = channels
    .map((name) => ({ name, d: byName.get(name), linked: Boolean(linkOf.get(name)?.youtubeId) }))
    .sort((a, b) => (a.d && b.d ? a.d.today / a.d.perDay - b.d.today / b.d.perDay : a.d ? -1 : 1))
    .map(({ name, d, linked: ok }) => {
      const t = typical.get(name);
      const met = d && d.today >= d.perDay;
      return `<tr>
        <td><a class="chlink" href="${chanHref(name)}"><span class="cdot" style="--ch:${channelColour(name)}"></span>${esc(name)}</a>${pausedMark(name)}</td>
        <td>${ok && d ? `<span class="pace ${met ? "ok" : d.today ? "due" : "late"}">${met ? "✓" : d.today ? "◷" : "!"} ${d.today} of ${d.perDay}</span>` : "—"}</td>
        <td class="num">${d ? d.streak : "—"}</td>
        <td class="num">${d?.avg7 != null ? d.avg7.toFixed(1) : "—"}</td>
        <td class="num">${d?.hit30 != null ? `${Math.round(d.hit30 * 100)}%` : "—"}</td>
        <td>${d?.last ? `${esc(usDate(shortsDay(d.last)))} <small>${esc(relativeDay(shortsDay(d.last)))}</small>` : "—"}</td>
        <td class="num">${t ? `${esc(compactViews(Math.round(t.views)))} <small>${esc(t.basis)}</small>` : "—"}</td>
      </tr>`;
    })
    .join("");
  const table = `<div class="panel">
    <h2>${channels.length === 1 ? "Pace" : "By channel"}</h2>
    <div class="utable-wrap"><table class="utable">
      <thead><tr><th>Channel</th><th>Today</th><th class="num" title="Days in a row on target">Streak</th>
        <th class="num">A day · 7d</th><th class="num">On target · 30d</th><th>Last Short</th><th class="num">Typical views</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div>
  </div>`;

  return `<div class="utiles">${tiles}</div>${heatmap}${table}`;
}

// ── uploads: Shorts outliers (Bits, Reading) ──────────────────────────────

const TIER: Record<ShortTier, { label: string; icon: string; colour: string; r: number }> = {
  viral: { label: "Viral", icon: "🚀", colour: "#F8E27A", r: 7 },
  breakout: { label: "Breakout", icon: "🔥", colour: "#EE9A55", r: 5.5 },
  normal: { label: "Normal", icon: "", colour: "#6E6E78", r: 3.5 },
  soft: { label: "Soft", icon: "🫤", colour: "#B08A8A", r: 4 },
  flop: { label: "Flop", icon: "📉", colour: "#FF7A70", r: 5.5 },
};

function shortsPanel(
  channels: string[],
  uploads: Upload[],
  scores: Map<string, ShortScore>,
  health: ChannelShortHealth[],
  slots: SlotStat[],
  now: Date,
): string {
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const week = uploads.filter((u) => u.publishedAt.getTime() >= weekAgo && scores.has(u.videoId));
  const count = (t: ShortTier) => week.filter((u) => scores.get(u.videoId)!.tier === t).length;
  const beat = week.length ? Math.round((week.filter((u) => scores.get(u.videoId)!.multiple >= 1).length / week.length) * 100) : null;
  const tiles = [
    { n: `${count("viral")}`, l: "🚀 viral · 7 days", cls: count("viral") ? "t-ok" : "" },
    { n: `${count("breakout")}`, l: "🔥 breakouts · 7 days", cls: "" },
    { n: `${count("flop")}`, l: "📉 flops · 7 days", cls: count("flop") ? "t-late" : "" },
    { n: beat === null ? "—" : `${beat}%`, l: `beat their channel's usual · ${week.length} scored`, cls: "" },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  // The spread: every Short of the week on a log scale of its multiple.
  const W = 1100, LABEL = 188, RIGHT = 30, ROW = 34, TOP = 30;
  const lo = Math.log(0.1), hi = Math.log(10);
  const x = (m: number) => LABEL + ((Math.min(Math.max(Math.log(m), lo), hi) - lo) / (hi - lo)) * (W - LABEL - RIGHT);
  const H = TOP + channels.length * ROW + 8;
  const ticks = [0.1, 0.25, 0.5, 1, 2, 4, 10]
    .map((m) => `<line x1="${x(m).toFixed(1)}" x2="${x(m).toFixed(1)}" y1="${TOP - 6}" y2="${H - 6}" class="${m === 1 ? "one" : "wk"}"/>
      <text x="${x(m).toFixed(1)}" y="${TOP - 12}" text-anchor="middle" class="tick${m === 1 ? " today-l" : ""}">${m === 1 ? "usual" : `${m}×`}</text>`)
    .join("");
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * (ROW - 12);
  const rows = channels
    .map((name, i) => {
      const y = TOP + i * ROW + ROW / 2;
      const mine = week.filter((u) => u.channel === name).map((u) => ({ u, sc: scores.get(u.videoId)! }));
      const spread = mine[0]?.sc.spread;
      const band = spread
        ? `<rect x="${x(Math.exp(-spread)).toFixed(1)}" y="${y - ROW / 2 + 3}" width="${(x(Math.exp(spread)) - x(Math.exp(-spread))).toFixed(1)}" height="${ROW - 6}" rx="6" class="band"/>`
        : "";
      const dots = mine
        .sort((a, b) => (a.sc.tier === "normal" ? -1 : 0) - (b.sc.tier === "normal" ? -1 : 0))
        .map(({ u, sc }) => {
          const t = TIER[sc.tier];
          const tip = `${t.icon ? `${t.icon} ` : ""}${u.title} · ${u.views !== null ? `${u.views.toLocaleString()} views · ` : ""}${formatMultiple(sc.multiple)} usual ${sc.basis} · beat ${sc.percentile}% of the last ${sc.sample}`;
          return `<a href="${esc(safeUrl(u.url))}" target="_blank" rel="noreferrer" data-tip="${esc(tip)}">
            <circle cx="${x(sc.multiple).toFixed(1)}" cy="${(y + jitter()).toFixed(1)}" r="${t.r}" fill="${t.colour}" class="sdot ${sc.tier}"/></a>`;
        })
        .join("");
      return `<circle cx="12" cy="${y}" r="5" fill="${channelColour(name)}" class="ring"/>
        <text x="24" y="${y + 4}" class="lname">${esc(name.replace(/^Specular /, ""))}</text>
        <line x1="${LABEL}" x2="${W - RIGHT}" y1="${y}" y2="${y}" class="track"/>${band}${dots}${
          mine.length ? "" : `<text x="${LABEL + 8}" y="${y + 4}" class="nolink">${
            uploads.some((u) => u.channel === name && u.views !== null)
              ? "Nothing scored this week yet — Shorts score at 3 days old until tracking from upload has built up"
              : "No view counts yet for this channel — they arrive with the hourly read"
          }</text>`
        }`;
    })
    .join("");
  const spreadChart = `<div class="panel uplanes">
    <div class="uphead">
      <h2>This week's Shorts, against each channel's usual</h2>
      <div class="ulegend">
        ${(["viral", "breakout", "normal", "soft", "flop"] as ShortTier[]).map((t) => `<span><i class="lg-tier" style="--c:${TIER[t].colour}"></i>${TIER[t].icon} ${TIER[t].label}</span>`).join("")}
        <span><i class="lg-band"></i>Normal range</span>
      </div>
    </div>
    <div class="upscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Every Short of the last seven days, placed by its multiple of its channel's usual views on a log scale">
      ${ticks}${rows}</svg></div>
    <div class="uptip" hidden></div>
    <p class="hint">Each Short is compared with its channel's last 60 at the same age (1 hour, 3, 6, 24, 3 days, 7 days) on a log scale.
    Viral is three typical spreads above usual, breakout two; soft one below, flop two. The shaded band is each channel's normal range.
    Until those ages have been tracked from upload for enough Shorts (a couple of days after deploying), Shorts three days and older are compared on their views now.</p>
  </div>`;

  // Channel health.
  const trend = (h: ChannelShortHealth) => {
    if (h.thisWeek === null || h.lastWeek === null) return "—";
    const pct = Math.round((h.thisWeek / h.lastWeek - 1) * 100);
    return `<span class="${pct >= 0 ? "up" : "down"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
  };
  const healthRows = health
    .map((h) => `<tr>
      <td><span class="cdot" style="--ch:${channelColour(h.channel)}"></span>${esc(h.channel)}</td>
      <td class="num">${h.thisWeek === null ? "—" : esc(formatMultiple(h.thisWeek))}</td>
      <td class="num">${trend(h)}</td>
      <td class="num">${h.beatRate === null ? "—" : `${Math.round(h.beatRate * 100)}%`}</td>
      <td class="num">${h.counts.viral || "·"}</td><td class="num">${h.counts.breakout || "·"}</td>
      <td class="num">${h.counts.soft || "·"}</td><td class="num">${h.counts.flop || "·"}</td>
      <td class="num">${h.scored}</td>
    </tr>`)
    .join("");
  const healthTable = `<div class="panel">
    <h2>Channel health <span class="sub">this week against last</span></h2>
    <div class="utable-wrap"><table class="utable">
      <thead><tr><th>Channel</th><th class="num" title="Median multiple of this week's Shorts">Typical ×</th><th class="num">vs last week</th>
        <th class="num">Beat usual</th><th class="num">🚀</th><th class="num">🔥</th><th class="num">🫤</th><th class="num">📉</th><th class="num">Scored</th></tr></thead>
      <tbody>${healthRows}</tbody></table></div>
  </div>`;

  // The outliers themselves.
  const month = uploads.filter((u) => now.getTime() - u.publishedAt.getTime() < 30 * 86_400_000 && scores.has(u.videoId));
  const row = (u: Upload) => {
    const sc = scores.get(u.videoId)!;
    const t = TIER[sc.tier];
    return `<a class="prow" href="${esc(safeUrl(u.url))}" target="_blank" rel="noreferrer">
      <span class="pmult ${sc.tier === "flop" || sc.tier === "soft" ? "under" : "breakout"}">${esc(formatMultiple(sc.multiple))}</span>
      <span class="pbody"><span class="ut">${t.icon} ${esc(u.title)}</span>
        <span class="pmeta"><span class="cdot" style="--ch:${channelColour(u.channel)}"></span>${esc(u.channel)} · ${
          sc.tier === "flop" || sc.tier === "soft" ? `bottom ${Math.max(1, 100 - sc.percentile)}%` : `top ${Math.max(1, 100 - sc.percentile)}%`
        } · ${esc(compactViews(sc.value))} ${esc(sc.basis)} vs ${esc(compactViews(Math.round(sc.baseline)))} usual · ${esc(relativeDay(shortsDay(u.publishedAt)))}</span></span>
    </a>`;
  };
  const ups = month.filter((u) => ["viral", "breakout"].includes(scores.get(u.videoId)!.tier)).sort((a, b) => scores.get(b.videoId)!.z - scores.get(a.videoId)!.z).slice(0, 10);
  const downs = month.filter((u) => scores.get(u.videoId)!.tier === "flop").sort((a, b) => scores.get(a.videoId)!.z - scores.get(b.videoId)!.z).slice(0, 10);
  const outliers = `<div class="panel performers">
    <h2>Outliers <span class="sub">last 30 days, most unusual first</span></h2>
    <div class="pcols">
      <div><h3>🚀🔥 Above <span>${ups.length}</span></h3>${ups.map(row).join("") || `<p class="hint">None this month yet.</p>`}</div>
      <div><h3>📉 Flops <span>${downs.length}</span></h3>${downs.map(row).join("") || `<p class="hint">None this month.</p>`}</div>
    </div>
  </div>`;

  const maxSlot = Math.max(...slots.map((s) => s.median), 1);
  const slotPanel = slots.length
    ? `<div class="panel"><h2>When Shorts do best <span class="sub">three-hour slots, Eastern · median multiple of the channel's usual</span></h2>
        <ul class="slots">${slots
          .slice()
          .sort((a, b) => a.from - b.from)
          .map((sl) => `<li><span class="sl">${esc(sl.label)}</span>
            <span class="sb"><i style="width:${((sl.median / maxSlot) * 100).toFixed(0)}%" class="${sl.median >= 0.95 ? "up" : "down"}"></i></span>
            <b class="${sl.median >= 0.95 ? "up" : "down"}">${esc(formatMultiple(sl.median))}</b><small>${sl.count}</small></li>`)
          .join("")}</ul></div>`
    : "";

  return `<div class="utiles after">${tiles}</div>${spreadChart}${outliers}${healthTable}${slotPanel}`;
}

function ideasPanel(
  category: CategoryId,
  a: IdeaAnalysis,
  idea: { title: string; check: IdeaCheck } | null,
  channels: string[] = [],
  channel: string | null = null,
  hooks: Map<string, string> = new Map(),
): string {
  const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? "";
  const scope = channel ?? `${catLabel} channels`;
  const ago = (d: Date) => relativeDay(dayOf(d));
  const vidLine = (v: IdeaVideo) => `<li><a href="${esc(safeUrl(v.url))}" target="_blank" rel="noreferrer">
      <span class="vm ${v.multiple! >= 1 ? "up" : "down"}">${esc(formatMultiple(v.multiple!))}</span>
      <span class="vt">${esc(v.title)}</span>
      <span class="vc"><span class="cdot" style="--ch:${channelColour(v.channel)}"></span>${esc(v.channel.replace(/^Specular /, ""))} · ${esc(ago(v.publishedAt))}</span>
    </a></li>`;
  const channelTable = (st: FeatureStat) =>
    st.byChannel.length > 1
      ? `<div class="ibych">${st.byChannel
          .slice(0, 6)
          .map((c) => `<span><span class="cdot" style="--ch:${channelColour(c.channel)}"></span>${esc(c.channel.replace(/^Specular /, ""))}
            <b class="${c.median >= a.overall ? "up" : "down"}">${esc(formatMultiple(c.median))}</b> <small>${c.count}</small></span>`)
          .join("")}</div>`
      : "";
  const statDetail = (st: FeatureStat) => {
    const best = st.videos.slice(0, 3);
    const worst = st.videos.length > 4 ? st.videos.slice(-2).reverse() : [];
    return `<div class="idetail">
      <p class="imeta">${st.count} judged videos · median ${esc(formatMultiple(st.median))} their channel's usual
        (all ${esc(catLabel)}: ${esc(formatMultiple(a.overall))}) · last used ${esc(ago(st.lastUsed))}</p>
      ${channelTable(st)}
      <h4>Best</h4><ul class="ivids">${best.map(vidLine).join("")}</ul>
      ${worst.length ? `<h4>Weakest</h4><ul class="ivids">${worst.map(vidLine).join("")}</ul>` : ""}
    </div>`;
  };
  const statRow = (st: FeatureStat) => `<li><details>
      <summary><span class="ik">${esc(st.key)}</span>
        <span class="il ${st.lift >= 1 ? "up" : "down"}">${esc(liftText(st.lift))}</span>
        <span class="in">${st.count} video${st.count === 1 ? "" : "s"}</span></summary>
      ${statDetail(st)}
    </details></li>`;
  const list = (title: string, xs: FeatureStat[], n: number) =>
    `<div class="icol"><h3>${esc(title)}</h3>${xs.length ? `<ul class="ilist">${xs.slice(0, n).map(statRow).join("")}</ul>` : `<p class="hint">Not enough yet.</p>`}</div>`;

  const picker = channels.length > 1
    ? `<form method="get" action="/uploads" class="ichan">
        <input type="hidden" name="cat" value="${category}">
        <label>Ideas for
          <select name="ch" onchange="this.form.submit()">
            <option value="">all ${esc(catLabel)} channels</option>
            ${channels.map((c) => `<option value="${esc(c)}"${c === channel ? " selected" : ""}>${esc(c)}</option>`).join("")}
          </select>
        </label>
      </form>`
    : "";

  const checker = `<form method="get" action="/uploads" class="ichecker">
      <input type="hidden" name="cat" value="${category}">
      ${channel ? `<input type="hidden" name="ch" value="${esc(channel)}">` : ""}
      <input type="text" name="idea" value="${esc(idea?.title ?? "")}" placeholder="Type a title idea — e.g. What If Gojo Joined The Avengers?" autocomplete="off">
      <button class="clear">Check idea</button>
    </form>
    ${
      idea
        ? `<div class="iresult">
            <div class="ipred ${idea.check.predicted >= 1.15 ? "up" : idea.check.predicted <= 0.87 ? "down" : ""}">
              <b>${esc(formatMultiple(idea.check.predicted))}</b>
              <span>${idea.check.predicted >= 1.15 ? "likely above usual" : idea.check.predicted <= 0.87 ? "likely below usual" : "about usual"} · ${esc(idea.check.confidence)} confidence</span>
            </div>
            <div class="ireasons">${
              idea.check.reasons.length
                ? idea.check.reasons
                    .map((r) => `<span class="ichip ${r.lift >= 1 ? "up" : "down"}">${esc(r.label)} <b>${esc(liftText(r.lift))}</b> <small>${r.count}</small></span>`)
                    .join("")
                : `<span class="hint">Nothing in this title matches a format or subject with enough history yet${
                    idea.check.subjects.length ? ` (read as ${esc(idea.check.subjects.join(", "))})` : ""
                  }.</span>`
            }</div>
          </div>`
        : ""
    }`;

  const suggestion = (sg: Suggestion) => {
    const d = sg.details;
    return `<li><details class="isg">
      <summary>
        <span class="ikind ${sg.kind}">${sg.kind === "pairing" ? "New pairing" : sg.kind === "sequel" ? "Follow-up" : "Bring back"}</span>
        <span class="iidea">${esc(sg.idea)}</span><span class="iwhy">${esc(sg.why)}</span>
        <span class="imore">Details ▾</span>
      </summary>
      <div class="idetail">
        ${d.drafts.length ? `<h4>Titles to start from</h4><ol class="idrafts">${d.drafts.map((t) => `<li><a href="/uploads?cat=${category}${channel ? `&amp;ch=${encodeURIComponent(channel)}` : ""}&amp;idea=${encodeURIComponent(t)}" title="Check this title">${esc(t)}</a></li>`).join("")}</ol>` : ""}
        ${d.source ? `<h4>The hit it builds on</h4><ul class="ivids">${vidLine(d.source)}</ul>` : ""}
        ${d.source && hooks.get(d.source.url) ? `<h4>How it opened</h4><blockquote class="shook">${esc(hooks.get(d.source.url)!)}</blockquote>` : ""}
        <div class="ifacts">
          ${d.bestChannel ? `<span><b>Best channel</b> ${esc(d.bestChannel.channel)} · ${esc(formatMultiple(d.bestChannel.median))} usual</span>` : ""}
          ${d.bestDay ? `<span><b>Best day</b> ${esc(d.bestDay.key)} · ${esc(liftText(d.bestDay.lift))}</span>` : ""}
          ${d.lastUsedDays !== null ? `<span><b>Last done</b> ${d.lastUsedDays} days ago</span>` : `<span><b>Last done</b> never</span>`}
        </div>
        ${d.evidence.map((e) => `<h4>${esc(e.label)} · ${esc(liftText(e.stat.lift))} over ${e.stat.count} videos</h4>${channelTable(e.stat)}<ul class="ivids">${e.stat.videos.slice(0, 3).map(vidLine).join("")}</ul>`).join("")}
        ${d.caveats.length ? `<h4>Watch out</h4><ul class="icav">${d.caveats.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      </div>
    </details></li>`;
  };

  return `<div class="panel ideas" id="ideas">
    <div class="ihead-row">
      <h2>Ideas <span class="sub">from ${a.judged} videos on ${esc(scope)}, each judged against its channel's usual</span></h2>
      ${picker}
    </div>
    ${checker}
    ${
      a.judged < 6
        ? `<p class="hint">Ideas need at least six judged videos${channel ? " on this channel" : " in this category"} — videos are judged once they're two weeks old, or sooner as the hourly view history builds up.</p>`
        : `<div class="icols">
            ${list("Formats", a.formats, 6)}
            ${list("Subjects", a.subjects, 8)}
            <div class="icol"><h3>Best days</h3>${a.days.length ? `<ul class="ilist">${a.days.slice(0, 3).map(statRow).join("")}</ul>` : `<p class="hint">Not enough yet.</p>`}
              <h3 style="margin-top:14px">Title length</h3><ul class="ilist">${[a.length.short, a.length.long]
                .filter((x): x is FeatureStat => Boolean(x))
                .map(statRow)
                .join("")}</ul></div>
          </div>
          <h3 class="ihead">Suggested ideas <span class="sub">— open one for titles, evidence and where to post it</span></h3>
          ${a.suggestions.length ? `<ul class="isugg">${a.suggestions.map(suggestion).join("")}</ul>` : `<p class="hint">No suggestions yet — they need a few formats and subjects with a track record.</p>`}`
    }
  </div>`;
}

// ── uploads ───────────────────────────────────────────────────────────────

/** 🔥 3.4× / 📉 0.4× beside a video, or nothing when it's normal or unscored. */
function verdictBadge(p: Performance | undefined): string {
  if (!p || p.verdict === "normal") return "";
  return ` <span class="vbadge ${p.verdict}">${p.verdict === "breakout" ? "🔥" : "📉"} ${esc(formatMultiple(p.multiple))}</span>`;
}



const PACE: Record<PaceState, { label: string; icon: string; cls: string }> = {
  "on-pace": { label: "On pace", icon: "✓", cls: "ok" },
  due: { label: "Due today", icon: "◷", cls: "due" },
  behind: { label: "Behind", icon: "!", cls: "late" },
  none: { label: "No uploads yet", icon: "–", cls: "none" },
};

/** One channel on the Uploads page by itself. */
export interface ChannelFocus {
  channel: string;
  /** Every upload the board has for it, newest first. */
  all: Upload[];
  /** Stories only: Story Lab ideas ranked by how well they fit this channel, and why. */
  lab?: Array<{ idea: LabIdea; fit: string[] }>;
  /** Gaming only: every series on the channel, and the next episode of each worth making. */
  series?: Series[];
  next?: NextUp[];
}

/** A channel's own Uploads page. */
export function chanHref(name: string): string {
  return `/uploads/channel/${CHANNELS.find((c) => c.name === name)?.id ?? ""}`;
}

/** How a video did: a Short by its tier against the channel's last sixty, a long-form video by its verdict. */
function judged(u: Upload, perf: Map<string, Performance>, shorts: Map<string, ShortScore> | null) {
  const s = shorts?.get(u.videoId);
  if (s) return { multiple: s.multiple, kind: s.tier === "viral" || s.tier === "breakout" ? "up" : s.tier === "flop" ? "down" : s.tier === "soft" ? "soft" : "mid", badge: TIER[s.tier].icon ? `${TIER[s.tier].icon} ${TIER[s.tier].label}` : "", note: `top ${Math.max(1, 100 - s.percentile)}% · ${s.basis}` };
  const p = perf.get(u.videoId);
  if (p) return { multiple: p.multiple, kind: p.verdict === "breakout" ? "up" : p.verdict === "under" ? "down" : "mid", badge: p.verdict === "breakout" ? "🔥 Breakout" : p.verdict === "under" ? "📉 Under" : "", note: p.basis };
  return null;
}

const medianOf = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length ? (v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2) : null;
};

/**
 * What stands out on one channel: its usual, how often it beats it, the
 * spread of every scored video, the best and the weakest, whether it's
 * trending up, and (long form) which days do best.
 */
function outlierPanel(
  f: ChannelFocus,
  perf: Map<string, Performance>,
  shorts: Map<string, ShortScore> | null,
  typical: { views: number; basis: string } | null,
): string {
  const scored = f.all
    .map((u) => ({ u, j: judged(u, perf, shorts) }))
    .filter((x): x is { u: Upload; j: NonNullable<ReturnType<typeof judged>> } => x.j !== null);
  if (!scored.length) {
    return `<div class="panel"><h2>Outliers</h2><p class="hint">Scores appear once the channel has three earlier videos to compare
      with at the same age — straight away for older videos, within days for new ones as the view snapshots build up.</p></div>`;
  }
  const ms = scored.map((x) => x.j.multiple);
  const up = scored.filter((x) => x.j.kind === "up");
  const down = scored.filter((x) => x.j.kind === "down");
  const beat = Math.round((ms.filter((m) => m >= 1).length / ms.length) * 100);
  const newest = [...scored].sort((a, b) => b.u.publishedAt.getTime() - a.u.publishedAt.getTime());
  const recent = medianOf(newest.slice(0, 10).map((x) => x.j.multiple));
  const before = medianOf(newest.slice(10, 20).map((x) => x.j.multiple));
  const trend = recent !== null && before !== null && newest.length >= 14 ? recent / before - 1 : null;
  const tiles = [
    { n: typical ? compactViews(Math.round(typical.views)) : "—", l: `typical views${typical ? ` · ${typical.basis}` : ""}`, cls: "" },
    { n: `${beat}%`, l: `beat the channel's usual · ${ms.length} scored`, cls: beat >= 50 ? "t-ok" : "" },
    { n: `${up.length}`, l: `${shorts ? "🚀🔥 viral or breakout" : "🔥 breakouts (≥2×)"} · ${Math.round((up.length / ms.length) * 100)}%`, cls: up.length ? "t-ok" : "" },
    { n: `${down.length}`, l: `${shorts ? "📉 flops" : "📉 under (≤½)"} · ${Math.round((down.length / ms.length) * 100)}%`, cls: down.length ? "t-late" : "" },
    {
      n: trend === null ? "—" : `${trend >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(trend * 100))}%`,
      l: trend === null ? "trend · needs 14 scored" : `last 10 vs the 10 before · ${formatMultiple(recent!)} now`,
      cls: trend === null ? "" : trend >= 0.1 ? "t-ok" : trend <= -0.1 ? "t-late" : "",
    },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  // The spread: every scored video by how it did against the usual.
  const bins = [
    { l: "½× or less", test: (m: number) => m <= 0.5, cls: "down" },
    { l: "½–0.8×", test: (m: number) => m > 0.5 && m < 0.8, cls: "soft" },
    { l: "0.8–1.25×", test: (m: number) => m >= 0.8 && m < 1.25, cls: "mid" },
    { l: "1.25–2×", test: (m: number) => m >= 1.25 && m < 2, cls: "good" },
    { l: "2–4×", test: (m: number) => m >= 2 && m < 4, cls: "up" },
    { l: "4× or more", test: (m: number) => m >= 4, cls: "up" },
  ].map((b) => ({ ...b, n: ms.filter(b.test).length }));
  const most = Math.max(1, ...bins.map((b) => b.n));
  const spread = bins
    .map((b) => `<div class="obar ${b.cls}"><span class="ol">${esc(b.l)}</span>
      <span class="ot"><i style="width:${((b.n / most) * 100).toFixed(1)}%"></i></span><b>${b.n}</b></div>`)
    .join("");

  const line = ({ u, j }: (typeof scored)[number]) => `<li><a href="${esc(safeUrl(u.url))}" target="_blank" rel="noreferrer">
      <span class="vm ${j.multiple >= 1 ? "up" : "down"}">${esc(formatMultiple(j.multiple))}</span>
      <span class="vt">${esc(u.title)}${uploadScriptMark(u.title)}</span>
      <span class="vc">${esc(usDate(dayOf(u.publishedAt)))}${u.views !== null ? ` · ${esc(compactViews(u.views))} views` : ""}</span></a></li>`;
  const byMultiple = [...scored].sort((a, b) => b.j.multiple - a.j.multiple);

  // Long form: which day of the week does best, where there's enough to say.
  let days = "";
  if (!shorts) {
    const wd = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: ORG_TZ });
    const byDay = new Map<string, number[]>();
    for (const x of scored) {
      const d = wd.format(x.u.publishedAt);
      byDay.set(d, [...(byDay.get(d) ?? []), x.j.multiple]);
    }
    const rows = [...byDay]
      .filter(([, list]) => list.length >= 2)
      .map(([d, list]) => ({ d, n: list.length, med: medianOf(list)! }))
      .sort((a, b) => b.med - a.med);
    if (rows.length >= 2) {
      days = `<div><h3>By day posted <span>ET</span></h3><div class="odays">${rows
        .map((r) => `<span class="${r.med >= 1 ? "up" : "down"}"><b>${esc(r.d)}</b>${esc(formatMultiple(r.med))}<small>${r.n} videos</small></span>`)
        .join("")}</div></div>`;
    }
  }

  return `<div class="panel outliers">
    <h2>Outliers <span class="sub">— every scored video against ${esc(f.channel)}'s own usual at the same age</span></h2>
    <div class="utiles">${tiles}</div>
    <div class="ocols">
      <div><h3>The spread</h3>${spread}</div>
      <div><h3>Best</h3><ul class="ivids">${byMultiple.slice(0, 4).map(line).join("")}</ul></div>
      <div><h3>Weakest</h3><ul class="ivids">${byMultiple.slice(-4).reverse().map(line).join("")}</ul></div>
      ${days}
    </div>
  </div>`;
}

/**
 * Every video the board has for the channel — views, how it did against the
 * usual, its tier — sortable and filterable, sixty at a time.
 */
function everyVideoPanel(f: ChannelFocus, perf: Map<string, Performance>, shorts: Map<string, ShortScore> | null, now: Date): string {
  const SHOW = 60;
  const rows = f.all
    .map((u, i) => {
      const j = judged(u, perf, shorts);
      const age = relativeDay(dayOf(u.publishedAt));
      return `<a class="evrow ${j?.kind ?? "none"}" href="${esc(safeUrl(u.url))}" target="_blank" rel="noreferrer"
        data-t="${u.publishedAt.getTime()}" data-v="${u.views ?? -1}" data-m="${j ? j.multiple.toFixed(4) : -1}" data-k="${j?.kind ?? "none"}"${i >= SHOW ? " hidden" : ""}>
        <span class="evm ${j ? (j.multiple >= 1 ? "up" : "down") : ""}" title="${esc(j ? `${formatMultiple(j.multiple)} the channel's usual · ${j.note}` : "Not scored yet")}">${j ? esc(formatMultiple(j.multiple)) : "—"}</span>
        <span class="evt">${esc(u.title)}</span>
        <span class="evd">${esc(usDate(dayOf(u.publishedAt)))} · ${esc(age)}</span>
        <span class="evv">${u.views !== null ? `${esc(compactViews(u.views))}` : "—"}<small> views</small></span>
        <span class="evtier">${j?.badge ? esc(j.badge) : ""}</span>
      </a>`;
    })
    .join("");
  void now;
  const n = f.all.length;
  return `<div class="panel everyvid" id="everyvid">
    <div class="uphead">
      <h2>Every video <span class="sub">${n} upload${n === 1 ? "" : "s"} · views as of the last read</span></h2>
      <div class="tabs evsort" role="group" aria-label="Sort">
        <button type="button" class="tab on" data-sort="t">Newest</button>
        <button type="button" class="tab" data-sort="v">Most viewed</button>
        <button type="button" class="tab" data-sort="m">Best vs usual</button>
        <button type="button" class="tab" data-sort="w">Weakest</button>
      </div>
      <div class="tabs evfilter" role="group" aria-label="Show">
        <button type="button" class="tab on" data-f="all">All</button>
        <button type="button" class="tab" data-f="up">Outliers up</button>
        <button type="button" class="tab" data-f="down">Outliers down</button>
      </div>
    </div>
    <div class="evlist" id="evlist">${rows || `<p class="hint">No uploads read yet.</p>`}</div>
    ${n > SHOW ? `<button type="button" class="clear secondary evmore" id="evmore">Show all ${n}</button>` : ""}
    <script>
    (function () {
      var list = document.getElementById("evlist"), more = document.getElementById("evmore");
      var rows = Array.prototype.slice.call(list.querySelectorAll(".evrow"));
      var key = "t", only = "all", all = false, LIMIT = ${SHOW};
      function num(el, k) { return Number(el.getAttribute("data-" + k)); }
      function draw() {
        var picked = rows.filter(function (r) { return only === "all" || r.getAttribute("data-k") === only; });
        picked.sort(function (a, b) {
          if (key === "w") {
            var am = num(a, "m"), bm = num(b, "m");
            if (am < 0) return 1;
            if (bm < 0) return -1;
            return am - bm;
          }
          return num(b, key) - num(a, key);
        });
        rows.forEach(function (r) { r.hidden = true; });
        picked.forEach(function (r, i) { r.hidden = !all && i >= LIMIT; list.appendChild(r); });
        if (more) more.hidden = all || picked.length <= LIMIT;
      }
      function pick(group, attr, set) {
        document.querySelectorAll(group + " button").forEach(function (b) {
          b.addEventListener("click", function () {
            document.querySelectorAll(group + " button").forEach(function (x) { x.classList.toggle("on", x === b); });
            set(b.getAttribute(attr));
            draw();
          });
        });
      }
      pick(".evsort", "data-sort", function (v) { key = v; });
      pick(".evfilter", "data-f", function (v) { only = v; });
      if (more) more.addEventListener("click", function () { all = true; draw(); });
    })();
    </script>
  </div>`;
}

/** Story Lab's ideas, the ones that fit this channel first, each opening its blueprint. */
function channelLabPanel(f: ChannelFocus): string {
  const items = (f.lab ?? [])
    .map(({ idea, fit }) => {
      const qs = new URLSearchParams({
        format: idea.format,
        ...(idea.hero ? { hero: idea.hero.id } : {}),
        ...(idea.world ? { world: idea.world.id } : {}),
        ...(idea.power ? { power: idea.power.id } : {}),
        ...(idea.target ? { target: idea.target.id } : {}),
        ...(idea.shape ? { shape: idea.shape } : {}),
      }).toString();
      const why = [...fit, ...idea.reasons.slice(0, 1).map((r) => r.text)];
      return `<li><a href="/story-lab?${esc(qs)}#blueprint">
        <b>${esc(idea.title)}</b>
        <span class="lf">${esc(FORMAT_BY_ID.get(idea.format)?.name ?? idea.format)}</span>
        ${why.length ? `<span class="why">${why.map(esc).join(" · ")}</span>` : ""}
      </a></li>`;
    })
    .join("");
  return `<div class="panel ideas chlab">
    <h2>What ${esc(f.channel)} could make next <span class="sub">— Story Lab's ideas that fit this channel's worlds, heroes and formats; none already public on any channel</span></h2>
    ${items ? `<ul class="isugg">${items}</ul>` : `<p class="hint">Nothing fits yet — see <a href="/story-lab">Story Lab</a> for every idea.</p>`}
    <p class="hint">Each opens its part-by-part blueprint in <a href="/story-lab">Story Lab</a>.</p>
  </div>`;
}

/** Gaming: what a channel could make next — the next episode of each series worth going on with. */
function gamingNextPanel(f: ChannelFocus, now: Date): string {
  const today = dayOf(now);
  const items = (f.next ?? [])
    .slice(0, 6)
    .map((n) => {
      const due = n.series.nextDue;
      const dueCls = due && due < today ? "due late" : due && daysBetween(today, due) <= 1 ? "due" : "";
      return `<li><a href="#series-${esc(n.series.key.replace(/\s+/g, "-"))}">
        <b>${esc(n.title)}</b>
        <span class="lf ep">${n.series.live ? `Next episode · ${n.series.episodes.length} up so far` : "Bring it back"}</span>
        ${n.why.length ? `<span class="why">${n.why.map((w) => (dueCls && /^due/.test(w) ? `<span class="${dueCls}">${esc(w)}</span>` : esc(w))).join(" · ")}</span>` : ""}
      </a></li>`;
    })
    .join("");
  return `<div class="panel ideas chlab">
    <h2>What ${esc(f.channel)} could make next <span class="sub">— the next episode of each series worth going on with, best first; a fading or weak one is left to the Series panel below</span></h2>
    ${items ? `<ul class="isugg">${items}</ul>` : f.series?.some((s) => s.live) ? `<p class="hint">Nothing to go on with: every running series is fading or well below the channel's usual. See why in <a href="#series">Series</a> below.</p>` : `<p class="hint">No series running yet. A title with an episode number — Ep 3, Part 2, Day 5, #4 — starts one.</p>`}
  </div>`;
}

/** A series' episodes as bars round the channel's usual: up is above it, down below. */
function seriesSpark(s: Series): string {
  const eps = s.episodes.slice(-20);
  const W = 132, H = 32, mid = H / 2;
  const step = W / Math.max(eps.length, 6);
  const bars = eps
    .map((e, i) => {
      const x = (i * step + 1).toFixed(1);
      const w = Math.max(2, step - 2).toFixed(1);
      const tip = `${s.marker === "#" ? "#" : `${s.marker} `}${e.episode} · ${e.title} · ${usDate(dayOf(e.publishedAt))}${e.views !== null ? ` · ${e.views.toLocaleString()} views` : ""}${e.multiple !== null ? ` · ${formatMultiple(e.multiple)} usual` : " · not judged yet"}`;
      if (e.multiple === null) return `<rect x="${x}" y="${mid - 1}" width="${w}" height="2" class="na" data-tip="${esc(tip)}"/>`;
      const h = Math.max(1.5, (Math.min(2, Math.abs(Math.log2(e.multiple))) / 2) * (mid - 1));
      const up = e.multiple >= 1;
      return `<rect x="${x}" y="${(up ? mid - h : mid).toFixed(1)}" width="${w}" height="${h.toFixed(1)}" class="${e.multiple >= 1.2 ? "up" : e.multiple <= 0.8 ? "down" : ""}" data-tip="${esc(tip)}"/>`;
    })
    .join("");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${s.name}: each episode against the channel's usual`)}"><line x1="0" x2="${W}" y1="${mid}" y2="${mid}" class="mid"/>${bars}</svg>`;
}

/**
 * Gaming's series: every numbered series read from the titles, live first,
 * with how its episodes are holding the audience and when the next is due.
 */
function seriesPanel(list: Series[], opts: { oneOffs: number; single: boolean }, now: Date): string {
  const today = dayOf(now);
  const live = list.filter((s) => s.live);
  const fading = live.filter((s) => s.trend === "fading").length;
  const growing = live.filter((s) => s.trend === "rising").length;
  const episodes = list.reduce((n, s) => n + s.episodes.length, 0);
  const tiles = [
    { n: String(live.length), l: "series running", cls: "" },
    { n: String(growing), l: "growing", cls: growing ? "t-ok" : "" },
    { n: String(fading), l: "fading", cls: fading ? "t-late" : "" },
    { n: episodes + opts.oneOffs ? `${Math.round((episodes / (episodes + opts.oneOffs)) * 100)}%` : "—", l: "of uploads are episodes", cls: "" },
  ]
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");
  const rowsHtml = list
    .map((s) => {
      const first = s.episodes[0]!.episode;
      const trend = !s.live
        ? `<span class="strend resting">Resting</span>`
        : s.trend
          ? `<span class="strend ${s.trend}">${s.trend === "rising" ? "▲ Growing" : s.trend === "fading" ? "▼ Fading" : "Holding"}</span>`
          : "";
      const due = s.nextDue;
      const dueNote = !s.live
        ? `<small>last ${esc(usDate(s.lastDay))} · ${esc(relativeDay(s.lastDay))}</small>`
        : due
          ? `<small class="${due < today ? "late" : daysBetween(today, due) <= 1 ? "soon" : ""}">due ${esc(usDate(due))} · ${esc(relativeDay(due))}</small>`
          : `<small>last ${esc(relativeDay(s.lastDay))}</small>`;
      return `<div class="srow${s.live ? "" : " resting"}" id="series-${esc(s.key.replace(/\s+/g, "-"))}">
        <div class="sname"><span class="sn" title="${esc(s.name)}">${esc(s.name)}</span>
          ${opts.single ? "" : `<a class="sch chlink" href="${chanHref(s.channel)}"><span class="cdot" style="--ch:${channelColour(s.channel)}"></span>${esc(s.channel)}</a>`}
          ${trend}<span class="sadv">${esc(s.advice)}</span></div>
        <div class="seps">${first === s.latest ? `${esc(s.marker === "#" ? "#" : `${s.marker} `)}${s.latest}` : `${esc(s.marker === "#" ? "#" : `${s.marker} `)}${first}–${s.latest}`}<small>${s.episodes.length} up${s.gap ? ` · every ${s.gap === 1 ? "day" : `${s.gap}d`}` : ""}</small></div>
        ${seriesSpark(s)}
        <div class="smed ${s.median === null ? "" : s.median >= 1.2 ? "up" : s.median <= 0.8 ? "down" : ""}" title="The median episode against the channel's usual">${s.median === null ? "—" : esc(formatMultiple(s.median))}</div>
        <div class="snext"><b>${esc(s.live ? `Next: ${s.draft.replace(s.name, "").trim()}` : s.draft.replace(s.name, "").trim() + " to bring it back")}</b>${dueNote}</div>
      </div>`;
    })
    .join("");
  return `<div class="panel ideas series" id="series">
    <h2>Series <span class="sub">— every numbered series, read from the titles (Ep 3, Part 2, Day 5, #4): whether each is holding the audience its first episodes found, and when the next is due at its pace</span></h2>
    <div class="utiles">${tiles}</div>
    ${rowsHtml ? `<div class="slist">${rowsHtml}</div>` : `<p class="hint">No numbered series yet — ${opts.oneOffs} upload${opts.oneOffs === 1 ? "" : "s"}, all one-offs. A title with an episode number (Ep 3, Part 2, Day 5, #4) starts one.</p>`}
    <p class="hint">Each bar is an episode against the channel's usual at the same age: up is above it, down below. A series is running while its latest episode is within twice its usual gap (two weeks at least); after that it's resting. <b>Growing</b> and <b>Fading</b> compare the latest episodes with the earlier ones, once four are judged.</p>
    <div class="uptip" hidden></div>
  </div>`;
}

/**
 * The Uploads tab: whether each Stories channel is keeping to one long-form
 * upload every four days. Tiles for the headline, a timeline lane per channel
 * — every upload a dot, every gap coloured by whether it kept the pace, the
 * wait since the last one running up to today and on to when the next is due
 * — then the same thing as a table, the latest uploads, and the links.
 */
/**
 * The paused channels while an Uploads page renders — its tables are drawn by
 * helpers that don't take the shell. A paused channel stays on every chart;
 * it just says so.
 */
let uploadsPaused: Record<string, string> = {};
const pausedMark = (name: string) =>
  uploadsPaused[name] ? ` <span class="chpausetag" title="Production paused since ${esc(usDate(uploadsPaused[name]!))}">Paused</span>` : "";

export function renderUploads(
  shell: Shell,
  data: {
    channels: string[];
    links: ChannelLink[];
    uploads: Upload[];
    cadence: ChannelCadence[];
    range: number;
    hasKey: boolean;
    perf?: Map<string, Performance>;
    typical?: Map<string, { views: number; basis: string } | null>;
    category?: CategoryId;
    daily?: DailyCadence[];
    ideas?: IdeaAnalysis;
    idea?: { title: string; check: IdeaCheck } | null;
    ideaChannel?: string | null;
    shorts?: { scores: Map<string, ShortScore>; health: ChannelShortHealth[]; slots: SlotStat[] };
    /** Each Stories video's opening, from its script, by the video's link. */
    hooks?: Map<string, string>;
    /** One channel on its own page: every upload it has, and Story Lab ideas that fit it. */
    focus?: ChannelFocus;
    /** Gaming: every numbered series across the category, and how many uploads are one-offs. */
    series?: { series: Series[]; oneOffs: number };
    /** Paused channels in this category, and whether they're shown anyway. */
    paused?: { names: string[]; shown: boolean };
  },
  now = new Date(),
): string {
  const category: CategoryId = data.category ?? "stories";
  const focus = data.focus ?? null;
  uploadsPaused = shell.pausedChannels ?? {};
  const target = UPLOAD_TARGETS[category];
  // Targets are per channel: Stories every four days, Specular one a day,
  // others none. A channel with no target still shows every gap, none "late".
  const everyOf = (name: string) => everyFor(name);
  const targeted = data.channels.filter((n) => everyOf(n) !== null);
  const hasTarget = targeted.length > 0;
  const everyValues = [...new Set(targeted.map((n) => everyOf(n)!))];
  const every = everyValues.length ? Math.max(...everyValues) : STORIES_EVERY_DAYS;
  // One target shared by every channel reads as a heading; a mix doesn't.
  const uniform = everyValues.length === 1 && targeted.length === data.channels.length;
  const everyText = (d: number) => (d === 1 ? "one a day" : `every ${d} days`);
  // Gaming is held to each channel's own usual gap, and says so.
  const ownNote = targeted.some(isOwnPace) ? " — each channel's own usual pace" : "";
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const catLabel = CATEGORIES.find((c) => c.id === category)?.label ?? "Stories";
  const q = (extra = "") => `/uploads?cat=${category}${extra}`;
  const perf = data.perf ?? new Map<string, Performance>();
  const typical = data.typical ?? new Map();
  const perfNote = (id: string) => {
    const p = perf.get(id);
    return p ? ` · ${formatMultiple(p.multiple)} usual (${p.basis})` : "";
  };
  const today = dayOf(now);
  const linkOf = new Map(data.links.map((l) => [l.channel, l]));
  const cad = new Map(data.cadence.map((c) => [c.channel, c]));
  const linked = data.channels.filter((c) => linkOf.get(c)?.youtubeId);
  const tracked = data.cadence.filter((c) => linked.includes(c.channel));

  // ── tiles
  const trackedT = tracked.filter((c) => everyOf(c.channel) !== null);
  const linkedT = linked.filter((n) => everyOf(n) !== null);
  const onPace = trackedT.filter((c) => c.state === "on-pace" || c.state === "due").length;
  const behind = trackedT.filter((c) => c.state === "behind").length;
  const last30 = tracked.reduce((n, c) => n + c.uploads30, 0);
  const target30 = Math.round(linkedT.reduce((n, name) => n + 30 / everyOf(name)!, 0));
  const gapsT = trackedT.flatMap((c) => c.gaps.filter((g) => g.to > addDays(today, -90)).map((g) => ({ g, ev: everyOf(c.channel)! })));
  const onTime = gapsT.length ? Math.round((gapsT.filter(({ g, ev }) => g.days <= ev).length / gapsT.length) * 100) : null;
  const allGaps = tracked.flatMap((c) => c.gaps.filter((g) => g.to > addDays(today, -90)).map((g) => g.days)).sort((x, y) => x - y);
  const medGap = allGaps.length ? allGaps[Math.floor(allGaps.length / 2)]! : null;
  const active7 = tracked.filter((c) => c.daysSince !== null && c.daysSince <= 7).length;
  const tiles = (hasTarget
    ? [
        { n: linkedT.length ? `${onPace}/${linkedT.length}` : "—", l: uniform ? "on pace" : targeted.length === 1 ? `on pace · ${targeted[0]} ${everyText(everyOf(targeted[0]!)!)}` : "on pace · channels with a target", cls: "t-ok" },
        { n: String(behind), l: "behind", cls: behind ? "t-late" : "" },
        { n: `${last30}`, l: `uploads · 30 days · target ${target30}`, cls: "" },
        { n: onTime === null ? "—" : `${onTime}%`, l: "gaps on time · 90 days", cls: "" },
      ]
    : [
        { n: linked.length ? `${active7}/${linked.length}` : "—", l: "posted in the last 7 days", cls: "" },
        { n: `${last30}`, l: "uploads · 30 days", cls: "" },
        { n: medGap === null ? "—" : `${medGap}d`, l: "typical gap · 90 days", cls: "" },
        { n: String(linked.length), l: "channels tracked", cls: "" },
      ])
    .map((t) => `<div class="utile ${t.cls}"><div class="n">${esc(t.n)}</div><div class="l">${esc(t.l)}</div></div>`)
    .join("");

  // ── the timeline
  const W = 1100, LABEL = 188, RIGHT = 70, ROW = 36, TOP = 34;
  const start = addDays(today, -data.range);
  const end = addDays(today, hasTarget ? every + 2 : 3);
  const span = daysBetween(start, end);
  const x = (day: string) => LABEL + (daysBetween(start, day) / span) * (W - LABEL - RIGHT);
  const H = TOP + data.channels.length * ROW + 8;
  const byChannel = new Map<string, Upload[]>();
  for (const u of data.uploads) {
    if (!byChannel.has(u.channel)) byChannel.set(u.channel, []);
    byChannel.get(u.channel)!.push(u);
  }

  // Week lines, labelled on Mondays; the tick labels are M/D.
  const grid: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) continue;
    const gx = x(d).toFixed(1);
    grid.push(`<line x1="${gx}" x2="${gx}" y1="${TOP - 6}" y2="${H - 6}" class="wk"/>`);
    // Today's own label wins where the two would collide.
    if (Math.abs(x(d) - x(today)) > 34) {
      grid.push(`<text x="${gx}" y="${TOP - 14}" class="tick" text-anchor="middle">${esc(usDate(d).replace(/\/\d{4}$/, ""))}</text>`);
    }
  }
  const tx = x(today).toFixed(1);
  grid.push(`<line x1="${tx}" x2="${tx}" y1="${TOP - 6}" y2="${H - 6}" class="today"/>`);
  grid.push(`<text x="${tx}" y="${TOP - 14}" class="tick today-l" text-anchor="middle">Today</text>`);

  const lanes = data.channels
    .map((name, i) => {
      const y = TOP + i * ROW + ROW / 2;
      const c = cad.get(name);
      const link = linkOf.get(name);
      const colour = channelColour(name);
      const label = `<a href="${chanHref(name)}" class="lane-a"><g class="lane-l"><circle cx="12" cy="${y}" r="5" fill="${colour}" class="ring"/>
        <text x="24" y="${y + 4}" class="lname">${esc(name.replace(/^Specular /, ""))}</text></g><title>${esc(name)} on its own</title></a>`;
      const track = `<line x1="${LABEL}" x2="${W - RIGHT}" y1="${y}" y2="${y}" class="track"/>`;
      if (!link?.youtubeId) {
        return `${label}${track}<text x="${LABEL + 8}" y="${y + 4}" class="nolink">${
          link?.error ? `Couldn't read: ${esc(link.error)}` : "No link yet — add it below"
        }</text>`;
      }
      const vids = (byChannel.get(name) ?? []).slice().sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
      const days = [...new Set(vids.map((v) => dayOf(v.publishedAt)))].sort();
      const clamp = (d: string) => (d < start ? start : d);

      // Gaps between uploads, the late ones in red with their length.
      const ev = everyOf(name);
      const segs = (c?.gaps ?? [])
        .filter((g) => g.to >= start)
        .map((g) => {
          const late = ev !== null && g.days > ev;
          const x1 = x(clamp(g.from)), x2 = x(g.to);
          const mid = (x1 + x2) / 2;
          const tip = `${g.days}-day gap · ${usDate(g.from)} → ${usDate(g.to)}${late ? ` · ${g.days - ev!} over` : ev !== null ? " · on pace" : ""}`;
          return `<g class="seg ${late ? "late" : "ok"}" data-tip="${esc(tip)}">
            <line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${y}" y2="${y}"/>
            <rect x="${x1.toFixed(1)}" y="${y - 9}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="18" class="hit"/>
            ${late && x2 - x1 > 28 ? `<text x="${mid.toFixed(1)}" y="${y - 8}" text-anchor="middle" class="glab">${g.days}d</text>` : ""}
          </g>`;
        })
        .join("");

      // The wait since the last upload, and the target beyond it.
      let wait = "";
      if (c?.lastDay && c.nextDue) {
        const over = c.state === "behind";
        const x1 = x(clamp(c.lastDay)), x2 = x(today);
        wait = `<g class="seg wait ${over ? "late" : "ok"}" data-tip="${esc(
          `${c.daysSince} day${c.daysSince === 1 ? "" : "s"} since the last upload${over ? ` · ${c.behindBy} over` : ""}`,
        )}"><line x1="${x1.toFixed(1)}" x2="${x2.toFixed(1)}" y1="${y}" y2="${y}"/>
          <rect x="${x1.toFixed(1)}" y="${y - 9}" width="${Math.max(2, x2 - x1).toFixed(1)}" height="18" class="hit"/></g>`;
        if (ev !== null && c.nextDue >= today) {
          const dx = x(c.nextDue);
          wait += `<g class="due-mark" data-tip="${esc(`Next due ${usDate(c.nextDue)} · ${relativeDay(c.nextDue)}`)}">
            <line x1="${x2.toFixed(1)}" x2="${dx.toFixed(1)}" y1="${y}" y2="${y}" class="ahead"/>
            <path d="M${dx.toFixed(1)} ${y - 6} l6 6 l-6 6 l-6 -6 z"/>
            <rect x="${(dx - 10).toFixed(1)}" y="${y - 10}" width="20" height="20" class="hit"/></g>`;
        }
      }

      const dots = vids
        .filter((v) => dayOf(v.publishedAt) >= start)
        .map((v) => {
          const vx = x(dayOf(v.publishedAt)).toFixed(1);
          const p = perf.get(v.videoId);
          const tip = `${p?.verdict === "breakout" ? "🔥 " : p?.verdict === "under" ? "📉 " : ""}${v.title} · ${usDate(dayOf(v.publishedAt))}${
            v.views !== null ? ` · ${v.views.toLocaleString()} views` : ""
          }${perfNote(v.videoId)}`;
          // A breakout wears a gold halo; an underperformer a dashed one.
          const halo =
            p?.verdict === "breakout"
              ? `<circle cx="${vx}" cy="${y}" r="9.5" class="halo-up"/>`
              : p?.verdict === "under"
                ? `<circle cx="${vx}" cy="${y}" r="9" class="halo-down"/>`
                : "";
          return `<a href="${esc(safeUrl(v.url))}" target="_blank" rel="noreferrer" class="up" data-tip="${esc(tip)}">
            <circle cx="${vx}" cy="${y}" r="11" class="hit"/>${halo}
            <circle cx="${vx}" cy="${y}" r="5.5" fill="${colour}" class="ring"/></a>`;
        })
        .join("");

      const state = c ? PACE[c.state] : PACE.none;
      const status = ev !== null
        ? `<text x="${W - RIGHT + 12}" y="${y + 4}" class="lstate ${state.cls}">${state.icon} ${
            c?.state === "behind" ? `${c.behindBy}d` : c?.state === "on-pace" ? (c.daysSince === 0 ? "today" : `${c.daysSince}d`) : c?.state === "due" ? "today" : ""
          }</text>`
        : `<text x="${W - RIGHT + 12}" y="${y + 4}" class="lstate">${c?.daysSince == null ? "" : c.daysSince === 0 ? "today" : `${c.daysSince}d ago`}</text>`;
      void days;
      return `${label}${track}${segs}${wait}${dots}${status}`;
    })
    .join("");

  const ranges = [30, 90, 180]
    .map((r) => `<a class="tab${data.range === r ? " on" : ""}" href="${focus ? `${chanHref(focus.channel)}?range=${r}` : q(`&amp;range=${r}`)}">${r} days</a>`)
    .join("");

  const timeline = `<div class="panel uplanes">
    <div class="uphead">
      <h2>${focus ? (hasTarget ? `${cap(everyText(every))} · every upload and the gaps between` : "Every upload and the gaps between") : uniform ? `${cap(everyText(every))}, per channel${ownNote}` : hasTarget ? `Uploads per channel · ${targeted.map((n) => `${n.replace(/^Specular /, "")} ${everyText(everyOf(n)!)}`).join(" · ")}${ownNote}` : "Uploads per channel"}</h2>
      <div class="ulegend" aria-label="Legend">
        <span><i class="lg-dot"></i>Upload</span>
        ${hasTarget ? `<span><i class="lg-ok"></i>✓ Gap on pace${uniform ? ` (≤${every}d)` : ""}</span>
        <span><i class="lg-late"></i>! Gap over ${uniform ? `${every} day${every === 1 ? "" : "s"}` : "the channel's target"}</span>
        <span><i class="lg-due"></i>Next due</span>` : `<span><i class="lg-ok"></i>Gap between uploads</span>`}
        <span><i class="lg-up"></i>🔥 Breakout (≥2× usual)</span>
        <span><i class="lg-down"></i>📉 Under (≤½ usual)</span>
      </div>
      <div class="tabs">${ranges}</div>
    </div>
    <div class="upscroll"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img"
      aria-label="Uploads per ${esc(catLabel)} channel over the last ${data.range} days">
      ${grid.join("")}${lanes}</svg></div>
    <div class="uptip" hidden></div>
  </div>`;

  // ── the table — the same facts, readable without the chart
  const order: Record<PaceState, number> = { behind: 0, due: 1, "on-pace": 2, none: 3 };
  const rowsHtml = data.channels
    .map((name) => ({ name, c: cad.get(name), link: linkOf.get(name) }))
    .sort((a, b) => order[a.c?.state ?? "none"] - order[b.c?.state ?? "none"] || (b.c?.daysSince ?? -1) - (a.c?.daysSince ?? -1))
    .map(({ name, c, link }) => {
      const st = link?.youtubeId && c ? PACE[c.state] : PACE.none;
      const ch = channelColour(name);
      return `<tr>
        <td><a class="chlink" href="${chanHref(name)}"><span class="cdot" style="--ch:${ch}"></span>${esc(name)}</a>${pausedMark(name)}</td>
        <td>${everyOf(name) !== null ? `<span class="pace ${st.cls}">${st.icon} ${esc(st.label)}${c?.state === "behind" ? ` · ${c.behindBy}d` : ""}</span>` : c?.daysSince != null ? `${c.daysSince}d ago` : "—"}</td>
        <td>${c?.lastDay ? `${esc(usDate(c.lastDay))} <small>${esc(relativeDay(c.lastDay))}</small>` : "—"}</td>
        <td>${c?.nextDue ? `${esc(usDate(c.nextDue))} <small>${esc(relativeDay(c.nextDue))}</small>` : "—"}</td>
        <td class="num">${c?.streak ?? "—"}</td>
        <td class="num">${c ? c.uploads30 : "—"}</td>
        <td class="num">${c?.avgGap90 != null ? `${c.avgGap90.toFixed(1)}d` : "—"}</td>
        <td class="num">${c?.onTime90 != null ? `${Math.round(c.onTime90 * 100)}%` : "—"}</td>
        <td class="num">${(() => {
          const t = typical.get(name);
          return t ? `${esc(compactViews(Math.round(t.views)))} <small>${esc(t.basis)}</small>` : "—";
        })()}</td>
      </tr>`;
    })
    .join("");
  const table = `<div class="panel">
    <h2>${focus ? "Pace" : "By channel"}</h2>
    <div class="utable-wrap"><table class="utable">
      <thead><tr><th>Channel</th><th>Status</th><th>Last upload</th><th>Next due</th>
        <th class="num" title="On-time uploads in a row">Streak</th><th class="num">30 days</th>
        <th class="num">Avg gap · 90d</th><th class="num">On time · 90d</th><th class="num" title="Median views of the last twenty uploads">Typical views</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></div>
  </div>`;

  // ── latest uploads
  const latest = data.uploads
    .slice()
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 12)
    .map((u) => `<a class="ulatest" href="${esc(safeUrl(u.url))}" target="_blank" rel="noreferrer">
      <span class="cdot" style="--ch:${channelColour(u.channel)}"></span>
      <span class="ut">${esc(u.title)}${uploadScriptMark(u.title)}</span>
      <span class="uc">${esc(u.channel)}</span>
      <span class="ud">${esc(usDate(dayOf(u.publishedAt)))} · ${esc(relativeDay(dayOf(u.publishedAt)))}${u.views !== null ? ` · ${u.views.toLocaleString()} views` : ""}${verdictBadge(perf.get(u.videoId))}</span>
    </a>`)
    .join("");

  // ── breakouts and underperformers, last 30 days
  const since30 = now.getTime() - 30 * 86_400_000;
  const scored = data.uploads
    .filter((u) => u.publishedAt.getTime() >= since30 && perf.has(u.videoId))
    .map((u) => ({ u, p: perf.get(u.videoId)! }));
  const perfRow = ({ u, p }: { u: Upload; p: Performance }) => `<a class="prow" href="${esc(safeUrl(u.url))}" target="_blank" rel="noreferrer">
      <span class="pmult ${p.verdict}">${esc(formatMultiple(p.multiple))}</span>
      <span class="pbody"><span class="ut">${esc(u.title)}</span>
        <span class="pmeta"><span class="cdot" style="--ch:${channelColour(u.channel)}"></span>${esc(u.channel)} · ${esc(
          compactViews(p.value),
        )} ${esc(p.basis)} vs ${esc(compactViews(Math.round(p.baseline)))} usual</span></span>
    </a>`;
  const ups = scored.filter((x) => x.p.verdict === "breakout").sort((a, b) => b.p.multiple - a.p.multiple).slice(0, 8);
  const downs = scored.filter((x) => x.p.verdict === "under").sort((a, b) => a.p.multiple - b.p.multiple).slice(0, 8);
  const performers = linked.length
    ? `<div class="panel performers">
        <h2>Breakouts &amp; underperformers <span class="sub">last 30 days, against each channel's usual at the same age</span></h2>
        <div class="pcols">
          <div><h3>🔥 Breakouts <span>${ups.length}</span></h3>${ups.map(perfRow).join("") || `<p class="hint">None this month yet.</p>`}</div>
          <div><h3>📉 Underperforming <span>${downs.length}</span></h3>${downs.map(perfRow).join("") || `<p class="hint">None this month.</p>`}</div>
        </div>
        ${scored.length ? "" : `<p class="hint">Scores appear once a channel has three earlier videos to compare with at the same age — from the first read for videos two weeks and older, and within days for new ones as the hourly view snapshots build up.</p>`}
      </div>`
    : "";

  // ── the links
  const set = data.links.filter((l) => data.channels.includes(l.channel)).length;
  const links = `<details class="panel ulinks"${set ? "" : " open"}>
    <summary><h2>Channel links</h2><span class="sub">${set} of ${data.channels.length} set</span></summary>
    <p class="hint">Paste each ${esc(catLabel)} channel's YouTube link — its page, like youtube.com/@SpecularStudios, is
    enough. The board looks up the rest, reads every channel once an hour, and keeps every ${
      formatFor(category) === "short" ? "Short it sees — long-form videos don't count here" : "long-form upload it sees — Shorts don't count"
    }. ${
      data.hasKey
        ? "A YouTube API key is set, so each channel's full history comes in on its first read."
        : "Without a YouTube API key, each channel starts from its latest 15 uploads — and builds from there. Add a YouTube key in Settings → Connections & API keys to pull full history."
    }</p>
    <form method="post" action="/uploads/links" class="linkform">
      <input type="hidden" name="_cat" value="${category}">${focus ? `<input type="hidden" name="_ch" value="${esc(focus.channel)}">` : ""}
      ${data.channels
        .map((name) => {
          const l = linkOf.get(name);
          const note = !l
            ? ""
            : l.error
              ? `<span class="lstat err">! ${esc(l.error)}</span>`
              : l.youtubeId
                ? `<span class="lstat ok">✓ ${esc(l.title ?? "found")}</span>`
                : `<span class="lstat">waiting for the next read</span>`;
          return `<label class="linkrow"><span class="lname"><span class="cdot" style="--ch:${channelColour(name)}"></span>${esc(name)}</span>
            <input type="text" name="${esc(name)}" value="${esc(l?.input ?? "")}" placeholder="youtube.com/@…" autocomplete="off" spellcheck="false">
            ${note}</label>`;
        })
        .join("")}
      <button class="clear">Save and read now</button>
    </form>
  </details>`;

  const checked = data.links.map((l) => l.checkedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0);

  const focusLink = focus ? linkOf.get(focus.channel) : undefined;
  const header = focus
    ? `${pageHeader(
        focus.channel,
        `${channelPauseButton(shell, focus.channel)}<form method="post" action="/uploads/check" class="checknow"><input type="hidden" name="_cat" value="${category}"><input type="hidden" name="_ch" value="${esc(focus.channel)}"><button class="clear secondary">Read YouTube now</button></form>`,
      )}
      <nav class="catswitch chswitch" aria-label="${esc(catLabel)} channels">
        <a class="back" href="/uploads?cat=${category}">← All ${esc(catLabel)}</a>
        ${CHANNELS.filter((c) => c.category === category)
          .map((c) => `<a class="${c.name === focus.channel ? "on" : ""}" style="--c:${c.color};--on:${
            contrastRatio("#0B0B0D", c.color) >= contrastRatio("#FFFFFF", c.color) ? "#0B0B0D" : "#FFFFFF"
          }" href="${chanHref(c.name)}"${c.name === focus.channel ? ' aria-current="page"' : ""}${shell.pausedChannels?.[c.name] ? ' title="Paused"' : ""}><i class="round"></i>${esc(c.name.replace(/^Specular /, ""))}${shell.pausedChannels?.[c.name] ? " ⏸" : ""}</a>`)
          .join("")}
      </nav>
      <div class="usub">${channelPausedTag(shell, focus.channel)}<span class="cdot" style="--ch:${channelColour(focus.channel)}"></span>${esc(catLabel)} · ${esc(
        everyOf(focus.channel) !== null
          ? `${everyText(everyOf(focus.channel)!)}${isOwnPace(focus.channel) ? " — its own usual pace over 90 days" : ""}`
          : target.kind === "daily" ? `${describeTarget(category)}` : isOwnPace(focus.channel) ? "no target yet — held to its own usual pace once it has four uploads in 90 days" : "no target"
      )}${focusLink?.youtubeId ? ` · <a href="https://www.youtube.com/channel/${esc(focusLink.youtubeId)}" target="_blank" rel="noreferrer">${esc(focusLink.title ?? "on YouTube")} ↗</a>` : ""}${
        checked ? ` · read ${esc(timeAgo(new Date(checked)))}` : ""
      }</div>`
    : `${pageHeader(
        "Uploads",
        `<form method="post" action="/uploads/check" class="checknow"><input type="hidden" name="_cat" value="${category}"><button class="clear secondary">Read YouTube now</button></form>`,
      )}
    <nav class="catswitch" aria-label="Category">${UPLOAD_CATEGORIES.map(
      (c) => `<a class="${c.id === category ? "on" : ""}" style="--c:${c.color};--on:${
        contrastRatio("#0B0B0D", c.color) >= contrastRatio("#FFFFFF", c.color) ? "#0B0B0D" : "#FFFFFF"
      }" href="/uploads?cat=${c.id}"><i></i>${esc(c.label)}</a>`,
    ).join("")}</nav>
    <div class="usub">${esc(catLabel)} · ${esc(describeTarget(category))}${
      checked ? ` · read ${esc(timeAgo(new Date(checked)))}` : ""
    } · <span class="hint-inline">click a channel for its own page</span>${
      data.paused
        ? ` · <a class="upaused" href="/uploads/paused?cat=${category}&amp;show=${data.paused.shown ? "0" : "1"}" title="${esc(data.paused.names.join(", "))}">${
            data.paused.shown
              ? `⏸ Hide ${data.paused.names.length} paused`
              : `⏸ ${data.paused.names.length} paused channel${data.paused.names.length === 1 ? "" : "s"} hidden · show`
          }</a>`
        : ""
    }</div>`;

  return layout(
    focus ? focus.channel : "Uploads",
    shell,
    `${header}
    ${
      linked.length
        ? target.kind === "daily"
          ? `${dailyView(data.channels, linkOf, data.daily ?? [], data.range, typical, category, now, focus ? `${chanHref(focus.channel)}?` : undefined)}${
              data.shorts ? shortsPanel(data.channels, data.uploads, data.shorts.scores, data.shorts.health, data.shorts.slots, now) : performers
            }`
          : `<div class="utiles">${tiles}</div>${timeline}${focus ? "" : performers}${table}`
        : ""
    }
    ${focus && linked.length ? outlierPanel(focus, perf, data.shorts?.scores ?? null, typical.get(focus.channel) ?? null) : ""}
    ${focus && linked.length ? everyVideoPanel(focus, perf, data.shorts?.scores ?? null, now) : ""}
    ${focus?.lab ? channelLabPanel(focus) : ""}
    ${focus?.next ? gamingNextPanel(focus, now) : ""}
    ${focus?.series && linked.length ? seriesPanel(focus.series, { oneOffs: focus.all.length - focus.series.reduce((n, s) => n + s.episodes.length, 0), single: true }, now) : ""}
    ${!focus && data.series && linked.length ? seriesPanel(data.series.series, { oneOffs: data.series.oneOffs, single: false }, now) : ""}
    ${category === "stories" && !focus ? `<a class="labcta" href="/story-lab"><b>Story Lab</b><span>What to write next, with a part-by-part blueprint for each — learned from the Stories scripts →</span></a>` : ""}
    ${data.ideas ? ideasPanel(category, data.ideas, data.idea ?? null, data.channels, data.ideaChannel ?? null, data.hooks) : ""}
    ${latest && !focus ? `<div class="panel"><h2>Latest uploads</h2><div class="ulatest-list">${latest}</div></div>` : ""}
    ${links}
    <script>
    // Hover any upload, gap, day or Short for what it is — on every chart.
    document.querySelectorAll(".uptip").forEach(function (tip) {
      var box = tip.parentElement;
      box.addEventListener("mousemove", function (e) {
        var t = e.target.closest && e.target.closest("[data-tip]");
        if (!t) { tip.hidden = true; return; }
        tip.textContent = t.getAttribute("data-tip");
        tip.hidden = false;
        var r = box.getBoundingClientRect();
        var left = Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 8);
        tip.style.left = Math.max(8, left) + "px";
        tip.style.top = (e.clientY - r.top + 16) + "px";
      });
      box.addEventListener("mouseleave", function () { tip.hidden = true; });
    });
    </script>`,
  );
}
