import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { config, hasDatabase } from "../config.js";
import { CATEGORIES, CHANNELS } from "../catalog.js";
import { ORG_TZ } from "../parse/derive.js";
import {
  categoryCounts,
  channelCounts,
  dueByDay,
  getRecord,
  lastIntake,
  listByCategory,
  listByChannel,
  listReviews,
  openByCategory,
  setStatus,
  stats,
} from "../db/records.js";
import { migrate } from "../db/migrate.js";
import { COOKIE_NAME, COOKIE_OPTIONS, checkPassword, issueToken, verifyToken } from "./auth.js";
import type { Shell } from "./page.js";
import {
  renderCategory,
  renderDashboard,
  renderEmptyState,
  renderList,
  renderLogin,
  renderRecord,
} from "./page.js";

const PUBLIC = new Set(["/login", "/healthz"]);

/**
 * The sidebar's numbers, fetched once per request. Every page carries them, so
 * the counts can never disagree between one page and the next.
 */
async function shell(active: string): Promise<Shell> {
  const [counts, reviews, grouped, at] = await Promise.all([
    categoryCounts(),
    listReviews(200),
    openByCategory(),
    lastIntake(),
  ]);
  const queue = [...grouped.values()].reduce((n, list) => n + list.length, 0);
  return {
    active,
    counts,
    nav: { reviews: reviews.length, queue, recurring: counts.bits ?? 0 },
    lastIntake: at,
  };
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
    const [s, list, channels] = await Promise.all([
      shell("recurring"),
      listByCategory("bits", 200),
      channelCounts(),
    ]);
    return reply
      .type("text/html")
      .send(
        renderCategory(
          s,
          "Recurring",
          "bits",
          list,
          channels,
        ),
      );
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

  app.post<{ Params: { id: string; action: string } }>("/r/:id/:action", async (request, reply) => {
    const { id, action } = request.params;
    if (action !== "done" && action !== "open") return reply.code(400).send("no");
    await setStatus(Number(id), action);
    return reply.redirect(`/r/${id}`);
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[web] listening on :${config.port}`);
  console.log(`[web] storage: ${hasDatabase ? "connected" : "none — set DATABASE_URL"}`);
}
