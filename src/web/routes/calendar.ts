/**
 * The calendar: Month, Week, 4 days and Day, by air date or deadline; days
 * off; and the subscribable feed (calendar.ics, signed by its own key).
 */
import { CATEGORIES, CHANNELS } from "../../catalog.js";
import { type CalendarMode, type StoredRecord, calendarRange, dueOnDay, feedRecords, listDaysOff, saveDayOffMoves, setDayOff } from "../../db/records.js";
import { DAY_SPAN, type StatusHide, calendarGrid, monthOf, renderCalendar, renderDay, renderWeek, weekStart } from "../pages/calendar.js";
import { type WorkItem as MyWorkItem, projectBatches, remaining, spreadDayOff, toItem } from "../work.js";
import { ORG_TZ, dateIn, shiftDate } from "../../parse/derive.js";
import { isMonth } from "../../finance/money.js";
import { buildIcs, checkFeedKey, feedKey, parseFeedOptions } from "../ics.js";
import { clearBatchesOn, reopenBatchesOn } from "../../jobs/batches.js";
import { hasDatabase } from "../../config.js";
import { renderList } from "../pages/lists.js";
import { baseUrlOf, refererPath, safeDate, safeMode } from "../http.js";
import { forgetGaps, loadWork, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

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

/** A day off has no daily batches: they go when it's marked, and come back when it's a working day again. */
async function markDayOff(date: string, on: boolean): Promise<void> {
  await setDayOff(date, on);
  if (on) {
    await clearBatchesOn(date);
    await spreadOff(date).catch((err) => console.error("[days off] couldn't spread the work:", err));
  } else await reopenBatchesOn(date);
  forgetGaps();
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

/** A real YYYY-MM from the address, else this month — so a bad URL can't 500. */
function safeMonth(value: string | undefined): string {
  return isMonth(value) ? value : monthOf();
}

export function registerCalendar(app: FastifyInstance): void {
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

  app.get<{ Params: { ym?: string }; Querystring: { mode?: string } }>(
    "/calendar/:ym",
    async (request, reply) => calendar(request.params.ym, request.query.mode, request, reply),
  );

  // The sidebar's Calendar: opens the way it was last left — Day, 4 days,
  // Week or Month, deadlines or posting.
  app.get<{ Querystring: { mode?: string } }>("/calendar", async (request, reply) => {
    const [view, savedMode] = (request.cookies.cal_view ?? "").split(".");
    const mode = request.query.mode ?? (savedMode === "deadlines" ? "deadlines" : undefined);
    const q = mode ? `?mode=${safeMode(mode)}` : "";
    if (view === "day") return reply.redirect(`/day/${dateIn(ORG_TZ)}${q}`);
    if (view === "4day") return reply.redirect(`/4day/${dateIn(ORG_TZ)}${q}`);
    if (view === "week") return reply.redirect(`/week/${dateIn(ORG_TZ)}${q}`);
    return calendar(undefined, mode, request, reply);
  });

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

  // Days off: mark one from the calendar (the moon on a day) or the
  // dashboard's date box, or make it a working day again.
  app.post<{ Params: { date: string }; Body: { on?: string } }>("/days-off/:date", async (request, reply) => {
    const date = safeDate(request.params.date);
    if (date) await markDayOff(date, request.body?.on !== "0");
    return reply.redirect(refererPath(request.headers.referer, "/calendar"));
  });
  app.post<{ Body: { date?: string } }>("/days-off", async (request, reply) => {
    const date = safeDate(request.body?.date);
    if (date) await markDayOff(date, true);
    return reply.redirect(refererPath(request.headers.referer, "/"));
  });
}
