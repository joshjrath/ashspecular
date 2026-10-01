import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { config, hasDatabase } from "../config.js";
import { CATEGORIES, CHANNELS, isLongFormRecurring, type CategoryId } from "../catalog.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";
import {
  calendarRange,
  categoryCounts,
  channelCounts,
  dueByDay,
  getRecord,
  lastIntake,
  listByCategory,
  listByChannel,
  listBatchesOn,
  search,
  listReviews,
  listReviewed,
  openByCategory,
  setStatus,
  stats,
  listRemoved,
  removedCount,
  openBatchCount,
  clearBatches,
  refile,
  moveAir,
  moveDue,
  listLate,
  feedRecords,
  listNotices,
  setPinned,
  setPaused,
  setNoScript,
  setUploaded,
  listPaused,
  pausedCount,
  channelSchedule,
  snapshotMoves,
  restoreMoves,
  listDaysOff,
  setDayOff,
  listOffShifted,
  dueOnDay,
  saveDayOffMoves,
  type MoveSnapshot,
  type Notice,
  type GapNotice,
  channelAirDays,
  storiesOnBoard,
  openWork,
  doneToday,
  revisionKeys,
  getRecord as getRecordById,
  type CalendarMode,
  type StoredRecord,
} from "../db/records.js";
import { migrate } from "../db/migrate.js";
import { classify } from "../parse/classify.js";
import {
  DEADLINE_TIME,
  VO_BUFFER_DAYS,
  derive,
  instantIn,
  shiftDate,
  usDate,
} from "../parse/derive.js";
import { fetchScriptReport } from "./scriptcheck.js";
import cron from "node-cron";
import { latestUploads, listChannelLinks, listUploads, setChannelLink, storiesChannels, syncUploads, type Upload } from "../jobs/youtube.js";
import { addDays, cadenceFor, dailyFor, dayOf, daysBetween, usualGap } from "./cadence.js";
import { GAP_HORIZON_DAYS, nextToAssign, uploadGaps, type UploadGap } from "./gaps.js";
import { UPLOAD_CATEGORIES, UPLOAD_TARGETS, categoryOfChannel, channelsIn, everyFor, ownPaceChannels, perDayFor, setOwnPaces } from "./targets.js";
import { gamingSeries, nextUp, type SeriesVideo } from "./gaming/series.js";
import { analyzeIdeas, checkIdea } from "./ideas.js";
import { boardOpenings, boardScripts, corpus, learnsFrom, normsFor, setBoardScripts } from "./stories/corpus.js";
import { scriptFor, setScriptIndex } from "./scriptindex.js";
import { channelLab, contrast, indexPublic, keyOfTitle, labIdeas, matchScripts, norm as normTitle, perfStats, publicMatch, shapeStats, writtenIdea, type LabIdea, type LabVideo, type PublicVideo } from "./stories/lab.js";
import { channelProfile, focusBaseline, focusChoices, piecesOfTitle, type ChannelProfile, type FocusKind, type SetFocus } from "./stories/domain.js";
import { aiRunSummary, dropAiIdea, dropChannelIdeas, listAiIdeas, listFocus, setFocus } from "../db/storylab.js";
import { refillSoon, startStoryIdeas, WANT as WRITTEN_WANT, type StoryContext } from "../jobs/storyideas.js";
import { dailyCap } from "./stories/brainstorm.js";
import { canUseClaude } from "../ai/claude.js";
import { blueprint } from "./stories/blueprint.js";
import { checkDraft } from "./stories/check.js";
import { SHAPES, SHAPE_BY_ID, applyAdditions, currentAdditions, diceItem, recentAdditions } from "./stories/added.js";
import type { DiceKind } from "./stories/dice.js";
import { diceCard, diceLeft, rollDice } from "./stories/roll.js";
import { addLabAddition, listIdeaMarks, listLabAdditions, markIdea, removeLabAddition, setShowing, unmarkIdea } from "../db/lab.js";
import { writeNext } from "./stories/writenext.js";
import { addScript, getScript, listScripts, removeScript, scriptsFor, updateScriptBody } from "../db/scripts.js";
import { readDoc } from "./gdoc.js";
import { clearTime, forgetUntracked, loggedBetween, minutesByDay, minutesSpent, runningTimer, startTaskTimer, startTimer, stopTimer, taskMinutesSpent, untrackedKeys } from "../db/timers.js";
import { financeAlerts, registerFinance } from "./finance/routes.js";
import { registerSpecular, specularPanel, specularState } from "./specular.js";
import { checkPosts, listMissed, missedLine, undoMissed } from "../jobs/postcheck.js";
import { forgetHistory, strongUnseen } from "../db/ideas.js";
import { addChannel, channelUse, listChannelSettings, loadChannelSettings, onChannelsChanged, removeChannel, renameChannel, startChannelSync } from "../db/channelsettings.js";
import { registerIdeaFeed } from "./bitsfeed/routes.js";
import { registerCompetitors } from "./competitors/routes.js";
import { startCompetitorJobs } from "../jobs/competitors.js";
import { unseenAlerts } from "../db/competitors.js";
import { startIdeaJobs } from "../jobs/ideas.js";
import { dashboardAlerts } from "./finance/ui.js";
import { readEstimates, resetEstimates, saveEstimates } from "../db/estimates.js";
import { REPEAT, type Repeat } from "../tasks/repeat.js";
import { addTask, deleteTask, repeatTask, editTask, getTask, knownPeople, listTasks, openTasks, setTaskStatus, snoozeTask, tasksDoneToday } from "../db/tasks.js";
import { PRIORITY, TASK_CATEGORY, parseTask, type Priority, type TaskCategory } from "../tasks/parse.js";
import {
  dayLoads, doAhead, forgottenWork, isRequired, nextDays, projectBatches, remaining, taskItem, toItem, isVo, setEstimates, voQueue, whatNext, WORK_TYPES,
  MYDAY_GROUPS, shownTypes, spreadDayOff, itemKey, type WorkItem as MyWorkItem,
  LOG_RANGES, logByDay, logDays, typeOf, type LogRange, type LoggedEntry,
  type WorkItem,
} from "./work.js";
import { dismissGaps, dismissedGaps, pauseChannel, pausedChannels, resumeChannel } from "../db/channels.js";
import { channelMarks, getReview, pastForChannel, revisionHistory, saveReview, scoresFor, setChannelMark, videoKey } from "../db/revisions.js";
import { commentsFromFrameio, ownNotes, parsePasted } from "../revisions/comments.js";
import { summarize } from "../revisions/summarize.js";
import { channelHistories } from "../revisions/history.js";
import { RELEASES, releaseNotices } from "./changelog.js";
import { markReleases } from "../db/releases.js";

const DICE_KINDS: DiceKind[] = ["shape", "hero", "world", "power", "target"];
import { cascadeText, planCascade, type Cascade } from "./cascade.js";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { colourSources, distinctColour, loadChannelColours, sampleAvatars, sampledChannels, setChannelColour } from "../jobs/avatars.js";
import { FORMATS, type FormatId } from "./stories/formats.js";
import { HEROES, WORLDS } from "./stories/lore.js";
import { channelHealth, postingSlots, scoreShorts, typicalShort } from "./shorts-perf.js";
import { scoreAll, typicalViews } from "./performance.js";
import { announceBreakouts, loadVideoViews } from "../jobs/breakouts.js";
import { buildIcs, checkFeedKey, feedKey, parseFeedOptions } from "./ics.js";
import { MAX_AHEAD_DAYS, shortsDay, batchDays, batchStatus, clearBatchesOn, openBatchesFor, openBatchesThrough, reopenBatchesOn, reopenChannel, setBatchProgress, todayStatus, tomorrow } from "../jobs/batches.js";
import { COOKIE_NAME, COOKIE_OPTIONS, checkPassword, issueToken, passwordChangedAt, verifyToken } from "./auth.js";
import { loadBoardPassword, saveBoardPassword } from "../db/password.js";
import { renderForgotten, renderMyDay, renderRecording, renderTasks, renderVoQueue, type TimerState } from "./page.js";
import { DAY_SPAN, RAIL_ITEMS, calendarGrid, SORTS, channelPauseButton, channelPausedTag, displayTitle, esc, noticeTitle, weekStart, type Shell, type StatusHide, type SortDir, type SortKey, type SortState } from "./page.js";
import {
  monthOf,
  renderCalendar,
  renderCategory,
  renderDashboard,
  renderDay,
  renderEmptyState,
  renderList,
  renderPaused,
  renderRevisions,
  renderWhatsNew,
  renderSettings,
  renderLogin,
  renderRecurring,
  renderScripts,
  renderScriptBoard,
  renderUploads,
  renderStoryLab,
  renderWeek,
  renderRecord,
} from "./page.js";

const PUBLIC = new Set(["/login", "/healthz"]);

/**
 * The request's cookies, for code deep in a page (the sidebar's switched-off
 * items) without handing the request down through every route.
 */
const requestCookies = new AsyncLocalStorage<Record<string, string | undefined>>();

