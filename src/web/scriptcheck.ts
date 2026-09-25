/**
 * The scriptwriter's board, read as data.
 *
 * His board (scriptcheck, on the same Railway project) serves everything it
 * knows at /report.json. With his *view-only* password it hands out a
 * read-only copy — the briefs themselves left out — which is all this needs:
 * every script's code, title, air date, deadline, status and delivery link.
 * Reading it here, on the server, means the Scripts tab is this board's own
 * page in this board's design, with no login inside a frame to go wrong.
 *
 * Cached for a minute, so switching tabs doesn't hammer his service.
 */
import { config } from "../config.js";

export type ScriptStatus =
  | "OVERDUE" | "DUE_TODAY" | "DUE_SOON" | "PENDING" | "NO_DEADLINE"
  | "SUBMITTED_LATE" | "SUBMITTED" | "NOT_MINE" | "DUPLICATE" | "IGNORED";

export interface ScriptRow {
  id: string;
  code: string | null;
  title: string;
  /** YYYY-MM-DD, the air date from the thread's heading. */
  airDate: string | null;
  deadline: Date | null;
  status: ScriptStatus;
  role: string;
  /** Drive/Docs links from his deliveries, newest last. */
  delivered: string[];
  deliveredAt: Date | null;
  discordUrl: string | null;
  needsReview: boolean;
}

export interface ScriptReport {
  rows: ScriptRow[];
  generatedAt: Date | null;
  error: string | null;
}

/** Turn his report into rows. Anything malformed is skipped, not thrown. */
export function readReport(data: unknown): ScriptRow[] {
  const list = (data as { assignments?: unknown[] })?.assignments;
  if (!Array.isArray(list)) return [];
  const date = (v: unknown) => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return list.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const a = raw as Record<string, unknown>;
    if (typeof a.status !== "string" || typeof a.title !== "string") return [];
    const subs = Array.isArray(a.submissions) ? (a.submissions as Array<Record<string, unknown>>) : [];
    const links = subs.flatMap((s) => (Array.isArray(s.links) ? (s.links as unknown[]) : []))
      .filter((l): l is string => typeof l === "string" && /^https?:\/\//.test(l));
    const slate = typeof a.slate_date === "string" ? a.slate_date.slice(0, 10) : null;
    return [{
      id: String(a.thread_id ?? a.title),
      code: typeof a.slot === "string" && a.slot ? a.slot : null,
      title: a.title,
      airDate: slate && /^\d{4}-\d{2}-\d{2}$/.test(slate) ? slate : null,
      deadline: date(a.deadline),
      status: a.status as ScriptStatus,
      role: typeof a.role === "string" ? a.role : "",
      delivered: links,
      deliveredAt: date(subs[subs.length - 1]?.posted_at),
      discordUrl: typeof a.jump_url === "string" && a.jump_url ? a.jump_url : null,
      needsReview: a.needs_review === true,
    }];
  });
}

let cache: { at: number; report: ScriptReport } | null = null;

/** Fetch his report. Never throws: a failure comes back as `error`. */
export async function fetchScriptReport(fetcher: typeof fetch = fetch): Promise<ScriptReport> {
  if (cache && Date.now() - cache.at < 60_000) return cache.report;
  const base = config.scriptsUrl;
  if (!base) return { rows: [], generatedAt: null, error: "SCRIPTS_URL isn't set." };
  const url = new URL("/report.json", base);
  if (config.scriptsToken) url.searchParams.set("k", config.scriptsToken);
  let report: ScriptReport;
  try {
    const res = await fetcher(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (res.status === 404 && !config.scriptsToken) {
      report = { rows: [], generatedAt: null, error: "His board is password protected: set SCRIPTS_TOKEN to his view-only password (SCRIPTCHECK_VIEW_TOKEN)." };
    } else if (res.status === 404) {
      report = { rows: [], generatedAt: null, error: "His board didn't accept SCRIPTS_TOKEN — check it matches his SCRIPTCHECK_VIEW_TOKEN." };
    } else if (!res.ok) {
      report = { rows: [], generatedAt: null, error: `His board answered ${res.status}.` };
    } else {
      const data = (await res.json()) as { generated_at?: string };
      report = { rows: readReport(data), generatedAt: data.generated_at ? new Date(data.generated_at) : new Date(), error: null };
    }
  } catch {
    report = { rows: [], generatedAt: null, error: "Couldn't reach his board." };
  }
  // A failure is cached briefly too, so a down service doesn't slow every page.
  cache = { at: report.error ? Date.now() - 45_000 : Date.now(), report };
  return report;
}
