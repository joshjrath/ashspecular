/**
 * The board, rendered on the server: the frame every page shares.
 *
 * No client framework and no build step: every page is one HTML document with
 * its own CSS. The thing being shown is a list of short records, and a list of
 * short records does not need a bundler.
 *
 * This file holds what every page uses — layout() with the sidebar and the
 * bell, the record row and its controls, the small widgets and icons, and the
 * login, error and What's new pages. Each page's own renderer lives in
 * pages/<page>.ts (finance, the Idea Feed and Competitors keep theirs in their
 * own folders), the CSS in styles.ts, and escaping in html.ts.
 *
 * The layout follows the agreed design: no columns to drag things between,
 * one spine per row — Title · Channel · Needs VO · Deadline — and colour
 * carried by category so a glance tells you which side of the business a row
 * belongs to.
 */
import { CATEGORIES, CHANNELS, channelInk } from "../catalog.js";
import { CSS } from "./styles.js";
import { FORMAT_BY_ID, formatOfTitle } from "./stories/formats.js";
import { GAP_HORIZON_DAYS, type UploadGap } from "./gaps.js";
import type { Notice, NoticeKind, StoredRecord } from "../db/records.js";
import { ORG_TZ, REVIEW_HOURS, TEAM_TZ, VO_BUFFER_DAYS, dateIn, daysUntil, relativeDay, renderIn, usDate } from "../parse/derive.js";
import type { Release } from "./changelog.js";
import type { StoredScript } from "../db/scripts.js";
import { corpus, learnsFrom, splitScript } from "./stories/corpus.js";
import { dayOf } from "./cadence.js";
import { esc, safeHref, safeUrl } from "./html.js";
import { everyFor } from "./targets.js";
import { scriptFor } from "./scriptindex.js";

export const COLOURS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color]),
);
export const LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

/** A channel's own colour, falling back to its category's for an unknown name. */
export function channelColour(name: string | null): string {
  const ch = CHANNELS.find((c) => c.name === name);
  return ch ? ch.color : "#8A8A93";
}

export function colourOf(category: string): string {
  return COLOURS[category] ?? "#8A8F98";
}

export interface Shell {
  /** Which sidebar entry is lit. */
  active: string;
  /** Upload slots in the next eight days with nothing assigned: a badge on Calendar, dashed slots on it. */
  gaps?: UploadGap[];
  /** Channels with production paused, and the day each was paused (YYYY-MM-DD). */
  pausedChannels?: Record<string, string>;
  counts: Record<string, number>;
  nav: { reviews: number; queue: number; recurring: number; calendar: number; behind?: number | null; vo?: number; forgotten?: number; tasks?: number; tasksUrgent?: number; financeAlerts?: number; ideas?: number; competitors?: number };
  lastIntake: Date | null;
  /** How many records are removed; the rail links to them when there are any. */
  removed?: number;
  /** How many are paused; the rail links to them when there are any. */
  paused?: number;
  /** Kept so the box still shows what was searched for. */
  query?: string;
  /** Set when SCRIPTS_URL is, so the rail shows a Scripts tab. */
  scripts?: boolean;
  /** Every day marked off, YYYY-MM-DD. */
  daysOff?: string[];
  /** Sidebar items switched off in Settings (RAIL_ITEMS keys). */
  railHide?: string[];
}

export function layout(title: string, shell: Shell | null, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Specular</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
<script>try{if(localStorage.getItem("rail")==="closed")document.documentElement.classList.add("rail-closed")}catch(e){}</script>
</head><body>${
    shell
      ? `<div class="shell">${sidebar(shell)}<main>${body}</main></div>`
      : `<main style="max-width:none">${body}</main>`
  }<script>
  // The sidebar button: remembered per browser. "[" does the same.
  function toggleRail() {
    var closed = document.documentElement.classList.toggle("rail-closed");
    try { localStorage.setItem("rail", closed ? "closed" : "open"); } catch (e) {}
    document.querySelectorAll(".railtoggle").forEach(function (b) {
      b.setAttribute("aria-label", closed ? "Show the sidebar" : "Hide the sidebar");
      b.setAttribute("title", (closed ? "Show the sidebar" : "Hide the sidebar") + " ( [ )");
    });
  }
  document.addEventListener("keydown", function (e) {
    var t = e.target && e.target.tagName;
    if (e.key === "[" && t !== "INPUT" && t !== "TEXTAREA" && !e.metaKey && !e.ctrlKey) toggleRail();
  });
  // Stay where you were. A form that reloads the page (✓, ▶, a switch, Save)
  // would otherwise land at the top: remember the scroll as it's sent, and
  // put it back when the same page comes back — unless the page was sent to
  // a named spot (#…), which wins. Forms that swap in place never navigate.
  (function () {
    var KEY = "keep-scroll";
    function keep() {
      try { sessionStorage.setItem(KEY, JSON.stringify({ path: location.pathname, y: window.scrollY, at: Date.now() })); } catch (err) {}
    }
    document.addEventListener("submit", function (e) { if (!e.defaultPrevented) keep(); });
    // A switch that submits itself (form.submit()) sends no submit event.
    var send = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () { keep(); return send.call(this); };
    var kept = null;
    try { kept = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY); } catch (err) {}
    if (!kept || kept.path !== location.pathname || location.hash || Date.now() - kept.at > 20000 || kept.y < 40) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    var put = function () { window.scrollTo(0, Math.min(kept.y, document.documentElement.scrollHeight - window.innerHeight)); };
    put();
    window.addEventListener("load", put);
  })();
  </script></body></html>`;
}

/**
 * Everything on the sidebar that Settings can switch off. Settings itself
 * can't be: it's the way back.
 */
export const RAIL_ITEMS: Array<{ key: string; label: string; group: "Pages" | "Categories" | "Also" }> = [
  { key: "dashboard", label: "Dashboard", group: "Pages" },
  { key: "network", label: "Network Overview", group: "Pages" },
  { key: "myday", label: "My Day", group: "Pages" },
  { key: "tasks", label: "Tasks", group: "Pages" },
  { key: "vo", label: "VO Queue", group: "Pages" },
  { key: "forgotten", label: "Forgotten", group: "Pages" },
  { key: "calendar", label: "Calendar", group: "Pages" },
  { key: "reviews", label: "Revisions", group: "Pages" },
  { key: "queue", label: "Queue", group: "Pages" },
  { key: "recurring", label: "Recurring", group: "Pages" },
  { key: "scripts", label: "Scripts", group: "Pages" },
  { key: "uploads", label: "Uploads", group: "Pages" },
  { key: "finance", label: "Finance", group: "Pages" },
  { key: "storylab", label: "Story Lab", group: "Pages" },
  { key: "ideas", label: "Idea Feed", group: "Pages" },
  { key: "competitors", label: "Competitors", group: "Pages" },
  ...CATEGORIES.map((c) => ({ key: `cat-${c.id}`, label: c.label, group: "Categories" as const })),
  { key: "search", label: "Search box", group: "Also" },
  { key: "live", label: "#intake · last message", group: "Also" },
  { key: "paused", label: "Paused", group: "Also" },
  { key: "removed", label: "Removed", group: "Also" },
  { key: "whatsnew", label: "What's new", group: "Also" },
];

const GEAR_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="2.6"/><path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8"/></svg>`;

