import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { env } from "../env.js";
import { LANE_IDS, UNKNOWN_LANE } from "../lanes.js";
import {
  listItems,
  updateItem,
  laneCounts,
  STATUSES,
  OPEN_STATUSES,
  type Status,
} from "../db/items.js";
import { KINDS } from "../parse/schema.js";
import { parseTimestamp } from "../time.js";
import { COOKIE_NAME, COOKIE_OPTIONS, checkPassword, issueToken, verifyToken } from "./auth.js";
import { renderDashboard, renderLogin } from "./page.js";

const PUBLIC_PATHS = new Set(["/login", "/healthz"]);

export async function startWeb(): Promise<void> {
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie);
  await app.register(formbody);

  app.addHook("onRequest", async (request, reply) => {
    if (PUBLIC_PATHS.has(request.url.split("?")[0] ?? "")) return;
    if (verifyToken(request.cookies[COOKIE_NAME])) return;

    if (request.url.startsWith("/api/")) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return reply.redirect("/login");
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/login", async (_request, reply) =>
    reply.type("text/html").send(renderLogin()),
  );

  app.post<{ Body: { password?: string } }>("/login", async (request, reply) => {
    if (!checkPassword(request.body?.password ?? "")) {
      return reply.code(401).type("text/html").send(renderLogin("Wrong password."));
    }
    return reply
      .setCookie(COOKIE_NAME, issueToken(), COOKIE_OPTIONS)
      .redirect("/");
  });

  app.get("/logout", async (_request, reply) =>
    reply.clearCookie(COOKIE_NAME, COOKIE_OPTIONS).redirect("/login"),
  );

  app.get("/", async (_request, reply) =>
    reply.type("text/html").send(renderDashboard()),
  );

  app.get<{
    Querystring: { lane?: string; status?: string; today?: string; vo?: string; q?: string };
  }>("/api/items", async (request) => {
    const { lane, status, today, vo, q } = request.query;

    const statuses = status
      ? status.split(",").filter((s): s is Status => (STATUSES as string[]).includes(s))
      : OPEN_STATUSES;

    let items = await listItems({
      lanes: lane ? lane.split(",") : undefined,
      statuses: statuses.length ? statuses : OPEN_STATUSES,
      todayOnly: today === "1",
      search: q,
    });

    if (vo === "1") items = items.filter((i) => i.vo_needed);
    return items;
  });

  app.get("/api/counts", async () => laneCounts());

  app.patch<{
    Params: { id: string };
    Body: Record<string, unknown>;
  }>("/api/items/:id", async (request, reply) => {
    const patch = sanitize(request.body ?? {});
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: "no valid fields" });
    }
    const item = await updateItem(request.params.id, patch, "dashboard");
    if (!item) return reply.code(404).send({ error: "not found" });
    return item;
  });

  await app.listen({ port: env.port, host: "0.0.0.0" });
  console.log(`[web] listening on :${env.port}`);
}

/**
 * The dashboard is password-gated, not trusted — every field is validated
 * against the same allow-lists the classifier is held to.
 */
function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (typeof body.lane === "string" && [...LANE_IDS, UNKNOWN_LANE].includes(body.lane)) {
    out.lane = body.lane;
  }
  if (typeof body.kind === "string" && (KINDS as readonly string[]).includes(body.kind)) {
    out.kind = body.kind;
  }
  if (typeof body.status === "string" && (STATUSES as string[]).includes(body.status)) {
    out.status = body.status;
  }
  if (typeof body.priority === "number" && Number.isInteger(body.priority)) {
    out.priority = Math.min(5, Math.max(1, body.priority));
  }
  if (typeof body.title === "string" && body.title.trim()) {
    out.title = body.title.trim().slice(0, 200);
  }
  if (typeof body.summary === "string") out.summary = body.summary.slice(0, 2000);
  if (typeof body.project === "string" || body.project === null) {
    out.project = body.project === null ? null : String(body.project).slice(0, 200);
  }
  if (typeof body.vo_needed === "boolean") out.vo_needed = body.vo_needed;

  for (const field of ["due_at", "vo_due_at"] as const) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null) out[field] = null;
    else if (typeof value === "string") {
      const parsed = parseTimestamp(value);
      if (parsed) out[field] = parsed;
    }
  }

  return out;
}
