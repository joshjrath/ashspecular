/**
 * Check a draft against how the 94 scripts are actually built.
 *
 * Paste a script with its INTRO / PART n / OUTRO headers (any of the styles
 * the writers use). It's split and measured exactly like the corpus, then
 * compared with the scripts of the same format — and, when the title names a
 * world and a hero, with what that world's scripts do: when the apex arrives,
 * how many of the roster get met, when the hero's ultimate is spent.
 * Every finding says where in the draft and what the corpus does instead.
 */
import { FORMAT_BY_ID, formatOfTitle, type Format } from "./formats.js";
import { readTitle, voice, type Hero, type World } from "./lore.js";
import { corpus, measure, normsFor, sentencesOf, splitScript, type Norms, type Section } from "./corpus.js";

export interface Finding {
  level: "good" | "fix" | "note";
  label: string;
  detail: string;
}

export interface DraftCheck {
  format: Format;
  hero: Hero | null;
  world: World | null;
  sections: Array<{ name: string; words: number }>;
  words: number;
  norms: Norms;
  findings: Finding[];
}

const bare = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();

/** Where in the script (0–1) a name is said most — the part it "belongs" to. */
function peak(sections: Section[], name: string): number | null {
  const parts = sections.filter((s) => s.name.startsWith("PART"));
  if (!parts.length) return null;
  const counts = parts.map((p) => {
    const t = p.paras.join(" ");
    return (t.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")) ?? []).length;
  });
  const max = Math.max(...counts);
  if (max < 2) return null;
  return (counts.indexOf(max) + 1) / parts.length;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : 0;
}

export function checkDraft(text: string, title: string): DraftCheck | null {
  const sections = splitScript(text, title);
  const all = sections.map((s) => s.paras.join(" ")).join(" ");
  if (all.split(/\s+/).length < 150) return null;
  const formatId = formatOfTitle(title || "What If");
  const format = FORMAT_BY_ID.get(formatId)!;
  const read = readTitle(title);
  const hero = read.heroes[0] ?? null;
  const world = read.worlds[0] ?? null;
  const same = corpus().filter((s) => s.format === formatId);
  const norms = normsFor(same.length >= 4 ? same : corpus());
  const m = measure(sections);
  const parts = sections.filter((s) => s.name.startsWith("PART"));
  const f: Finding[] = [];
  const fmtN = (n: number) => Math.round(n).toLocaleString("en-US");

  // Shape.
  if (!parts.length) {
    f.push({ level: "fix", label: "No parts", detail: "Split it into INTRO, PART 1…n and OUTRO. Every script in the corpus is built that way, and every other check here reads the parts." });
  } else if (Math.abs(parts.length - norms.parts) > 2) {
    f.push({ level: "fix", label: `${parts.length} parts`, detail: `${format.name} scripts run ${norms.parts} parts (${same.length} scripts). ${parts.length < norms.parts ? "Some beats are probably sharing a part — see the beat list." : "Some parts can probably merge."}` });
  } else {
    f.push({ level: "good", label: `${parts.length} parts`, detail: `In line with ${format.name} scripts (${norms.parts}).` });
  }
  if (Math.abs(m.words - norms.words) / norms.words > 0.25) {
    f.push({ level: "fix", label: `${fmtN(m.words)} words`, detail: `${format.name} scripts run about ${fmtN(norms.words)}.` });
  }
  const long = parts.filter((p) => p.words > norms.partWords[2] * 1.1);
  const short = parts.filter((p) => p.words < norms.partWords[0] * 0.9);
  if (long.length) f.push({ level: "fix", label: "Parts running long", detail: `${long.map((p) => `${p.name} (${p.words})`).join(", ")} — parts usually run ${norms.partWords[0]}–${norms.partWords[2]} words. A long part is usually two beats.` });
  if (short.length) f.push({ level: "note", label: "Thin parts", detail: `${short.map((p) => `${p.name} (${p.words})`).join(", ")} — under ${norms.partWords[0]} words; check the beat actually lands.` });

  // Intro.
  const intro = sections[0]?.name === "INTRO" ? sections[0] : null;
  if (!intro) f.push({ level: "fix", label: "No intro", detail: `Open with an intro of ${norms.introWords[0]}–${norms.introWords[1]} words before PART 1.` });
  else {
    if (intro.words < norms.introWords[0] * 0.8 || intro.words > norms.introWords[1] * 1.2)
      f.push({ level: "fix", label: `Intro is ${intro.words} words`, detail: `Corpus intros run ${norms.introWords[0]}–${norms.introWords[1]}.` });
    const last = sentencesOf(intro.paras.join(" ")).at(-1) ?? "";
    if (last.trim().endsWith("?"))
      f.push({ level: "note", label: "Intro ends on a question", detail: `Only 4 of 94 scripts do. The rest end on the escalation hook — ${format.intro.hook}` });
    else f.push({ level: "good", label: "Intro ends on a statement", detail: `Like the corpus. The hook to aim for: ${format.intro.hook}` });
    const lockText = `${intro.paras.join(" ")} ${parts[0]?.paras.join(" ") ?? ""}`;
    if (["insert", "survive", "versus", "power"].includes(formatId) && !/(we['’]re using|we['’]ll use|I['’]d use|for this (scenario|matchup)|this would use|I['’]d set this|version|at his peak|at his strongest|after (the events of|No Way Home|Shibuya|Endgame)|before (the events of|Infinity War|Shibuya))/i.test(lockText))
      f.push({ level: formatId === "versus" ? "fix" : "note", label: "No version lock", detail: `Say which version and when, in the intro or Part 1 — ${hero ? `e.g. “${hero.version}”.` : "e.g. “MCU Peter after No Way Home, homemade suit, no Stark support”."}` });
  }

  // Voice.
  if (m.sentence > norms.sentence + 6) f.push({ level: "fix", label: `Sentences average ${m.sentence} words`, detail: `The corpus sits around ${norms.sentence}. Long sentences are hard to voice.` });
  if (m.paragraph > 5) f.push({ level: "fix", label: `Paragraphs run ${m.paragraph} sentences`, detail: "The corpus keeps them to about 3." });
  if (!["you", "game"].includes(formatId) && m.conditional < norms.conditional[0])
    f.push({ level: "note", label: "Reads as narration", detail: `“would / could / probably” ${m.conditional} a thousand words; ${format.name} scripts run ${norms.conditional[0]}–${norms.conditional[1]}. The house voice reasons it through (“He'd notice… That would…”) rather than narrating events as fact.` });
  if (parts.length && m.forwardClosers < norms.forwardClosers * 0.5) {
    const flat = parts.filter((p) => !/\b(next|until|once|then|now|about to|eventually|before|after that|that['’]s when)\b/i.test(sentencesOf(p.paras.join(" ")).at(-1) ?? ""));
    f.push({ level: "note", label: "Parts end flat", detail: `${flat.slice(0, 5).map((p) => p.name).join(", ")} end without pointing forward. About ${Math.round(norms.forwardClosers * 100)}% of corpus parts end on a line that sets up the next (“…their next meeting wouldn't end after a few exchanged attacks.”).` });
  }
  if (["insert", "versus", "survive", "power"].includes(formatId) && m.caveats === 0)
    f.push({ level: "note", label: "No honesty caveat", detail: "Add at least one “that doesn't mean…” / “canon never shows…” line where the matchup isn't settled — it's what makes the reasoning trustworthy." });
  if (!m.hasOutro && norms.outroShare > 0.5) f.push({ level: "note", label: "No outro", detail: `${Math.round(norms.outroShare * 100)}% of ${format.name} scripts close with one. ${format.outro}` });

  // Structure against the world and hero.
  if (world && formatId === "insert") {
    const apexAt = peak(sections, world.apex.name);
    const worldScripts = corpus().filter((s) => s.format === "insert" && s.worlds.some((w) => w.id === world.id));
    const normAt = median(worldScripts.map((s) => peak(s.sections, world.apex.name)).filter((x): x is number => x !== null));
    if (apexAt !== null && normAt) {
      const partNo = Math.round(apexAt * parts.length);
      const normNo = Math.round(normAt * 10);
      const off = Math.abs(apexAt - normAt) > 0.2;
      f.push({ level: off ? "fix" : "good", label: `${world.apex.name} peaks in part ${partNo} of ${parts.length}`, detail: `In the ${worldScripts.length} ${world.name} insertion scripts, ${world.apex.name}'s biggest part is around part ${normNo} of 10.${off ? (apexAt < normAt ? " You're getting to him early — the institution and the roster carry the first half." : " He arrives late — the corpus gives the first clash room to be inconclusive before the final fight.") : ""}` });
    } else if (apexAt === null) {
      f.push({ level: "fix", label: `${world.apex.name} barely appears`, detail: `Every ${world.name} insertion script builds to him.` });
    }
    const namesOf = (n: string) => n.split(/,| and /).map((x) => x.replace(/^\s*the\s+/i, "").trim()).filter((x) => x.length > 2);
    const roster = world.ladder.map((r) => ({ ...r, name: voice(r.name, hero) }));
    const met = roster.filter((r) => namesOf(r.name).some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(all)));
    f.push({ level: met.length >= 2 ? "good" : "fix", label: `Meets ${met.length} of ${roster.length} of the roster`, detail: `${met.map((r) => r.name).join(", ") || "none"}. The corpus meets them one by one, weakest first, each as a mechanics beat.` });
    if (world.faction && !world.faction.members.some((mb) => new RegExp(`\\b${mb.name}\\b`, "i").test(all)))
      f.push({ level: "fix", label: `No ${world.faction.name}`, detail: `The resistance side is part 4 of every ${world.name} insertion — and where the hero states his line.` });
  }
  if (hero) {
    const ult = bare(hero.ladder.at(-1) ?? "");
    const ultAt = ult ? peak(sections, ult) : null;
    if (ultAt !== null && ultAt < 0.6 && ["insert", "versus", "power"].includes(formatId))
      f.push({ level: "fix", label: `${ult} peaks at part ${Math.round(ultAt * parts.length)}`, detail: `The corpus holds the ultimate for the final fight (the last third), after the first clash shows what neither side used.` });
    else if (ultAt !== null) f.push({ level: "good", label: `${ult} saved for the end`, detail: "Like the corpus." });
  }
  return { format, hero, world, sections: sections.map((s) => ({ name: s.name, words: s.words })), words: m.words, norms, findings: f };
}
