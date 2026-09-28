/**
 * Repeating tasks: how often, and when the next one falls. The next is
 * counted from when this one was due (or today, with no date), and always
 * lands after today — finishing a daily task three days late opens
 * tomorrow's, not three already-late ones.
 */
export const REPEATS = [
  { id: "daily", label: "Every day" },
  { id: "weekdays", label: "Every weekday" },
  { id: "weekly", label: "Every week" },
  { id: "biweekly", label: "Every 2 weeks" },
  { id: "monthly", label: "Every month" },
] as const;
export type Repeat = (typeof REPEATS)[number]["id"];
export const REPEAT = new Map<string, (typeof REPEATS)[number]>(REPEATS.map((r) => [r.id, r]));

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

function step(d: string, r: Repeat): string {
  switch (r) {
    case "daily": return addDays(d, 1);
    case "weekly": return addDays(d, 7);
    case "biweekly": return addDays(d, 14);
    case "weekdays": {
      let n = addDays(d, 1);
      while ([0, 6].includes(new Date(`${n}T12:00:00Z`).getUTCDay())) n = addDays(n, 1);
      return n;
    }
    case "monthly": {
      const [y, m, day] = d.split("-").map(Number) as [number, number, number];
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const x = new Date(Date.UTC(y, m, Math.min(day, last), 12));
      return x.toISOString().slice(0, 10);
    }
  }
}

/** The day the next occurrence falls: after `from`, and after today. */
export function nextOccurrence(from: string, repeat: Repeat, today: string): string {
  let next = step(from, repeat);
  for (let guard = 0; next <= today && guard < 400; guard++) next = step(next, repeat);
  return next;
}
