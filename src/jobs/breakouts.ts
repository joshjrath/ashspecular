/**
 * Breakout alerts: when a Stories upload from the last week reaches twice its
 * channel's usual views at the same age, say so in Discord — once per video.
 *
 * Off unless asked for. Where it posts, first that is set:
 *   BREAKOUT_WEBHOOK_URL  a Discord webhook (Channel settings → Integrations →
 *                         Webhooks). Works whether or not the bot is running.
 *   BREAKOUT_CHANNEL_ID   a channel the bot can post in
 * With neither set, breakouts show on the Uploads page and nothing is sent.
 */
import { formatMultiple, scoreAll, type VideoViews } from "../web/performance.js";
import { listSnapshots, listUploads, markAlerted, unalertedSince } from "./youtube.js";

/** Uploads with their snapshots, for scoring. */
export async function loadVideoViews(since: Date, channels?: string[]): Promise<VideoViews[]> {
  const all = await listUploads(since);
  const only = channels ? new Set(channels) : null;
  const uploads = only ? all.filter((u) => only.has(u.channel)) : all;
  const snaps = await listSnapshots(uploads.map((u) => u.videoId));
  return uploads.map((u) => ({
    videoId: u.videoId,
    channel: u.channel,
    publishedAt: u.publishedAt,
    views: u.views,
    snapshots: snaps.get(u.videoId) ?? [],
  }));
}

export function breakoutMessage(a: { channel: string; title: string; url: string; views: number; multiple: number; basis: string; ageHours: number }): string {
  const age = a.ageHours < 48 ? `${Math.round(a.ageHours)} hours` : `${Math.round(a.ageHours / 24)} days`;
  return [
    `🔥 **Breakout on ${a.channel}**`,
    `**${a.title}** — ${a.views.toLocaleString("en-US")} views after ${age}, **${formatMultiple(a.multiple)}** the channel's usual ${a.basis === "so far" ? "at this age" : a.basis}.`,
    a.url,
  ].join("\n");
}

async function post(content: string): Promise<boolean> {
  const hook = process.env.BREAKOUT_WEBHOOK_URL?.trim();
  if (hook) {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, username: "Specular Uploads", allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  }
  const channelId = process.env.BREAKOUT_CHANNEL_ID?.trim();
  if (!channelId) return false;
  try {
    const { client } = await import("../bot/client.js");
    if (!client.isReady()) return false;
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) return false;
    await channel.send({ content, allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}

/** Announce any new breakouts. At most five a run, oldest first. */
export async function announceBreakouts(now: Date = new Date()): Promise<number> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const pending = await unalertedSince(weekAgo);
  if (!pending.size) return 0;
  const videos = await loadVideoViews(new Date(now.getTime() - 400 * 86_400_000));
  const scores = scoreAll(videos, now);
  const uploads = new Map((await listUploads(weekAgo)).map((u) => [u.videoId, u]));
  const hits = [...pending]
    .map((id) => ({ id, p: scores.get(id), u: uploads.get(id) }))
    .filter((h) => h.p?.verdict === "breakout" && h.u)
    .sort((a, b) => a.u!.publishedAt.getTime() - b.u!.publishedAt.getTime())
    .slice(0, 5);
  let sent = 0;
  for (const h of hits) {
    const ok = await post(
      breakoutMessage({
        channel: h.u!.channel,
        title: h.u!.title,
        url: h.u!.url,
        views: h.u!.views ?? h.p!.value,
        multiple: h.p!.multiple,
        basis: h.p!.basis,
        ageHours: (now.getTime() - h.u!.publishedAt.getTime()) / 3_600_000,
      }),
    ).catch(() => false);
    // Marked either way when there's nowhere to post, so turning an alert
    // channel on later doesn't replay old news; kept pending if a post failed.
    const configured = Boolean(process.env.BREAKOUT_WEBHOOK_URL?.trim() || process.env.BREAKOUT_CHANNEL_ID?.trim());
    if (ok || !configured) await markAlerted(h.id);
    if (ok) sent += 1;
  }
  return sent;
}
