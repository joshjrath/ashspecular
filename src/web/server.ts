/**
 * The board's web server: Fastify, the sign-in gate, and every route.
 *
 * startWeb() gets the database ready, builds the app with its guards (errors
 * logged and answered plainly, POSTs from other sites refused, everything
 * but the login behind the session cookie), registers each area's routes —
 * one module per area in routes/, as finance/, bitsfeed/ and competitors/
 * already were — starts the background work that belongs with the board,
 * and listens.
 */
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { config, hasDatabase } from "../config.js";
import { prepareDatabase } from "../db/prepare.js";
import { onChannelsChanged } from "../db/channelsettings.js";
import { forgetLoginFailures, loadBoardPassword, loadLoginFailures, recordLoginFailure } from "../db/password.js";
import { listScripts } from "../db/scripts.js";
import { listLabAdditions } from "../db/lab.js";
import { markReleases } from "../db/releases.js";
import { forgetHistory } from "../db/ideas.js";
import { loadChannelColours } from "../jobs/avatars.js";
import { startIdeaJobs } from "../jobs/ideas.js";
import { startCompetitorJobs } from "../jobs/competitors.js";
import { startStoryIdeas } from "../jobs/storyideas.js";
import { startHourlyRead } from "../jobs/hourly.js";
import { repairCatchUpPushes } from "../jobs/postcheck.js";
import { restoreMoves } from "../db/records.js";
import { COOKIE_NAME, checkPassword, clearLoginFailures, cookieOptions, issueToken, loginWait, noteLoginFailure, verifyToken } from "./auth.js";
import { originIsThisBoard, wantsJson } from "./http.js";
import { renderError, renderLogin } from "./page.js";
import { RELEASES } from "./changelog.js";
import { setBoardScripts } from "./stories/corpus.js";
import { applyAdditions } from "./stories/added.js";
import { forgetPaces, requestCookies, setReleaseTimes, shell } from "./shell.js";
import { registerFinance } from "./finance/routes.js";
import { registerIdeaFeed } from "./bitsfeed/routes.js";
import { registerCompetitors } from "./competitors/routes.js";
import { registerCalendar } from "./routes/calendar.js";
import { registerDashboard } from "./routes/dashboard.js";
import { registerLists } from "./routes/lists.js";
import { registerMyWork } from "./routes/mywork.js";
import { registerRecords } from "./routes/records.js";
import { registerRecurring } from "./routes/recurring.js";
import { registerRevisions } from "./routes/revisions.js";
import { registerScripts } from "./routes/scripts.js";
import { registerSettings } from "./routes/settings.js";
import { registerStoryLab, storyContext } from "./routes/storylab.js";
import { registerTasks } from "./routes/tasks.js";
import { registerUploads } from "./routes/uploads.js";

const PUBLIC = new Set(["/login", "/healthz"]);

