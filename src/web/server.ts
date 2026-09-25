import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { config, hasDatabase } from "../config.js";
import { CATEGORIES, CHANNELS } from "../catalog.js";
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
  listByDay,
  search,
  listReviews,
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
  type CalendarMode,
} from "../db/records.js";
import { migrate } from "../db/migrate.js";
import { classify } from "../parse/classify.js";
import {
  DEADLINE_TIME,
  VO_BUFFER_DAYS,
  derive,
  instantIn,
  shiftDate,
} from "../parse/derive.js";
import { batchStatus, openBatchesFor, tomorrow } from "../jobs/batches.js";
import { COOKIE_NAME, COOKIE_OPTIONS, checkPassword, issueToken, verifyToken } from "./auth.js";
import { SORTS, type Shell, type SortDir, type SortKey, type SortState } from "./page.js";
import {
  monthOf,
  renderCalendar,
  renderCategory,
  renderDashboard,
  renderDay,
  renderEmptyState,
  renderList,
  renderLogin,
  renderRecurring,
  renderRecord,
} from "./page.js";

const PUBLIC = new Set(["/login", "/healthz"]);

/**
 * The sidebar's numbers, fetched once per request. Every page carries them, so
 * the counts can never disagree between one page and the next.
 */
async function shell(active: string): Promise<Shell> {
  const [counts, reviews, grouped, at, month, removed, batchesOpen] = await Promise.all([
    categoryCounts(),
    listReviews(200),
    openByCategory(),
    lastIntake(),
    monthEntries(monthOf()),
    removedCount(),
    openBatchCount(dateIn(ORG_TZ)),
  ]);
  const queue = [...grouped.values()].reduce((n, list) => n + list.length, 0);
  return {
    active,
    counts,
    nav: {
      reviews: reviews.length,
      queue,
      recurring: batchesOpen,
      calendar: month.length,
    },
    lastIntake: at,
    removed,
  };
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

export async function startWeb(): Promise<void> {
  if (!config.dashboardPassword) {
    console.error("[web] DASHBOARD_PASSWORD is not set.");
    console.error("      The board shows the whole studio's work, so it will not run open.");
    process.exit(1);
  }

  if (hasDatabase) await migrate();

  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie);
  await app.register(formbody);

  app.addHook("onRequest", async (request, reply) => {
    if (PUBLIC.has(request.url.split("?")[0] ?? "")) return;
    if (verifyToken(request.cookies[COOKIE_NAME])) return;
    return reply.redirect("/login");
  });

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/login", async (_req, reply) => reply.type("text/html").send(renderLogin()));

  app.post<{ Body: { password?: string } }>("/login", async (request, reply) => {
    if (!checkPassword(request.body?.password ?? "")) {
      return reply.code(401).type("text/html").send(renderLogin("Wrong password."));
    }
    return reply.setCookie(COOKIE_NAME, issueToken(), COOKIE_OPTIONS).redirect("/");
  });

  app.get("/", async (_req, reply) => {
    if (!hasDatabase) return reply.type("text/html").send(renderEmptyState());

    const [s, counters, byDay, grouped, channels] = await Promise.all([
      shell("dashboard"),
      stats(ORG_TZ),
      dueByDay(ORG_TZ, 14),
      openByCategory(),
      channelCounts(),
    ]);

    return reply
      .type("text/html")
      .send(renderDashboard(s, { stats: counters, byDay, grouped, channels }));
  });

  app.get<{ Params: { ym?: string }; Querystring: { mode?: string } }>(
    "/calendar/:ym",
    async (request, reply) => calendar(request.params.ym, request.query.mode, request, reply),
  );

  app.get<{ Querystring: { mode?: string } }>("/calendar", async (request, reply) =>
    calendar(undefined, request.query.mode, request, reply),
  );

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

  async function calendar(
    ymRaw: string | undefined,
    modeRaw: string | undefined,
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) {
    const ym = safeMonth(ymRaw);
    const mode = safeMode(modeRaw);
    const hide = hiddenCategories(request, reply);
    const [s, entries] = await Promise.all([shell("calendar"), monthEntries(ym, mode)]);
    const shown = entries.filter((e) => !hide.includes(e.record.category));
    return reply.type("text/html").send(renderCalendar(s, ym, mode, shown, hide));
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
      const list = await listByDay(date, mode, ORG_TZ);
      return reply.type("text/html").send(renderDay(s, date, mode, list));
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

  app.get("/revisions", async (request, reply) => {
    const [s, list] = await Promise.all([shell("reviews"), listReviews(100)]);
    return reply
      .type("text/html")
      .send(
        renderList(s, "Revisions", "No Frame.io links yet. Forward one into the intake channel.", list, listSort(request, reply)),
      );
  });

  app.get("/queue", async (request, reply) => {
    const [s, grouped] = await Promise.all([shell("queue"), openByCategory()]);
    const all = CATEGORIES.flatMap((c) => grouped.get(c.id) ?? []).concat(
      grouped.get("unknown") ?? [],
    );
    return reply.type("text/html").send(renderList(s, "Queue", "Nothing open.", all, listSort(request, reply)));
  });

  app.get("/recurring", async (_req, reply) => {
    const t = tomorrow();
    const [s, todayRows, aheadRows, list] = await Promise.all([
      shell("recurring"),
      batchStatus(dateIn(ORG_TZ)),
      batchStatus(t),
      listBatchesOn(dateIn(ORG_TZ)),
    ]);
    return reply
      .type("text/html")
      .send(
        renderRecurring(
          s,
          { date: dateIn(ORG_TZ), rows: todayRows },
          { date: t, rows: aheadRows },
          list,
        ),
      );
  });

  // Working ahead: the opener is idempotent, so tomorrow's morning run finds
  // these already there and leaves them — including anything already cleared.
  app.post("/recurring/ahead", async (_req, reply) => {
    await openBatchesFor(tomorrow());
    return reply.redirect("/recurring");
  });

  app.get<{ Params: { name: string } }>("/channel/:name", async (request, reply) => {
    const name = decodeURIComponent(request.params.name);
    const known = CHANNELS.find((c) => c.name === name);
    const [s, list] = await Promise.all([shell(known?.category ?? ""), listByChannel(name)]);
    return reply
      .type("text/html")
      .send(renderList(s, name, `Nothing filed under ${name} yet.`, list, listSort(request, reply)));
  });

  app.get<{ Params: { id: string } }>("/category/:id", async (request, reply) => {
    const cat = CATEGORIES.find((c) => c.id === request.params.id);
    const s = await shell(cat?.id ?? "");
    if (!cat) return reply.code(404).type("text/html").send(renderList(s, "Not found", "No such category.", []));
    const [list, channels] = await Promise.all([listByCategory(cat.id), channelCounts()]);
    return reply.type("text/html").send(renderCategory(s, cat.label, cat.id, list, channels, listSort(request, reply)));
  });

  app.get<{ Params: { id: string } }>("/r/:id", async (request, reply) => {
    const [s, record] = await Promise.all([shell(""), getRecord(Number(request.params.id))]);
    if (!record) return reply.code(404).type("text/html").send(renderList(s, "Not found", "That record is gone.", []));
    return reply.type("text/html").send(renderRecord(s, record));
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
    const fresh = derive(result.extraction, result.raw);
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

  // A calendar drag. Posting mode moves the air date; Deadlines mode moves
  // whichever deadline the calendar was showing, keeping its time of day.
  app.post<{ Params: { id: string }; Body: { date?: string; mode?: string } }>(
    "/r/:id/move",
    async (request, reply) => {
      const id = Number(request.params.id);
      const date = safeDate(request.body?.date);
      const record = await getRecord(id);
      if (!record || !date) return reply.code(400).send({ ok: false });

      if (safeMode(request.body?.mode) === "posting") {
        await moveAir(id, date, voFor(date));
      } else {
        const field = record.voDue ? "vo_due" : record.deadline ? "deadline" : record.scriptDue ? "script_due" : null;
        const current = record.voDue ?? record.deadline ?? record.scriptDue;
        if (!field || !current) return reply.code(400).send({ ok: false });
        const hhmm = new Intl.DateTimeFormat("en-GB", {
          timeZone: ORG_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(current);
        const at = instantIn(date, hhmm, ORG_TZ);
        if (!at) return reply.code(400).send({ ok: false });
        await moveDue(id, field, at);
      }
      return reply.send({ ok: true });
    },
  );

  // The date box on a record's page — for a phone, where dragging is awkward,
  // or for a date weeks away. Empty clears it.
  app.post<{ Params: { id: string }; Body: { air?: string } }>("/r/:id/air", async (request, reply) => {
    const id = Number(request.params.id);
    const raw = (request.body?.air ?? "").trim();
    const date = raw ? safeDate(raw) : null;
    if (raw && !date) return reply.redirect(`/r/${id}`);
    await moveAir(id, date, voFor(date));
    return reply.redirect(`/r/${id}`);
  });

  app.post<{ Body: { channel?: string; date?: string } }>("/recurring/clear", async (request, reply) => {
    const channel = request.body?.channel;
    const date = safeDate(request.body?.date);
    if (channel && date && CHANNELS.some((c) => c.name === channel)) {
      await clearBatches(channel, date);
    }
    return reply.redirect("/recurring");
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[web] listening on :${config.port}`);
  console.log(`[web] storage: ${hasDatabase ? "connected" : "none — set DATABASE_URL"}`);
}
