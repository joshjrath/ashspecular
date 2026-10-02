/**
 * Tasks: the list, quick add (read like a message in #tasks), and each
 * task's actions.
 */
import { DEADLINE_TIME, ORG_TZ, dateIn, instantIn, shiftDate } from "../../parse/derive.js";
import { PRIORITY, type Priority, TASK_CATEGORY, type TaskCategory, parseTask } from "../../tasks/parse.js";
import { REPEAT, type Repeat } from "../../tasks/repeat.js";
import { addTask, deleteTask, editTask, knownPeople, listTasks, repeatTask, setTaskStatus, snoozeTask } from "../../db/tasks.js";
import { hasDatabase } from "../../config.js";
import { localPath } from "../http.js";
import { renderTasks } from "../pages/tasks.js";
import { loadWork, shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

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
const taskBack = (b: unknown) => localPath(b, "/tasks");

export function registerTasks(app: FastifyInstance): void {
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
}
