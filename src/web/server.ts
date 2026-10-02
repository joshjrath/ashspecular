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
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { config, hasDatabase } from "../config.js";
import { prepareDatabase } from "../db/prepare.js";
import { onChannelsChanged } from "../db/channelsettings.js";
import { loadBoardPassword } from "../db/password.js";
import { listScripts } from "../db/scripts.js";
import { listLabAdditions } from "../db/lab.js";
import { markReleases } from "../db/releases.js";
import { forgetHistory } from "../db/ideas.js";
import { loadChannelColours } from "../jobs/avatars.js";
import { startIdeaJobs } from "../jobs/ideas.js";
import { startCompetitorJobs } from "../jobs/competitors.js";
import { startStoryIdeas } from "../jobs/storyideas.js";
import { startHourlyRead } from "../jobs/hourly.js";
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
    // Scripts pasted in or read from a doc: Story Lab and the idea hooks learn from them.
    setBoardScripts(await listScripts().catch((err) => (console.error("[scripts] couldn't read them:", err), [])));
    // What's new: each change is announced from the first start that ships it.
    setReleaseTimes(await markReleases(RELEASES).catch((err) => (console.error("[whats-new] couldn't mark the releases:", err), new Map())));
  }

  const app = Fastify({ logger: false, trustProxy: true });
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
  app.get("/login", async (_req, reply) => reply.type("text/html").send(renderLogin()));

  app.post<{ Body: { password?: string } }>("/login", async (request, reply) => {
    const wait = loginWait(request.ip);
    if (wait) {
      return reply.code(429).type("text/html").send(renderLogin(`Too many wrong passwords. Try again in ${Math.ceil(wait / 60)} minute${wait > 60 ? "s" : ""}.`));
    }
    if (!(await checkPassword(request.body?.password ?? ""))) {
      noteLoginFailure(request.ip);
      return reply.code(401).type("text/html").send(renderLogin("Wrong password."));
    }
    clearLoginFailures(request.ip);
    return reply.setCookie(COOKIE_NAME, issueToken(), cookieOptions(request.protocol === "https")).redirect("/");
  });

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

  // The background work that belongs with the board.
  if (hasDatabase) {
    // Claude's ideas for each Stories channel, kept topped up.
    startStoryIdeas(storyContext);
    // YouTube read hourly, then the posting check, breakouts and avatars.
    startHourlyRead();
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`[web] listening on :${config.port}`);
  console.log(`[web] storage: ${hasDatabase ? "connected" : "none — set DATABASE_URL"}`);
}
