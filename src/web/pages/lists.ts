/**
 * Plain lists of records — search, a channel, a category, the queue, late,
 * removed, paused — and how they sort.
 */
import { CHANNELS } from "../../catalog.js";
import { type Shell, channelColour, channelPauseButton, displayTitle, layout, pageHeader, pinnedFirst, rows } from "../page.js";
import type { StoredRecord } from "../../db/records.js";
import { esc } from "../html.js";
import { usDate } from "../../parse/derive.js";

export function renderList(
  shell: Shell,
  title: string,
  subtitle: string,
  list: StoredRecord[],
  sort?: SortState,
  /** Beside the title: a channel page's Pause channel button. */
  headerExtra = "",
  /** Above the list: a paused channel says so. */
  lead = "",
): string {
  const shown = sort ? sortRecords(list, sort.key, sort.dir) : list;
  return layout(
    title,
    shell,
    `${pageHeader(title, headerExtra)}${lead}${list.length > 1 ? sortBar(sort) : ""}${rows(shown, subtitle)}`,
  );
}

/** A category page leads with its channels, then its open work. */
export function renderCategory(
  shell: Shell,
  label: string,
  id: string,
  list: StoredRecord[],
  channels: Record<string, number>,
  sort?: SortState,
): string {
  const chans = CHANNELS.filter((c) => c.category === id);
  const chips = chans.length
    ? `<div class="chanlist" style="margin-bottom:18px">${chans
        .map(
          (ch) =>
            `<a href="/channel/${encodeURIComponent(ch.name)}" style="--c:${ch.color}">
              <span class="dot"></span>${esc(ch.name)}<span class="n">${channels[ch.name] ?? 0}</span></a>`,
        )
        .join("")}</div>`
    : "";

  return layout(
    label,
    shell,
    `${pageHeader(label)}${chips}${list.length > 1 ? sortBar(sort) : ""}${rows(
      sort ? sortRecords(list, sort.key, sort.dir) : list,
      `Nothing open in ${label}.`,
    )}`,
  );
}


// ── sorting lists ───────────────────────────────────────────────────────────

export type SortKey = "air" | "code" | "due" | "channel" | "title" | "filed";
export type SortDir = "asc" | "desc";

export const SORTS: Array<{ key: SortKey; label: string; defaultDir: SortDir }> = [
  { key: "air", label: "Air date", defaultDir: "asc" },
  { key: "code", label: "Video #", defaultDir: "asc" },
  { key: "due", label: "Deadline", defaultDir: "asc" },
  { key: "channel", label: "Channel", defaultDir: "asc" },
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "filed", label: "Newest", defaultDir: "desc" },
];

/** "VIDEO-011" → ["VIDEO", 11], so VIDEO-9 sorts before VIDEO-10. */
function codeParts(code: string | null): [string, number] | null {
  const m = code?.match(/^([A-Z]+)-?(\d+)$/i);
  return m ? [m[1]!.toUpperCase(), Number(m[2])] : null;
}

/**
 * Sort a list by one key. Records without that value — no air date, no code —
 * always go to the bottom whichever way it runs, so flipping the direction
 * reorders the real values instead of burying them under the blanks.
 */
export function sortRecords(list: StoredRecord[], key: SortKey, dir: SortDir): StoredRecord[] {
  const sign = dir === "asc" ? 1 : -1;
  const due = (r: StoredRecord) => (r.voDue ?? r.deadline ?? r.scriptDue)?.getTime() ?? null;

  const value = (r: StoredRecord): string | number | [string, number] | null => {
    switch (key) {
      case "air": return r.airDate;
      case "code": return codeParts(r.code);
      case "due": return due(r);
      case "channel": return r.channel?.toLowerCase() ?? null;
      case "title": return displayTitle(r).toLowerCase();
      case "filed": return r.createdAt.getTime();
    }
  };

  const cmp = (a: unknown, b: unknown): number => {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a[0] === b[0] ? (a[1] as number) - (b[1] as number) : String(a[0]).localeCompare(String(b[0]));
    }
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "en", { numeric: true });
  };

  return pinnedFirst([...list].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (a === null && b === null) return y.createdAt.getTime() - x.createdAt.getTime();
    if (a === null) return 1;
    if (b === null) return -1;
    const c = cmp(a, b) * sign;
    // Ties fall back to the air date, then the newest filed.
    if (c !== 0) return c;
    if (key !== "air" && x.airDate && y.airDate && x.airDate !== y.airDate) return x.airDate < y.airDate ? -1 : 1;
    return y.createdAt.getTime() - x.createdAt.getTime();
  }));
}

export interface SortState {
  key: SortKey;
  dir: SortDir;
  /** The page's own path and query, ending in ? or &, for the sort links. */
  base: string;
}

/** The pills above a list. The active one shows its direction; pressing it again reverses. */
export function sortBar(sort: SortState | undefined): string {
  if (!sort) return "";
  const pills = SORTS.map((o) => {
    const on = o.key === sort.key;
    const dir = on ? (sort.dir === "asc" ? "desc" : "asc") : o.defaultDir;
    const arrow = on ? (sort.dir === "asc" ? " ↑" : " ↓") : "";
    return `<a class="sortpill${on ? " on" : ""}" href="${esc(sort.base)}sort=${o.key}&amp;dir=${dir}"
      aria-pressed="${on}">${esc(o.label)}${arrow}</a>`;
  }).join("");
  return `<div class="sortbar"><span class="sortlabel">Sort</span>${pills}</div>`;
}

/** Everything paused — out of the workflow with no deadline — and the way back. */
export function renderPaused(shell: Shell, list: StoredRecord[]): string {
  const chans = Object.entries(shell.pausedChannels ?? {});
  const chanPanel = chans.length
    ? `<div class="panel pchans"><h2>Paused channels</h2>
        <p class="hint" style="padding:0">Production is paused on these: their work is here with the rest, off every deadline, and no daily batches open. Resume one and its work comes back as it was.</p>
        <div class="pchanlist">${chans
          .map(([name, since]) => `<div class="pchan" style="--ch:${channelColour(name)}"><i></i><a href="/channel/${encodeURIComponent(name)}">${esc(name)}</a><span>since ${esc(usDate(since))}</span>${channelPauseButton(shell, name, "compact")}</div>`)
          .join("")}</div></div>`
    : "";
  return layout(
    "Paused",
    shell,
    `${pageHeader("Paused")}${chanPanel}
    <p class="labsub">Paused videos have no deadline anywhere: they're off late, due today, the calendar, the
      dashboard columns, the bell and the reminders. Resume one (▶) and its deadline comes back as it was —
      if that date has passed, change it on its page.</p>
    ${rows(list, "Nothing paused.")}`,
  );
}
