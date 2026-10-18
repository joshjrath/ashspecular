/**
 * Calendar snapshot: any stretch of the calendar as a poster, drawn as one
 * self-contained SVG (no outside fonts or images) so the page can turn it
 * into a PNG in the browser. Posting and Deadlines each have their own.
 *
 * The layout follows the range: a week or less is a column a day with every
 * video as a card; up to nine weeks is a calendar grid; longer is a channel
 * by week heat map. The glow behind it takes the colours of the range's
 * busiest categories, placed by the range itself, so no two look alike.
 */
import { CATEGORIES, CHANNELS } from "../catalog.js";
import { esc } from "./html.js";
import { daysBetween } from "./cadence.js";
import { ORG_TZ, shiftDate } from "../parse/derive.js";

export type SnapMode = "posting" | "deadlines";

/** The longest range a snapshot covers. */
export const SNAP_MAX_DAYS = 366;

export interface SnapItem {
  day: string;
  id: number;
  title: string;
  channel: string | null;
  category: string;
  code: string | null;
  done: boolean;
  /** Deadlines: which deadline and when ("VO · 11:59 PM"). */
  due: string | null;
}

export interface SnapInput {
  mode: SnapMode;
  from: string;
  to: string;
  today: string;
  items: SnapItem[];
  /** Daily batches per day: counted, not drawn one by one. */
  batches: Map<string, number>;
  daysOff: Set<string>;
  generatedAt: Date;
}

const W = 1600;
const PAD = 56;
const FONT = `'Archivo', 'Segoe UI', -apple-system, system-ui, Helvetica, Arial, sans-serif`;
const DISPLAY = `'Bricolage Grotesque', 'Archivo', 'Segoe UI', -apple-system, system-ui, Helvetica, Arial, sans-serif`;
const INK = "#F3F3F5", INK2 = "#BDBDC6", INK3 = "#94949E", CARD = "#1C1C22", LINE = "#2E2E36";

const catColour = (id: string) => CATEGORIES.find((c) => c.id === id)?.color ?? "#8A8F98";
const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
/** A colour light enough to see on the dark poster: a very dark channel colour is mixed toward white. */
function visible(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16));
  const lum = (0.2126 * r! + 0.7152 * g! + 0.0722 * b!) / 255;
  if (lum >= 0.3) return hex;
  const k = Math.min(0.55, (0.3 - lum) * 2.2);
  return `#${[r!, g!, b!].map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0")).join("")}`;
}
const chColour = (name: string | null, category: string) => visible(CHANNELS.find((c) => c.name === name)?.color ?? catColour(category));
const shortCh = (name: string | null) => (name ?? "").replace(/^Specular /, "") || "Specular";
const weekday = (day: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en-US", { weekday: style, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const monthDay = (day: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
const monthName = (day: string) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** About how many characters fit in a width at a font size (an average glyph is ~0.55em). */
const fits = (width: number, size: number) => Math.max(4, Math.floor(width / (size * 0.55)));
function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}
/** Words into at most `lines` lines of `max` characters, the last clipped. */
function wrap(text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if (`${cur} ${w}`.length <= max) cur = `${cur} ${w}`;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) return [...out.slice(0, lines - 1), clip(out.slice(lines - 1).join(" "), max)];
  return out.map((l) => clip(l, max));
}

/** A small deterministic number from text, for placing the glow. */
function seed(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < SNAP_MAX_DAYS + 7; d = shiftDate(d, 1)) out.push(d);
  return out;
}