function sidebar(s: Shell): string {
  const off = new Set(s.railHide ?? []);
  const item = (href: string, label: string, n: number | null, key: string) =>
    off.has(key)
      ? ""
      : `<a class="${s.active === key ? "on" : ""}" href="${href}">${esc(label)}${
          n === null ? "" : `<span class="n">${n}</span>`
        }</a>`;

  const cats = CATEGORIES.filter((c) => !off.has(`cat-${c.id}`))
    .map(
      (c) => `<a class="cat" style="--c:${c.color}" href="/category/${c.id}">
      <span class="dot"></span>${esc(c.label)}<span class="n">${s.counts[c.id] ?? 0}</span>
    </a>`,
    )
    .join("");

  // "Live" is only honest if it says when, so it says when.
  const ago = s.lastIntake ? timeAgo(s.lastIntake) : "nothing yet";

  return `<aside><div class="inner">
    <a class="mark" href="/">Specular</a>
    ${
      off.has("search")
        ? ""
        : `<form class="search" method="get" action="/search" role="search">
      <input type="search" name="q" placeholder="Search…" value="${esc(s.query ?? "")}"
        aria-label="Search everything">
    </form>`
    }
    <nav>
      ${item("/", "Dashboard", null, "dashboard")}
      ${item("/network", "Network Overview", null, "network")}
      ${item("/my-day", "My Day", null, "myday")}
      ${
        off.has("tasks")
          ? ""
          : `<a class="${s.active === "tasks" ? "on" : ""}" href="/tasks">Tasks${
              s.nav.tasksUrgent ? `<span class="sideflag" title="${s.nav.tasksUrgent} urgent or late">${s.nav.tasksUrgent}</span>` : ""
            }${s.nav.tasks ? `<span class="n">${s.nav.tasks}</span>` : ""}</a>`
      }
      ${item("/vo", "VO Queue", s.nav.vo ?? null, "vo")}
      ${
        off.has("forgotten")
          ? ""
          : `<a class="${s.active === "forgotten" ? "on" : ""}" href="/forgotten">Forgotten${
              s.nav.forgotten ? `<span class="sideflag" title="${s.nav.forgotten} thing${s.nav.forgotten === 1 ? "" : "s"} slipping through the cracks">${s.nav.forgotten}</span>` : ""
            }</a>`
      }
      ${
        off.has("calendar")
          ? ""
          : `<a class="${s.active === "calendar" ? "on" : ""}" href="/calendar">Calendar${
              s.gaps?.length ? `<span class="gapbadge" title="${s.gaps.length} expected upload${s.gaps.length === 1 ? "" : "s"} in the next 8 days with nothing assigned">${s.gaps.length}</span>` : ""
            }<span class="n">${s.nav.calendar}</span></a>`
      }
      ${item("/revisions", "Revisions", s.nav.reviews, "reviews")}
      ${item("/queue", "Queue", s.nav.queue, "queue")}
      ${item("/recurring", "Recurring", s.nav.recurring, "recurring")}
      ${s.scripts ? item("/scripts", "Scripts", null, "scripts") : ""}
      ${item("/uploads", "Uploads", s.nav.behind ?? null, "uploads")}
      ${item("/story-lab", "Story Lab", null, "storylab")}
      ${item("/ideas", "Idea Feed", s.nav.ideas ?? null, "ideas")}
      ${item("/competitors", "Competitors", s.nav.competitors ?? null, "competitors")}
      ${
        off.has("finance")
          ? ""
          : `<a class="${s.active === "finance" ? "on" : ""}" href="/finance">Finance${
              s.nav.financeAlerts ? `<span class="sideflag" title="${s.nav.financeAlerts} sustainability alert${s.nav.financeAlerts === 1 ? "" : "s"}">${s.nav.financeAlerts}</span>` : ""
            }</a>`
      }
    </nav>
    ${cats ? `<h3>Categories</h3>\n    <div class="cats">${cats}</div>` : ""}
    ${off.has("live") ? "" : `<div class="live"><span class="pulse"></span>#intake · ${esc(ago)}</div>`}
    ${
      (s.paused || Object.keys(s.pausedChannels ?? {}).length) && !off.has("paused")
        ? `<a class="removed-link paused-link${s.active === "paused" ? " on" : ""}" href="/paused">Paused · ${s.paused ?? 0}${
            Object.keys(s.pausedChannels ?? {}).length ? ` · ${Object.keys(s.pausedChannels ?? {}).length} channel${Object.keys(s.pausedChannels ?? {}).length === 1 ? "" : "s"}` : ""
          }</a>`
        : ""
    }
    ${
      s.removed && !off.has("removed")
        ? `<a class="removed-link${s.active === "removed" ? " on" : ""}" href="/removed">Removed · ${s.removed}</a>`
        : ""
    }
    ${off.has("whatsnew") ? "" : `<a class="removed-link${s.active === "whatsnew" ? " on" : ""}" href="/whats-new">What's new</a>`}
    <a class="settings-link${s.active === "settings" ? " on" : ""}" href="/settings">${GEAR_ICON}Settings</a>
  </div></aside>`;
}

export function timeAgo(at: Date): string {
  const mins = Math.round((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function pageHeader(title: string, extra = ""): string {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TZ, weekday: "long", day: "numeric", month: "long",
  }).format(now);
  return `<header class="page">
    <button class="railtoggle" type="button" onclick="toggleRail()"
      aria-label="Hide or show the sidebar" title="Hide or show the sidebar ( [ )">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <rect x="2.5" y="3.5" width="15" height="13" rx="3"/><path d="M7.5 3.5v13"/>
      </svg>
    </button>
    <h1>${esc(title)}</h1>
    <span class="when">${esc(day)} · ${esc(renderIn(now, ORG_TZ, "ET").split("@")[1]?.trim() ?? "")}</span>
    ${extra}
  </header>`;
}

/** A record's name as the bell and desktop alerts show it. */
export function noticeTitle(r: StoredRecord): string {
  return displayTitle(r);
}

const BELL_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8.5a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12.5 5 8.5z"/><path d="M8.3 16.5a1.9 1.9 0 0 0 3.4 0"/></svg>`;

/**
 * The dashboard's bell: revisions that have come in and work past its time,
 * newest first. The badge counts what arrived since you last opened it.
 * Opening it marks everything read. "Desktop alerts" asks the browser for
 * permission, then the open dashboard checks every minute and pops a system
 * notification for anything new.
 */
/** Each kind of notification: its filter label, its icon and its colour. */
const NOTICE_KINDS: Array<{ kind: NoticeKind; label: string; colour: string; icon: string }> = [
  {
    kind: "revision", label: "Revisions", colour: "#5B6CF0",
    icon: `<path d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z"/><path d="M8.5 7.5v5l4-2.5z" fill="currentColor"/>`,
  },
  {
    kind: "overdue", label: "Overdue", colour: "#E5534B",
    icon: `<path d="M10 3.2 17.4 16H2.6z"/><path d="M10 8v3.6"/><circle cx="10" cy="13.9" r=".6" fill="currentColor"/>`,
  },
  {
    kind: "upcoming", label: "Due soon", colour: "#D9822B",
    icon: `<circle cx="10" cy="10" r="6.8"/><path d="M10 6.2V10l2.6 1.8"/>`,
  },
  {
    kind: "airing", label: "Airing", colour: "#2F9E6A",
    icon: `<rect x="3" y="6.5" width="14" height="9.5" rx="2"/><path d="m7 3.5 3 3 3-3"/>`,
  },
  {
    kind: "new", label: "New", colour: "#A35BC4",
    icon: `<path d="M5 3.5h6.5L15 7v9.5H5z"/><path d="M10 9.5v4.5M7.8 11.8h4.4"/>`,
  },
  {
    kind: "dayoff", label: "Day off", colour: "#2AA9D8",
    icon: `<path d="M15.2 12.6A6.2 6.2 0 0 1 7.4 4.8a6.2 6.2 0 1 0 7.8 7.8z"/>`,
  },
  {
    kind: "missed", label: "Not posted", colour: "#F08C3A",
    icon: `<rect x="3.5" y="4.5" width="13" height="12" rx="2"/><path d="M3.5 8.5h13M7 3v3M13 3v3"/><path d="m8 11 4 3M12 11l-4 3"/>`,
  },
  {
    kind: "gap", label: "Nothing assigned", colour: "#E2574C",
    icon: `<rect x="3.5" y="4.5" width="13" height="12" rx="2" stroke-dasharray="2.2 1.8"/><path d="M3.5 8.5h13M7 3v3M13 3v3"/><path d="M10 10.8v2.4"/><circle cx="10" cy="15" r=".5" fill="currentColor"/>`,
  },
  {
    kind: "network", label: "Network", colour: "#4FB3BF",
    icon: `<path d="M3.5 15.5 7.5 10l3 3 6-8"/><path d="M13 5h3.5v3.5"/>`,
  },
  {
    kind: "update", label: "What's new", colour: "#E8C547",
    icon: `<path d="m10 3.2 2 4.3 4.6.5-3.4 3.1 1 4.6L10 13.4l-4.2 2.3 1-4.6L3.4 8l4.6-.5z"/>`,
  },
];

const noticeIcon = (kind: NoticeKind) => {
  const k = NOTICE_KINDS.find((n) => n.kind === kind)!;
  return `<span class="ico" style="--nc:${k.colour}"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${k.icon}</svg></span>`;
};

/**
 * The dashboard's bell. Five kinds, each with its own icon and colour, and a
 * filter row to see one kind at a time. The badge counts what arrived since
 * you last opened it; opening it marks everything read. "Desktop alerts"
 * asks the browser for permission, then an open dashboard checks every minute
 * and pops a system notification for anything new.
 */
export function bell(notices: Notice[], seen: number): string {
  const unread = notices.filter((n) => n.at.getTime() > seen).length;
  const what = (n: Notice): string => {
    if (n.kind === "update") return `What's new · ${n.release.changes.length} change${n.release.changes.length === 1 ? "" : "s"}`;
    if (n.kind === "gap") return `Expected ${esc(relativeDay(n.gap.date))} · ${esc(n.gap.channel)}`;
    if (n.kind === "network") return `Network Overview${n.alert.channel ? ` · ${esc(n.alert.channel)}` : ""}`;
    const r = n.record;
    switch (n.kind) {
      case "revision": return `Revision ready${r.version ? ` · v${r.version}` : ""}`;
      case "overdue": return `Overdue · was due ${esc(renderIn(n.at, ORG_TZ, "ET"))}`;
      case "upcoming": {
        const due = r.voDue ?? r.deadline ?? r.scriptDue;
        return `Due ${due ? esc(renderIn(due, ORG_TZ, "ET")) : "soon"}`;
      }
      case "airing": return `Airs ${esc(relativeDay(r.airDate!))} · ${esc(usDate(r.airDate!))}`;
      case "new": return `New ${esc(r.stage ?? "assignment")}${r.code ? ` · ${esc(r.code)}` : ""}`;
      case "missed":
        return n.missed
          ? `Not posted ${esc(usDate(n.missed.day))} · pushed to ${esc(usDate(n.missed.pushedTo))}${n.missed.moved ? ` with ${n.missed.moved} more` : ""}`
          : "Not posted";
      case "dayoff": {
        const due = r.voDue ?? r.deadline ?? r.scriptDue;
        return `Day off ${esc(usDate(dayOf(r.offFrom ?? n.at)))} · now due ${due ? esc(renderIn(due, ORG_TZ, "ET")) : "the day before"}`;
      }
    }
  };
  const items = notices
    .map((n) => {
      const isNew = n.at.getTime() > seen;
      if (n.kind === "gap") {
        return `<a class="notice gap${isNew ? " new-item" : ""}" data-kind="gap" href="/day/${n.gap.date}">
        ${noticeIcon("gap")}
        <span class="body">
          <span class="nt">Nothing assigned for ${esc(usDate(n.gap.date))}</span>
          <span class="ns">${what(n)}</span>
        </span>
        <span class="ago">${esc(n.gap.inDays === 0 ? "today" : `${n.gap.inDays}d`)}</span>
      </a>`;
      }
      if (n.kind === "network") {
        return `<a class="notice network${isNew ? " new-item" : ""}" data-kind="network" href="${esc(safeHref(n.alert.href ?? "") || "/network")}">
        ${noticeIcon("network")}
        <span class="body">
          <span class="nt">${esc(n.alert.text)}</span>
          <span class="ns">${what(n)}</span>
        </span>
        <span class="ago">${esc(timeAgo(n.at))}</span>
      </a>`;
      }
      if (n.kind === "update") {
        return `<a class="notice update${isNew ? " new-item" : ""}" data-kind="update" href="/whats-new#${esc(n.release.id)}">
        ${noticeIcon("update")}
        <span class="body">
          <span class="nt">${esc(n.release.title)}</span>
          <span class="ns">${what(n)}</span>
        </span>
        <span class="ago">${esc(timeAgo(n.at))}</span>
      </a>`;
      }
      const r = n.record;
      return `<a class="notice ${n.kind}${isNew ? " new-item" : ""}" data-kind="${n.kind}" href="/r/${r.id}">
        ${noticeIcon(n.kind)}
        <span class="body">
          <span class="nt">${esc(displayTitle(r))}</span>
          <span class="ns">${what(n)}${r.channel ? ` · ${esc(r.channel)}` : ""}</span>
        </span>
        <span class="ago">${esc(n.kind === "airing" ? "" : timeAgo(n.at))}</span>
      </a>`;
    })
    .join("");

  const counts = new Map<string, number>();
  for (const n of notices) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  const filters = `<div class="nfilters" role="tablist" aria-label="Show">
    <button type="button" class="nf on" data-f="all" style="--nc:var(--ink)">All<span>${notices.length}</span></button>
    ${NOTICE_KINDS.map(
      (k) => `<button type="button" class="nf" data-f="${k.kind}" style="--nc:${k.colour}"${
        counts.get(k.kind) ? "" : " disabled"
      }><i></i>${k.label}<span>${counts.get(k.kind) ?? 0}</span></button>`,
    ).join("")}
  </div>`;

  return `<div class="bellwrap">
    <button class="bell" type="button" id="bell" aria-haspopup="true" aria-expanded="false"
      aria-label="Notifications${unread ? `, ${unread} new` : ""}" title="Notifications">
      ${BELL_ICON}<span class="badge" id="bellcount"${unread ? "" : " hidden"}>${unread > 9 ? "9+" : unread}</span>
    </button>
    <div class="notices" id="notices" hidden>
      <div class="nhead">
        <b>Notifications</b>
        <button type="button" class="alerts" id="alerts">Desktop alerts</button>
      </div>
      ${filters}
      <div class="nlist">${items || `<div class="nempty">Nothing yet. Revisions, deadlines, air dates and what's new on the board show up here.</div>`}</div>
      <div class="nempty nfiltered" hidden>Nothing of this kind right now.</div>
    </div>
  </div>
  <script>
  (function () {
    var bell = document.getElementById("bell"), panel = document.getElementById("notices");
    var count = document.getElementById("bellcount"), alerts = document.getElementById("alerts");
    function markRead() {
      document.cookie = "notices_seen=" + Date.now() + "; path=/; max-age=31536000; samesite=lax";
      count.hidden = true;
    }
    bell.addEventListener("click", function (e) {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      bell.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) markRead();
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target)) { panel.hidden = true; bell.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") panel.hidden = true; });

    // One kind at a time, remembered in this browser.
    function filter(f) {
      var shown = 0;
      panel.querySelectorAll(".nf").forEach(function (b) { b.classList.toggle("on", b.dataset.f === f); });
      panel.querySelectorAll(".notice").forEach(function (n) {
        var show = f === "all" || n.dataset.kind === f;
        n.hidden = !show;
        if (show) shown += 1;
      });
      panel.querySelector(".nfiltered").hidden = shown > 0 || !panel.querySelector(".notice");
      try { localStorage.setItem("noticeFilter", f); } catch (x) {}
    }
    panel.querySelectorAll(".nf").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); filter(b.dataset.f); });
    });
    try {
      var saved = localStorage.getItem("noticeFilter");
      var btn = saved && panel.querySelector('.nf[data-f="' + saved + '"]');
      if (btn && !btn.disabled) filter(saved);
    } catch (x) {}

    // Desktop alerts: remembered per browser, and only for what arrives after
    // they were turned on, so switching them on never fires a backlog.
    var canAlert = "Notification" in window;
    function on() {
      try { return canAlert && Notification.permission === "granted" && localStorage.getItem("alerts") === "on"; } catch (e) { return false; }
    }
    function label() {
      alerts.textContent = !canAlert ? "Alerts not supported" : on() ? "Desktop alerts: on" : "Desktop alerts: off";
      alerts.classList.toggle("on", on());
    }
    label();
    alerts.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!canAlert) return;
      if (on()) { try { localStorage.setItem("alerts", "off"); } catch (x) {} label(); return; }
      Notification.requestPermission().then(function (p) {
        if (p === "granted") {
          try { localStorage.setItem("alerts", "on"); localStorage.setItem("alertedTo", String(Date.now())); } catch (x) {}
        }
        label();
      });
    });

    function poll() {
      fetch("/notifications.json", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          if (panel.hidden) {
            count.hidden = data.unread === 0;
            count.textContent = data.unread > 9 ? "9+" : String(data.unread);
          }
          if (!on()) return;
          var since = 0;
          try { since = Number(localStorage.getItem("alertedTo")) || Date.now(); } catch (x) {}
          var now = Date.now(), fresh = data.items.filter(function (n) { return n.at > since && n.at <= now; });
          fresh.slice(0, 5).forEach(function (n) {
            var heads = { revision: "Revision ready", overdue: "Overdue", upcoming: "Due soon", airing: "Airing soon", "new": "New assignment", dayoff: "Day off — due earlier", gap: "Nothing assigned", update: "What's new on the board" };
            var note = new Notification(heads[n.kind] || "Specular", {
              body: n.title + (n.channel ? " — " + n.channel : ""), tag: n.kind + ":" + n.id,
            });
            note.onclick = function () { window.focus(); location.href = n.href || "/r/" + n.id; };
          });
          try { localStorage.setItem("alertedTo", String(now)); } catch (x) {}
        })
        .catch(function () {});
    }
    setInterval(poll, 60000);
  })();
  </script>`;
}

/** Where the date is already the column — a calendar cell, a day card. */
export function titleOnDay(r: StoredRecord): string {
  // A batch given its own title (a Specular Movie from Story Lab) shows it.
  if (r.batchNo && r.channel && r.title && r.title !== r.channel) return r.title;
  return r.batchNo && r.channel ? r.channel : displayTitle(r);
}

/**
 * A row with no title of its own shows its own first line, not the parser's
 * note about it — "need 2 more before 6" is what you wrote and what you will
 * recognise; "Filed by the channel name only" is bookkeeping.
 */
export function displayTitle(r: StoredRecord): string {
  // A recurring batch is its channel and its day, and nothing else.
  if (r.batchNo && r.channel && r.title && r.title !== r.channel) return r.title;
  if (r.batchNo && r.channel) return r.airDate ? `${r.channel} · ${usDate(r.airDate)}` : r.channel;
  if (r.title) return r.title;
  const firstLine = r.raw.split("\n").map((l) => l.trim()).find(Boolean);
  // A bare link says nothing the link chip beside it doesn't already say.
  if (firstLine && /^https?:\/\/\S+$/.test(firstLine)) {
    return r.kind === "review" ? "Unnamed revision" : "Link";
  }
  if (firstLine) return firstLine.length > 90 ? `${firstLine.slice(0, 88)}…` : firstLine;
  return r.note ?? "(untitled)";
}

/**
 * A task as one compact row: what it is on top, whose it is and when it airs
 * underneath, and a single deadline pill on the right. Stage, word count and
 * the second time zone live on the record's own page (and in the pill's
 * tooltip) — on a list they were only taking up room.
 */
export function row(r: StoredRecord): string {
  const c = colourOf(r.category);
  // A batch is its channel; the deadline pill already says which day.
  const title = r.batchNo && r.channel ? r.channel : displayTitle(r);

  const meta: string[] = [];
  const sm = scriptMark(r);
  if (sm) meta.push(sm);
  if (r.code) meta.push(`<span class="code">${esc(r.code)}</span>`);
  if (r.channel && !r.batchNo) {
    meta.push(
      `<a class="chan" style="--ch:${channelColour(r.channel)};--ink:${channelInk(channelColour(r.channel))}" href="/channel/${encodeURIComponent(r.channel)}"><i></i>${esc(r.channel)}</a>`,
    );
  } else if (!r.channel) {
    meta.push(`<span class="pill">${esc(LABELS[r.category] ?? "unsorted")}</span>`);
  }
  if (r.airDate && !r.batchNo) meta.push(airs(r));
  if (r.batchNo) {
    const target = r.batchTarget ?? 1;
    meta.push(`<span class="count">${r.status === "done" ? target : r.batchDone}/${target} uploaded</span>`);
  }
  for (const l of r.links) {
    const label = l.kind === "frameio" ? `Frame.io${r.version ? ` v${r.version}` : ""}` : l.label || l.kind;
    meta.push(
      `<a class="lnk ${esc(l.kind)}" href="${esc(safeUrl(l.url))}" target="_blank" rel="noreferrer" title="${esc(l.label || l.url)}">${esc(label)}</a>`,
    );
  }
  // A revision is a link to watch; there's nothing about it to double-check.
  if (r.confidence < 0.7 && r.kind !== "review") meta.push(`<span class="warn">needs a look</span>`);
  if (typeof r.reviewScore === "number") meta.unshift(`<a class="revscore" href="/r/${r.id}#summary" style="--sc:${revColour(r.reviewScore)}" title="The cut's score, from its notes">${esc(fmtScore(r.reviewScore))}/10</a>`);
  if (r.uploadedAt) meta.unshift(`<span class="uploaded-tag" title="Marked ${esc(usDate(dayOf(r.uploadedAt)))}">Uploaded</span>`);
  if (r.noScriptAt && r.status === "open") meta.unshift(`<span class="noscript-tag" title="Marked ${esc(usDate(dayOf(r.noScriptAt)))}">No script · waiting</span>`);
  if (r.pausedAt) meta.unshift(`<span class="paused-tag" title="Paused ${esc(usDate(dayOf(r.pausedAt)))}">Paused</span>`);
  if (r.offFrom && r.status === "open" && !r.pausedAt) meta.unshift(offTag(r));
  // A revision says so first: it's a cut to review, not a video to voice.
  if (r.kind === "review") meta.unshift(`<span class="rev-tag">${REV_ICON}Revision${r.version ? ` v${r.version}` : ""}</span>`);

  return `<div class="row${r.kind === "review" ? " revision" : ""}${r.status === "done" ? " cleared" : ""}${r.uploadedAt ? " uploaded" : ""}${r.pinnedAt ? " pinned" : ""}${r.noScriptAt && r.status === "open" ? " noscript" : ""}${r.pausedAt ? " paused" : ""}" style="--c:${c}">
    <div class="title"><span class="swatch"></span><a href="/r/${r.id}" title="${esc(displayTitle(r))}">${
      r.batchNo && r.channel ? `<i class="chdot" style="--ch:${channelColour(r.channel)}"></i>` : ""
    }${esc(title)}</a>${pinControl(r)}</div>
    <div class="meta">${meta.join("")}</div>
    ${duePill(r)}
    ${actions(r)}
  </div>`;
}

/** A play mark, as the bell's revisions wear it. */
export const REV_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L9.8 6z" fill="currentColor"/></svg>`;