export async function startWeb(): Promise<void> {
  if (!config.dashboardPassword) {
    console.error("[web] DASHBOARD_PASSWORD is not set.");
    console.error("      The board shows the whole studio's work, so it will not run open.");
    process.exit(1);
  }

  if (hasDatabase) {
    // The schema, the API keys set in Settings and the channels added or renamed there.
    await prepareDatabase();
    // When the channels change, colours and caches follow.
    onChannelsChanged(async () => {
      forgetPaces();
      forgetHistory();
      await loadChannelColours();
    });
    // The Shorts channels' avatar colours and any set by hand, before the first page.
    await loadChannelColours().catch((err) => console.error("[colours] load failed:", err));
    // Whatever's been added to Story Lab from its dice.
    applyAdditions(await listLabAdditions().catch((err) => (console.error("[lab] couldn't read the dice additions:", err), [])));
    // A login password changed in Settings takes over from DASHBOARD_PASSWORD.
    await loadBoardPassword().catch((err) => console.error("[auth] couldn't read the stored password:", err));
    // Wrong passwords from the last fifteen minutes still count after a restart.
    await loadLoginFailures().catch((err) => console.error("[auth] couldn't read failed sign-ins:", err));
    // Scripts pasted in or read from a doc: Story Lab and the idea hooks learn from them.
    setBoardScripts(await listScripts().catch((err) => (console.error("[scripts] couldn't read them:", err), [])));
    // Once: undo the first posting catch-up's multi-day pushes (see jobs/postcheck.ts).
    await repairCatchUpPushes(restoreMoves)
      .then((r) => {
        if (r?.restored.length) console.log(`[posts] put back ${r.restored.length} catch-up push(es): ${r.restored.join("; ")}`);
        if (r?.left.length) console.warn(`[posts] left ${r.left.length} catch-up push(es) changed since, for It was posted: ${r.left.join("; ")}`);
      })
      .catch((err) => console.error("[posts] couldn't repair the catch-up pushes:", err));
    // What's new: each change is announced from the first start that ships it.
    setReleaseTimes(await markReleases(RELEASES).catch((err) => (console.error("[whats-new] couldn't mark the releases:", err), new Map())));
  }

  const app = await buildApp();

  // The background work that belongs with the board.
  if (hasDatabase) {
    // The Idea Feed reading Tumblr and analysing posts.
    startIdeaJobs();
    // Competitors: channels read and concepts worked out.
    startCompetitorJobs();
    // Claude's ideas for each Stories channel, kept topped up.
    startStoryIdeas(storyContext);
    // YouTube read hourly, then the posting check, breakouts and avatars.
    startHourlyRead();
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[web] listening on :${config.port}`);
  console.log(`[web] storage: ${hasDatabase ? "connected" : "none — set DATABASE_URL"}`);
}

/**
 * Pages carry their styles and scripts inline, so most are hundreds of KB:
 * gzipped when the browser takes it, about a tenth of that on the wire.
 */
const gzipAsync = promisify(gzip);
async function compressed(request: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
  if (typeof payload !== "string" && !Buffer.isBuffer(payload)) return payload;
  if (Buffer.byteLength(payload) < 1024 || request.method === "HEAD" || reply.getHeader("content-encoding")) return payload;
  if (!/^(text\/|application\/(json|javascript))/.test(String(reply.getHeader("content-type") ?? ""))) return payload;
  reply.header("Vary", "Accept-Encoding");
  if (!/\bgzip\b/.test(String(request.headers["accept-encoding"] ?? ""))) return payload;
  reply.header("Content-Encoding", "gzip");
  reply.removeHeader("content-length");
  return gzipAsync(payload);
}

/**
 * The board as a Fastify app with every route registered, not listening yet.
 * startWeb() runs it; the tests build one to check every route's guards.
 * `everyRoute` registers the areas that otherwise need the database too, and
 * `onRoute` hears each route as it's added.
 */
export async function buildApp(opts: { everyRoute?: boolean; onRoute?: (method: string, url: string) => void } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: true });
  if (opts.onRoute) app.addHook("onRoute", (r) => { for (const m of [r.method].flat()) opts.onRoute!(String(m), r.url); });
  await app.register(cookie);
  await app.register(formbody);

  // A failure is logged here (Fastify's own logger is off) and answered
  // plainly: never the error's text, which can carry SQL or internals.
  app.setErrorHandler((err: Error & { statusCode?: number }, request, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) console.error(`[web] ${request.method} ${request.url.split("?")[0]} failed:`, err);
    const message = status >= 500 ? "Something went wrong on the board." : err.message;
    if (wantsJson(request)) return reply.code(status).send({ ok: false, error: message });
    return reply.code(status).type("text/html").send(renderError(status, status >= 500 ? "" : message));
  });
  app.setNotFoundHandler((request, reply) =>
    wantsJson(request) ? reply.code(404).send({ ok: false, error: "Not found" }) : reply.code(404).type("text/html").send(renderError(404)),
  );

  // Every answer: no type sniffing, no framing by other sites, and links out
  // (YouTube, Tumblr, Frame.io) don't learn the board's addresses.
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "same-origin");
    return compressed(request, reply, payload);
  });

  // Every change is a POST from the board's own pages, and a browser says
  // where a POST came from. One from another site is refused — on top of the
  // SameSite cookie — so no other site can make a signed-in browser change
  // anything. No Origin at all is a non-browser client, left to the cookie.
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (!originIsThisBoard(origin, request)) {
      console.warn(`[web] refused a ${request.method} to ${request.url.split("?")[0]} from ${origin}`);
      return reply.code(403).type("text/plain").send("Refused: this came from another site.");
    }
  });
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

  // Finance, the Bits Idea Feed and Competitors: their own sections, the same shell.
  if (hasDatabase || opts.everyRoute) {
    registerFinance(app, shell);
    registerIdeaFeed(app, shell);
    registerCompetitors(app, shell);
  }

  app.get<{ Querystring: { out?: string } }>("/login", async (request, reply) =>
    reply.type("text/html").send(renderLogin("", request.query.out === "1" ? "You're signed out." : "")),
  );

  app.post<{ Body: { password?: string } }>("/login", async (request, reply) => {
    const wait = loginWait(request.ip);
    if (wait) {
      return reply.code(429).type("text/html").send(renderLogin(`Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`));
    }
    if (!(await checkPassword(request.body?.password ?? ""))) {
      // Counted in memory first; kept in the database so a restart doesn't reset the slow-down.
      if (hasDatabase) await recordLoginFailure(request.ip).catch((err) => console.error("[auth] couldn't keep a failed sign-in:", err));
      else noteLoginFailure(request.ip);
      return reply.code(401).type("text/html").send(renderLogin("Wrong password."));
    }
    if (hasDatabase) await forgetLoginFailures(request.ip).catch((err) => console.error("[auth] couldn't clear failed sign-ins:", err));
    else clearLoginFailures(request.ip);
    return reply.setCookie(COOKIE_NAME, issueToken(), cookieOptions(request.protocol === "https")).redirect("/");
  });

  // Signing out: this browser's cookie goes. (Ending every sign-in is in Settings.)
  app.post("/logout", async (request, reply) =>
    reply.clearCookie(COOKIE_NAME, { path: "/", secure: cookieOptions(request.protocol === "https").secure, sameSite: "lax", httpOnly: true }).redirect("/login?out=1"),
  );

  // Every page of the board, one module per area.
  registerDashboard(app);
  registerCalendar(app);
  registerLists(app);
  registerRecords(app);
  registerRevisions(app);
  registerScripts(app);
  registerUploads(app);
  registerStoryLab(app);
  registerRecurring(app);
  registerMyWork(app);
  registerTasks(app);
  registerSettings(app);
  return app;
}
