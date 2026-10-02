/**
 * What every page of the board needs before it renders: the sidebar's
 * counts (shell), Ash's open work with its time tracked (loadWork), the
 * upload gaps, and the bell's notices. Each page's route calls shell() and
 * gets the same numbers as every other page.
 *
 * A few answers are kept briefly (the gaps for a minute, each Gaming
 * channel's pace for ten); forgetGaps() and forgetPaces() drop them when
 * something they depend on changes.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { CHANNELS, isLongFormRecurring } from "../catalog.js";
import { type CalendarMode, type GapNotice, type Notice, type StoredRecord, calendarRange, categoryCounts, channelAirDays, doneToday, getRecord as getRecordById, lastIntake, listDaysOff, listNotices, listReviews, openBatchCount, openByCategory, openWork, pausedCount, removedCount, revisionKeys } from "../db/records.js";
import { GAP_HORIZON_DAYS, type UploadGap, nextToAssign, uploadGaps } from "./gaps.js";
import { dateIn, ORG_TZ, shiftDate } from "../parse/derive.js";
import type { Shell } from "./page.js";
import type { TimerState } from "./pages/mywork.js";
import { type WorkItem, forgottenWork, isVo, itemKey, setEstimates, taskItem, toItem } from "./work.js";
import { dayOf, daysBetween, usualGap } from "./cadence.js";
import { boardScripts, corpus } from "./stories/corpus.js";
import { config, hasDatabase } from "../config.js";
import { dismissedGaps, pausedChannels } from "../db/channels.js";
import { everyFor, ownPaceChannels, setOwnPaces } from "./targets.js";
import { fetchScriptReport } from "./scriptcheck.js";
import { financeAlerts } from "./finance/routes.js";
import { getTask, openTasks, tasksDoneToday } from "../db/tasks.js";
import { latestUploads, listChannelLinks, listUploads } from "../jobs/youtube.js";
import { listMissed } from "../jobs/postcheck.js";
import { minutesSpent, runningTimer, taskMinutesSpent, untrackedKeys } from "../db/timers.js";
import { monthOf } from "./pages/calendar.js";
import { readEstimates } from "../db/estimates.js";
import { releaseNotices } from "./changelog.js";
import { scoresFor } from "../db/revisions.js";
import { scriptFor, setScriptIndex } from "./scriptindex.js";
import { shortsDay } from "../jobs/batches.js";
import { strongUnseen } from "../db/ideas.js";
import { unseenAlerts } from "../db/competitors.js";

/**
 * The request's cookies, for code deep in a page (the sidebar's switched-off
 * items) without handing the request down through every route.
 */
export const requestCookies = new AsyncLocalStorage<Record<string, string | undefined>>();

/** A cookie that lists ids with dots, as the dashboard's own do. */
export function cookieList(name: string): string[] {
  const raw = requestCookies.getStore()?.[name] ?? "";
  return raw === "none" ? [] : raw.split(".").filter(Boolean);
}

/**
 * The sidebar's numbers, fetched once per request. Every page carries them, so
 * the counts can never disagree between one page and the next.
 */
/**
 * Where every video's script is: attached on the board, in Story Lab, or
 * delivered on the Scripts tab. Refreshed with each page (the Scripts tab is
 * cached a minute), so every card can say.
 */
async function refreshScriptIndex(): Promise<void> {
  const report = config.scriptsUrl ? await fetchScriptReport().catch(() => null) : null;
  setScriptIndex({
    attached: boardScripts().map((b) => ({ recordId: b.recordId, title: b.title })),
    lab: corpus().filter((c) => !c.board),
    delivered: report?.rows ?? [],
  });
}

/**
 * Ash's work, with the time tracked on each piece: everything open that's
 * hers, what she cleared today, the timer running, and the forgotten-work
 * checks. Shared by My Day, the VO Queue, recording mode, Forgotten and the
 * sidebar's counts.
 */
/** The time estimates from Settings, into the work model, before anything counts time. */
async function refreshEstimates(): Promise<void> {
  if (!hasDatabase) return;
  setEstimates(await readEstimates());
}

