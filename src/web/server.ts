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
  clearBatches,
  type CalendarMode,
} from "../db/records.js";
import { migrate } from "../db/migrate.js";
import { batchStatus, openBatchesFor, tomorrow } from "../jobs/batches.js";
import { COOKIE_NAME, COOKIE_OPTIONS, checkPassword, issueToken, verifyToken } from "./auth.js";
import type { Shell } from "./page.js";
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
  const [counts, reviews, grouped, at, month] = await Promise.all([
    categoryCounts(),
    listReviews(200),
    openByCategory(),
    lastIntake(),
    monthEntries(monthOf()),
  ]);
  const queue = [...grouped.values()].reduce((n, list) => n + list.length, 0);
  return {
    active,
    counts,
    nav: {
      reviews: reviews.length,
      queue,
      recurring: counts.bits ?? 0,
      calendar: month.length,
    },
    lastIntake: at,
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
    async (request, reply) => calendar(request.params.ym, request.query.mode, reply),
  );

  app.get<{ Querystring: { mode?: string } }>("/calendar", async (request, reply) =>
    calendar(undefined, request.query.mode, reply),
  );

  async function calendar(
    ymRaw: string | undefined,
    modeRaw: string | undefined,
    reply: import("fastify").FastifyReply,
  ) {
    const ym = safeMonth(ymRaw);
    const mode = safeMode(modeRaw);
    const [s, entries] = await Promise.all([shell("calendar"), monthEntries(ym, mode)]);
    return reply.type("text/html").send(renderCalendar(s, ym, mode, entries));
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
      .send(renderList(s, `“${q}”`, `Nothing matches “${q}”.`, list));
  });

  app.get("/reviews", async (_req, reply) => {
    const [s, list] = await Promise.all([shell("reviews"), listReviews(100)]);
    return reply
      .type("text/html")
      .send(
        renderList(s, "Reviews", "No Frame.io links yet. Forward one into the intake channel.", list),
      );
  });

  app.get("/queue", async (_req, reply) => {
    const [s, grouped] = await Promise.all([shell("queue"), openByCategory()]);
    const all = CATEGORIES.flatMap((c) => grouped.get(c.id) ?? []).concat(
      grouped.get("unknown") ?? [],
    );
    return reply.type("text/html").send(renderList(s, "Queue", "Nothing open.", all));
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
      .send(renderList(s, name, `Nothing filed under ${name} yet.`, list));
  });

  app.get<{ Params: { id: string } }>("/category/:id", async (request, reply) => {
    const cat = CATEGORIES.find((c) => c.id === request.params.id);
    const s = await shell(cat?.id ?? "");
    if (!cat) return reply.code(404).type("text/html").send(renderList(s, "Not found", "No such category.", []));
    const [list, channels] = await Promise.all([listByCategory(cat.id), channelCounts()]);
    return reply.type("text/html").send(renderCategory(s, cat.label, cat.id, list, channels));
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
    if (action !== "done" && action !== "open") return reply.code(400).send("no");
    await setStatus(Number(id), action);
    // Back where you pressed it, so clearing a list does not bounce you away.
    return reply.redirect(backTo(request.headers.referer, `/r/${id}`));
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
