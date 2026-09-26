/**
 * The revision history, channel by channel: each video's score out of 10 in
 * the order they came in, and what the latest run says. Three in a row at 5
 * or below is cause for concern (time to find a different editor); three in a
 * row at 8 or higher earns a trophy.
 */
export interface HistoryPoint {
  recordId: number;
  title: string;
  version: number | null;
  score: number;
  at: Date;
}

export type Streak = "concern" | "trophy" | null;

/** What the channel's last three videos say. */
export function streakOf(scores: number[], run = 3): Streak {
  if (scores.length < run) return null;
  const last = scores.slice(-run);
  if (last.every((s) => s <= 5)) return "concern";
  if (last.every((s) => s >= 8)) return "trophy";
  return null;
}

export interface ChannelHistory {
  channel: string;
  points: HistoryPoint[];
  average: number;
  streak: Streak;
  mark: "flag" | "trophy" | null;
}

export type HistorySort = "attention" | "best" | "name";

export function channelHistories(
  points: Array<HistoryPoint & { channel: string | null }>,
  marks: Map<string, "flag" | "trophy">,
  sort: HistorySort = "attention",
): ChannelHistory[] {
  const by = new Map<string, HistoryPoint[]>();
  for (const p of points) {
    const ch = p.channel ?? "No channel";
    by.set(ch, [...(by.get(ch) ?? []), p]);
  }
  const list = [...by].map(([channel, pts]) => {
    const sorted = [...pts].sort((a, b) => a.at.getTime() - b.at.getTime());
    const scores = sorted.map((p) => p.score);
    return {
      channel,
      points: sorted,
      average: Math.round((scores.reduce((n, s) => n + s, 0) / scores.length) * 10) / 10,
      streak: streakOf(scores),
      mark: marks.get(channel) ?? null,
    };
  });
  const need = (h: ChannelHistory) => (h.mark === "flag" ? 0 : h.streak === "concern" ? 1 : 2);
  return list.sort((a, b) =>
    sort === "name"
      ? a.channel.localeCompare(b.channel)
      : sort === "best"
        ? b.average - a.average || a.channel.localeCompare(b.channel)
        : need(a) - need(b) || a.average - b.average || a.channel.localeCompare(b.channel),
  );
}