export async function loadWork(now = new Date()) {
  await refreshEstimates().catch((err) => console.error("[estimates] couldn't read them:", err));
  const [open, done, running, revs, paused, tasks, tasksDone] = await Promise.all([
    openWork(),
    doneToday(),
    runningTimer(),
    revisionKeys(),
    pausedChannels().catch(() => new Map<string, Date>()),
    openTasks().catch(() => []),
    tasksDoneToday(ORG_TZ).catch(() => []),
  ]);
  const [spent, taskSpent, untracked] = await Promise.all([
    minutesSpent([...open, ...done].map((r) => r.id)),
    taskMinutesSpent([...tasks, ...tasksDone].map((t) => t.id)).catch(() => new Map<number, number>()),
    untrackedKeys().catch(() => new Set<string>()),
  ]);
  // Tasks from #tasks sit alongside the production work, timed the same way.
  const items = open
    .map((r) => toItem(r, spent.get(r.id) ?? 0))
    .filter((i): i is WorkItem => i !== null)
    .concat(tasks.map((t) => taskItem(t, now, taskSpent.get(t.id) ?? 0)));
  const doneItems = done
    .map((r) => toItem(r, spent.get(r.id) ?? 0))
    .filter((i): i is WorkItem => i !== null)
    .concat(tasksDone.map((t) => taskItem(t, now, taskSpent.get(t.id) ?? 0)))
    .map((i) => (untracked.has(itemKey(i) ?? "") ? { ...i, untracked: true } : i));
  const norm = (t: string) => t.toLowerCase().replace(/\bv(?:er|ersion)?\.?\s*\d{1,2}\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const forgotten = forgottenWork(open, now, {
    script: (r) => Boolean(scriptFor({ id: r.id, code: r.code, title: r.title })),
    revision: (r) => Boolean((r.code && revs.codes.has(r.code.toUpperCase())) || (r.title && revs.titles.has(norm(r.title)))),
  });
  let timer: TimerState | null = null;
  if (running?.taskId) {
    const t = tasks.find((x) => x.id === running.taskId) ?? (await getTask(running.taskId));
    const item = t ? taskItem(t, now, 0) : null;
    const before = (taskSpent.get(running.taskId) ?? 0) - (now.getTime() - running.startedAt.getTime()) / 60_000;
    timer = { recordId: null, taskId: running.taskId, startedAt: running.startedAt, title: t?.title ?? "Task", est: item?.est ?? 0, spentBefore: Math.max(0, before) };
  } else if (running) {
    const rec = running.recordId ? (open.find((r) => r.id === running.recordId) ?? (await getRecordById(running.recordId))) : null;
    const item = rec ? toItem(rec, 0) : null;
    const before = running.recordId ? (spent.get(running.recordId) ?? 0) - (now.getTime() - running.startedAt.getTime()) / 60_000 : 0;
    timer = { recordId: running.recordId, startedAt: running.startedAt, title: item?.title ?? rec?.title ?? "Work", est: item?.est ?? 0, spentBefore: Math.max(0, before) };
  }
  return { open, items, doneItems, timer, forgotten, paused, tasks };
}

export async function shell(active: string): Promise<Shell> {
  await refreshScriptIndex().catch((err) => console.error("[scripts] index failed:", err));
  const work = hasDatabase ? await loadWork().catch((err) => (console.error("[my day] couldn't load the work for the sidebar:", err), null)) : null;
  const [counts, reviews, grouped, at, month, removed, batchesOpen, behind, paused, daysOff, gaps, chPaused] = await Promise.all([
    categoryCounts(),
    listReviews(200),
    openByCategory(),
    lastIntake(),
    monthEntries(monthOf()),
    removedCount(),
    openBatchCount(shortsDay()),
    behindCount().catch(() => null),
    pausedCount(),
    listDaysOff(),
    currentGaps().catch(() => []),
    hasDatabase ? pausedChannels().catch(() => new Map<string, Date>()) : Promise.resolve(new Map<string, Date>()),
  ]);
  const queue = [...grouped.values()].reduce((n, list) => n + list.length, 0);
  return {
    active,
    gaps,
    pausedChannels: Object.fromEntries([...chPaused].map(([c, at]) => [c, dateIn(ORG_TZ, at)])),
    counts,
    nav: {
      reviews: reviews.length,
      queue,
      recurring: batchesOpen,
      calendar: month.length,
      behind,
      vo: work ? work.items.filter((i) => isVo(i.type)).length : undefined,
      forgotten: work ? work.forgotten.length + gaps.length : undefined,
      tasks: work ? work.tasks.length : undefined,
      financeAlerts: hasDatabase ? (await financeAlerts().catch(() => [])).length || undefined : undefined,
      // Strong Bits ideas from the last three days nobody has decided on yet.
      ideas: hasDatabase ? (await strongUnseen().catch(() => 0)) || undefined : undefined,
      // Competitor alerts from the last week not seen yet.
      competitors: hasDatabase ? (await unseenAlerts().catch(() => 0)) || undefined : undefined,
      tasksUrgent: work ? work.tasks.filter((t) => t.priority === "urgent" || (t.due && t.due.getTime() < Date.now())).length : undefined,
    },
    lastIntake: at,
    removed,
    paused,
    daysOff,
    railHide: cookieList("rail_hide"),
    scripts: Boolean(config.scriptsUrl || config.scriptsUrlRaw),
  };
}

/**
 * Each Gaming channel's own usual gap, read from its uploads — what everyFor
 * holds it to. Read again at most every ten minutes.
 */
let ownPaces: { at: number; read: Promise<void> } | null = null;
export function refreshOwnPaces(): Promise<void> {
  if (!hasDatabase || !ownPaceChannels().length) return Promise.resolve();
  // Everyone asking at once waits on the same read, so none sees the paces unread.
  if (ownPaces && Date.now() - ownPaces.at < 600_000) return ownPaces.read;
  const now = new Date();
  const read = listUploads(new Date(now.getTime() - 100 * 86_400_000)).then(
    (uploads) => setOwnPaces(new Map(ownPaceChannels().map((name) => [name, usualGap(uploads.filter((u) => u.channel === name).map((u) => u.publishedAt), now)] as const))),
    (err) => {
      ownPaces = null;
      console.error("[uploads] couldn't read the Gaming channels' pace:", err);
    },
  );
  ownPaces = { at: now.getTime(), read };
  return read;
}

/** The channels changed (renamed, added): read every Gaming channel's pace again next time. */
export function forgetPaces(): void {
  ownPaces = null;
}

/**
 * How many linked channels are past their pace — for the rail: Stories every
 * four days, Specular one a day, each Gaming channel its own usual gap.
 * Channels with no long-form target (the daily Shorts, Specular Sleep) sit out.
 */
async function behindCount(): Promise<number | null> {
  await refreshOwnPaces();
  const [links, latest, paused] = await Promise.all([listChannelLinks(), latestUploads(), pausedChannels().catch(() => new Map<string, Date>())]);
  // A paused channel isn't behind: it isn't meant to be posting.
  const linked = links.filter((l) => l.youtubeId && !paused.has(l.channel) && everyFor(l.channel) !== null);
  if (!linked.length) return null;
  const today = dateIn(ORG_TZ);
  return linked.filter((l) => {
    const last = latest.get(l.channel);
    return !last || daysBetween(dayOf(last), today) > everyFor(l.channel)!;
  }).length;
}

/** Whole-month bounds for a YYYY-MM, as the calendar's inclusive range. */
function monthBounds(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0, 12)).toISOString().slice(0, 10);
  return [`${ym}-01`, last];
}

