/**
 * Ash's own work: My Day and its switches, the timers, the VO Queue and
 * recording mode, and Forgotten work.
 */
import { LOG_RANGES, type LogRange, type LoggedEntry, MYDAY_GROUPS, dayLoads, doAhead, isRequired, isVo, logByDay, logDays, nextDays, projectBatches, remaining, shownTypes, typeOf, voQueue, whatNext } from "../work.js";
import { ORG_TZ, dateIn, instantIn, shiftDate } from "../../parse/derive.js";
import { type StoredRecord, setStatus } from "../../db/records.js";
import { clearTime, forgetUntracked, loggedBetween, minutesByDay, runningTimer, startTaskTimer, startTimer, stopTimer } from "../../db/timers.js";
import { hasDatabase } from "../../config.js";
import { localPath } from "../http.js";
import { renderForgotten, renderMyDay, renderRecording, renderVoQueue } from "../pages/mywork.js";
import { repeatTask, setTaskStatus } from "../../db/tasks.js";
import { loadWork, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

// ── My Day, timers, the VO Queue, recording mode, forgotten work ──────

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

// My Day's switches, kept in this browser: which kinds of work show, and batches as one row each upload.
const keepYear = { path: "/", sameSite: "lax" as const, httpOnly: true, maxAge: 60 * 60 * 24 * 365 };

export function registerMyWork(app: FastifyInstance): void {
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
    return reply.redirect(localPath(request.body?.back, "/my-day"));
  });

  app.post<{ Body: { id?: string; kind?: string; back?: string } }>("/timer/start", async (request, reply) => {
    const id = Number(request.body?.id);
    if (hasDatabase && id) await forgetUntracked(`${request.body?.kind === "task" ? "t" : "r"}${id}`);
    if (hasDatabase && id) await (request.body?.kind === "task" ? startTaskTimer(id) : startTimer(id));
    return reply.redirect(localPath(request.body?.back, "/my-day"));
  });
  app.post<{ Body: { back?: string } }>("/timer/stop", async (request, reply) => {
    if (hasDatabase) await stopTimer();
    return reply.redirect(localPath(request.body?.back, "/my-day"));
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
    return reply.redirect(localPath(request.body?.back, "/my-day"));
  });

  app.get("/vo", async (_request, reply) => {
    const now = new Date();
    const [s, work] = await Promise.all([shell("vo"), loadWork(now)]);
    return reply.type("text/html").send(renderVoQueue(s, { now, queue: voQueue(work.items, now), running: work.timer }));
  });

  // Recording mode: the first VO not skipped, timed from the moment it's shown.
  // Opening it changes nothing: the page starts the VO's timer itself with a
  // POST, so a reload, the back button or a browser's prefetch can't.
  app.get<{ Querystring: { skip?: string; started?: string } }>("/vo/record", async (request, reply) => {
    const now = new Date();
    const skipped = (request.query.skip ?? "").split(",").map(Number).filter((n) => n > 0);
    const [s, work] = await Promise.all([shell("vo"), loadWork(now)]);
    const queue = voQueue(work.items, now);
    const left = queue.filter((i) => !skipped.includes(i.id!));
    const current = left[0] ?? null;
    const running = current?.id && work.timer?.recordId === current.id ? work.timer : null;
    return reply.type("text/html").send(
      renderRecording(s, {
        now, current, position: current ? queue.indexOf(current) + 1 : 0, total: queue.length,
        next: left.slice(1, 4), running, skipped, brief: current?.record?.brief ?? null,
        // Start it on arrival, once: back here with started=<id> and still not running means it didn't take.
        autoStart: hasDatabase && Boolean(current?.id) && !running && request.query.started !== String(current?.id),
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

  app.get("/forgotten", async (_request, reply) => {
    const [s, work] = await Promise.all([shell("forgotten"), loadWork()]);
    return reply.type("text/html").send(renderForgotten(s, { gaps: s.gaps ?? [], flags: work.forgotten }));
  });
}
