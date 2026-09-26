/**
 * A revision's score out of 10: how much the editor's cut needed.
 *
 *   10  nothing to fix
 *    8  a few small notes — a keeper
 *    5  a lot to fix, or something big — worth watching
 *    1  a rework
 *
 * Worked out in code, from the comments, so every point is explained:
 *
 *   frequency  how many notes, and how many rounds (versions) it took
 *   type       a small bug (a typo, a frame) costs little; an issue with the
 *              whole video (its structure, the audio throughout) costs a lot
 *   repeats    the same issue on this channel's recent videos costs extra —
 *              the editor was told before
 *
 * Your own summary counts as notes of its own (a little heavier: they're
 * yours), and your own rating, when you give one, is half the score.
 */

export type Severity = "minor" | "moderate" | "major";

export interface RevComment {
  text: string;
  author?: string | null;
  /** "00:01:23" when the note is pinned to a moment. */
  timecode?: string | null;
  version?: number | null;
  severity?: Severity;
  theme?: string;
  source: "frameio" | "pasted" | "you";
}

/** What each kind of note is about, and the words that give it away — the most specific first ("music too loud" is music). */
export const THEMES: Array<{ id: string; label: string; words: RegExp }> = [
  { id: "music", label: "music", words: /\b(music|song|track|bgm|soundtrack|beat drop)\b/i },
  { id: "sfx", label: "sound effects", words: /\b(sfx|sound effects?|whoosh|impact sound)\b/i },
  { id: "vo", label: "voiceover and sync", words: /\b(vo|voice ?over|narrat\w*|out of sync|sync|lip ?sync|voice)\b/i },
  { id: "text", label: "text and captions", words: /\b(captions?|subtitles?|text|typo|spell\w*|font|title card|lower third|misspel\w*|grammar)\b/i },
  { id: "audio", label: "audio levels", words: /\b(audio|volume|loud|louder|quiet|quieter|levels?|mix|mic|peak(ing)?|clipping|noise|echo|muffled|distort\w*)\b/i },
  { id: "pacing", label: "pacing", words: /\b(pacing|pace|slow|drags?|dragging|too long|rushed|fast|dead air|pause|trim|tighten|cut (it )?down|shorten|lingers?)\b/i },
  { id: "visuals", label: "footage and b-roll", words: /\b(footage|clips?|b-?roll|visuals?|images?|scenes?|shots?|wrong (character|clip|scene)|reference|stock)\b/i },
  { id: "colour", label: "colour", words: /\b(colou?r|grade|grading|brightness|too dark|too bright|saturat\w*|exposure|contrast)\b/i },
  { id: "motion", label: "transitions and effects", words: /\b(transitions?|effects?|zoom|shake|animat\w*|motion|flash|keyframe|glitch)\b/i },
  { id: "graphics", label: "graphics", words: /\b(graphics?|overlay|map|chart|icons?|png|green ?screen|logo)\b/i },
  { id: "quality", label: "export quality", words: /\b(resolution|blurry|pixelat\w*|quality|1080|4k|artifacts?|watermark|black bars?|aspect|export|render)\b/i },
  { id: "story", label: "story and structure", words: /\b(story|structure|intro|hook|outro|ending|order|flow|script|context|doesn'?t match|missing (section|part))\b/i },
  { id: "rights", label: "copyright", words: /\b(copyright\w*|claim|dmca|licens\w*)\b/i },
];

const MAJOR = /\b(whole video|entire video|throughout|everywhere|every scene|all of (it|the)|redo|re-do|start over|restart|rework|re-?edit|unusable|completely|overall|structure|wrong video|missing (section|part)|doesn'?t match the script|copyright|dmca|claim)\b/i;
const MINOR = /\b(typo|spelling|slightly|a bit|a little|small|tiny|minor|nit(pick)?|one frame|few frames|just|quick fix|little)\b/i;

export function themeOf(text: string): string {
  return THEMES.find((t) => t.words.test(text))?.id ?? "other";
}

export function severityOf(c: RevComment): Severity {
  if (MAJOR.test(c.text)) return "major";
  if (MINOR.test(c.text)) return "minor";
  return "moderate";
}

export const themeLabel = (id: string) => THEMES.find((t) => t.id === id)?.label ?? "other";

const STOP = new Set("the a an and or but of to in on at for with this that it its is are was be here there please can could we you i me my just so too very also more less make need needs should".split(" "));
const sig = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w)));

/** Earlier videos' notes on the same channel, newest first, for repeats. */
export interface PastVideo {
  title: string;
  themes: string[];
  comments: string[];
}