const MOON_ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M15.2 12.6A6.2 6.2 0 0 1 7.4 4.8a6.2 6.2 0 1 0 7.8 7.8z"/></svg>`;

const weekdayOf = (day: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** "Day off 9/28 · due Sun 9/27": a deadline a day off brought forward. */
export function offTag(r: StoredRecord): string {
  const at = r.voDue ?? r.deadline ?? r.scriptDue;
  if (!r.offFrom || !at) return "";
  const was = dayOf(r.offFrom);
  const now = dayOf(at);
  return `<span class="off-tag" title="${esc(`Due ${renderIn(r.offFrom, ORG_TZ, "ET")}, a day off — so it's due the working day before`)}">${MOON_ICON}Day off ${esc(usDate(was).replace(/\/\d{4}$/, ""))} · due ${esc(weekdayOf(now))} ${esc(usDate(now).replace(/\/\d{4}$/, ""))}</span>`;
}

/**
 * The switch on a calendar day: mark it off, or make it a working day again.
 * Only today and later can be marked; a past day off can still be cleared.
 */
export function offToggle(day: string, off: boolean): string {
  if (!off && day < dateIn(ORG_TZ)) return "";
  const label = off
    ? `${usDate(day)} is a day off — make it a working day again`
    : `Mark ${usDate(day)} as a day off: nothing can be due that day`;
  return `<form class="offbtn${off ? " on" : ""}" method="post" action="/days-off/${day}">
    <input type="hidden" name="on" value="${off ? "0" : "1"}">
    <button aria-label="${esc(label)}" title="${esc(label)}">${MOON_ICON}${off ? "<span>Day off</span>" : ""}</button>
  </form>`;
}

/**
 * The dashboard's days off: each one coming up, what it moved and to when,
 * and a date box to add another.
 */
/**
 * Nothing assigned: each upload a channel is expected to make in the next
 * eight days with no video on that day. A chip opens the day to fill it.
 */
/** × on a "Nothing assigned" chip or slot: the channel isn't posting then after all. */
export function gapDismiss(channel: string, days: string[], label: string): string {
  return `<form method="post" action="/gaps/dismiss" class="gapx"><input type="hidden" name="channel" value="${esc(channel)}"><input type="hidden" name="days" value="${esc(days.join(","))}"><button aria-label="${esc(label)}" title="${esc(label)} — it won't ask again">×</button></form>`;
}

/**
 * The next video to assign: whichever channel runs out of lined-up videos
 * first, however far ahead, and the day its next upload would be if nothing
 * is added. Always on the dashboard; add a video on that channel (or move
 * its schedule) and the next channel to run out takes its place.
 */
export function nextAssignStrip(list: UploadGap[]): string {
  const first = list[0];
  if (!first) return "";
  const when = (g: UploadGap) => `${weekdayOf(g.date)} ${usDate(g.date).replace(/\/\d{4}$/, "")}`;
  const inText = first.inDays === 0 ? "today" : first.inDays === 1 ? "tomorrow" : `in ${first.inDays} days`;
  const every = everyFor(first.channel);
  const then = list.slice(1, 5);
  return `<section class="nextassign${first.inDays <= GAP_HORIZON_DAYS ? " soon" : ""}" style="--ch:${channelColour(first.channel)}" aria-label="Next video to assign">
    <div class="nalead">
      <span class="nalbl">Next to assign</span>
      <a class="nach" href="/day/${first.date}" title="Open ${esc(usDate(first.date))} on the calendar"><i></i>${esc(first.channel)}</a>
      <span class="nawhen">next upload <b>${esc(when(first))}</b> · ${esc(inText)}</span>
      <span class="nasub">its last lined-up video is ${esc(usDate(first.after))}${every ? ` · one every ${every} day${every === 1 ? "" : "s"}` : ""}</span>
    </div>
    ${
      then.length
        ? `<div class="nathen"><span>Then</span>${then
            .map((g) => `<a href="/day/${g.date}" style="--ch:${channelColour(g.channel)}" title="${esc(`${g.channel}: next upload ${usDate(g.date)}, last lined up ${usDate(g.after)}`)}"><i></i>${esc(g.channel.replace(/^Specular /, ""))} <b>${esc(when(g))}</b></a>`)
            .join("")}</div>`
        : ""
    }
  </section>`;
}

export function gapStrip(gaps: UploadGap[]): string {
  if (!gaps.length) return "";
  // One chip a channel, soonest first, naming each empty day.
  const byChannel = new Map<string, UploadGap[]>();
  for (const g of gaps) byChannel.set(g.channel, [...(byChannel.get(g.channel) ?? []), g]);
  const when = (g: UploadGap) => (g.inDays === 0 ? "today" : g.inDays === 1 ? "tomorrow" : `${weekdayOf(g.date)} ${usDate(g.date).replace(/\/\d{4}$/, "")}`);
  const items = [...byChannel]
    .map(([channel, list]) => `<span class="gapchip${list[0]!.inDays <= 2 ? " soon" : ""}" style="--ch:${channelColour(channel)}">
        <a href="/day/${list[0]!.date}" title="Last video ${esc(usDate(list[0]!.after))} · one every ${esc(String(everyFor(channel) ?? ""))} days"><i></i><b>${esc(channel.replace(/^Specular /, ""))}</b> <span class="first">${esc(when(list[0]!))}</span>${
          list.length > 1 ? `<span>· ${list.slice(1).map((g) => esc(when(g))).join(" · ")}</span>` : ""
        }</a>${gapDismiss(channel, list.map((g) => g.date), list.length > 1 ? `Clear these ${list.length} days for ${channel}` : `Clear ${channel} on ${usDate(list[0]!.date)}`)}</span>`)
    .join("");
  return `<div class="gapstrip" role="alert">
      <span class="lbl"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="12" rx="2" stroke-dasharray="2.2 1.8"/><path d="M10 9v3.4"/><circle cx="10" cy="14.6" r=".5" fill="currentColor"/></svg>Nothing assigned <b class="gapn">${gaps.length}</b></span>
      <span class="gapsub">expected uploads in the next 8 days with no video on the day · ${byChannel.size} channel${byChannel.size === 1 ? "" : "s"}</span>
      <div class="gapchips">${items}</div>
    </div>`;
}

export function daysOffStrip(days: string[], shifted: StoredRecord[]): string {
  const today = dateIn(ORG_TZ);
  const ahead = days.filter((d) => d >= today).slice(0, 8);
  const byDay = new Map<string, StoredRecord[]>();
  for (const r of shifted) {
    if (!r.offFrom) continue;
    const d = dayOf(r.offFrom);
    byDay.set(d, [...(byDay.get(d) ?? []), r]);
  }
  const items = ahead
    .map((d) => {
      const list = byDay.get(d) ?? [];
      const first = list[0];
      const to = first ? first.voDue ?? first.deadline ?? first.scriptDue : null;
      const names = list.slice(0, 3).map((r) => r.code ?? displayTitle(r)).join(", ") + (list.length > 3 ? ` +${list.length - 3}` : "");
      return `<li class="offday${d === today ? " now" : ""}">
        <b>${d === today ? "Today" : esc(weekdayOf(d))} ${esc(usDate(d))}</b>
        <span>${
          list.length && to
            ? `${list.length} deadline${list.length === 1 ? "" : "s"} now due ${esc(weekdayOf(dayOf(to)))} ${esc(usDate(dayOf(to)))} — ${esc(names)}`
            : "nothing was due"
        }</span>
        <form method="post" action="/days-off/${d}"><input type="hidden" name="on" value="0">
          <button class="x" aria-label="Make ${esc(usDate(d))} a working day again" title="Make it a working day again">×</button></form>
      </li>`;
    })
    .join("");
  return `<div class="offstrip${ahead[0] === today ? " today" : ""}">
    <span class="lbl">${MOON_ICON}Days off</span>
    ${items ? `<ul>${items}</ul>` : `<span class="none">None coming up. A deadline on a day off is due the working day before.</span>`}
    <form class="offadd" method="post" action="/days-off">
      <input type="date" name="date" min="${today}" required aria-label="A day off">
      <button>Add</button>
    </form>
  </div>`;
}

/**
 * The deadline as one pill: "VO 9/17/2026 · 11:59 PM", red with how late it
 * is once it has passed, amber inside a day. The tooltip carries the rest —
 * the IST time, and whether the VO time was worked out from the air date.
 */
function duePill(r: StoredRecord): string {
  const at = r.voDue ?? r.deadline ?? r.scriptDue;
  // Paused: no deadline anywhere until it's resumed.
  if (r.pausedAt)
    return `<span class="due paused" title="${esc(at ? `Was due ${renderIn(at, ORG_TZ, "ET")} — back when it's resumed` : "No deadline")}"><b>Paused</b>no deadline</span>`;
  if (!at) return `<span class="due none">no deadline</span>`;
  const label = r.kind === "review" ? "Review" : r.voDue ? "VO" : r.deadline ? "Due" : "Script";
  const ms = at.getTime() - Date.now();
  // A daily batch is never late: its day is its day, and tomorrow brings its own.
  const open = r.status === "open" && !(r.batchNo && ms < 0);
  const state = !open ? "" : ms < 0 ? " late" : ms < 86_400_000 ? " soon" : "";
  const span = (n: number) => {
    const h = Math.round(Math.abs(n) / 3_600_000);
    return h < 1 ? "<1h" : h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
  };
  const tail = !open ? "" : ms < 0 ? `<em>${span(ms)} late</em>` : ms < 86_400_000 ? `<em>in ${span(ms)}</em>` : "";
  const [date, time] = renderIn(at, ORG_TZ, "ET").split(" @ ");
  const tip = [
    `${label} ${renderIn(at, ORG_TZ, "ET")}`,
    renderIn(at, TEAM_TZ, "IST"),
    r.voDue && r.voSource === "calculated" ? `set ${VO_BUFFER_DAYS} days before air` : "",
    r.kind === "review" && r.deadline && Math.abs(r.deadline.getTime() - r.createdAt.getTime() - REVIEW_HOURS * 3_600_000) < 60_000
      ? `${REVIEW_HOURS} hours after it came in`
      : "",
    r.offFrom ? `was ${renderIn(r.offFrom, ORG_TZ, "ET")}, a day off` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<span class="due${state}" title="${esc(tip)}"><b>${label}</b>${esc(date ?? "")}<span class="tm">${esc(
    (time ?? "").replace(/ ET$/, ""),
  )}</span>${tail}</span>`;
}

/**
 * The buttons at the end of a row, one tap each from wherever you are looking.
 *
 * ✓ clears, and counts toward "cleared this week". × removes, and counts
 * toward nothing — it is for things that were never real work, like a
 * duplicate or a message filed by mistake. A removed row gets a single ↺ to
 * put it back.
 */
/**
 * The pin. Pinned, a row carries a yellow "Pinned" tab that is itself the
 * unpin button, and sits at the top of its category. Unpinned, it is a quiet
 * icon beside the title that shows itself when you point at the row.
 */
export function pinControl(r: StoredRecord): string {
  if (r.status === "removed") return "";
  const on = Boolean(r.pinnedAt);
  return `<form class="pinform" method="post" action="/r/${r.id}/${on ? "unpin" : "pin"}">
    <button class="${on ? "pinned-tag" : "pin-ghost"}" aria-label="${on ? "Unpin" : "Pin to the top of its category"}"
      title="${on ? "Unpin" : "Pin to the top of its category"}">${PIN_ICON}${on ? "<span>Pinned</span>" : ""}</button>
  </form>`;
}

/** Pinned first — newest pin on top — and everything else in its order. */
export function pinnedFirst(list: StoredRecord[]): StoredRecord[] {
  const pinned = list
    .filter((r) => r.pinnedAt)
    .sort((a, b) => b.pinnedAt!.getTime() - a.pinnedAt!.getTime());
  return pinned.length ? [...pinned, ...list.filter((r) => !r.pinnedAt)] : list;
}

const PIN_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 1.75h5l-.75 4.5 2.5 2.5v1.25h-8.5V8.75l2.5-2.5z" fill="currentColor"/><path d="M8 10v4.25" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

export const PAUSE_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2" width="2.4" height="8" rx=".8" fill="currentColor"/><rect x="7.1" y="2" width="2.4" height="8" rx=".8" fill="currentColor"/></svg>`;
const SUM_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2.5h8M2 5h8M2 7.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="m8.6 7.2.5 1.1 1.2.1-.9.8.3 1.2-1.1-.6-1 .6.2-1.2-.9-.8 1.2-.1z" fill="currentColor"/></svg>`;
export const UPLOAD_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 8.2V2.3M3.4 4.7 6 2.1l2.6 2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.3 8.6v1.3h7.4V8.6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const PLAY_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3.5 2.2v7.6L9.6 6z" fill="currentColor"/></svg>`;
export const NOSCRIPT_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5h4.2L9.5 3.8v6.7H3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.2 4v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6.2" cy="8.6" r=".75" fill="currentColor"/></svg>`;

/**
 * Pause production on a whole channel, or resume it: off every deadline, the
 * late list, the calendar and the bell; no new daily batches. Everything
 * else about the channel stays where it is.
 */
export function channelPauseButton(shell: Shell, channel: string, size: "full" | "compact" = "full"): string {
  const since = shell.pausedChannels?.[channel];
  const label = since ? "Resume channel" : "Pause channel";
  const tip = since
    ? `Paused since ${usDate(since)} — resume and its work comes back with its deadlines`
    : "Pause production: its work comes off every deadline, the calendar and the bell, and no new daily batches open";
  return `<form method="post" action="/channels/${since ? "resume" : "pause"}" class="chpause${size === "compact" ? " compact" : ""}"${
    since ? "" : ` onsubmit="return confirm('Pause ${esc(channel.replace(/'/g, ""))}? Its open work comes off every deadline until you resume it.')"`
  }><input type="hidden" name="channel" value="${esc(channel)}"><button class="clear secondary${since ? " on" : ""}" title="${esc(tip)}">${since ? PLAY_ICON : PAUSE_ICON}<span>${label}</span></button></form>`;
}

/** A small "Paused" mark beside a paused channel's name. */
export function channelPausedTag(shell: Shell, channel: string): string {
  const since = shell.pausedChannels?.[channel];
  return since ? `<span class="chpausetag" title="Production paused since ${esc(usDate(since))}">${PAUSE_ICON}Paused</span>` : "";
}

/**
 * Whether a video has its script somewhere — attached on its page, in Story
 * Lab, or delivered on the Scripts tab. Green with a link when it has; a
 * dashed grey mark when nothing's found. Batches and revisions have no script.
 */
export const SCRIPT_ICON = `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5h4.2L9.5 3.8v6.7H3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M4.6 5.6h3.2M4.6 7.4h3.2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;
export function scriptMark(r: StoredRecord, iconOnly = false): string {
  if (r.batchNo || r.kind === "review") return "";
  const hit = scriptFor({ id: r.id, code: r.code, title: r.title });
  if (hit) {
    return `<a class="scriptmark has${iconOnly ? " icon" : ""}" href="${esc(safeHref(hit.href))}"${hit.href.startsWith("http") ? ' target="_blank" rel="noreferrer"' : ""} title="Script: ${esc(hit.where.join(" · "))}">${SCRIPT_ICON}${iconOnly ? "" : "Script"}</a>`;
  }
  // "No script · waiting" already says it louder.
  if (r.noScriptAt && r.status === "open") return "";
  return `<span class="scriptmark none${iconOnly ? " icon" : ""}" title="No script found — not attached, not in Story Lab, not delivered on the Scripts tab">${SCRIPT_ICON}${iconOnly ? "" : "Script"}</span>`;
}

/** An upload's script, when there is one: a small green mark beside its title. */
export function uploadScriptMark(title: string): string {
  const hit = scriptFor({ title });
  return hit ? `<span class="scriptmark has icon" title="Script: ${esc(hit.where.join(" · "))}">${SCRIPT_ICON}</span>` : "";
}

/** A revision score out of 10 as a colour: red at 5 or below, green at 8 and up. */
export const revColour = (n: number) => (n >= 8 ? "#3CCB84" : n > 5 ? "#E8C547" : "#E5534B");
export const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * A card's buttons: ✓ clear and × remove on top; below them ⏸ pause (off
 * every deadline until resumed) and the no-script mark (the VO is needed but
 * the script hasn't been sent — the whole card turns magenta until it has).
 */
export function actions(r: StoredRecord): string {
  const button = (action: string, label: string, glyph: string, cls = "", on = false) =>
    `<form class="tick${cls ? ` ${cls}` : ""}" method="post" action="/r/${r.id}/${action}">
      <button aria-label="${label}" title="${label}"${on ? ' class="on"' : ""}>${glyph}</button>
    </form>`;

  if (r.status === "removed") return `<div class="acts">${button("open", "Restore", "↺", "restore")}</div>`;

  const revision = r.kind === "review";
  const top = `${r.status === "done" ? button("open", "Reopen", "✓", "", true) : button("done", revision ? "Reviewed — clear it" : "Clear", "✓")}
    ${button("remove", "Remove — doesn't count as cleared", "×", "remove")}`;
  // Uploaded: live on the channel. Green on the calendar; a revision has nothing to upload.
  const upload = revision
    ? ""
    : r.uploadedAt
      ? button("notuploaded", "Uploaded — take the mark off", UPLOAD_ICON, "uploaded", true)
      : button("uploaded", "Uploaded — it's live on the channel", UPLOAD_ICON, "uploaded");
  if (r.status === "done") return `<div class="acts">${top}${upload}</div>`;
  const pause = r.pausedAt
    ? button("resume", "Resume — its deadline comes back", PLAY_ICON, "resume", true)
    : button("pause", "Pause — off every deadline, late list and the calendar until resumed", PAUSE_ICON, "pause");
  // A daily batch has no script to wait on, and neither does a revision.
  const noScript = r.batchNo || revision
    ? ""
    : r.noScriptAt
      ? button("script", "Script arrived — clear the no-script mark", NOSCRIPT_ICON, "noscript", true)
      : button("noscript", "No script — the VO is needed but the script hasn't been sent", NOSCRIPT_ICON, "noscript");
  // A revision's notes, summed up and scored.
  const summarize = revision
    ? `<a class="tick sumlink" href="/r/${r.id}#summary" aria-label="Summarize the notes" title="Summarize the notes and score the cut">${SUM_ICON}</a>`
    : "";
  return `<div class="acts">${top}${pause}${noScript}${upload}${summarize}</div>`;
}

/**
 * "airs 9/28/2026 · in 3 days". The countdown is computed on every page load,
 * so it is always today's answer — and it turns warm inside three days.
 */
function airs(r: StoredRecord): string {
  if (!r.airDate) return "";
  const n = daysUntil(r.airDate);
  const soon = r.status === "open" && n >= 0 && n <= 3;
  return `<span class="airs${soon ? " soon" : ""}">airs ${esc(usDate(r.airDate))} · ${esc(
    relativeDay(r.airDate),
  )}</span>`;
}


export function rows(list: StoredRecord[], emptyText: string): string {
  if (!list.length) return `<div class="empty">${esc(emptyText)}</div>`;
  return `<div class="rows">${list.map(row).join("")}</div>`;
}

/**
 * One kept script: how long, how it splits, where it came from, whether
 * Story Lab learns from it, the text itself, and what can be done with it.
 */
export function scriptCard(sc: StoredScript, colour: string, from = ""): string {
  const sections = splitScript(sc.body, sc.title);
  const parts = sections.filter((x) => x.name.startsWith("PART")).length;
  const inLab = corpus().some((c) => c.board?.id === sc.id);
  const status = inLab
    ? `<span class="learn">Story Lab learns from it · read as ${esc(FORMAT_BY_ID.get(formatOfTitle(sc.title))?.name ?? "a script")}</span>`
    : learnsFrom(sc)
      ? `<span class="learn no">Too short for Story Lab to learn from — it needs 150 words or more</span>`
      : `<span class="learn no">Kept with the video · its opening feeds the Uploads idea hooks</span>`;
  const shown = sections.length
    ? sections
        .map((x) => `<h4>${esc(x.name)}${x.label ? ` — ${esc(x.label)}` : ""}</h4>${x.paras.map((p) => `<p>${esc(p)}</p>`).join("")}`)
        .join("")
    : `<p>${esc(sc.body)}</p>`;
  return `<div class="scard" style="--c:${colour}">
      <div class="st">${esc(sc.title)}</div>
      <div class="sm">${sc.words.toLocaleString("en-US")} words · ${parts ? `${parts} part${parts === 1 ? "" : "s"}` : "no PART headers"}${
        safeUrl(sc.url) ? ` · <a href="${esc(safeUrl(sc.url))}" target="_blank" rel="noreferrer">Google Doc</a>` : " · pasted"
      } · added ${esc(usDate(dayOf(sc.addedAt)))}${sc.updatedAt.getTime() - sc.addedAt.getTime() > 60_000 ? `, re-read ${esc(usDate(dayOf(sc.updatedAt)))}` : ""}${from}</div>
      ${status}
      <details><summary>Read it</summary><div class="scripttext">${shown}</div></details>
      <div class="sacts">
        ${inLab ? `<form method="post" action="/story-lab/check#check"><input type="hidden" name="title" value="${esc(sc.title)}"><input type="hidden" name="script" value="${esc(sc.body)}"><button class="clear secondary">Check its structure</button></form>` : ""}
        ${sc.url ? `<form method="post" action="/scripts/${sc.id}/refresh"><button class="clear secondary" title="Read the doc again for its latest draft">Re-read the doc</button></form>` : ""}
        <form method="post" action="/scripts/${sc.id}/remove" onsubmit="return confirm('Remove this script? Story Lab stops learning from it.')"><button class="clear secondary">Remove</button></form>
      </div>
    </div>`;
}

/** Paste a script, or give its Google Doc link. */
export function scriptForm(action: string, opts: { title?: boolean; url?: string; again?: boolean }): string {
  return `<form class="sform" method="post" action="${action}" style="padding:0">
      ${opts.title ? `<input type="text" name="title" placeholder="Its video title — e.g. What If Gojo Was In Invincible?" autocomplete="off" required>` : ""}
      <textarea name="text" rows="6" placeholder="Paste the script, with its INTRO / PART 1 / … / OUTRO headers"></textarea>
      <div class="or">or</div>
      <input type="text" name="url" value="${esc(opts.url ?? "")}" placeholder="Its Google Doc link — shared as “Anyone with the link can view”" autocomplete="off">
      <button class="clear">${opts.again ? "Add another draft" : "Add the script"}</button>
    </form>`;
}

export function renderLogin(error = "", note = ""): string {
  return layout(
    "Sign in",
    null,
    `<div class="login">
      <h1>Specular</h1>
      <p>Everything the studio has going out.</p>
      <form method="post" action="/login">
        ${error ? `<div class="err">${esc(error)}</div>` : ""}
        ${note ? `<div class="note" role="status">${esc(note)}</div>` : ""}
        <input type="password" name="password" placeholder="Password" autofocus>
        <button type="submit">Sign in</button>
      </form>
    </div>`,
  );
}

/** A page that failed or isn't there, said plainly with the way back. Nothing internal is shown. */
export function renderError(status: number, message = ""): string {
  const missing = status === 404;
  return layout(
    missing ? "Not found" : "Something went wrong",
    null,
    `<div class="empty" style="padding:40px 22px;line-height:1.7">
      <strong style="color:var(--text)">${missing ? "That page isn't here." : message ? esc(message) : "Something went wrong on the board."}</strong><br>
      ${missing || message ? "" : "It's been logged. Try again, or "}<a href="/">Back to the dashboard</a>
    </div>`,
  );
}

export function renderEmptyState(): string {
  return layout(
    "Not connected",
    null,
    `<div class="empty" style="padding:40px 22px;line-height:1.7">
      <strong style="color:var(--text)">No database connected.</strong><br>
      The board needs <code>DATABASE_URL</code>. Add a Postgres service in
      Railway and the bot will start filing what it parses.
    </div>`,
  );
}

/** A lift as a signed percentage: 1.23 → "+23%", 0.8 → "−20%". */
export function liftText(lift: number): string {
  const pct = Math.round((lift - 1) * 100);
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct)}%`;
}

/** What's new: every change to the board, newest first, as its notification summed it up. */
export function renderWhatsNew(shell: Shell, releases: Array<Release & { at: Date | null }>): string {
  const k = NOTICE_KINDS.find((n) => n.kind === "update")!;
  const items = releases
    .map(
      (r) => `<section class="panel release" id="${esc(r.id)}" style="--nc:${k.colour}">
      <div class="relhead">${noticeIcon("update")}<div><h2>${esc(r.title)}</h2>
        <div class="reldate">${r.at ? `${esc(usDate(dayOf(r.at)))} · ${esc(timeAgo(r.at))}` : "not live yet"}</div></div></div>
      <ul class="relchanges">${r.changes
        .map((c) => `<li>${esc(c.text)}${c.href ? ` <a href="${esc(c.href)}">Open →</a>` : ""}</li>`)
        .join("")}</ul>
    </section>`,
    )
    .join("");
  return layout(
    "What's new",
    shell,
    `${pageHeader("What's new")}
    <p class="labsub">Every change to the board, newest first. Each one also arrives in the bell as its own kind of notification, <b>What's new</b>.</p>
    ${items}`,
  );
}

/** 40 → "40m", 130 → "2h 10m". */
export function fmtMin(m: number): string {
  const n = Math.max(0, Math.round(m));
  if (n < 60) return `${n}m`;
  return `${Math.floor(n / 60)}h${n % 60 ? ` ${String(n % 60).padStart(2, "0")}m` : ""}`;
}

/** One tooltip for every element with data-tip ("title|line|line"). */
export const TIP_SCRIPT = `<div class="ftip" id="ftip" hidden></div><script>
(function () {
  var tip = document.getElementById("ftip");
  if (!tip) return;
  function show(e) {
    var t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) { tip.hidden = true; return; }
    var parts = t.getAttribute("data-tip").split("|");
    tip.innerHTML = "";
    parts.forEach(function (p, i) { var d = document.createElement(i ? "div" : "b"); d.textContent = p; tip.appendChild(d); });
    tip.hidden = false;
    var x = e.clientX + 14, y = e.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  document.addEventListener("mousemove", show);
  document.addEventListener("touchstart", function (e) { if (e.touches[0]) show({ target: e.target, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }, { passive: true });
})();
</script>`;

/** A round step for a chart axis: 1, 2 or 5 of a power of ten. */
export function niceStep(raw: number): number {
  if (raw <= 0) return 10000;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}