function monthEntries(ym: string, mode: CalendarMode = "posting") {
  const [from, to] = monthBounds(ym);
  return calendarRange(from, to, mode, ORG_TZ);
}

/** When each release went live; set at start. */
let releaseTimes = new Map<string, Date>();
export const releaseTime = (id: string): Date | null => releaseTimes.get(id) ?? null;
export function setReleaseTimes(times: Map<string, Date>): void {
  releaseTimes = times;
}

/**
 * Upload slots with nothing on them in the next eight days, for every
 * channel with a posting target (Stories, every four days; each Gaming
 * channel, its own usual gap). Worked out at most once a minute.
 */
let gapCache: { at: number; gaps: UploadGap[] } | null = null;
/** Something changed what's on the calendar (a pause, a move, a day off): work the gaps out afresh. */
export function forgetGaps(): void {
  gapCache = null;
}
async function currentGaps(): Promise<UploadGap[]> {
  if (!hasDatabase) return [];
  if (gapCache && Date.now() - gapCache.at < 60_000) return gapCache.gaps;
  const { channels, today, dismissed } = await gapInputs();
  // A day cleared by hand stays cleared; the chain still counts it as the expected day.
  const gaps = uploadGaps(channels, today).filter((g) => !dismissed.has(`${g.channel}|${g.date}`));
  gapCache = { at: Date.now(), gaps };
  return gaps;
}