/** A cookie that lists ids with dots, as the dashboard's own do. */
function cookieList(name: string): string[] {
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

async function loadWork(now = new Date()) {
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

async function shell(active: string): Promise<Shell> {
  await refreshScriptIndex().catch((err) => console.error("[scripts] index failed:", err));
  const work = hasDatabase ? await loadWork().catch(() => null) : null;
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
function refreshOwnPaces(): Promise<void> {
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

/** This board's own address: PUBLIC_URL, or what the request came in on. */
function baseUrlOf(request: import("fastify").FastifyRequest): string {
  if (config.publicUrl) return config.publicUrl;
  const proto = String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0]!.trim();
  const host = String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "").split(",")[0]!.trim();
  return host ? `${proto}://${host}` : "";
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

/** Rejects anything that isn't a real YYYY-MM, so a bad URL can't 500. */
function safeMonth(value: string | undefined): string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return monthOf();
  return value;
}

function safeDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : value;
}

function safeMode(value: unknown): CalendarMode {
  return value === "deadlines" ? "deadlines" : "posting";
}

/** Uploads as the series reader takes them, each with how it did against its channel's usual. */
function seriesVideos(uploads: Upload[], perf: Map<string, { multiple: number }>): SeriesVideo[] {
  return uploads.map((u) => ({ title: u.title, channel: u.channel, publishedAt: u.publishedAt, url: u.url, views: u.views, multiple: perf.get(u.videoId)?.multiple ?? null }));
}

/** When each release went live; set at start. */
let releaseTimes = new Map<string, Date>();

/**
 * Upload slots with nothing on them in the next eight days, for every
 * channel with a posting target (Stories, every four days; each Gaming
 * channel, its own usual gap). Worked out at most once a minute.
 */
let gapCache: { at: number; gaps: UploadGap[] } | null = null;
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
async function nextAssignments(): Promise<UploadGap[]> {
  if (!hasDatabase) return [];
  const { channels, today, dismissed } = await gapInputs();
  return nextToAssign(channels, today, (g) => dismissed.has(`${g.channel}|${g.date}`));
}

/** Every channel with a posting target, and each day it has a video on (posted or scheduled). */
async function gapInputs(): Promise<{ channels: Array<{ channel: string; every: number; days: string[] }>; today: string; dismissed: Set<string> }> {
  await refreshOwnPaces();
  const today = dateIn(ORG_TZ);
  const from = addDays(today, -45);
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
    at: new Date(Math.min(Date.now(), zonedMidnight(addDays(gap.date, -GAP_HORIZON_DAYS)).getTime())),
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
async function withScores(list: StoredRecord[]): Promise<StoredRecord[]> {
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
async function allNotices(): Promise<Notice[]> {
  const [work, gaps, missed] = await Promise.all([listNotices(ORG_TZ), currentGaps(), missedNotices()]);
  return [...work, ...missed, ...gapNotices(gaps), ...releaseNotices(releaseTimes)].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 60);
}

export async function startWeb(): Promise<void> {
  if (!config.dashboardPassword) {
    console.error("[web] DASHBOARD_PASSWORD is not set.");
    console.error("      The board shows the whole studio's work, so it will not run open.");
    process.exit(1);
  }

  if (hasDatabase) {
    await migrate();
    // Channels added or renamed in Settings; when they change, colours and caches follow.
    onChannelsChanged(async () => {
      ownPaces = null;
      forgetHistory();
      await loadChannelColours();
    });
    await loadChannelSettings().catch((err) => console.error("[channels] load failed:", err));
    startChannelSync();
    // The Shorts channels' avatar colours and any set by hand, before the first page.
    await loadChannelColours().catch((err) => console.error("[colours] load failed:", err));
    // Whatever's been added to Story Lab from its dice.
    applyAdditions(await listLabAdditions().catch(() => []));
    // A login password changed in Settings takes over from DASHBOARD_PASSWORD.
    await loadBoardPassword().catch((err) => console.error("[auth] couldn't read the stored password:", err));
    // Scripts pasted in or read from a doc: Story Lab and the idea hooks learn from them.
    setBoardScripts(await listScripts().catch(() => []));
    // What's new: each change is announced from the first start that ships it.
    releaseTimes = await markReleases(RELEASES).catch(() => new Map());
  }

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie);
  await app.register(formbody);
  // Everything after this runs with the request's cookies to hand.
  app.addHook("onRequest", (request, _reply, done) => {
    requestCookies.run(request.cookies, done);
  });

  app.addHook("onRequest", async (request, reply) => {
    if (PUBLIC.has(request.url.split("?")[0] ?? "")) return;
    // The calendar feed can't sign in: its own key in the link is the check.
    if ((request.url.split("?")[0] ?? "") === "/calendar.ics") return;
    if (verifyToken(request.cookies[COOKIE_NAME])) return;
    return reply.redirect("/login");
  });

  app.get("/healthz", async () => ({ ok: true }));

  // Finance: its own section, its own tabs, the same shell.
  if (hasDatabase) registerFinance(app, shell);

  // The Bits Idea Feed: its pages, and the reading and analysis in the background.
  if (hasDatabase) {
    registerIdeaFeed(app, shell);
    startIdeaJobs();
  }

  // Competitors: niches, competitor channels, outliers and concept gaps — read in the background.
  if (hasDatabase) {
    registerCompetitors(app, shell);
    startCompetitorJobs();
  }

  // The subscribable calendar. Two months back, a year ahead.
  app.get<{ Querystring: Record<string, string | undefined> }>("/calendar.ics", async (request, reply) => {
    if (!hasDatabase || !checkFeedKey(request.query.key)) return reply.code(404).send("Not found");
    const opts = parseFeedOptions(request.query);
    const today = dateIn(ORG_TZ);
    const [list, daysOff] = await Promise.all([
      feedRecords(shiftDate(today, -60), shiftDate(today, 365), opts.batches),
      listDaysOff(),
    ]);
    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Content-Disposition", 'inline; filename="specular.ics"')
      .header("Cache-Control", "no-cache")
      .send(buildIcs(list, list, opts, baseUrlOf(request), new Date(), daysOff.filter((d) => d >= shiftDate(today, -60))));
  });
  app.get("/login", async (_req, reply) => reply.type("text/html").send(renderLogin()));

  app.post<{ Body: { password?: string } }>("/login", async (request, reply) => {
    if (!checkPassword(request.body?.password ?? "")) {
      return reply.code(401).type("text/html").send(renderLogin("Wrong password."));
    }
    return reply.setCookie(COOKIE_NAME, issueToken(), COOKIE_OPTIONS).redirect("/");
  });

  app.get("/", async (request, reply) => {
    if (!hasDatabase) return reply.type("text/html").send(renderEmptyState());

    const [s, counters, byDay, grouped, channels, notices, shifted, finAlerts, nextUp] = await Promise.all([
      shell("dashboard"),
      stats(ORG_TZ),
      dueByDay(ORG_TZ, 14),
      openByCategory(),
      channelCounts(),
      allNotices(),
      listOffShifted(),
      financeAlerts().catch((err) => (console.error("[finance] alerts failed:", err), [])),
      nextAssignments().catch(() => []),
    ]);

    // Revisions get their own section; the columns are the work to voice.
    const revisions = await withScores([...grouped.values()].flat().filter((r) => r.kind === "review"));
    const due = (r: StoredRecord) => (r.deadline ?? r.voDue ?? r.scriptDue)?.getTime() ?? Infinity;
    revisions.sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || due(a) - due(b));
    const columns = new Map([...grouped].map(([k, list]) => [k, list.filter((r) => r.kind !== "review")] as const));
    return reply
      .type("text/html")
      .send(
        renderDashboard(s, {
          stats: counters, byDay, grouped: columns, channels, notices, seen: noticesSeen(request), revisions, gaps: s.gaps,
          cols: dashColumns(request), shifted: shifted.map((x) => x.record),
          order: cookieList("dash_order"),
          finance: dashboardAlerts(finAlerts),
          nextUp,
          hideParts: cookieList("dash_hide").filter((x) => x === "unsorted" || x === "channels" || x === "revisions"),
        }),
      );
  });

  /**
   * The dashboard's columns, as the page last saved them. "none" means every
   * box was unticked; no cookie means the default three.
   */
  function dashColumns(request: import("fastify").FastifyRequest): string[] | undefined {
    const raw = request.cookies.dash_cols;
    if (!raw) return undefined;
    if (raw === "none") return [];
    const known = new Set<string>(CATEGORIES.map((c) => c.id));
    const cols = raw.split(".").filter((id) => known.has(id));
    return cols.length ? cols : undefined;
  }

  /** When this browser last opened the bell. Set by the page itself. */
  function noticesSeen(request: import("fastify").FastifyRequest): number {
    const n = Number(request.cookies.notices_seen);
    return Number.isFinite(n) ? n : 0;
  }

  // The bell's contents, for the dashboard to poll: the unread count and, for
  // desktop alerts, what came in.
  app.get("/notifications.json", async (request, reply) => {
    const seen = noticesSeen(request);
    const notices = await allNotices();
    return reply.send({
      unread: notices.filter((n) => n.at.getTime() > seen).length,
      items: notices.map((n) =>
        n.kind === "update"
          ? { id: n.release.id, kind: n.kind, at: n.at.getTime(), title: n.release.title, channel: null, href: `/whats-new#${n.release.id}` }
          : n.kind === "gap"
          ? { id: `${n.gap.channel}:${n.gap.date}`, kind: n.kind, at: n.at.getTime(), title: `Nothing assigned for ${usDate(n.gap.date)}`, channel: n.gap.channel, href: `/day/${n.gap.date}` }
          : { id: n.record.id, kind: n.kind, at: n.at.getTime(), title: noticeTitle(n.record), channel: n.record.channel, href: `/r/${n.record.id}` },
      ),
    });
  });

  app.get("/whats-new", async (_request, reply) => {
    const s = await shell("whatsnew");
    return reply.type("text/html").send(renderWhatsNew(s, RELEASES.map((r) => ({ ...r, at: releaseTimes.get(r.id) ?? null }))));
  });

  app.get<{ Params: { ym?: string }; Querystring: { mode?: string } }>(
    "/calendar/:ym",
    async (request, reply) => calendar(request.params.ym, request.query.mode, request, reply),
  );

  // The sidebar's Calendar: opens the way it was last left — Day, 4 days,
  // Week or Month, deadlines or posting.
  app.get<{ Querystring: { mode?: string } }>("/calendar", async (request, reply) => {
    const [view, savedMode] = (request.cookies.cal_view ?? "").split(".");
    const mode = request.query.mode ?? (savedMode === "deadlines" ? "deadlines" : undefined);
    const q = mode ? `?mode=${mode}` : "";
    if (view === "day") return reply.redirect(`/day/${dateIn(ORG_TZ)}${q}`);
    if (view === "4day") return reply.redirect(`/4day/${dateIn(ORG_TZ)}${q}`);
    if (view === "week") return reply.redirect(`/week/${dateIn(ORG_TZ)}${q}`);
    return calendar(undefined, mode, request, reply);
  });

  /**
   * Remember which calendar view is open, so the sidebar's Calendar reopens it.
   * Only when it was reached from the calendar itself — a day opened from the
   * dashboard or My Day doesn't change how the calendar opens.
   */
  function rememberView(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply, view: "month" | "week" | "4day" | "day", mode: string) {
    const from = (() => { try { return new URL(String(request.headers.referer ?? "")).pathname; } catch { return ""; } })();
    if (!/^\/(calendar|week|4day|day)(\/|$)/.test(from)) return;
    reply.setCookie("cal_view", `${view}.${mode}`, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: true });
  }

  /**
   * Which categories the calendar hides. An explicit ?hide= wins and is
   * remembered in a cookie, so the calendar opens the way it was left.
   */
  function hiddenCategories(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): string[] {
    const q = (request.query as { hide?: string }).hide;
    const raw = q ?? request.cookies.cal_hide ?? "";
    const known = new Set(CATEGORIES.map((c) => c.id));
    const hide = raw.split(",").filter((id) => known.has(id as never));
    if (q !== undefined) {
      reply.setCookie("cal_hide", hide.join(","), { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    }
    return hide;
  }

  /**
   * Which channels the calendar hides (catalog ids, and "nochannel" for work
   * filed without one). An explicit ?chide= wins and is remembered, like the
   * category toggles.
   */
  function hiddenChannels(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): string[] {
    const q = (request.query as { chide?: string }).chide;
    const raw = q ?? request.cookies.cal_chide ?? "";
    const known = new Set<string>([...CHANNELS.map((c) => c.id), "nochannel"]);
    const hide = [...new Set(raw.split(",").filter((id) => known.has(id)))];
    if (q !== undefined) {
      reply.setCookie("cal_chide", hide.join(","), { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    }
    return hide;
  }

  /** Whether a record passes the calendar's channel dropdown. */
  const channelShown = (r: StoredRecord, chide: string[]) => {
    if (!chide.length) return true;
    const id = r.channel ? CHANNELS.find((c) => c.name === r.channel)?.id : "nochannel";
    return !id || !chide.includes(id);
  };

  /**
   * Which statuses to hide — "done", "open", both or neither. Read from the
   * address only, never remembered, so every calendar opens showing both.
   */
  function hiddenStatuses(request: import("fastify").FastifyRequest): StatusHide {
    const raw = (request.query as { st?: string }).st ?? "";
    return [...new Set(raw.split(",").filter((x): x is "done" | "open" => x === "done" || x === "open"))];
  }

  /** Entries for a range of days, filtered, one bucket per day in order. */
  async function dayBuckets(
    from: string,
    to: string,
    mode: CalendarMode,
    hide: string[],
    st: StatusHide,
    chide: string[] = [],
  ): Promise<Array<{ date: string; list: StoredRecord[] }>> {
    const entries = (await calendarRange(from, to, mode, ORG_TZ)).filter(
      (e) => !hide.includes(e.record.category) && !st.includes(e.record.status as "done" | "open") && channelShown(e.record, chide),
    );
    const days: Array<{ date: string; list: StoredRecord[] }> = [];
    for (let d = from; d <= to; d = shiftDate(d, 1)) days.push({ date: d, list: [] });
    const index = new Map(days.map((d) => [d.date, d]));
    for (const e of entries) index.get(e.day)?.list.push(e.record);
    return days;
  }

  async function calendar(
    ymRaw: string | undefined,
    modeRaw: string | undefined,
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) {
    const ym = safeMonth(ymRaw);
    const mode = safeMode(modeRaw);
    const hide = hiddenCategories(request, reply);
    const chide = hiddenChannels(request, reply);
    const st = hiddenStatuses(request);
    // The whole grid: the days of the weeks either side that show in it get their cards too.
    const grid = calendarGrid(ym);
    const [s, entries] = await Promise.all([shell("calendar"), calendarRange(grid[0]!, grid[grid.length - 1]!, mode, ORG_TZ)]);
    rememberView(request, reply, "month", mode);
    const shown = entries.filter(
      (e) => !hide.includes(e.record.category) && !st.includes(e.record.status as "done" | "open") && channelShown(e.record, chide),
    );
    return reply
      .type("text/html")
      .send(renderCalendar(s, ym, mode, shown, hide, st, `${baseUrlOf(request)}/calendar.ics?key=${feedKey()}`, chide));
  }

  app.get<{ Params: { date: string }; Querystring: { mode?: string } }>(
    "/day/:date",
    async (request, reply) => {
      const date = safeDate(request.params.date);
      const mode = safeMode(request.query.mode);
      const s = await shell("calendar");
      if (!date) {
        return reply.code(404).type("text/html").send(renderList(s, "Not found", "That is not a date.", []));
      }
      const hide = hiddenCategories(request, reply);
      const chide = hiddenChannels(request, reply);
      const st = hiddenStatuses(request);
      const days = await dayBuckets(shiftDate(date, -DAY_SPAN), shiftDate(date, DAY_SPAN), mode, hide, st, chide);
      rememberView(request, reply, "day", mode);
      return reply.type("text/html").send(renderDay(s, date, mode, days, hide, st, chide));
    },
  );

  // A week, Sunday to Saturday. Any date in it works; no date is this week.
  app.get<{ Params: { date?: string }; Querystring: { mode?: string } }>(
    "/week/:date?",
    async (request, reply) => {
      const raw = request.params.date;
      const date = raw ? safeDate(raw) : dateIn(ORG_TZ);
      const mode = safeMode(request.query.mode);
      const s = await shell("calendar");
      if (!date) {
        return reply.code(404).type("text/html").send(renderList(s, "Not found", "That is not a date.", []));
      }
      const start = weekStart(date);
      const hide = hiddenCategories(request, reply);
      const chide = hiddenChannels(request, reply);
      const st = hiddenStatuses(request);
      const days = await dayBuckets(start, shiftDate(start, 6), mode, hide, st, chide);
      rememberView(request, reply, "week", mode);
      return reply.type("text/html").send(renderWeek(s, start, mode, days, hide, st, chide));
    },
  );

  // Four days from any day (today when none is given), side by side.
  app.get<{ Params: { date?: string }; Querystring: { mode?: string } }>(
    "/4day/:date?",
    async (request, reply) => {
      const raw = request.params.date;
      const start = raw ? safeDate(raw) : dateIn(ORG_TZ);
      const mode = safeMode(request.query.mode);
      const s = await shell("calendar");
      if (!start) {
        return reply.code(404).type("text/html").send(renderList(s, "Not found", "That is not a date.", []));
      }
      const hide = hiddenCategories(request, reply);
      const chide = hiddenChannels(request, reply);
      const st = hiddenStatuses(request);
      const days = await dayBuckets(start, shiftDate(start, 3), mode, hide, st, chide);
      rememberView(request, reply, "4day", mode);
      return reply.type("text/html").send(renderWeek(s, start, mode, days, hide, st, chide, 4));
    },
  );

  /**
   * The list sort: an explicit ?sort= wins and is remembered in a cookie, so
   * every list opens sorted the way you last chose. The links keep whatever
   * else the page's address carried — a search keeps its words.
   */
  function listSort(
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ): SortState {
    const q = request.query as Record<string, string | undefined>;
    const [savedKey, savedDir] = (request.cookies.list_sort ?? "").split(":");
    const valid = (k: string | undefined): k is SortKey => SORTS.some((o) => o.key === k);
    const key: SortKey = valid(q.sort) ? q.sort : valid(savedKey) ? savedKey : "air";
    const dirRaw = valid(q.sort) ? q.dir : savedDir;
    const dir: SortDir = dirRaw === "desc" || dirRaw === "asc"
      ? dirRaw
      : SORTS.find((o) => o.key === key)!.defaultDir;
    if (valid(q.sort)) {
      reply.setCookie("list_sort", `${key}:${dir}`, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    }
    const keep = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (k !== "sort" && k !== "dir" && v !== undefined) keep.set(k, v);
    const path = request.url.split("?")[0]!;
    const kept = keep.toString();
    return { key, dir, base: `${path}?${kept ? `${kept}&` : ""}` };
  }

  app.get<{ Querystring: { q?: string } }>("/search", async (request, reply) => {
    const q = (request.query.q ?? "").trim();
    const s = await shell("");
    s.query = q;
    if (q.length < 2) {
      return reply
        .type("text/html")
        .send(renderList(s, "Search", "Type at least two characters.", []));
    }
    const list = await search(q);
    return reply
      .type("text/html")
      .send(renderList(s, `“${q}”`, `Nothing matches “${q}”.`, list, listSort(request, reply)));
  });

  // The old address keeps working for anything that already links to it.
  app.get("/reviews", async (_req, reply) => reply.redirect("/revisions"));

  app.get("/removed", async (request, reply) => {
    const [s, list] = await Promise.all([shell("removed"), listRemoved()]);
    return reply
      .type("text/html")
      .send(renderList(s, "Removed", "Nothing removed. Anything you take off the board lands here, to restore.", list, listSort(request, reply)));
  });

  app.get("/paused", async (_request, reply) => {
    const [s, list] = await Promise.all([shell("paused"), listPaused()]);
    return reply.type("text/html").send(renderPaused(s, list));
  });

  app.get<{ Querystring: { view?: string; ch?: string; sort?: string } }>("/revisions", async (request, reply) => {
    const [s, list] = await Promise.all([shell("reviews"), listReviews(200)]);
    if (request.query.view === "history") {
      const [points, marks, reviewed] = hasDatabase
        ? await Promise.all([revisionHistory(), channelMarks(), listReviewed().then(withScores)])
        : [[], new Map<string, "flag" | "trophy">(), []];
      const sort = (["attention", "best", "name"] as const).find((x) => x === request.query.sort) ?? "attention";
      const channels = channelHistories(
        points.map((p) => ({ recordId: p.recordId, title: p.title, version: p.version, score: p.score, at: p.at, channel: p.channel })),
        marks,
        sort,
      );
      const ch = channels.some((c) => c.channel === request.query.ch) ? request.query.ch! : "";
      return reply.type("text/html").send(
        renderRevisions(s, list, undefined, {
          channels: ch ? channels.filter((c) => c.channel === ch) : channels,
          all: channels.map((c) => c.channel).sort((a, b) => a.localeCompare(b)),
          ch,
          sort,
          reviewed: (ch ? reviewed.filter((r) => (r.channel ?? "No channel") === ch) : reviewed) as Array<StoredRecord & { reviewedAt: Date | null }>,
        }),
      );
    }
    return reply.type("text/html").send(renderRevisions(s, await withScores(list), listSort(request, reply)));
  });

  // Mark a channel from the history: 🚩 find a different editor, 🏆 a run of great cuts, or clear it.
  app.post<{ Body: { channel?: string; mark?: string } }>("/revisions/mark", async (request, reply) => {
    const channel = (request.body?.channel ?? "").trim().slice(0, 200);
    const mark = request.body?.mark === "flag" || request.body?.mark === "trophy" ? request.body.mark : null;
    if (hasDatabase && channel) await setChannelMark(channel, mark);
    return reply.redirect(backTo(request.headers.referer, "/revisions?view=history"));
  });

  app.get("/queue", async (request, reply) => {
    const [s, grouped] = await Promise.all([shell("queue"), openByCategory()]);
    const all = CATEGORIES.flatMap((c) => grouped.get(c.id) ?? []).concat(
      grouped.get("unknown") ?? [],
    );
    return reply.type("text/html").send(renderList(s, "Queue", "Nothing open.", all, listSort(request, reply)));
  });

  // Everything past its time: where the chart's LATE column goes.
  app.get("/late", async (request, reply) => {
    const [s, list] = await Promise.all([shell("dashboard"), listLate()]);
    return reply
      .type("text/html")
      .send(renderList(s, "Late", "Nothing is late.", list, listSort(request, reply)));
  });

  // The scriptwriter's board under a Scripts tab. Whether it can sit in a
  // frame is the other site's choice (X-Frame-Options, or CSP
  // frame-ancestors), so ask it — once every ten minutes — rather than show
  // a blank box.
  let frameCheck: { at: number; ok: boolean; why: string } | null = null;
  async function canFrame(url: string): Promise<{ ok: boolean; why: string }> {
    if (frameCheck && Date.now() - frameCheck.at < 600_000) return frameCheck;
    let result = { ok: true, why: "" };
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
      const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
      const csp = (res.headers.get("content-security-policy") ?? "").toLowerCase();
      const ancestors = csp.match(/frame-ancestors([^;]*)/)?.[1]?.trim() ?? "";
      const self = config.publicUrl ? new URL(config.publicUrl).origin.toLowerCase() : "";
      if (xfo.includes("deny") || xfo.includes("sameorigin")) {
        result = { ok: false, why: "Josh's board says it may only be shown on its own (X-Frame-Options)." };
      } else if (ancestors && !ancestors.includes("*") && !(self && ancestors.includes(self))) {
        result = { ok: false, why: "Josh's board only allows itself to be shown on the pages it lists (frame-ancestors)." };
      }
    } catch {
      // Unreachable from here isn't proof it can't be framed; let the browser try.
    }
    frameCheck = { at: Date.now(), ...result };
    return result;
  }

  app.get("/scripts", async (_req, reply) => {
    const s = await shell("scripts");
    if (!config.scriptsUrl && !config.scriptsUrlRaw) return reply.redirect("/");
    if (!config.scriptsUrl) {
      return reply.type("text/html").send(renderScriptBoard(s, "#", await fetchScriptReport()));
    }
    // With his view-only password, read his data and show it natively. Without
    // one, fall back to showing his page itself, where his site allows it.
    if (config.scriptsToken) {
      const report = await fetchScriptReport();
      return reply.type("text/html").send(renderScriptBoard(s, config.scriptsUrl, report));
    }
    const { ok, why } = await canFrame(config.scriptsUrl);
    return reply.type("text/html").send(renderScripts(s, config.scriptsUrl, ok, why));
  });

  // Uploads: whether each Stories channel is keeping to its four-day pace.
  type UploadsQuery = { range?: string; cat?: string; idea?: string; ch?: string };
  const uploadsPage = async (query: UploadsQuery) => {
    const category = (UPLOAD_CATEGORIES.find((c) => c.id === query.cat)?.id ?? "stories") as CategoryId;
    const target = UPLOAD_TARGETS[category];
    const ranges = target.kind === "daily" ? [14, 30, 60] : [30, 90, 180];
    const range = ranges.includes(Number(query.range)) ? Number(query.range) : ranges[1]!;
    // A paused channel is left out of the charts, unless asked for (Show paused).
    const s = await shell("uploads");
    const showPaused = requestCookies.getStore()?.uploads_paused === "show";
    const pausedHere = channelsIn(category).filter((c) => s.pausedChannels?.[c]);
    const channels = channelsIn(category).filter((c) => showPaused || !s.pausedChannels?.[c]);
    const now = new Date();
    const since = new Date(now.getTime() - (Math.max(range, 90) + 60) * 86_400_000);
    await refreshOwnPaces();
    const [links, allUploads, allViews, history] = await Promise.all([
      listChannelLinks(),
      listUploads(since),
      // A year and more of views, so every channel has twenty to compare with.
      // Twenty earlier videos to compare with: a year and more for long form,
      // a couple of months for Shorts at five a day.
      loadVideoViews(new Date(now.getTime() - (target.kind === "daily" ? 75 : 400) * 86_400_000), channels),
      // Gaming: every upload, so a series that's resting still shows.
      category === "gaming" ? listUploads(new Date(0)) : Promise.resolve(null),
    ]);
    const inCat = new Set(channels);
    const uploads = allUploads.filter((u) => inCat.has(u.channel));
    const viewData = allViews.filter((v) => inCat.has(v.channel));
    const cadence = channels.map((name) =>
      cadenceFor(name, uploads.filter((u) => u.channel === name).map((u) => u.publishedAt), now, everyFor(name) ?? 36_500),
    );
    const daily =
      target.kind === "daily"
        ? channels.map((name) => dailyFor(name, uploads.filter((u) => u.channel === name).map((u) => u.publishedAt), perDayFor(name), now))
        : undefined;
    const perf = scoreAll(viewData, now);
    const typical = new Map(
      channels.map((name) => {
        const mine = viewData.filter((v) => v.channel === name);
        return [name, target.kind === "daily" ? typicalShort(mine, now) : typicalViews(mine, now)] as const;
      }),
    );
    const byId = new Map(allUploads.map((u) => [u.videoId, u]));
    // Shorts get the fuller treatment: checkpoints from an hour, sixty to
    // compare with, a log-scale spread.
    const shortScores = target.kind === "daily" ? scoreShorts(viewData, now) : null;
    const multipleOf = (id: string) => shortScores?.get(id)?.multiple ?? perf.get(id)?.multiple ?? null;
    const ideaChannel = channels.includes(query.ch ?? "") ? query.ch! : null;
    const ideas = analyzeIdeas(
      viewData.filter((v) => !ideaChannel || v.channel === ideaChannel).map((v) => ({
        title: byId.get(v.videoId)?.title ?? "",
        channel: v.channel,
        publishedAt: v.publishedAt,
        url: byId.get(v.videoId)?.url ?? "",
        multiple: multipleOf(v.videoId),
      })).filter((v) => v.title),
      now,
    );
    const ideaTitle = (query.idea ?? "").trim().slice(0, 200);
    const series = history ? gamingSeries(seriesVideos(history.filter((u) => inCat.has(u.channel)), perf), now) : undefined;

    // Each video's opening, from its script, for the idea details.
    const openings = new Map([
      ...corpus()
        .filter((sc) => sc.sections[0]?.name === "INTRO")
        .map((sc) => [normTitle(sc.title), sc.sections[0]!.paras.join(" ")] as const),
      // Every category's scripts added on the board, not only Stories'.
      ...boardOpenings(),
    ]);
    const hooks = new Map(
      uploads.filter((u) => openings.has(normTitle(u.title))).map((u) => [u.url, openings.get(normTitle(u.title))!] as const),
    );

    return renderUploads(
        s,
        {
          channels, links, uploads, cadence, range, hasKey: Boolean(process.env.YOUTUBE_API_KEY?.trim()), perf, typical,
          category, daily, ideas, idea: ideaTitle ? { title: ideaTitle, check: checkIdea(ideaTitle, ideas) } : null,
          ideaChannel,
          shorts: shortScores
            ? {
                scores: shortScores,
                health: channels.map((c) => channelHealth(c, viewData, shortScores, now)),
                slots: postingSlots(viewData.filter((v) => now.getTime() - v.publishedAt.getTime() < 30 * 86_400_000), shortScores),
              }
            : undefined,
          hooks,
          series,
          paused: pausedHere.length ? { names: pausedHere, shown: showPaused } : undefined,
        },
        now,
      );
  };

  // Show or hide paused channels on the Uploads charts, remembered in this browser.
  app.get<{ Querystring: { show?: string; cat?: string } }>("/uploads/paused", async (request, reply) => {
    reply.setCookie("uploads_paused", request.query.show === "1" ? "show" : "hide", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
    const cat = UPLOAD_CATEGORIES.find((c) => c.id === request.query.cat)?.id ?? "stories";
    return reply.redirect(`/uploads?cat=${cat}`);
  });

  app.get<{ Querystring: UploadsQuery }>("/uploads", async (request, reply) => {
    const shellHtml = await uploadsPage(request.query);
    return reply.type("text/html").send(shellHtml);
  });

  /**
   * One channel on its own: its pace, every video it has with how each did,
   * what stands out, and what to make next — the ideas from its own videos,
   * and for Stories, the Story Lab ideas that fit it.
   */
  app.get<{ Params: { id: string }; Querystring: { range?: string; idea?: string } }>(
    "/uploads/channel/:id",
    async (request, reply) => {
      const ch = CHANNELS.find((c) => c.id === request.params.id);
      if (!ch) return reply.redirect("/uploads");
      const category = ch.category;
      const target = UPLOAD_TARGETS[category];
      const ranges = target.kind === "daily" ? [14, 30, 60] : [30, 90, 180];
      const range = ranges.includes(Number(request.query.range)) ? Number(request.query.range) : ranges[1]!;
      const now = new Date();
      const name = ch.name;
      await refreshOwnPaces();
      const [s, links, everything, views] = await Promise.all([
        shell("uploads"),
        listChannelLinks(),
        listUploads(new Date(0)),
        // Long form: every video's curve. Shorts: four months — sixty to compare each with.
        loadVideoViews(new Date(target.kind === "daily" ? now.getTime() - 120 * 86_400_000 : 0), [name]),
      ]);
      const mine = everything.filter((u) => u.channel === name);
      const all = [...mine].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      const perf = scoreAll(views, now);
      const shortScores = target.kind === "daily" ? scoreShorts(views, now) : null;
      const typical = new Map([[name, target.kind === "daily" ? typicalShort(views, now) : typicalViews(views, now)] as const]);
      const byId = new Map(mine.map((u) => [u.videoId, u]));
      const multipleOf = (id: string) => shortScores?.get(id)?.multiple ?? perf.get(id)?.multiple ?? null;
      const ideas = analyzeIdeas(
        views
          .map((v) => ({ title: byId.get(v.videoId)?.title ?? "", channel: v.channel, publishedAt: v.publishedAt, url: byId.get(v.videoId)?.url ?? "", multiple: multipleOf(v.videoId) }))
          .filter((v) => v.title),
        now,
      );
      const ideaTitle = (request.query.idea ?? "").trim().slice(0, 200);

      // Stories: Story Lab's ideas, the ones that fit this channel first.
      let lab: Array<{ idea: import("./stories/lab.js").LabIdea; fit: string[] }> | undefined;
      if (category === "stories") {
        const storiesNames = channelsIn("stories");
        const storyViews = await loadVideoViews(new Date(0), storiesNames);
        const storyPerf = scoreAll(storyViews, now);
        const stories = everything.filter((u) => storiesNames.includes(u.channel));
        const videos: LabVideo[] = stories.map((u) => ({ title: u.title, multiple: storyPerf.get(u.videoId)?.multiple ?? null, publishedAt: u.publishedAt }));
        const published: PublicVideo[] = everything.map((u) => ({ title: u.title, url: u.url, channel: u.channel }));
        // Only ideas that fit the channel's focus: read from its videos, or set by hand in Story Lab.
        const set = (await listFocus().catch(() => new Map<string, SetFocus>())).get(ch.id) ?? null;
        const titles = mine.map((u) => u.title);
        lab = channelLab(name, titles, labIdeas(videos, now, 5000, published, [], false), 8, 2, channelProfile(name, titles, set, focusBaseline(stories.map((u) => u.title))));
      }
      // Gaming: its series, and the next episode of each worth making.
      const series = category === "gaming" ? gamingSeries(seriesVideos(mine, perf), now).series : undefined;

      return reply.type("text/html").send(
        renderUploads(
          s,
          {
            channels: [name], links, uploads: mine, cadence: [cadenceFor(name, mine.map((u) => u.publishedAt), now, everyFor(name) ?? 36_500)],
            range, hasKey: Boolean(process.env.YOUTUBE_API_KEY?.trim()), perf, typical, category,
            daily: target.kind === "daily" ? [dailyFor(name, mine.map((u) => u.publishedAt), perDayFor(name), now)] : undefined,
            ideas, idea: ideaTitle ? { title: ideaTitle, check: checkIdea(ideaTitle, ideas) } : null, ideaChannel: name,
            shorts: shortScores
              ? {
                  scores: shortScores,
                  health: [channelHealth(name, views, shortScores, now)],
                  slots: postingSlots(views.filter((v) => now.getTime() - v.publishedAt.getTime() < 30 * 86_400_000), shortScores),
                }
              : undefined,
            focus: { channel: name, all, lab, series, next: series ? nextUp(series, now) : undefined },
          },
          now,
        ),
      );
    },
  );

  // Story Lab: what to write next for Stories, and how to build it.
  type LabQuery = {
    format?: string; hero?: string; world?: string; power?: string; target?: string; shape?: string;
    /** 🎲: any value rolls; `dice` keeps the roll to one group; `added` shows what was just added. */
    roll?: string; dice?: string; added?: string;
    /** Why a script couldn't be added. */
    scripterr?: string;
    /** Unassigned videos: open the list; the title just linked, or why it couldn't be. */
    open?: string; linked?: string; linkerr?: string;
  };
  /**
   * What Story Lab and Claude's ideas both read: every Stories channel's videos
   * (uploaded and on the board) with how each did, each channel's focus, the
   * marks, and Claude's ideas still in play.
   */
  const storyBasics = async () => {
    const channels = channelsIn("stories");
    const now = new Date();
    const [all, views, marks, onBoard, focus, written] = await Promise.all([
      hasDatabase ? listUploads(new Date(0)) : Promise.resolve([]),
      hasDatabase ? loadVideoViews(new Date(0), channels) : Promise.resolve([]),
      hasDatabase ? listIdeaMarks().catch(() => []) : Promise.resolve([]),
      hasDatabase ? storiesOnBoard().catch(() => []) : Promise.resolve([]),
      hasDatabase ? listFocus().catch(() => new Map<string, SetFocus>()) : Promise.resolve(new Map<string, SetFocus>()),
      hasDatabase ? listAiIdeas().catch(() => []) : Promise.resolve([]),
    ]);
    const perf = scoreAll(views, now);
    const stories = all.filter((u) => channels.includes(u.channel));
    const videos: LabVideo[] = stories.map((u) => ({ title: u.title, multiple: perf.get(u.videoId)?.multiple ?? null, publishedAt: u.publishedAt }));
    // Every video already public, on any channel, newest first — Stories ideas never repeat one.
    const published: PublicVideo[] = [...all].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime()).map((u) => ({ title: u.title, url: u.url, channel: u.channel }));
    const planned: PublicVideo[] = onBoard.filter((r) => !r.uploaded && r.channel).map((r) => ({ title: r.title, url: "", channel: r.channel! }));
    const titlesOf = (channel: string) => [...stories.filter((u) => u.channel === channel).map((u) => u.title), ...onBoard.filter((r) => r.channel === channel).map((r) => r.title)];
    const idOf = (name: string) => CHANNELS.find((c) => c.name === name)?.id ?? name;
    // What's ordinary across the network's Stories videos, so each channel's focus is what sets it apart.
    const baseline = focusBaseline(channels.flatMap(titlesOf));
    const profiles = new Map<string, ChannelProfile>(channels.map((ch) => [ch, channelProfile(ch, titlesOf(ch), focus.get(idOf(ch)) ?? null, baseline)]));
    // Claude's ideas still to use: not rerolled away or saved, not made since (on any channel, or on the board).
    const gone = new Set(marks.filter((m) => m.mark !== "show").map((m) => `${idOf(m.channel)}|${m.key}`));
    const pubIndex = indexPublic(published);
    const live = written.filter((w) => {
      if (gone.has(`${w.channelId}|ai:${w.id}`)) return false;
      const p = piecesOfTitle(w.title);
      const made = publicMatch({ hero: p.hero, world: p.world, power: p.power, target: p.target, title: w.title }, published, pubIndex) ?? publicMatch({ hero: p.hero, world: p.world, power: p.power, target: p.target, title: w.title }, planned);
      if (made) void dropAiIdea(w.id, `made: ${made.title} (${made.channel || "on the board"})`).catch(() => undefined);
      return !made;
    });
    return { channels, now, all, perf, stories, videos, published, planned, marks, onBoard, focus, written, live, titlesOf, idOf, profiles };
  };

  /** What Claude reads to write a channel's ideas. */
  const storyContext = async (): Promise<StoryContext> => {
    const b = await storyBasics();
    const briefs = b.channels.map((name) => {
      const id = b.idOf(name);
      return {
        id,
        name,
        profile: b.profiles.get(name)!,
        videos: b.stories.filter((u) => u.channel === name).map((u) => ({ title: u.title, multiple: b.perf.get(u.videoId)?.multiple ?? null })),
        planned: b.onBoard.filter((r) => r.channel === name && !r.uploaded).map((r) => r.title),
        // Everything it's been offered before — rerolled, saved, or written already — so nothing comes round again.
        avoid: [...b.marks.filter((m) => m.channel === name).map((m) => m.title), ...b.written.filter((w) => w.channelId === id).map((w) => w.title)],
      };
    });
    const available = new Map<string, number>();
    for (const w of b.live) available.set(w.channelId, (available.get(w.channelId) ?? 0) + 1);
    return { briefs, published: b.published, planned: b.planned, available };
  };

  const storyLab = async (query: LabQuery, check?: { title: string; text: string }) => {
    const [s, kept, b, runs] = await Promise.all([
      shell("storylab"),
      hasDatabase ? listScripts().catch(() => []) : Promise.resolve([]),
      storyBasics(),
      hasDatabase ? aiRunSummary().catch(() => null) : Promise.resolve(null),
    ]);
    const { channels, now, stories, videos, published, marks, onBoard } = b;
    const scripts = corpus();
    // Claude's ideas, scored from the network's own results like any other.
    const perfNow = perfStats(videos);
    const shapes = shapeStats(videos);
    const multiples = new Map(stories.map((u) => [normTitle(u.title), b.perf.get(u.videoId)?.multiple ?? null] as const));
    const written = new Map<string, LabIdea[]>();
    for (const w of b.live) {
      const name = CHANNELS.find((c) => c.id === w.channelId)?.name;
      if (!name || !channels.includes(name)) continue;
      written.set(name, [...(written.get(name) ?? []), writtenIdea(w, name, perfNow, shapes, multiples)]);
    }
    const heldBack: PublicVideo[] = [];
    // Every idea, best first — just-added dice items brought forward — then two per channel.
    const everything = labIdeas(videos, now, 100_000, published, heldBack, false, recentAdditions());
    const cards = writeNext({
      channels: channels.map((channel) => ({ channel, titles: b.titlesOf(channel), profile: b.profiles.get(channel) })),
      ideas: everything,
      written,
      marks,
      // Too close to anything made or planned, on any channel.
      neighbours: [
        ...onBoard.map((r) => ({ title: r.title, channel: r.channel, source: r.uploaded ? ("uploaded" as const) : ("assigned" as const) })),
        ...published.map((v) => ({ title: v.title, channel: v.channel, source: "uploaded" as const })),
        ...scripts.map((x) => ({ title: x.title, channel: null, source: "script" as const })),
      ],
    });
    // Remember what's showing, so the next visit (and a reroll elsewhere) leaves these cards where they are.
    if (hasDatabase) {
      for (const channel of channels) {
        const shown = (cards.get(channel) ?? []).map((c) => c.idea.key).sort().join("\n");
        const was = marks.filter((m) => m.channel === channel && m.mark === "show").map((m) => m.key).sort().join("\n");
        if (shown === was) continue;
        await setShowing(
          channel,
          (cards.get(channel) ?? []).map((c) => ({
            key: c.idea.key, title: c.idea.title, format: c.idea.format, hero: c.idea.hero?.id ?? null, world: c.idea.world?.id ?? null,
            power: c.idea.power?.id ?? null, target: c.idea.target?.id ?? null, shape: c.idea.shape ?? null, score: c.score,
          })),
        ).catch((err) => console.error("[lab] couldn't keep the cards:", err));
      }
    }
    // One of Claude's ideas has a blueprint only when its title is a format the lore builds, with its lead — under its own title.
    const printOf = (idea: LabIdea) => {
      if (idea.ai && !(piecesOfTitle(idea.title).format && idea.hero)) return null;
      const bp = blueprint({ format: idea.format, hero: idea.hero?.id, world: idea.world?.id, power: idea.power?.id, target: idea.target?.id, shape: idea.shape });
      return bp && idea.ai ? { ...bp, title: idea.title, alternates: [] } : bp;
    };
    const byId = new Map(b.written.map((w) => [`ai:${w.id}`, w]));
    const writeNextData = channels.map((channel) => {
      const id = b.idOf(channel);
      return {
        channel,
        id,
        cards: (cards.get(channel) ?? []).map((c) => ({ ...c, blueprint: printOf(c.idea) })),
        saved: marks.filter((m) => m.channel === channel && m.mark === "save").map((m) => ({ ...m, written: byId.get(m.key) ?? null })),
        skipped: marks.filter((m) => m.channel === channel && m.mark === "skip").length,
        profile: b.profiles.get(channel)!,
        set: b.focus.get(id) ?? null,
        writtenLeft: b.live.filter((w) => w.channelId === id).length,
        lastRun: runs?.last.get(id) ?? null,
      };
    });
    const ideas = writeNextData.flatMap((w) => w.cards.map((c) => ({ idea: c.idea, blueprint: c.blueprint })));
    // A title shape picked in the builder ("shape:hundreddays") builds on its own format.
    const shape = query.shape && SHAPE_BY_ID.has(query.shape) ? SHAPE_BY_ID.get(query.shape)! : null;
    const picked = {
      format: shape ? shape.base : FORMATS.some((f) => f.id === query.format) ? query.format! : "insert",
      shape: shape?.id ?? "",
      hero: query.hero ?? "",
      world: query.world ?? "",
      power: query.power ?? "",
      target: query.target ?? "",
    };
    const built = query.hero || query.world || query.power
      ? blueprint({ format: picked.format as FormatId, hero: picked.hero || null, world: picked.world || null, power: picked.power || null, target: picked.target || null, shape: picked.shape || null })
      : null;

    // 🎲 — one new item, or the one just added and what it opens up.
    const group = DICE_KINDS.includes(query.dice as DiceKind) ? (query.dice as DiceKind) : null;
    const rolledOne = query.roll !== undefined ? rollDice(group) : null;
    const [addedKind, addedId] = (query.added ?? "").split(":");
    const dice = {
      rolled: rolledOne ? diceCard(rolledOne.kind, rolledOne.id, videos, published) : null,
      added: addedKind && addedId && DICE_KINDS.includes(addedKind as DiceKind) ? diceCard(addedKind as DiceKind, addedId, videos, published) : null,
      additions: currentAdditions().map((a) => ({ ...a, name: diceItem(a.kind, a.id)?.name ?? a.id })),
      left: diceLeft(),
      group,
      nonce: String(Date.now()),
      rolledNothing: query.roll !== undefined && !rolledOne,
    };
    const builtRepeats = built ? publicMatch({ hero: built.hero, world: built.world, power: built.power, target: built.target, title: built.title }, published) : null;
    const results = matchScripts(videos);
    // Coverage: heroes who lead a script or a top idea, against every world.
    const done = new Set<string>();
    for (const t of [...scripts.map((x) => x.title), ...stories.map((u) => u.title)]) for (const p of keyOfTitle(t).pairs) done.add(p);
    const leadIds = new Set([...scripts.map((x) => x.heroes[0]?.id), ...ideas.map((i) => i.idea.hero?.id)].filter(Boolean) as string[]);
    return renderStoryLab(s, {
      specular: hasDatabase ? await specularState().then(specularPanel).catch((err) => (console.error("[specular] panel failed:", err), "")) : "",
      scripts: scripts.length,
      words: scripts.reduce((n, x) => n + x.words, 0),
      matched: results.length,
      ideas,
      blueprint: built,
      builtRepeats,
      heldBack: heldBack.length,
      publicCount: published.length,
      picked,
      check: check ? { ...check, result: checkDraft(check.text, check.title) } : null,
      contrast: contrast(results),
      results,
      coverage: { heroes: HEROES.filter((h) => leadIds.has(h.id)), worlds: WORLDS, done },
      formats: FORMATS.map((f) => {
        const mine = scripts.filter((x) => x.format === f.id);
        return { format: f, norms: normsFor(mine.length ? mine : scripts), examples: mine.map((x) => x.title) };
      }).filter((f) => f.examples.length),
      shapes: [...SHAPES],
      dice,
      writeNext: writeNextData,
      claude: { on: canUseClaude(), today: runs?.calls ?? 0, cap: dailyCap(), kept: runs?.kept ?? 0, want: WRITTEN_WANT },
      focusChoices: focusChoices(),
      // Every Stories upload with no script anywhere — attached, in Story Lab or delivered on the Scripts tab.
      unassigned: {
        videos: stories
          .filter((u) => !scriptFor({ title: u.title }))
          .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
          .map((u) => ({ title: u.title, channel: u.channel, url: u.url, publishedAt: u.publishedAt, views: u.views })),
        total: stories.length,
        open: query.open === "unassigned",
        linked: (query.linked ?? "").slice(0, 200),
        error: (query.linkerr ?? "").slice(0, 200),
      },
      library: {
        // Stories videos' scripts and those added on their own — the ones Story Lab reads.
        scripts: kept.filter(learnsFrom),
        drive: scripts.filter((x) => !x.board).length,
        error: (query.scripterr ?? "").slice(0, 200),
      },
    });
  };
  app.get<{ Querystring: LabQuery }>("/story-lab", async (request, reply) =>
    reply.type("text/html").send(await storyLab(request.query)),
  );
  // Specular compilations: the next Movie and Sleep, their pages, the catalog.
  if (hasDatabase) registerSpecular(app, shell, () => storyLab({}));
  // Claude's ideas for each Stories channel, kept topped up in the background.
  if (hasDatabase) startStoryIdeas(storyContext);
  // 🎲 Add what was rolled, or take an addition out again.
  app.post<{ Body: { kind?: string; id?: string } }>("/story-lab/add", async (request, reply) => {
    const kind = request.body?.kind as DiceKind;
    const id = request.body?.id ?? "";
    if (!hasDatabase || !DICE_KINDS.includes(kind) || !diceItem(kind, id)) return reply.redirect("/story-lab#dice");
    await addLabAddition(kind, id);
    applyAdditions(await listLabAdditions());
    return reply.redirect(`/story-lab?added=${kind}:${encodeURIComponent(id)}#dice`);
  });
  app.post<{ Body: { kind?: string; id?: string } }>("/story-lab/remove", async (request, reply) => {
    const kind = request.body?.kind as DiceKind;
    if (hasDatabase && DICE_KINDS.includes(kind)) {
      await removeLabAddition(kind, request.body?.id ?? "");
      applyAdditions(await listLabAdditions());
    }
    return reply.redirect("/story-lab#dice");
  });

  // Write next: ↻ a fresh idea in a card's place, 🔖 save it to the channel's bucket, or take it out again.
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/idea", async (request, reply) => {
    const b = request.body ?? {};
    const channel = channelsIn("stories").find((c) => c === b.channel);
    const key = (b.key ?? "").slice(0, 300);
    const anchor = `#wn-${CHANNELS.find((c) => c.name === channel)?.id ?? ""}`;
    if (!hasDatabase || !channel || !key) return reply.redirect(`/story-lab${anchor}`);
    // One of Claude's ideas used up: that channel's pool is topped up in the background.
    if (key.startsWith("ai:") && (b.do === "reroll" || b.do === "save")) refillSoon(CHANNELS.find((c) => c.name === channel)?.id ?? "");
    if (b.do === "unsave") await unmarkIdea(channel, key);
    else if (b.do === "reroll" || b.do === "save") {
      const opt = (v: string | undefined) => (v ? v.slice(0, 100) : null);
      await markIdea({
        channel, key, mark: b.do === "save" ? "save" : "skip", title: (b.title ?? "").slice(0, 300), format: (b.format ?? "").slice(0, 40),
        hero: opt(b.hero), world: opt(b.world), power: opt(b.power), target: opt(b.target), shape: opt(b.shape),
        score: Math.max(0, Math.min(100, Number(b.score) || 0)),
      });
    }
    return reply.redirect(`/story-lab${anchor}`);
  });

  // A channel's focus — what its videos are about — set by hand, or back to reading it from its videos; and its note for Claude.
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/focus", async (request, reply) => {
    const b = request.body ?? {};
    const channel = channelsIn("stories").find((c) => c === b.channel);
    const id = CHANNELS.find((c) => c.name === channel)?.id ?? "";
    if (hasDatabase && channel) {
      const raw = (b.focus ?? "").trim();
      const [kind, ...rest] = raw.split(":");
      const kinds: Array<FocusKind | "any"> = ["lead", "hero", "franchise", "format", "genre", "any"];
      const focus = raw === "any" ? { kind: "any" as const, value: null } : kinds.includes(kind as FocusKind) && rest.join(":") ? { kind: kind as FocusKind, value: rest.join(":") } : null;
      const before = (await listFocus().catch(() => new Map<string, SetFocus>())).get(id);
      await setFocus(id, focus, b.note ?? null);
      // A new focus or note: what Claude wrote to the old one is set aside, and it writes to the new one.
      if ((before?.kind ?? null) !== (focus?.kind ?? null) || (before?.value ?? null) !== (focus?.value ?? null) || (before?.note ?? "") !== (b.note ?? "").replace(/\s+/g, " ").trim()) {
        await dropChannelIdeas(id, "the channel's focus changed");
        refillSoon(id);
      }
    }
    return reply.redirect(`/story-lab#wn-${id}`);
  });

  // Drafts are posted: they're far too long for a link.
  app.post<{ Body: Record<string, string | undefined> }>("/story-lab/check", async (request, reply) => {
    const b = request.body ?? {};
    return reply.type("text/html").send(
      await storyLab({}, { title: (b.title ?? "").trim().slice(0, 200), text: (b.script ?? "").slice(0, 120_000) }),
    );
  });

  const backToCategory = (cat: unknown, ch?: unknown) => {
    const one = CHANNELS.find((c) => c.name === ch);
    return one ? `/uploads/channel/${one.id}` : `/uploads?cat=${UPLOAD_CATEGORIES.find((c) => c.id === cat)?.id ?? "stories"}`;
  };

  app.post<{ Body: Record<string, string | undefined> }>("/uploads/links", async (request, reply) => {
    const body = request.body ?? {};
    for (const c of CHANNELS) {
      if (typeof body[c.name] === "string") await setChannelLink(c.name, body[c.name]!);
    }
    await syncUploads().catch((err) => console.error("[uploads] read failed:", err));
    await announceBreakouts().catch((err) => console.error("[uploads] breakout alert failed:", err));
    // A new Shorts link: its avatar's colour, straight away (and a removed one's goes).
    await sampleAvatars().catch((err) => console.error("[colours] sampling failed:", err));
    await loadChannelColours().catch((err) => console.error("[colours] load failed:", err));
    return reply.redirect(backToCategory(body._cat, body._ch));
  });

  app.post<{ Body: Record<string, string | undefined> }>("/uploads/check", async (request, reply) => {
    await syncUploads().catch((err) => console.error("[uploads] read failed:", err));
    await announceBreakouts().catch((err) => console.error("[uploads] breakout alert failed:", err));
    return reply.redirect(backToCategory(request.body?._cat, request.body?._ch));
  });


  // Today, and any day ahead — ?day= picks it, tomorrow by default.
  app.get<{ Querystring: { day?: string } }>("/recurring", async (request, reply) => {
    const today = shortsDay();
    const first = tomorrow();
    const picked = safeDate(request.query.day);
    const day = picked && picked >= first ? picked : first;
    const [s, todayNow, aheadRows, list, strip] = await Promise.all([
      shell("recurring"),
      todayStatus(),
      batchStatus(day),
      listBatchesOn(today),
      batchDays(first, shiftDate(first, 13)),
    ]);
    return reply
      .type("text/html")
      .send(
        renderRecurring(
          s,
          { date: today, rows: todayNow.rows },
          { date: day, rows: aheadRows },
          list,
          strip,
          MAX_AHEAD_DAYS,
        ),
      );
  });

  // Working ahead, as far as you like: one day (day=), the next N days
  // (days=), or every day through a date (through=). The opener is
  // idempotent, so a morning run later finds these and leaves them alone —
  // cleared ones included — and a partly open day gets only what it lacks.
  app.post<{ Body: { day?: string; days?: string; through?: string } }>("/recurring/ahead", async (request, reply) => {
    const first = tomorrow();
    const body = request.body ?? {};
    const day = safeDate(body.day);
    const through = safeDate(body.through);
    const n = Math.min(Math.max(Number(body.days) || 0, 0), MAX_AHEAD_DAYS);
    let show = first;
    if (day && day >= first) {
      await openBatchesFor(day);
      show = day;
    } else if (through && through >= first) {
      const last = through <= shiftDate(first, MAX_AHEAD_DAYS - 1) ? through : shiftDate(first, MAX_AHEAD_DAYS - 1);
      await openBatchesThrough(first, last);
      show = first;
    } else if (n > 0) {
      await openBatchesThrough(first, shiftDate(first, n - 1));
    } else {
      await openBatchesFor(first);
    }
    return reply.redirect(`/recurring?day=${show}`);
  });

  // Clear a "Nothing assigned" day (or several): that channel isn't posting then after all.
  app.post<{ Body: { channel?: string; days?: string | string[] } }>("/gaps/dismiss", async (request, reply) => {
    const channel = CHANNELS.find((c) => c.name === request.body?.channel)?.name;
    const raw = request.body?.days;
    const days = (Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map((d) => safeDate(d.trim())).filter((d): d is string => Boolean(d));
    if (hasDatabase && channel && days.length) {
      await dismissGaps(channel, days);
      gapCache = null;
    }
    return reply.redirect(backTo(request.headers.referer, "/"));
  });

  // ── My Day, timers, the VO Queue, recording mode, forgotten work ──────
  const safeBack = (b: unknown, fallback: string) => (typeof b === "string" && /^\/[a-z0-9/_?=&#.-]*$/i.test(b) ? b : fallback);

  /** Time logged over a range, each stretch labelled with its kind of work. */
  async function timeLog(range: LogRange, today: string, shown?: Set<string>) {
    const days = logDays(range, today);
    const from = instantIn(days[0]!, "00:00", ORG_TZ)!;
    const to = instantIn(shiftDate(days[days.length - 1]!, 1), "00:00", ORG_TZ)!;
    const rows = hasDatabase ? await loggedBetween(from, to).catch(() => []) : [];
    const entries: LoggedEntry[] = [];
    for (const r of rows) {
      const type = r.taskId ? "task" : typeOf({ kind: r.kind, batchNo: r.batchNo, channel: r.channel, category: r.category } as StoredRecord);
      if (!type || (shown && !shown.has(type))) continue;
      const title = r.batchNo && r.channel ? r.channel : r.title ?? r.code ?? "(untitled)";
      entries.push({ start: r.start, end: r.end, type, title });
    }
    return logByDay(entries, days);
  }

  app.get<{ Querystring: { next?: string; budget?: string; log?: string } }>("/my-day", async (request, reply) => {
    const now = new Date();
    const [s, loaded, tracked] = await Promise.all([shell("myday"), loadWork(now), minutesByDay(ORG_TZ, dateIn(ORG_TZ, now))]);
    const today = dateIn(ORG_TZ, now);
    const days = nextDays(7, now);
    const offs = new Set(s.daysOff ?? []);
    // The category switches: only the kinds of work left on count anywhere on the page.
    const hidden = (request.cookies.myday_hide ?? "").split(".").filter((g) => MYDAY_GROUPS.some((x) => x.id === g));
    const shown = shownTypes(hidden);
    const exploded = request.cookies.myday_explode === "1";
    const logRange: LogRange = LOG_RANGES.find((r) => r.id === request.query.log)?.id ?? "week";
    const work = { ...loaded, items: loaded.items.filter((i) => shown.has(i.type)), doneItems: loaded.doneItems.filter((i) => shown.has(i.type)) };
    const projected = projectBatches(days.slice(1), work.open, { paused: new Set(work.paused.keys()), daysOff: offs }).filter((i) => shown.has(i.type));
    const all = [...work.items, ...projected];
    const budget = [15, 30, 60, 120].includes(Number(request.query.budget)) ? Number(request.query.budget) : null;
    const asked = request.query.next !== undefined;
    const required = work.items.filter((i) => isRequired(i, today)).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
    const vos = work.items.filter((i) => isVo(i.type));
    return reply.type("text/html").send(
      renderMyDay(s, {
        now, today, required, ahead: doAhead(work.items, now, 10), done: work.doneItems,
        loads: dayLoads(all, days, today), trackedToday: tracked.get(today) ?? 0, running: work.timer,
        focus: asked ? whatNext(work.items, now, budget) : null, budget, asked,
        voLeft: { n: vos.length, minutes: vos.reduce((n, i) => n + remaining(i), 0) },
        hidden, exploded,
        log: { range: logRange, days: await timeLog(logRange, today, shown), daysOff: s.daysOff ?? [] },
      }),
    );
  });

  // My Day's switches, kept in this browser: which kinds of work show, and batches as one row each upload.
  const keepYear = { path: "/", sameSite: "lax" as const, httpOnly: true, maxAge: 60 * 60 * 24 * 365 };
  app.post<{ Body: { show?: string | string[] } }>("/my-day/show", async (request, reply) => {
    const raw = request.body?.show;
    const show = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const hide = MYDAY_GROUPS.map((g) => g.id).filter((g) => !show.includes(g));
    reply.setCookie("myday_hide", hide.join("."), keepYear);
    return reply.redirect("/my-day");
  });
  app.post<{ Body: { on?: string } }>("/my-day/explode", async (request, reply) => {
    reply.setCookie("myday_explode", request.body?.on === "1" ? "1" : "0", keepYear);
    return reply.redirect("/my-day");
  });
  // Clear the time tracked on a piece that's already done — someone else did it.
  app.post<{ Body: { id?: string; kind?: string; back?: string } }>("/timer/clear", async (request, reply) => {
    const id = Number(request.body?.id);
    if (hasDatabase && id) await clearTime(request.body?.kind === "task" ? { taskId: id } : { recordId: id });
    return reply.redirect(safeBack(request.body?.back, "/my-day"));
  });

  app.post<{ Body: { id?: string; kind?: string; back?: string } }>("/timer/start", async (request, reply) => {
    const id = Number(request.body?.id);
    if (hasDatabase && id) await forgetUntracked(`${request.body?.kind === "task" ? "t" : "r"}${id}`);
    if (hasDatabase && id) await (request.body?.kind === "task" ? startTaskTimer(id) : startTimer(id));
    return reply.redirect(safeBack(request.body?.back, "/my-day"));
  });
  app.post<{ Body: { back?: string } }>("/timer/stop", async (request, reply) => {
    if (hasDatabase) await stopTimer();
    return reply.redirect(safeBack(request.body?.back, "/my-day"));
  });
  // Done: the timer stops and the work is cleared.
  app.post<{ Body: { id?: string; kind?: string; back?: string; notime?: string } }>("/timer/done", async (request, reply) => {
    const id = Number(request.body?.id);
    // Done with no time: someone else did it, so nothing tracked on it counts as yours.
    if (hasDatabase && id && request.body?.notime === "1") await clearTime(request.body?.kind === "task" ? { taskId: id } : { recordId: id });
    if (hasDatabase && id && request.body?.kind === "task") {
      // Clearing a task stops its timer too; a repeating one opens its next.
      await setTaskStatus(id, true);
      await repeatTask(id);
    } else if (hasDatabase && id) {
      const running = await runningTimer();
      if (running?.recordId === id) await stopTimer();
      await setStatus(id, "done");
    }
    return reply.redirect(safeBack(request.body?.back, "/my-day"));
  });

  app.get("/vo", async (_request, reply) => {
    const now = new Date();
    const [s, work] = await Promise.all([shell("vo"), loadWork(now)]);
    return reply.type("text/html").send(renderVoQueue(s, { now, queue: voQueue(work.items, now), running: work.timer }));
  });

  // Recording mode: the first VO not skipped, timed from the moment it's shown.
  app.get<{ Querystring: { skip?: string } }>("/vo/record", async (request, reply) => {
    const now = new Date();
    const skipped = (request.query.skip ?? "").split(",").map(Number).filter((n) => n > 0);
    const [s, work] = await Promise.all([shell("vo"), loadWork(now)]);
    const queue = voQueue(work.items, now);
    const left = queue.filter((i) => !skipped.includes(i.id!));
    const current = left[0] ?? null;
    let running = work.timer;
    if (current?.id && hasDatabase && running?.recordId !== current.id) {
      await startTimer(current.id);
      running = { recordId: current.id, startedAt: new Date(), title: current.title, est: current.est, spentBefore: current.spent };
    }
    return reply.type("text/html").send(
      renderRecording(s, {
        now, current, position: current ? queue.indexOf(current) + 1 : 0, total: queue.length,
        next: left.slice(1, 4), running, skipped, brief: current?.record?.brief ?? null,
      }),
    );
  });
  app.post<{ Body: { id?: string; skip?: string } }>("/vo/record/done", async (request, reply) => {
    const id = Number(request.body?.id);
    if (hasDatabase && id) {
      await stopTimer();
      await setStatus(id, "done");
    }
    const skip = (request.body?.skip ?? "").replace(/[^0-9,]/g, "");
    return reply.redirect(`/vo/record${skip ? `?skip=${skip}` : ""}`);
  });

  // ── Tasks: anything forwarded into #tasks, or added here ───────────────
  const taskFields = (b: Record<string, string | undefined>) => {
    const category = (TASK_CATEGORY.has(b.category ?? "") ? b.category : "general") as TaskCategory;
    const priority = (PRIORITY.has(b.priority ?? "") ? b.priority : "normal") as Priority;
    // The form's date and time are the studio's wall clock.
    const day = (b.due_date ?? "").trim();
    const due = /^\d{4}-\d{2}-\d{2}$/.test(day) ? instantIn(day, /^\d{2}:\d{2}$/.test(b.due_time ?? "") ? b.due_time! : DEADLINE_TIME, ORG_TZ) : null;
    const est = Number(b.est);
    return {
      title: (b.title ?? "").trim().slice(0, 200) || "Task",
      category,
      priority,
      person: (b.person ?? "").trim().slice(0, 60) || null,
      due,
      estMin: Number.isFinite(est) && est > 0 ? Math.min(600, Math.round(est)) : null,
      notes: (b.notes ?? "").trim().slice(0, 4000),
      repeat: (REPEAT.has(b.repeat ?? "") ? b.repeat : null) as Repeat | null,
    };
  };
  const taskBack = (b: unknown) => safeBack(b, "/tasks");

  app.get("/tasks", async (_request, reply) => {
    const now = new Date();
    const [s, lists, work] = await Promise.all([shell("tasks"), hasDatabase ? listTasks() : Promise.resolve({ todo: [], snoozed: [], done: [] }), loadWork(now)]);
    return reply.type("text/html").send(renderTasks(s, { now, ...lists, running: work.timer }));
  });
  // Quick add: one line, read the same way as a message in #tasks.
  app.post<{ Body: { text?: string; notes?: string; repeat?: string } }>("/tasks", async (request, reply) => {
    const text = (request.body?.text ?? "").trim();
    if (hasDatabase && text) {
      const t = parseTask({ comment: text, people: await knownPeople().catch(() => []) });
      // A repeat picked in the form wins over one read from the words.
      const picked = REPEAT.has(request.body?.repeat ?? "") ? (request.body!.repeat as Repeat) : null;
      await addTask({ ...t, repeat: picked ?? t.repeat, notes: (request.body?.notes ?? "").trim().slice(0, 4000), sourceUrl: null, captureUrl: null, sourceMessageId: null, author: "board" });
    }
    return reply.redirect("/tasks");
  });
  app.post<{ Params: { id: string; action: string }; Body: Record<string, string | undefined> }>("/tasks/:id/:action", async (request, reply) => {
    const id = Number(request.params.id);
    const b = request.body ?? {};
    if (!hasDatabase || !id) return reply.redirect("/tasks");
    switch (request.params.action) {
      case "done":
        await setTaskStatus(id, true);
        // A repeating task opens its next occurrence.
        await repeatTask(id);
        break;
      case "reopen":
        await setTaskStatus(id, false);
        break;
      case "snooze": {
        // 1h, this evening, tomorrow morning, next week — or back now.
        const now = new Date();
        const today = dateIn(ORG_TZ, now);
        const at = (day: string, hhmm: string) => instantIn(day, hhmm, ORG_TZ);
        const until =
          b.for === "1h" ? new Date(now.getTime() + 3_600_000)
          : b.for === "3h" ? new Date(now.getTime() + 3 * 3_600_000)
          : b.for === "tomorrow" ? at(shiftDate(today, 1), "09:00")
          : b.for === "week" ? at(shiftDate(today, 7), "09:00")
          : null;
        await snoozeTask(id, until);
        break;
      }
      case "edit":
        await editTask(id, taskFields(b));
        break;
      case "delete":
        await deleteTask(id);
        break;
    }
    return reply.redirect(taskBack(b.back));
  });

  app.get("/forgotten", async (_request, reply) => {
    const [s, work] = await Promise.all([shell("forgotten"), loadWork()]);
    return reply.type("text/html").send(renderForgotten(s, { gaps: s.gaps ?? [], flags: work.forgotten }));
  });

  // Pause production on a whole channel, or resume it.
  app.post<{ Params: { action: string }; Body: { channel?: string } }>("/channels/:action", async (request, reply) => {
    const channel = CHANNELS.find((c) => c.name === request.body?.channel)?.name;
    const { action } = request.params;
    if (hasDatabase && channel && (action === "pause" || action === "resume")) {
      if (action === "pause") await pauseChannel(channel);
      else {
        await resumeChannel(channel);
        await reopenChannel(channel);
      }
      gapCache = null;
    }
    return reply.redirect(backTo(request.headers.referer, channel ? `/channel/${encodeURIComponent(channel)}` : "/"));
  });

  app.get<{ Params: { name: string } }>("/channel/:name", async (request, reply) => {
    const name = decodeURIComponent(request.params.name);
    const known = CHANNELS.find((c) => c.name === name);
    const [s, list] = await Promise.all([shell(known?.category ?? ""), listByChannel(name)]);
    const since = s.pausedChannels?.[name];
    return reply.type("text/html").send(
      renderList(
        s, name, `Nothing filed under ${name} yet.`, list, listSort(request, reply),
        known ? channelPauseButton(s, name) : "",
        since
          ? `<div class="pausedlead">${channelPausedTag(s, name)}Production on ${esc(name)} is paused since ${esc(usDate(since))}: its work is off every deadline, the calendar and the bell${known?.recurring ? ", and no daily batches open" : ""}.</div>`
          : "",
      ),
    );
  });

  app.get<{ Params: { id: string } }>("/category/:id", async (request, reply) => {
    const cat = CATEGORIES.find((c) => c.id === request.params.id);
    const s = await shell(cat?.id ?? "");
    if (!cat) return reply.code(404).type("text/html").send(renderList(s, "Not found", "No such category.", []));
    const [list, channels] = await Promise.all([listByCategory(cat.id), channelCounts()]);
    return reply.type("text/html").send(renderCategory(s, cat.label, cat.id, list, channels, listSort(request, reply)));
  });

  app.get<{ Params: { id: string }; Querystring: { moved?: string; scripterr?: string; sumerr?: string } }>("/r/:id", async (request, reply) => {
    const [s, record, scripts, review] = await Promise.all([
      shell(""),
      getRecord(Number(request.params.id)),
      hasDatabase ? scriptsFor(Number(request.params.id)).catch(() => []) : Promise.resolve([]),
      hasDatabase ? getReview(Number(request.params.id)).catch(() => null) : Promise.resolve(null),
    ]);
    if (!record) return reply.code(404).type("text/html").send(renderList(s, "Not found", "That record is gone.", []));
    // How many of its channel's videos would move with a new air date.
    const from = record.airDate;
    const later =
      from && record.channel && record.batchNo === null && !record.pausedAt
        ? (await channelSchedule(record.channel, "posting", dateIn(ORG_TZ))).filter(
            (r) => r.id !== record.id && r.airDate !== null && r.airDate > from,
          ).length
        : 0;
    const token = request.query.moved ?? "";
    const kept = token ? undos.get(token) : undefined;
    return reply
      .type("text/html")
      .send(
        renderRecord(s, record, {
          later,
          moved: kept ? { token, text: kept.text } : null,
          scripts,
          scriptError: (request.query.scripterr ?? "").slice(0, 200),
          review,
          frameio: Boolean(process.env.FRAMEIO_TOKEN?.trim()) && record.links.some((l) => l.kind === "frameio"),
          summaryError: (request.query.sumerr ?? "").slice(0, 300),
          missed: hasDatabase ? (await listMissed({ days: 30, recordId: record.id }).catch(() => [])).filter((m) => !m.undoneAt)[0] ?? null : null,
        }),
      );
  });

  /**
   * Summarize a revision: its Frame.io comments (pasted, or read through the
   * API), your own summary and rating, and the channel's earlier notes for
   * repeats — into a summary and a score out of 10.
   */
  app.post<{ Params: { id: string }; Body: { comments?: string; own?: string; rating?: string } }>("/r/:id/summarize", async (request, reply) => {
    const record = await getRecord(Number(request.params.id));
    if (!record || record.kind !== "review") return reply.redirect(`/r/${request.params.id}`);
    const back = (err?: string) => reply.redirect(`/r/${record.id}${err ? `?sumerr=${encodeURIComponent(err)}` : ""}#summary`);
    const before = await getReview(record.id);
    const pasted = parsePasted((request.body?.comments ?? "").slice(0, 200_000));
    let comments = pasted;
    let source = "pasted";
    let versions = record.version ?? 1;
    if (!pasted.length) {
      const link = record.links.find((l) => l.kind === "frameio");
      const fromApi = link ? await commentsFromFrameio(link.url) : null;
      if (fromApi?.ok) {
        comments = fromApi.comments;
        versions = Math.max(versions, fromApi.versions);
        source = "frameio";
      } else if (before) {
        // Nothing new: the notes already here, summed up again with the new take.
        comments = before.comments.filter((c) => c.source !== "you");
        source = before.source;
      } else if ((request.body?.own ?? "").trim()) {
        comments = [];
      } else {
        return back(fromApi?.error ?? "Paste the cut's Frame.io comments, or write your own summary.");
      }
    }
    versions = Math.max(versions, ...comments.map((c) => c.version ?? 1));
    const ownText = (request.body?.own ?? "").trim().slice(0, 5000);
    const ratingRaw = Number(request.body?.rating);
    const own = request.body?.rating && Number.isFinite(ratingRaw) ? Math.max(1, Math.min(10, ratingRaw)) : null;
    const title = displayTitle(record);
    const video = videoKey(record.code, title);
    const done = await summarize({
      title,
      channel: record.channel,
      comments: [...comments, ...ownNotes(ownText)],
      versions,
      past: await pastForChannel(record.channel, video, new Date()),
      own,
    });
    await saveReview({
      recordId: record.id, channel: record.channel, video, title, version: record.version, versions,
      comments: done.comments, source, summary: done.text, summaryBy: done.by, ownSummary: ownText || null, ownScore: own,
      autoScore: done.breakdown.auto, score: done.breakdown.score, breakdown: done.breakdown,
    });
    return back();
  });

  // ── scripts: pasted, or read from a Google Doc ──────────────────────────
  const reloadScripts = async () => setBoardScripts(await listScripts());
  /** The script to keep: what was pasted, else the doc's text. */
  async function scriptText(text: string | undefined, url: string | undefined): Promise<{ body: string; url: string | null } | { error: string }> {
    const pasted = (text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 200_000);
    const link = (url ?? "").trim().slice(0, 1000) || null;
    if (pasted) return { body: pasted, url: link };
    if (!link) return { error: "Paste the script, or give its Google Doc link." };
    const read = await readDoc(link);
    return read.ok ? { body: read.text, url: link } : { error: read.error };
  }

  app.post<{ Params: { id: string }; Body: { text?: string; url?: string } }>("/r/:id/scripts", async (request, reply) => {
    const record = await getRecord(Number(request.params.id));
    if (!record) return reply.redirect("/");
    const got = await scriptText(request.body?.text, request.body?.url);
    if ("error" in got) return reply.redirect(`/r/${record.id}?scripterr=${encodeURIComponent(got.error)}#script`);
    await addScript({ recordId: record.id, title: displayTitle(record), ...got });
    // The script is here, so the video isn't waiting on it any more.
    if (record.noScriptAt) await setNoScript(record.id, false);
    await reloadScripts();
    return reply.redirect(`/r/${record.id}#script`);
  });

  app.post<{ Body: { title?: string; text?: string; url?: string; from?: string } }>("/story-lab/scripts", async (request, reply) => {
    const title = (request.body?.title ?? "").trim().slice(0, 200);
    // Linked from Unassigned videos: back to that list, open, saying what happened.
    const fromList = request.body?.from === "unassigned";
    const fail = (why: string) =>
      reply.redirect(fromList ? `/story-lab?open=unassigned&linkerr=${encodeURIComponent(`${title}: ${why}`)}#unassigned` : `/story-lab?scripterr=${encodeURIComponent(why)}#scripts`);
    if (!hasDatabase) return reply.redirect(fromList ? "/story-lab?open=unassigned#unassigned" : "/story-lab#scripts");
    if (!title) return fail("Give the script its video title — that's how Story Lab reads its format, hero and world.");
    const got = await scriptText(request.body?.text, request.body?.url);
    if ("error" in got) return fail(got.error);
    await addScript({ recordId: null, title, ...got });
    await reloadScripts();
    return reply.redirect(fromList ? `/story-lab?open=unassigned&linked=${encodeURIComponent(title)}#unassigned` : "/story-lab#scripts");
  });

  // Read a linked doc again, for the latest draft.
  app.post<{ Params: { sid: string } }>("/scripts/:sid/refresh", async (request, reply) => {
    const script = await getScript(Number(request.params.sid));
    const back = backTo(request.headers.referer, "/story-lab#scripts").replace(/#.*$/, "");
    if (!script?.url) return reply.redirect(back);
    const read = await readDoc(script.url);
    const sep = back.includes("?") ? "&" : "?";
    if (!read.ok) return reply.redirect(`${back}${sep}scripterr=${encodeURIComponent(read.error)}#${script.recordId ? "script" : "scripts"}`);
    await updateScriptBody(script.id, read.text);
    await reloadScripts();
    return reply.redirect(`${back}#${script.recordId ? "script" : "scripts"}`);
  });

  app.post<{ Params: { sid: string } }>("/scripts/:sid/remove", async (request, reply) => {
    const script = await getScript(Number(request.params.sid));
    if (script) {
      await removeScript(script.id);
      await reloadScripts();
    }
    return reply.redirect(backTo(request.headers.referer, "/story-lab#scripts"));
  });

  /**
   * Only ever a path on this site. A Referer is attacker-controllable, so its
   * pathname is taken and everything else — host, scheme, a whole other URL —
   * is thrown away, which makes an open redirect impossible.
   */
  function backTo(referer: string | undefined, fallback: string): string {
    if (!referer) return fallback;
    try {
      const url = new URL(referer, "http://internal");
      return url.pathname + url.search;
    } catch {
      return fallback;
    }
  }

  app.post<{ Params: { id: string; action: string } }>("/r/:id/:action", async (request, reply) => {
    const { id, action } = request.params;
    if (action === "pin" || action === "unpin") {
      await setPinned(Number(id), action === "pin");
      return reply.redirect(backTo(request.headers.referer, `/r/${id}`));
    }
    // Pause takes it off every deadline until it's resumed; no script marks
    // it as waiting on the writer. Neither touches its status.
    if (action === "pause" || action === "resume") {
      await setPaused(Number(id), action === "pause");
      return reply.redirect(backTo(request.headers.referer, `/r/${id}`));
    }
    if (action === "uploaded" || action === "notuploaded") {
      await setUploaded(Number(id), action === "uploaded");
      return reply.redirect(backTo(request.headers.referer, `/r/${id}`));
    }
    if (action === "noscript" || action === "script") {
      await setNoScript(Number(id), action === "noscript");
      return reply.redirect(backTo(request.headers.referer, `/r/${id}`));
    }
    const status = action === "remove" ? "removed" : action;
    if (status !== "done" && status !== "open" && status !== "removed") {
      return reply.code(400).send("no");
    }
    await setStatus(Number(id), status);
    // Back where you pressed it, so clearing a list does not bounce you away.
    return reply.redirect(backTo(request.headers.referer, `/r/${id}`));
  });

  // Re-read a record with the parser as it is now. A channel someone set by
  // hand is kept when the fresh reading finds none — a correction is a fact
  // about the message that the parser may still not be able to see.
  app.post<{ Params: { id: string } }>("/r/:id/reread", async (request, reply) => {
    const id = Number(request.params.id);
    const current = await getRecord(id);
    if (!current || !current.raw.trim() || current.parsedBy === "recurring") {
      return reply.redirect(`/r/${id}`);
    }
    const result = await classify({ content: current.raw });
    const fresh = derive(result.extraction, result.raw, current.createdAt);
    if (!fresh.channel && current.channel) {
      fresh.channel = current.channel;
      fresh.category = current.category;
    }
    await refile(id, fresh, result.parsedBy);
    return reply.redirect(`/r/${id}`);
  });

  /** The VO a new air date implies, by the studio's rule. */
  const voFor = (air: string | null) =>
    air ? instantIn(shiftDate(air, -VO_BUFFER_DAYS), DEADLINE_TIME, ORG_TZ) : null;

  /** A deadline's time of day, so moving it to another day keeps it. */
  const timeOf = (at: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);

  /** Whichever deadline the Deadlines calendar shows a record by. */
  const dueOf = (r: StoredRecord) =>
    r.voDue ? { field: "vo_due" as const, at: r.voDue }
      : r.deadline ? { field: "deadline" as const, at: r.deadline }
        : r.scriptDue ? { field: "script_due" as const, at: r.scriptDue }
          : null;

  /** Where the calendar shows a record, in the given mode. */
  const dayIn = (r: StoredRecord, mode: CalendarMode) => {
    if (mode === "posting") return r.airDate;
    const due = dueOf(r);
    return due ? dayOf(due.at) : null;
  };

  /** Put a record on another day, the way the calendar in that mode means it. */
  async function placeOn(r: StoredRecord, date: string, mode: CalendarMode): Promise<boolean> {
    if (mode === "posting") {
      await moveAir(r.id, date, voFor(date));
      return true;
    }
    const due = dueOf(r);
    const at = due ? instantIn(date, timeOf(due.at), ORG_TZ) : null;
    if (!due || !at) return false;
    await moveDue(r.id, due.field, at);
    return true;
  }

  /**
   * Undo for a move that took the rest of a channel with it. Kept in memory for
   * fifteen minutes: long enough to notice, and a restart simply ends it.
   */
  const undos = new Map<string, { at: number; snaps: MoveSnapshot[]; text: string }>();
  const UNDO_MS = 15 * 60_000;
  function keepUndo(snaps: MoveSnapshot[], text: string): string {
    for (const [k, v] of undos) if (Date.now() - v.at > UNDO_MS) undos.delete(k);
    const token = randomUUID();
    undos.set(token, { at: Date.now(), snaps, text });
    return token;
  }

  /**
   * Move one record and, unless told otherwise, the rest of its channel's
   * schedule after it. Daily batches, paused videos and records with no
   * channel only ever move themselves.
   */
  async function moveWithRest(
    record: StoredRecord,
    date: string,
    mode: CalendarMode,
    alone: boolean,
  ): Promise<{ ok: boolean; plan: Cascade; undo: string | null; text: string }> {
    const none: Cascade = { days: 0, asked: 0, moves: [] };
    const from = dayIn(record, mode);
    const today = dateIn(ORG_TZ);
    const schedule =
      alone || !from || !record.channel || record.batchNo !== null || record.pausedAt
        ? []
        : await channelSchedule(record.channel, mode, today);
    const plan = from && schedule.length
      ? planCascade(
          { id: record.id, from, to: date },
          schedule.map((r) => ({ id: r.id, date: dayIn(r, mode)!, label: r.code ?? displayTitle(r) })),
          today,
        )
      : none;
    const snaps = plan.moves.length ? await snapshotMoves([record.id, ...plan.moves.map((m) => m.id)]) : [];
    if (!(await placeOn(record, date, mode))) return { ok: false, plan: none, undo: null, text: "" };
    const byId = new Map(schedule.map((r) => [r.id, r]));
    for (const m of plan.moves) await placeOn(byId.get(m.id)!, m.to, mode);
    const text = plan.moves.length ? cascadeText(record.channel!, plan) : "";
    return { ok: true, plan, undo: plan.moves.length ? keepUndo(snaps, text) : null, text };
  }

  // A calendar drag. Posting mode moves the air date; Deadlines mode moves
  // whichever deadline the calendar was showing, keeping its time of day. The
  // rest of the channel's schedule follows, unless Shift was held.
  app.post<{ Params: { id: string }; Body: { date?: string; mode?: string; only?: string } }>(
    "/r/:id/move",
    async (request, reply) => {
      const id = Number(request.params.id);
      const date = safeDate(request.body?.date);
      const record = await getRecord(id);
      if (!record || !date) return reply.code(400).send({ ok: false });
      const mode = safeMode(request.body?.mode);
      const moved = await moveWithRest(record, date, mode, request.body?.only === "1");
      if (!moved.ok) return reply.code(400).send({ ok: false });
      // A deadline dropped on a day off lands on the working day before; say so.
      const off = mode === "deadlines" && (await listDaysOff()).includes(date)
        ? `${usDate(date)} is a day off, so it's due the working day before. `
        : "";
      return reply.send({
        ok: true, moved: moved.plan.moves.length, days: moved.plan.days, text: off + moved.text, undo: moved.undo,
      });
    },
  );

  // Days off: mark one from the calendar (the moon on a day) or the
  // dashboard's date box, or make it a working day again.
  app.post<{ Params: { date: string }; Body: { on?: string } }>("/days-off/:date", async (request, reply) => {
    const date = safeDate(request.params.date);
    if (date) await markDayOff(date, request.body?.on !== "0");
    return reply.redirect(backTo(request.headers.referer, "/calendar"));
  });
  app.post<{ Body: { date?: string } }>("/days-off", async (request, reply) => {
    const date = safeDate(request.body?.date);
    if (date) await markDayOff(date, true);
    return reply.redirect(backTo(request.headers.referer, "/"));
  });

  /** A day off has no daily batches: they go when it's marked, and come back when it's a working day again. */
  async function markDayOff(date: string, on: boolean): Promise<void> {
    await setDayOff(date, on);
    if (on) {
      await clearBatchesOn(date);
      await spreadOff(date).catch((err) => console.error("[days off] couldn't spread the work:", err));
    } else await reopenBatchesOn(date);
    gapCache = null;
  }

  /**
   * The work due on a new day off, spread over the working days from
   * tomorrow up to it (today, if it's tomorrow) — balanced against what those
   * days already hold, most pressing first — rather than all on the day before.
   */
  async function spreadOff(date: string): Promise<void> {
    const now = new Date();
    const today = dateIn(ORG_TZ, now);
    if (date <= today) return;
    const [due, offs, work] = await Promise.all([dueOnDay(date), listDaysOff(), loadWork(now)]);
    const pieces = due.map((r) => toItem(r)).filter((i): i is MyWorkItem => i !== null);
    if (!pieces.length) return;
    const off = new Set(offs);
    const between = (from: string) => {
      const out: string[] = [];
      for (let d = from; d < date; d = shiftDate(d, 1)) if (!off.has(d)) out.push(d);
      return out;
    };
    let days = between(shiftDate(today, 1));
    if (!days.length) days = between(today);
    if (!days.length) return;
    const ids = new Set(pieces.map((i) => i.id));
    const projected = projectBatches(days.filter((d) => d > today), work.open, { paused: new Set(work.paused.keys()), daysOff: off });
    const load = new Map<string, number>();
    for (const i of [...work.items, ...projected]) {
      if (ids.has(i.id) || !i.day || !days.includes(i.day)) continue;
      load.set(i.day, (load.get(i.day) ?? 0) + remaining(i));
    }
    await saveDayOffMoves(date, spreadDayOff(pieces, days, load));
  }

  // Settings: the sidebar's items, the dashboard's lists, the days off.
  // Time estimates: the one place every page counts time from. Blank is the default.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/estimates", async (request, reply) => {
    const body = request.body ?? {};
    if (!hasDatabase) return reply.redirect("/settings#estimates");
    if (body.reset) {
      await resetEstimates();
    } else {
      const valid = new Set([
        ...WORK_TYPES.map((t) => `type:${t.id}`),
        ...CHANNELS.filter((c) => c.recurring).map((c) => `channel:${c.name}`),
        ...[...TASK_CATEGORY.keys()].map((k) => `task:${k}`),
      ]);
      const entries: Array<[string, number | null]> = [];
      for (const [field, raw] of Object.entries(body)) {
        if (!field.startsWith("e:") || !valid.has(field.slice(2))) continue;
        const n = Math.round(Number(raw));
        entries.push([field.slice(2), raw?.trim() && Number.isFinite(n) && n >= 1 ? Math.min(600, n) : null]);
      }
      await saveEstimates(entries);
    }
    return reply.redirect("/settings?estimates=saved#estimates");
  });

  // The login password: the current one, then the new one twice. Every other sign-in ends; this one carries on.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/password", async (request, reply) => {
    const b = request.body ?? {};
    const fail = (why: string) => reply.redirect(`/settings?${new URLSearchParams({ pwerr: why }).toString()}#password`);
    if (!hasDatabase) return fail("The password can only be changed with the database connected.");
    if (!checkPassword(b.current ?? "")) return fail("The current password isn't right.");
    const next = b.next ?? "";
    if (next.length < 8) return fail("The new password needs at least 8 characters.");
    if (next.length > 200) return fail("That's too long (200 characters at most).");
    if (next !== (b.again ?? "")) return fail("The two new passwords don't match.");
    if (checkPassword(next)) return fail("That's the password already.");
    await saveBoardPassword(next);
    return reply.setCookie(COOKIE_NAME, issueToken(), COOKIE_OPTIONS).redirect("/settings?pw=changed#password");
  });

  app.get<{ Querystring: { saved?: string; colours?: string; estimates?: string; chmsg?: string; cherr?: string; pw?: string; pwerr?: string } }>("/settings", async (request, reply) => {
    const [s, shifted, sources, settings] = await Promise.all([shell("settings"), listOffShifted(), colourSources(), listChannelSettings().catch(() => [])]);
    const sampled = new Set(sampledChannels());
    // An added channel with nothing filed under it yet can be taken off again.
    const added = CHANNELS.filter((c) => settings.some((x) => x.id === c.id && x.added));
    const unused = new Set<string>();
    for (const c of added) {
      const use = await channelUse(c.name).catch(() => null);
      if (use && !use.records && !use.uploads) unused.add(c.id);
    }
    return reply.type("text/html").send(
      renderSettings(s, {
        railHide: s.railHide ?? [],
        dashHide: cookieList("dash_hide"),
        daysOff: s.daysOff ?? [],
        shifted: shifted.map((x) => x.record),
        saved: request.query.saved === "1",
        scripts: Boolean(s.scripts),
        colours: CHANNELS.map((c) => {
          const src = sources.get(c.name);
          const set = settings.find((x) => x.id === c.id);
          return {
            id: c.id, name: c.name, category: c.category, colour: c.color, source: src?.source ?? "catalog",
            sampled: sampled.has(c.name), linked: src?.linked ?? false, error: src?.error ?? null,
            previous: set?.previous ?? [], added: Boolean(set?.added), removable: unused.has(c.id), daily: c.recurring?.units ?? null,
          };
        }),
        newColour: distinctColour([...CHANNELS.map((c) => c.color), ...CATEGORIES.map((c) => c.color)]),
        estimatesSaved: request.query.estimates === "saved",
        password: { changedAt: passwordChangedAt(), saved: request.query.pw === "changed", error: (request.query.pwerr ?? "").slice(0, 200) },
        coloursSaved:
          request.query.chmsg ? request.query.chmsg.slice(0, 300) : request.query.colours === "saved" ? "Saved." : request.query.colours === "read" ? "Read the avatars again." : "",
        channelError: (request.query.cherr ?? "").slice(0, 300),
      }),
    );
  });

  // Channel colours: set by hand, reset to the avatar's (or the catalog's),
  // or read every Shorts avatar again now.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/colours", async (request, reply) => {
    const body = request.body ?? {};
    // Names first: a renamed channel's colour is then saved under its new name.
    const renamed: string[] = [];
    const failed: string[] = [];
    for (const c of [...CHANNELS]) {
      const v = body[`n_${c.id}`];
      if (typeof v !== "string" || v.replace(/\s+/g, " ").trim() === c.name) continue;
      const r = await renameChannel(c.id, v);
      if ("error" in r) failed.push(r.error);
      else if (r.from !== r.name) renamed.push(`${r.from} is now ${r.name}`);
    }
    if (body.reset) {
      const c = CHANNELS.find((ch) => ch.id === body.reset);
      if (c) await setChannelColour(c.name, null);
      return reply.redirect("/settings?colours=saved#colours");
    }
    if (body.sample) {
      await sampleAvatars(fetch, true).catch((err) => console.error("[colours] sampling failed:", err));
      return reply.redirect("/settings?colours=read#colours");
    }
    for (const c of CHANNELS) {
      const v = body[`c_${c.id}`];
      if (v && /^#[0-9a-f]{6}$/i.test(v) && v.toUpperCase() !== c.color.toUpperCase()) await setChannelColour(c.name, v);
    }
    const q = new URLSearchParams({ colours: "saved" });
    if (renamed.length) q.set("chmsg", `${renamed.join("; ")} — everywhere on the board.`);
    if (failed.length) q.set("cherr", failed.join(" "));
    return reply.redirect(`/settings?${q.toString()}#colours`);
  });

  // A new channel, in the category picked: on every page, and the bot knows it, straight away.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/channels/add", async (request, reply) => {
    const b = request.body ?? {};
    const units = b.units?.trim() ? Number(b.units) : null;
    const r = await addChannel({ name: b.name ?? "", category: b.category ?? "", units, colour: b.colour ?? "" });
    const q = new URLSearchParams("error" in r ? { cherr: r.error } : { chmsg: `Added ${r.name}.` });
    return reply.redirect(`/settings?${q.toString()}#colours`);
  });
  // Take an added channel off again, while nothing's been filed under it.
  app.post<{ Body: Record<string, string | undefined> }>("/settings/channels/remove", async (request, reply) => {
    const id = request.body?.remove ?? "";
    const name = CHANNELS.find((c) => c.id === id)?.name ?? "";
    const r = await removeChannel(id);
    const q = new URLSearchParams("error" in r ? { cherr: r.error } : { chmsg: `Took ${name} off the board.` });
    return reply.redirect(`/settings?${q.toString()}#colours`);
  });
  app.post<{ Body: { show?: string | string[]; dash?: string | string[] } }>("/settings", async (request, reply) => {
    const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
    const show = new Set(list(request.body?.show));
    const dash = new Set(list(request.body?.dash));
    const railHide = RAIL_ITEMS.map((i) => i.key).filter((k) => !show.has(k) && (k !== "scripts" || config.scriptsUrl || config.scriptsUrlRaw));
    const dashHide = ["revisions", "unsorted", "channels"].filter((k) => !dash.has(k));
    // Not httpOnly: the dashboard's own switches write dash_hide from the page.
    const keep = { path: "/", sameSite: "lax" as const, maxAge: 60 * 60 * 24 * 365, httpOnly: false };
    reply.setCookie("rail_hide", railHide.join(".") || "none", keep);
    reply.setCookie("dash_hide", dashHide.join(".") || "none", keep);
    return reply.redirect("/settings?saved=1");
  });

  // Put a move back: the dragged video and everything that went with it.
  app.post<{ Body: { token?: string } }>("/moves/undo", async (request, reply) => {
    const kept = undos.get(String(request.body?.token ?? ""));
    const json = (request.headers.accept ?? "").includes("application/json");
    if (!kept) return json ? reply.code(410).send({ ok: false }) : reply.redirect(backTo(request.headers.referer, "/calendar"));
    undos.delete(String(request.body?.token));
    await restoreMoves(kept.snaps);
    if (json) return reply.send({ ok: true });
    // From a record's page: back to it, without the note that offered this.
    const back = backTo(request.headers.referer, "/calendar");
    return reply.redirect(back.replace(/\?.*$/, ""));
  });

  // The date box on a record's page — for a phone, where dragging is awkward,
  // or for a date weeks away. Empty clears it. With "move the rest" ticked the
  // channel's later videos go with it, as they do on the calendar.
  app.post<{ Params: { id: string }; Body: { air?: string; rest?: string } }>("/r/:id/air", async (request, reply) => {
    const id = Number(request.params.id);
    const raw = (request.body?.air ?? "").trim();
    const date = raw ? safeDate(raw) : null;
    if (raw && !date) return reply.redirect(`/r/${id}`);
    const record = await getRecord(id);
    if (!record) return reply.redirect(`/r/${id}`);
    if (!date || !record.airDate) {
      await moveAir(id, date, voFor(date));
      return reply.redirect(`/r/${id}`);
    }
    const moved = await moveWithRest(record, date, "posting", request.body?.rest !== "1");
    return reply.redirect(moved.undo ? `/r/${id}?moved=${moved.undo}` : `/r/${id}`);
  });

  // One segment on a reading channel's day: how many of its uploads are done.
  app.post<{ Body: { channel?: string; date?: string; done?: string } }>(
    "/recurring/progress",
    async (request, reply) => {
      const channel = request.body?.channel;
      const date = safeDate(request.body?.date);
      const done = Number(request.body?.done);
      if (channel && date && Number.isInteger(done) && CHANNELS.some((c) => c.name === channel)) {
        await setBatchProgress(channel, date, done);
      }
      return reply.redirect(backTo(request.headers.referer, "/recurring"));
    },
  );

  app.post<{ Body: { channel?: string; date?: string } }>("/recurring/clear", async (request, reply) => {
    const channel = request.body?.channel;
    const date = safeDate(request.body?.date);
    if (channel && date && CHANNELS.some((c) => c.name === channel)) {
      await clearBatches(channel, date);
    }
    return reply.redirect(backTo(request.headers.referer, "/recurring"));
  });

  /**
   * The daily posting check, after each hourly read: yesterday's scheduled
   * videos against what went up. Missed ones are pushed a day, the rest of
   * the channel with them, and posted to the digest channel on Discord.
   */
  async function runPostCheck(): Promise<void> {
    const r = await checkPosts(async (record, to, alone) => {
      const m = await moveWithRest(record, to, "posting", alone);
      return { ok: m.ok, moved: m.plan.moves.length };
    });
    if (r.checked.length) {
      console.log(`[posts] ${r.day}: ${r.checked.length} channels checked, ${r.posted.length} posted, ${r.missed.length} missed${r.waiting.length ? `, waiting on ${r.waiting.join(", ")}` : ""}`);
      gapCache = null;
    }
    if (!r.missed.length || !config.digestChannelId) return;
    try {
      const { client } = await import("../bot/client.js");
      if (!client.isReady()) return;
      const channel = await client.channels.fetch(config.digestChannelId);
      if (!channel?.isSendable()) return;
      const lines = await Promise.all(
        r.missed.map(async (m) => {
          const rec = await getRecordById(m.recordId);
          const link = config.publicUrl ? ` · [open](${config.publicUrl}/r/${m.recordId})` : "";
          return missedLine(m, rec ? displayTitle(rec) : `#${m.recordId}`, usDate) + link;
        }),
      );
      await channel.send({
        content: `📅 **Not posted yesterday** — ${r.missed.length === 1 ? "pushed a day" : `${r.missed.length} videos pushed a day`}\n${lines.join("\n")}\nPosted after all? Open it and press *It was posted* to put the schedule back.`,
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      console.error("[posts] couldn't post to Discord:", err);
    }
  }

  // It went up after all: put the channel's schedule back and mark it uploaded.
  app.post<{ Params: { id: string } }>("/missed/:id/undo", async (request, reply) => {
    const recordId = hasDatabase ? await undoMissed(Number(request.params.id), restoreMoves) : null;
    gapCache = null;
    return reply.redirect(recordId ? `/r/${recordId}` : backTo(request.headers.referer, "/"));
  });

  // Read YouTube hourly (at :07), and once shortly after boot.
  if (hasDatabase) {
    const read = (why: string) =>
      syncUploads()
        .then((r) => r.channels && console.log(`[uploads] ${why}: ${r.channels} channels, ${r.added} new, ${r.errors} failed`))
        .then(() => runPostCheck())
        .then(() => announceBreakouts())
        .then((n) => n && console.log(`[uploads] announced ${n} breakout${n === 1 ? "" : "s"}`))
        .then(() => sampleAvatars())
        .then((a) => (a.sampled || a.failed) && console.log(`[colours] ${a.sampled} avatars sampled, ${a.failed} failed`))
        .catch((err) => console.error("[uploads] read failed:", err));
    cron.schedule("7 * * * *", () => void read("hourly"));
    setTimeout(() => void read("boot"), 20_000).unref();
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[web] listening on :${config.port}`);
  console.log(`[web] storage: ${hasDatabase ? "connected" : "none — set DATABASE_URL"}`);
}
