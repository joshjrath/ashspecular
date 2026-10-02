/**
 * Scripts: the Scripts tab (the scriptwriter's board), and scripts kept on
 * the board — pasted or read from a Google Doc, on a video or in Story Lab.
 */
import { addScript, getScript, listScripts, removeScript, updateScriptBody } from "../../db/scripts.js";
import { config, hasDatabase } from "../../config.js";
import { displayTitle } from "../page.js";
import { fetchScriptReport } from "../scriptcheck.js";
import { getRecord, setNoScript } from "../../db/records.js";
import { readDoc } from "../gdoc.js";
import { refererPath } from "../http.js";
import { renderScriptBoard, renderScripts } from "../pages/scripts.js";
import { safeUrl } from "../html.js";
import { setBoardScripts } from "../stories/corpus.js";
import { shell } from "../shell.js";
import type { FastifyInstance } from "fastify";

// The scriptwriter's board under a Scripts tab. Whether it can sit in a
// frame is the other site's choice (X-Frame-Options, or CSP
// frame-ancestors), so ask it — once every ten minutes — rather than show
// a blank box.
let frameCheck: { at: number; ok: boolean; why: string } | null = null;
async function canFrame(url: string): Promise<{ ok: boolean; why: string }> {
  if (frameCheck && Date.now() - frameCheck.at < 600_000) return frameCheck;
  let result = { ok: true, why: "" };
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
    const xfo = (res.headers.get("x-frame-options") ?? "").toLowerCase();
    const csp = (res.headers.get("content-security-policy") ?? "").toLowerCase();
    const ancestors = csp.match(/frame-ancestors([^;]*)/)?.[1]?.trim() ?? "";
    const self = config.publicUrl ? new URL(config.publicUrl).origin.toLowerCase() : "";
    if (xfo.includes("deny") || xfo.includes("sameorigin")) {
      result = { ok: false, why: "Josh's board says it may only be shown on its own (X-Frame-Options)." };
    } else if (ancestors && !ancestors.includes("*") && !(self && ancestors.includes(self))) {
      result = { ok: false, why: "Josh's board only allows itself to be shown on the pages it lists (frame-ancestors)." };
    }
  } catch {
    // Unreachable from here isn't proof it can't be framed; let the browser try.
  }
  frameCheck = { at: Date.now(), ...result };
  return result;
}

// ── scripts: pasted, or read from a Google Doc ──────────────────────────
const reloadScripts = async () => setBoardScripts(await listScripts());
/** The script to keep: what was pasted, else the doc's text. */
async function scriptText(text: string | undefined, url: string | undefined): Promise<{ body: string; url: string | null } | { error: string }> {
  const pasted = (text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 200_000);
  // Only a web link is kept: it's shown as one on the script's card.
  const link = safeUrl((url ?? "").trim().slice(0, 1000)) || null;
  if (pasted) return { body: pasted, url: link };
  if (!link) return { error: "Paste the script, or give its Google Doc link." };
  const read = await readDoc(link);
  return read.ok ? { body: read.text, url: link } : { error: read.error };
}

export function registerScripts(app: FastifyInstance): void {
  app.get("/scripts", async (_req, reply) => {
    const s = await shell("scripts");
    if (!config.scriptsUrl && !config.scriptsUrlRaw) return reply.redirect("/");
    if (!config.scriptsUrl) {
      return reply.type("text/html").send(renderScriptBoard(s, "#", await fetchScriptReport()));
    }
    // With his view-only password, read his data and show it natively. Without
    // one, fall back to showing his page itself, where his site allows it.
    if (config.scriptsToken) {
      const report = await fetchScriptReport();
      return reply.type("text/html").send(renderScriptBoard(s, config.scriptsUrl, report));
    }
    const { ok, why } = await canFrame(config.scriptsUrl);
    return reply.type("text/html").send(renderScripts(s, config.scriptsUrl, ok, why));
  });

  app.post<{ Params: { id: string }; Body: { text?: string; url?: string } }>("/r/:id/scripts", async (request, reply) => {
    const record = await getRecord(Number(request.params.id));
    if (!record) return reply.redirect("/");
    const got = await scriptText(request.body?.text, request.body?.url);
    if ("error" in got) return reply.redirect(`/r/${record.id}?scripterr=${encodeURIComponent(got.error)}#script`);
    await addScript({ recordId: record.id, title: displayTitle(record), ...got });
    // The script is here, so the video isn't waiting on it any more.
    if (record.noScriptAt) await setNoScript(record.id, false);
    await reloadScripts();
    return reply.redirect(`/r/${record.id}#script`);
  });

  app.post<{ Body: { title?: string; text?: string; url?: string; from?: string } }>("/story-lab/scripts", async (request, reply) => {
    const title = (request.body?.title ?? "").trim().slice(0, 200);
    // Linked from Unassigned videos: back to that list, open, saying what happened.
    const fromList = request.body?.from === "unassigned";
    const fail = (why: string) =>
      reply.redirect(fromList ? `/story-lab?open=unassigned&linkerr=${encodeURIComponent(`${title}: ${why}`)}#unassigned` : `/story-lab?scripterr=${encodeURIComponent(why)}#scripts`);
    if (!hasDatabase) return reply.redirect(fromList ? "/story-lab?open=unassigned#unassigned" : "/story-lab#scripts");
    if (!title) return fail("Give the script its video title — that's how Story Lab reads its format, hero and world.");
    const got = await scriptText(request.body?.text, request.body?.url);
    if ("error" in got) return fail(got.error);
    await addScript({ recordId: null, title, ...got });
    await reloadScripts();
    return reply.redirect(fromList ? `/story-lab?open=unassigned&linked=${encodeURIComponent(title)}#unassigned` : "/story-lab#scripts");
  });

  // Read a linked doc again, for the latest draft.
  app.post<{ Params: { sid: string } }>("/scripts/:sid/refresh", async (request, reply) => {
    const script = await getScript(Number(request.params.sid));
    const back = refererPath(request.headers.referer, "/story-lab#scripts").replace(/#.*$/, "");
    if (!script?.url) return reply.redirect(back);
    const read = await readDoc(script.url);
    const sep = back.includes("?") ? "&" : "?";
    if (!read.ok) return reply.redirect(`${back}${sep}scripterr=${encodeURIComponent(read.error)}#${script.recordId ? "script" : "scripts"}`);
    await updateScriptBody(script.id, read.text);
    await reloadScripts();
    return reply.redirect(`${back}#${script.recordId ? "script" : "scripts"}`);
  });

  app.post<{ Params: { sid: string } }>("/scripts/:sid/remove", async (request, reply) => {
    const script = await getScript(Number(request.params.sid));
    if (script) {
      await removeScript(script.id);
      await reloadScripts();
    }
    return reply.redirect(refererPath(request.headers.referer, "/story-lab#scripts"));
  });
}
