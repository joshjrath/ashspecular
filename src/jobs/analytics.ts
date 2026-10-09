/**
 * YouTube Analytics calls: signing in (code → lasting access), which channel
 * a sign-in is for, and reading each connected channel's days. Run from the
 * hourly job (each channel every SYNC_EVERY_HOURS) and straight after a
 * channel is connected.
 */
import { googleClient } from "../db/keys.js";
import { listAnalyticsLinks, markAnalyticsRead, refreshTokenOf, saveAnalyticsDays, type AnalyticsLink } from "../db/analytics.js";
import { SYNC_EVERY_HOURS, chunks, mergeDays, rowsOf, windowOf } from "../network/analytics.js";
import { ORG_TZ, dateIn } from "../parse/derive.js";

export type Fetcher = typeof fetch;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

/** Google's reason, in a few plain words. */
async function whyFailed(res: Response, what: string): Promise<string> {
  const body = await res.text().catch(() => "");
  if (/invalid_grant/.test(body)) return "Google access was removed or has expired: connect it again";
  if (/invalid_client|unauthorized_client/.test(body)) return "Google didn't accept the client ID and secret: check them in Settings";
  if (/redirect_uri_mismatch/.test(body)) return "the redirect address isn't on the Google client: add the one shown in Settings";
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(body)) return "the YouTube Analytics API isn't enabled in the Google Cloud project";
  if (/quota/i.test(body)) return "Google's quota for today is used up";
  return `${what} answered ${res.status}`;
}

async function postToken(params: Record<string, string>, fetcher: Fetcher): Promise<{ access: string; refresh: string | null; scope: string }> {
  const res = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(await whyFailed(res, "Google sign-in"));
  const j = (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string };
  if (!j.access_token) throw new Error("Google sign-in gave no access");
  return { access: j.access_token, refresh: j.refresh_token ?? null, scope: j.scope ?? "" };
}

/** The code Google sends back, for lasting access. */
export async function exchangeCode(code: string, redirectUri: string, fetcher: Fetcher = fetch): Promise<{ access: string; refresh: string | null; scope: string }> {
  const c = googleClient();
  if (c.source === "none") throw new Error("set the Google client ID and secret first");
  return postToken({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: "authorization_code" }, fetcher);
}

async function accessFor(refresh: string, fetcher: Fetcher): Promise<string> {
  const c = googleClient();
  if (c.source === "none") throw new Error("the Google client ID and secret aren't set");
  return (await postToken({ refresh_token: refresh, client_id: c.id, client_secret: c.secret, grant_type: "refresh_token" }, fetcher)).access;
}

/** The YouTube channel a sign-in is for. */
export async function channelOfSignIn(access: string, fetcher: Fetcher = fetch): Promise<{ id: string; title: string } | null> {
  const u = new URL(CHANNELS_URL);
  u.search = new URLSearchParams({ part: "snippet", mine: "true" }).toString();
  const res = await fetcher(u, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(await whyFailed(res, "YouTube"));
  const j = (await res.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
  const c = j.items?.[0];
  return c?.id ? { id: c.id, title: c.snippet?.title ?? "" } : null;
}

async function report(access: string, q: { from: string; to: string; metrics: string; dimensions: string }, fetcher: Fetcher): Promise<{ ok: true; rows: Array<Record<string, string | number>> } | { ok: false; status: number; why: string }> {
  const u = new URL(REPORTS_URL);
  const p = new URLSearchParams({ ids: "channel==MINE", startDate: q.from, endDate: q.to, metrics: q.metrics, dimensions: q.dimensions, sort: "day" });
  if (q.metrics.includes("estimatedRevenue")) p.set("currency", "USD");
  u.search = p.toString();
  const res = await fetcher(u, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { ok: false, status: res.status, why: await whyFailed(res, "YouTube Analytics") };
  return { ok: true, rows: rowsOf(await res.json()) };
}

/**
 * One connected channel: its days from YouTube, saved. Revenue is asked for
 * first; a sign-in that can't see it reads the rest. The split into
 * long-form and Shorts is extra: without it the totals still count.
 */
export async function readAnalytics(link: Pick<AnalyticsLink, "youtubeId" | "channel" | "backfilled" | "through" | "revenue">, now = new Date(), fetcher: Fetcher = fetch): Promise<{ days: number; through: string | null; revenue: boolean }> {
  const refresh = await refreshTokenOf(link.youtubeId);
  if (!refresh) throw new Error("the saved Google access can't be read (SESSION_SECRET changed): connect it again");
  const access = await accessFor(refresh, fetcher);
  const today = dateIn(ORG_TZ, now);
  let revenue = link.revenue !== false;
  let saved = 0;
  let through: string | null = null;
  for (const part of chunks(windowOf(link, today))) {
    const base = "views,subscribersGained,subscribersLost";
    let daily = revenue ? await report(access, { ...part, metrics: `${base},estimatedRevenue`, dimensions: "day" }, fetcher) : null;
    if (!daily || (!daily.ok && (daily.status === 403 || daily.status === 400))) {
      if (daily) revenue = false;
      daily = await report(access, { ...part, metrics: base, dimensions: "day" }, fetcher);
    }
    if (!daily.ok) throw new Error(daily.why);
    let split = await report(access, { ...part, metrics: revenue ? "views,estimatedRevenue" : "views", dimensions: "day,creatorContentType" }, fetcher);
    if (!split.ok && revenue) split = await report(access, { ...part, metrics: "views", dimensions: "day,creatorContentType" }, fetcher);
    const days = mergeDays(link.channel ?? link.youtubeId, daily.rows, split.ok ? split.rows : null, part);
    await saveAnalyticsDays(link.youtubeId, days.map(({ channel: _c, ...d }) => d));
    saved += days.length;
    const last = days[days.length - 1]?.day ?? null;
    if (last && (!through || last > through)) through = last;
  }
  await markAnalyticsRead(link.youtubeId, { through, backfilled: true, revenue, error: null });
  return { days: saved, through, revenue };
}

let running = false;

/** Every connected channel not read in the last SYNC_EVERY_HOURS (or never), one at a time. */
export async function syncAnalytics(now = new Date(), fetcher: Fetcher = fetch): Promise<number> {
  if (running || googleClient().source === "none") return 0;
  running = true;
  let read = 0;
  try {
    for (const link of await listAnalyticsLinks()) {
      if (link.syncedAt && now.getTime() - link.syncedAt.getTime() < SYNC_EVERY_HOURS * 3_600_000) continue;
      try {
        await readAnalytics(link, now, fetcher);
        read += 1;
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        console.error(`[analytics] ${link.channel ?? link.youtubeId} failed:`, why);
        await markAnalyticsRead(link.youtubeId, { error: why });
      }
    }
  } finally {
    running = false;
  }
  return read;
}