export function rangeTitle(from: string, to: string): string {
  if (from === to) return `${weekday(from, "long")}, ${monthDay(from)}`;
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${monthDay(from)}${sameYear ? "" : `, ${from.slice(0, 4)}`} – ${monthDay(to)}`;
}

/** Which layout a range gets. */
export function layoutFor(days: number): "columns" | "grid" | "timeline" {
  return days <= 7 ? "columns" : days <= 63 ? "grid" : "timeline";
}

export function snapshotSvg(s: SnapInput): string {
  const days = eachDay(s.from, s.to);
  const n = days.length;
  const layout = layoutFor(n);
  const byDay = new Map<string, SnapItem[]>();
  for (const it of s.items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  const batchTotal = [...s.batches.entries()].filter(([d]) => d >= s.from && d <= s.to).reduce((a, [, c]) => a + c, 0);

  // Categories by how much of the range they fill: the stats, and the glow's colours.
  const cats = CATEGORIES.map((c) => ({ id: c.id, n: s.items.filter((i) => i.category === c.id).length })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const busiest = days.map((d) => ({ d, n: (byDay.get(d) ?? []).length })).sort((a, b) => b.n - a.n || a.d.localeCompare(b.d))[0];
  const r = seed(`${s.mode}|${s.from}|${s.to}`);
  const glows = (cats.length ? cats : [{ id: "stories", n: 1 }]).slice(0, 3).map((c, i) => ({
    colour: catColour(c.id), x: ((r * 997 + i * 0.37) % 1) * W, y: 60 + ((r * 613 + i * 0.29) % 1) * 520, rad: 520 - i * 90,
  }));

  // ── header ──
  const label = s.mode === "posting" ? "POSTING SCHEDULE" : "DEADLINES";
  const count = s.items.length;
  const noun = s.mode === "posting" ? (count === 1 ? "video" : "videos") : count === 1 ? "deadline" : "deadlines";
  const sub = [
    from4(s.from, s.to),
    `${n} day${n === 1 ? "" : "s"}`,
    `${count} ${noun}`,
    batchTotal ? `${batchTotal} daily batch${batchTotal === 1 ? "" : "es"}` : "",
  ].filter(Boolean).join("  ·  ");
  const statX = W - PAD;
  const stats = cats.slice(0, 5).map((c, i) => {
    const y = 74 + i * 30;
    return `<circle cx="${statX - 168}" cy="${y - 5}" r="6" fill="${catColour(c.id)}"/>
      <text x="${statX - 154}" y="${y}" font-family="${FONT}" font-size="16" fill="${INK2}">${esc(catLabel(c.id))}</text>
      <text x="${statX}" y="${y}" font-family="${DISPLAY}" font-size="18" font-weight="700" fill="${INK}" text-anchor="end">${c.n}</text>`;
  }).join("");
  const busy = busiest && busiest.n > 0 && n > 1
    ? `<text x="${PAD}" y="196" font-family="${FONT}" font-size="16" fill="${INK3}">Busiest: <tspan fill="${INK}" font-weight="700">${esc(`${weekday(busiest.d)} ${monthDay(busiest.d)}`)}</tspan> · ${busiest.n} ${esc(noun)}</text>`
    : "";
  const header = `
    <text x="${PAD}" y="70" font-family="${FONT}" font-size="15" font-weight="700" letter-spacing="4" fill="${INK3}">SPECULAR  ·  ${label}</text>
    <text x="${PAD}" y="134" font-family="${DISPLAY}" font-size="58" font-weight="800" fill="${INK}">${esc(rangeTitle(s.from, s.to))}</text>
    <text x="${PAD}" y="168" font-family="${FONT}" font-size="18" fill="${INK2}">${esc(sub)}</text>
    ${busy}${stats}`;
  const top = 232;

  const body = layout === "columns" ? columns(s, days, byDay, top) : layout === "grid" ? grid(s, days, byDay, top) : timeline(s, days, top);
  const height = body.height + top + 70;
  const footer = `<text x="${PAD}" y="${height - 30}" font-family="${FONT}" font-size="13" fill="${INK3}">${esc(`Made ${new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(s.generatedAt)} ET from the Specular board`)}</text>
    <text x="${W - PAD}" y="${height - 30}" font-family="${FONT}" font-size="13" fill="${INK3}" text-anchor="end">${esc(s.mode === "posting" ? "By air date" : "By due date")}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${esc(`${label.toLowerCase()}, ${rangeTitle(s.from, s.to)}`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#121217"/><stop offset="1" stop-color="#0A0A0D"/></linearGradient>
    ${glows.map((g, i) => `<radialGradient id="g${i}"><stop offset="0" stop-color="${g.colour}" stop-opacity="0.22"/><stop offset="1" stop-color="${g.colour}" stop-opacity="0"/></radialGradient>`).join("")}
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#FFFFFF" fill-opacity="0.035"/></pattern>
  </defs>
  <rect width="${W}" height="${height}" fill="url(#bg)"/>
  ${glows.map((g, i) => `<circle cx="${g.x.toFixed(0)}" cy="${g.y.toFixed(0)}" r="${g.rad}" fill="url(#g${i})"/>`).join("")}
  <rect width="${W}" height="${height}" fill="url(#dots)"/>
  ${header}
  ${body.svg}
  ${footer}
</svg>`;
}

const from4 = (from: string, to: string) => (from.slice(0, 4) === to.slice(0, 4) ? from.slice(0, 4) : `${from.slice(0, 4)}–${to.slice(0, 4)}`);

/** A week or less: a column a day, every item a card. */
function columns(s: SnapInput, days: string[], byDay: Map<string, SnapItem[]>, top: number): { svg: string; height: number } {
  const gap = 14;
  const colW = (W - PAD * 2 - gap * (days.length - 1)) / days.length;
  const lineH = 19;
  const titleMax = fits(colW - 36, 15);
  const titleLines = days.length <= 3 ? 3 : 2;
  let tallest = 0;
  const cols = days.map((d, ci) => {
    const x = PAD + ci * (colW + gap);
    const list = byDay.get(d) ?? [];
    const isToday = d === s.today;
    const off = s.daysOff.has(d);
    let y = top + 78;
    const cards = list.map((it) => {
      const lines = wrap(it.title, titleMax, titleLines);
      const c = chColour(it.channel, it.category);
      const meta = s.mode === "deadlines" ? it.due ?? "" : it.code ?? "";
      const h = 40 + lines.length * lineH + (meta ? 26 : 12);
      const card = `<g opacity="${it.done ? 0.55 : 1}">
        <rect x="${x}" y="${y}" width="${colW}" height="${h}" rx="14" fill="${CARD}" stroke="${LINE}"/>
        <rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${c}"/>
        <circle cx="${x + 24}" cy="${y + 22}" r="5" fill="${c}"/>
        <text x="${x + 36}" y="${y + 27}" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="0.5" fill="${INK2}">${esc(clip(shortCh(it.channel).toUpperCase(), fits(colW - 50, 13)))}</text>
        ${lines.map((l, li) => `<text x="${x + 20}" y="${y + 50 + li * lineH}" font-family="${FONT}" font-size="15" font-weight="600" fill="${INK}"${it.done ? ` text-decoration="line-through"` : ""}>${esc(l)}</text>`).join("")}
        ${meta ? `<text x="${x + 20}" y="${y + h - 12}" font-family="${FONT}" font-size="12" fill="${INK3}">${esc(clip(`${meta}${it.done ? "  ✓" : ""}`, fits(colW - 30, 12)))}</text>` : ""}
      </g>`;
      y += h + 10;
      return card;
    }).join("");
    const batches = s.batches.get(d) ?? 0;
    const batchPill = batches
      ? `<rect x="${x}" y="${y}" width="${colW}" height="34" rx="17" fill="none" stroke="${LINE}" stroke-dasharray="4 4"/>
         <text x="${x + colW / 2}" y="${y + 22}" font-family="${FONT}" font-size="13" fill="${INK3}" text-anchor="middle">${esc(clip(`+ ${batches} daily batch${batches === 1 ? "" : "es"}`, fits(colW - 16, 13)))}</text>`
      : "";
    if (batches) y += 44;
    const empty = !list.length && !batches ? `<text x="${x + colW / 2}" y="${top + 112}" font-family="${FONT}" font-size="14" fill="${INK3}" text-anchor="middle">${off ? "Day off" : "Nothing"}</text>` : "";
    tallest = Math.max(tallest, y - top, 140);
    return `<g>
      <rect x="${x}" y="${top}" width="${colW}" height="62" rx="16" fill="${isToday ? "#F2A79C" : "#18181D"}" stroke="${isToday ? "none" : LINE}"/>
      <text x="${x + 18}" y="${top + 27}" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="2" fill="${isToday ? "#141414" : INK3}">${esc(weekday(d).toUpperCase())}${off ? " · OFF" : ""}</text>
      <text x="${x + 18}" y="${top + 51}" font-family="${DISPLAY}" font-size="22" font-weight="800" fill="${isToday ? "#141414" : INK}">${esc(monthDay(d))}</text>
      <text x="${x + colW - 18}" y="${top + 51}" font-family="${DISPLAY}" font-size="22" font-weight="800" fill="${isToday ? "#141414" : INK2}" text-anchor="end">${list.length || ""}</text>
      ${cards}${batchPill}${empty}
    </g>`;
  }).join("");
  return { svg: cols, height: tallest };
}

/** Up to nine weeks: a calendar grid, Sunday to Saturday, items as pills. */
function grid(s: SnapInput, days: string[], byDay: Map<string, SnapItem[]>, top: number): { svg: string; height: number } {
  const gap = 10;
  const cellW = (W - PAD * 2 - gap * 6) / 7;
  const first = shiftDate(days[0]!, -new Date(`${days[0]}T12:00:00Z`).getUTCDay());
  const last = shiftDate(days[days.length - 1]!, 6 - new Date(`${days[days.length - 1]}T12:00:00Z`).getUTCDay());
  const weeks = Math.round(daysBetween(first, last) / 7) + 1;
  const maxPills = 6;
  const pillH = 26;
  const head = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((w, i) => `<text x="${PAD + i * (cellW + gap) + 4}" y="${top + 14}" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="2" fill="${INK3}">${w}</text>`).join("");
  let y = top + 30;
  const rows: string[] = [];
  for (let w = 0; w < weeks; w++) {
    const week = Array.from({ length: 7 }, (_, i) => shiftDate(first, w * 7 + i));
    const most = Math.max(...week.map((d) => Math.min(maxPills, (byDay.get(d) ?? []).length) + ((byDay.get(d) ?? []).length > maxPills ? 1 : 0) + ((s.batches.get(d) ?? 0) ? 1 : 0)));
    const rowH = Math.max(104, 44 + most * (pillH + 5) + 8);
    rows.push(week.map((d, i) => {
      const x = PAD + i * (cellW + gap);
      const inRange = d >= s.from && d <= s.to;
      const list = inRange ? byDay.get(d) ?? [] : [];
      const isToday = d === s.today;
      const off = s.daysOff.has(d);
      const label = d.endsWith("-01") || d === s.from ? `${monthName(d)} ${Number(d.slice(8))}` : String(Number(d.slice(8)));
      const pills = list.slice(0, maxPills).map((it, pi) => {
        const py = y + 40 + pi * (pillH + 5);
        const c = chColour(it.channel, it.category);
        const text = s.mode === "deadlines" && it.due ? `${shortCh(it.channel)} · ${it.due.split(" · ")[0]} · ${it.title}` : `${shortCh(it.channel)} · ${it.title}`;
        return `<g opacity="${it.done ? 0.5 : 1}"><rect x="${x + 8}" y="${py}" width="${cellW - 16}" height="${pillH}" rx="${pillH / 2}" fill="#23232A"/>
          <circle cx="${x + 22}" cy="${py + pillH / 2}" r="5" fill="${c}"/>
          <text x="${x + 33}" y="${py + 17.5}" font-family="${FONT}" font-size="12.5" fill="${INK}">${esc(clip(text, fits(cellW - 50, 12.5)))}</text></g>`;
      }).join("");
      const more = list.length > maxPills ? `<text x="${x + 14}" y="${y + 40 + maxPills * (pillH + 5) + 15}" font-family="${FONT}" font-size="12" fill="${INK3}">+ ${list.length - maxPills} more</text>` : "";
      const b = inRange ? s.batches.get(d) ?? 0 : 0;
      const bOffset = Math.min(maxPills, list.length) + (list.length > maxPills ? 1 : 0);
      const batch = b ? `<text x="${x + 14}" y="${y + 40 + bOffset * (pillH + 5) + 15}" font-family="${FONT}" font-size="12" fill="${INK3}">+ ${b} batch${b === 1 ? "" : "es"}</text>` : "";
      return `<g opacity="${inRange ? 1 : 0.28}">
        <rect x="${x}" y="${y}" width="${cellW}" height="${rowH}" rx="14" fill="${isToday ? "#24201F" : "#16161B"}" stroke="${isToday ? "#F2A79C" : LINE}" stroke-width="${isToday ? 2 : 1}"/>
        <text x="${x + 14}" y="${y + 26}" font-family="${DISPLAY}" font-size="17" font-weight="800" fill="${isToday ? "#F2A79C" : INK}">${esc(label)}</text>
        ${off ? `<text x="${x + cellW - 14}" y="${y + 25}" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="1" fill="${INK3}" text-anchor="end">DAY OFF</text>` : list.length ? `<text x="${x + cellW - 14}" y="${y + 25}" font-family="${FONT}" font-size="13" font-weight="700" fill="${INK2}" text-anchor="end">${list.length}</text>` : ""}
        ${pills}${more}${batch}
      </g>`;
    }).join(""));
    y += rowH + gap;
  }
  return { svg: head + rows.join(""), height: y - top };
}

/** Longer: each channel a row of weeks, brighter the more it has that week. */
function timeline(s: SnapInput, days: string[], top: number): { svg: string; height: number } {
  const first = shiftDate(days[0]!, -((new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 6) % 7)); // Monday
  const weeks = Math.ceil((daysBetween(first, days[days.length - 1]!) + 1) / 7);
  const labelW = 230;
  const totalW = 70;
  const cell = Math.min(64, (W - PAD * 2 - labelW - totalW) / weeks);
  const rowH = Math.max(24, Math.min(38, cell));
  const counts = new Map<string, number[]>();
  const meta = new Map<string, { category: string }>();
  for (const it of s.items) {
    const key = it.channel ?? catLabel(it.category);
    if (!counts.has(key)) { counts.set(key, Array(weeks).fill(0)); meta.set(key, { category: it.category }); }
    const w = Math.floor(daysBetween(first, it.day) / 7);
    if (w >= 0 && w < weeks) counts.get(key)![w]! += 1;
  }
  const order = [...counts.keys()].sort((a, b) => {
    const ca = CATEGORIES.findIndex((c) => c.id === meta.get(a)!.category), cb = CATEGORIES.findIndex((c) => c.id === meta.get(b)!.category);
    return ca - cb || a.localeCompare(b);
  });
  const max = Math.max(1, ...[...counts.values()].flat());
  const gx = PAD + labelW;
  // Month labels over the weeks they start in.
  // A week is labelled by the month of its first day in the range; labels too close together give way.
  let lastMonth = "";
  let lastX = -Infinity;
  const months = Array.from({ length: weeks }, (_, w) => {
    const start = shiftDate(first, w * 7);
    const d = start < s.from ? s.from : start;
    const m = d.slice(0, 7);
    const x = gx + w * cell;
    if (m === lastMonth || x - lastX < 56) return "";
    lastMonth = m;
    lastX = x;
    return `<text x="${x}" y="${top + 14}" font-family="${FONT}" font-size="13" font-weight="700" letter-spacing="1" fill="${INK3}">${esc(monthName(d).toUpperCase())}${w === 0 || d.slice(5, 7) === "01" ? ` ${d.slice(0, 4)}` : ""}</text>`;
  }).join("");
  const todayW = s.today >= first ? Math.floor(daysBetween(first, s.today) / 7) : -1;
  const todayLine = todayW >= 0 && todayW < weeks ? `<rect x="${gx + todayW * cell + cell / 2 - 1}" y="${top + 24}" width="2" height="${order.length * rowH + 8}" fill="#F2A79C" opacity="0.8"/>` : "";
  const rows = order.map((ch, ri) => {
    const y = top + 30 + ri * rowH;
    const c = chColour(ch, meta.get(ch)!.category);
    const list = counts.get(ch)!;
    const cells = list.map((v, w) => `<rect x="${gx + w * cell + 2}" y="${y + 2}" width="${Math.max(2, cell - 4)}" height="${rowH - 4}" rx="${Math.min(6, (cell - 4) / 3)}" fill="${v ? c : "#FFFFFF"}" fill-opacity="${v ? (0.28 + 0.72 * (v / max)).toFixed(2) : 0.04}"/>`).join("");
    return `<circle cx="${PAD + 7}" cy="${y + rowH / 2}" r="5" fill="${c}"/>
      <text x="${PAD + 20}" y="${y + rowH / 2 + 5}" font-family="${FONT}" font-size="14" fill="${INK}">${esc(clip(ch, 26))}</text>
      ${cells}
      <text x="${W - PAD}" y="${y + rowH / 2 + 5}" font-family="${DISPLAY}" font-size="15" font-weight="700" fill="${INK2}" text-anchor="end">${list.reduce((a, b) => a + b, 0)}</text>`;
  }).join("");
  const empty = order.length ? "" : `<text x="${PAD}" y="${top + 60}" font-family="${FONT}" font-size="16" fill="${INK3}">Nothing on the calendar in this range.</text>`;
  return { svg: months + todayLine + rows + empty, height: 40 + Math.max(1, order.length) * rowH + 20 };
}

/** "11:59 PM" in the studio's zone. */
export const clockEt = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: ORG_TZ, hour: "numeric", minute: "2-digit" }).format(d);