export interface ScoreBreakdown {
  score: number;
  auto: number;
  own: number | null;
  counts: { minor: number; moderate: number; major: number; total: number; versions: number };
  /** Points taken off, each with why. */
  penalties: Array<{ what: "frequency" | "type" | "repeats"; points: number; why: string }>;
  themes: Array<{ id: string; label: string; n: number }>;
  /** Issues this channel's editor was already told about. */
  repeats: Array<{ theme: string; label: string; videos: string[] }>;
  repeatedNotes: Array<{ note: string; before: string }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreRevision(comments: RevComment[], versions: number, past: PastVideo[], own: number | null = null): ScoreBreakdown {
  const notes = comments.map((c) => ({ ...c, theme: c.theme ?? themeOf(c.text), severity: c.severity ?? severityOf(c) }));
  const weight = (c: (typeof notes)[number]) => (c.source === "you" ? 1.5 : 1);
  const counts = {
    minor: notes.filter((c) => c.severity === "minor").length,
    moderate: notes.filter((c) => c.severity === "moderate").length,
    major: notes.filter((c) => c.severity === "major").length,
    total: notes.length,
    versions: Math.max(1, versions),
  };
  const penalties: ScoreBreakdown["penalties"] = [];

  // 1) Frequency: the notes, and the rounds it took.
  const freq = Math.min(2.5, 0.1 * notes.reduce((n, c) => n + weight(c), 0)) + Math.min(1.5, 0.5 * (counts.versions - 1));
  if (freq > 0) {
    penalties.push({
      what: "frequency",
      points: round1(freq),
      why: `${counts.total} note${counts.total === 1 ? "" : "s"}${counts.versions > 1 ? ` over ${counts.versions} versions` : ""}`,
    });
  }

  // 2) Type: a small bug costs little, a problem with the whole video a lot.
  const per = { minor: 0.1, moderate: 0.3, major: 1.4 };
  const type = Math.min(4.5, notes.reduce((n, c) => n + per[c.severity] * weight(c), 0));
  if (type > 0) {
    penalties.push({
      what: "type",
      points: round1(type),
      why: [counts.major && `${counts.major} about the whole video`, counts.moderate && `${counts.moderate} moderate`, counts.minor && `${counts.minor} small`]
        .filter(Boolean)
        .join(", "),
    });
  }

  // 3) Repeats: the same issue on the channel's recent videos.
  const recent = past.slice(0, 4);
  const mine = [...new Set(notes.map((c) => c.theme).filter((t) => t !== "other"))];
  const repeats = mine
    .map((theme) => ({ theme, label: themeLabel(theme), videos: recent.filter((p) => p.themes.includes(theme)).map((p) => p.title) }))
    .filter((r) => r.videos.length >= 2);
  const repeatedNotes: ScoreBreakdown["repeatedNotes"] = [];
  for (const c of notes) {
    const a = sig(c.text);
    if (a.size < 2) continue;
    for (const p of recent) {
      const hit = p.comments.find((o) => {
        const b = sig(o);
        let k = 0;
        for (const w of a) if (b.has(w)) k += 1;
        return k >= 2 && k / (a.size + b.size - k) >= 0.5;
      });
      if (hit) {
        repeatedNotes.push({ note: c.text, before: p.title });
        break;
      }
    }
  }
  const rep = Math.min(3.5, Math.min(2.7, 0.9 * repeats.length) + Math.min(1.6, 0.4 * repeatedNotes.length));
  if (rep > 0) {
    penalties.push({
      what: "repeats",
      points: round1(rep),
      why: [
        repeats.length && `${repeats.map((r) => r.label).join(", ")} again, after ${Math.max(...repeats.map((r) => r.videos.length))} of the last ${recent.length} videos`,
        repeatedNotes.length && `${repeatedNotes.length} note${repeatedNotes.length === 1 ? "" : "s"} given before`,
      ]
        .filter(Boolean)
        .join("; "),
    });
  }

  const auto = Math.max(1, Math.min(10, round1(10 - freq - type - rep)));
  const score = own === null ? auto : Math.max(1, Math.min(10, round1((auto + own) / 2)));
  const themeCounts = new Map<string, number>();
  for (const c of notes) themeCounts.set(c.theme, (themeCounts.get(c.theme) ?? 0) + 1);
  return {
    score,
    auto,
    own,
    counts,
    penalties,
    themes: [...themeCounts].map(([id, n]) => ({ id, label: themeLabel(id), n })).sort((a, b) => b.n - a.n),
    repeats,
    repeatedNotes,
  };
}

/** A summary in plain words, when there's no model to write one. */
export function ruleSummary(comments: RevComment[], b: ScoreBreakdown): string {
  if (!comments.length) return "No notes: nothing to fix.";
  const top = b.themes.filter((t) => t.id !== "other").slice(0, 3);
  const major = comments.filter((c) => (c.severity ?? severityOf(c)) === "major").slice(0, 2);
  const parts = [
    `${b.counts.total} note${b.counts.total === 1 ? "" : "s"}${b.counts.versions > 1 ? ` over ${b.counts.versions} versions` : ""}${
      top.length ? `: ${top.map((t) => `${t.label} (${t.n})`).join(", ")}` : ""
    }.`,
    major.length ? `The big ones: ${major.map((c) => `“${c.text.slice(0, 120)}”`).join("; ")}.` : `Nothing about the video as a whole.`,
    b.repeats.length ? `Again: ${b.repeats.map((r) => r.label).join(", ")} — also on ${[...new Set(b.repeats.flatMap((r) => r.videos))].slice(0, 3).join(", ")}.` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