/**
 * The next video that needs assigning: the channel that runs out of lined-up
 * videos first, however far ahead, and the day its next upload would be.
 * Worked out fresh each time, so adding or moving a video shows at once.
 */
export async function nextAssignments(): Promise<UploadGap[]> {
  if (!hasDatabase) return [];
  const { channels, today, dismissed } = await gapInputs();
  return nextToAssign(channels, today, (g) => dismissed.has(`${g.channel}|${g.date}`));
}

/** Every channel with a posting target, and each day it has a video on (posted or scheduled). */
async function gapInputs(): Promise<{ channels: Array<{ channel: string; every: number; days: string[] }>; today: string; dismissed: Set<string> }> {
  await refreshOwnPaces();
  const today = dateIn(ORG_TZ);
  const from = shiftDate(today, -45);
  const [uploads, aired, paused, dismissed] = await Promise.all([
    listUploads(new Date(`${from}T00:00:00Z`)).catch(() => []),
    channelAirDays(from).catch(() => []),
    pausedChannels().catch(() => new Map<string, Date>()),
    dismissedGaps(today).catch(() => new Set<string>()),
  ]);
  // A paused channel isn't expected to post; a daily batch channel (Specular) has its batch instead.
  const channels = CHANNELS.filter((c) => !isLongFormRecurring(c))
    .map((c) => ({ channel: c.name, every: everyFor(c.name) ?? 0 }))
    .filter((c) => c.every > 0 && !paused.has(c.channel))
    .map((c) => ({
      ...c,
      days: [
        ...uploads.filter((u) => u.channel === c.channel).map((u) => dayOf(u.publishedAt)),
        ...aired.filter((a) => a.channel === c.channel).map((a) => a.day),
      ],
    }));
  return { channels, today, dismissed };
}

/** A gap is news from the day it comes within eight days (midnight ET). */
export function gapNotices(gaps: UploadGap[]): GapNotice[] {
  return gaps.map((gap) => ({
    kind: "gap" as const,
    at: new Date(Math.min(Date.now(), zonedMidnight(shiftDate(gap.date, -GAP_HORIZON_DAYS)).getTime())),
    gap,
  }));
}

/** Midnight at the start of a day, New York time. */
function zonedMidnight(day: string): Date {
  const noon = new Date(`${day}T12:00:00Z`);
  const offset = Number(new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, hour: "numeric", hourCycle: "h23" }).format(noon)) - 12;
  return new Date(Date.parse(`${day}T00:00:00Z`) - offset * 3_600_000);
}

/** Revisions with their scores, for their cards. */
export async function withScores(list: StoredRecord[]): Promise<StoredRecord[]> {
  if (!hasDatabase) return list;
  const scores = await scoresFor(list.filter((r) => r.kind === "review").map((r) => r.id)).catch(() => new Map<number, number>());
  return list.map((r) => (scores.has(r.id) ? { ...r, reviewScore: scores.get(r.id)! } : r));
}

/** The posting check's pushes from the last week, for the bell. */
async function missedNotices(): Promise<Notice[]> {
  if (!hasDatabase) return [];
  const list = (await listMissed({ days: 7 }).catch(() => [])).filter((m) => !m.undoneAt);
  const out: Notice[] = [];
  for (const m of list) {
    const record = await getRecordById(m.recordId);
    if (record) out.push({ kind: "missed", at: m.at, record, missed: { id: m.id, day: m.day, pushedTo: m.pushedTo, moved: m.moved, undone: false } });
  }
  return out;
}

/** Everything for the bell, newest first. */
export async function allNotices(): Promise<Notice[]> {
  const [work, gaps, missed] = await Promise.all([listNotices(ORG_TZ), currentGaps(), missedNotices()]);
  return [...work, ...missed, ...gapNotices(gaps), ...releaseNotices(releaseTimes)].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 60);
}
