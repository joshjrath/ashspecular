import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { config, hasDatabase } from "../config.js";
import { CATEGORIES } from "../catalog.js";
import {
  categoryCounts,
  channelCounts,
  getRecord,
  listByCategory,
  listByChannel,
  listOpen,
  listReviews,
  listVoQueue,
  setStatus,
} from "../db/records.js";
import { migrate } from "../db/migrate.js";
import { COOKIE_NAME, COOKIE_OPTIONS, checkPassword, issueToken, verifyToken } from "./auth.js";
import {
  renderDashboard,
  renderEmptyState,
  renderList,
  renderLogin,
  renderRecord,
} from "./page.js";

const PUBLIC = new Set(["/login", "/healthz"]);

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

    // One round trip each, in parallel — the dashboard is five small queries.
    const [vo, reviews, open, counts, channels] = await Promise.all([
      listVoQueue(20),
      listReviews(20),
      listOpen(60),
      categoryCounts(),
      channelCounts(),
    ]);

    // "Everything else" means everything not already shown above it.
    const shown = new Set([...vo, ...reviews].map((r) => r.id));
    const rest = open.filter((r) => !shown.has(r.id));

    return reply.type("text/html").send(renderDashboard({ vo, reviews, rest, counts, channels }));
  });

  app.get<{ Params: { name: string } }>("/channel/:name", async (request, reply) => {
    const name = decodeURIComponent(request.params.name);
    const list = await listByChannel(name);
    return reply
      .type("text/html")
      .send(renderList(name, `Nothing filed under ${name} yet.`, list));
  });

  app.get<{ Params: { id: string } }>("/category/:id", async (request, reply) => {
    const cat = CATEGORIES.find((c) => c.id === request.params.id);
    if (!cat) return reply.code(404).type("text/html").send(renderList("Not found", "No such category.", []));
    const list = await listByCategory(cat.id);
    return reply
      .type("text/html")
      .send(renderList(cat.label, `Nothing open in ${cat.label}.`, list));
  });

  app.get<{ Params: { id: string } }>("/r/:id", async (request, reply) => {
    const record = await getRecord(Number(request.params.id));
    if (!record) return reply.code(404).type("text/html").send(renderList("Not found", "That record is gone.", []));
    return reply.type("text/html").send(renderRecord(record));
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
