/**
 * A script blueprint for one idea: the title, the version lock, an intro
 * written in the house voice, and every part — what it has to do, with this
 * hero's abilities and this world's people in it, how long it should run,
 * and the part of a real script it's modelled on.
 *
 * Nothing here is generic filler: every line is filled from lore.ts (the
 * world's institution, roster, apex and canon anchors; the hero's version,
 * ability ladder, limits and code) in the order formats.ts says that format
 * is built in, which is the order the corpus scripts are built in.
 */
import { FORMAT_BY_ID, type Format, type FormatId } from "./formats.js";
import { HERO_BY_ID, POWER_BY_ID, WORLD_BY_ID, type Hero, type Power, type World } from "./lore.js";
import { corpus, firstSentence, normsFor, partFor, referencesFor, type Norms, type Script } from "./corpus.js";

export interface PlannedPart {
  n: number;
  name: string;
  plan: string;
  words: number;
  ref: { title: string; part: string; line: string } | null;
}

export interface Blueprint {
  format: Format;
  hero: Hero | null;
  world: World | null;
  power: Power | null;
  target: Hero | null;
  title: string;
  alternates: string[];
  premise: string;
  versionLock: string;
  intro: string[];
  parts: PlannedPart[];
  outro: string;
  caveats: string[];
  rules: string[];
  refs: Script[];
  norms: Norms;
}

const list = (xs: string[], n = xs.length) => {
  const a = xs.slice(0, n);
  return a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`;
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "Infinity (automatic)" → "Infinity" for use inside a sentence. */
const bare = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();
const plural = (s: string) => (/(s|x)$/.test(s) ? s : /y$/.test(s) && !/[aeiou]y$/.test(s) ? s.slice(0, -1) + "ies" : /o$/.test(s) ? s + "es" : s + "s");
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
const who = (m: { name: string; role: string }) => `${m.name} (${m.role})`;

function titleFor(format: FormatId, hero: Hero | null, world: World | null, power: Power | null, target: Hero | null): { title: string; alternates: string[] } {
  const h = hero?.name ?? "YOU";
  const w = world?.name ?? "";
  const p = power ? power.name.replace(/^(the|a) /i, "") : "";
  const P = power ? titleCase(power.name) : "";
  switch (format) {
    case "insert":
      return { title: `What If ${h} Was In ${w}?`, alternates: [`What If ${h} Joined ${w}?`, `${h} In ${w} Isn't Even Close`] };
    case "survive":
      return { title: `Could ${h} Survive ${w}?`, alternates: [`Could ${h} Escape ${w}?`, `How Long Would ${h} Last In ${w}?`] };
    case "hunt":
      return { title: `Could ${h} Catch ${target?.name ?? "…"}?`, alternates: [`Could ${h} Outsmart ${target?.name ?? "…"}?`] };
    case "versus":
      return { title: `${h} VS ${target?.name ?? w}`, alternates: [`${h} VS ${target?.name ?? w} Isn't Even Close`, `What If ${target?.name ?? w} Fought ${h}?`] };
    case "power":
      return { title: `What If ${h} Had ${P}?`, alternates: [`What If ${h} Got ${P}?`, `What If ${h} Was Given ${P}?`].filter((t) => !/Viltrumite biology/i.test(t)).concat(power?.id === "viltrumite" ? [`What If ${h} Was A Viltrumite?`] : []) };
    case "reborn":
      return { title: `What If ${h} Was Reborn With His Memories?`, alternates: [`What If ${h} Knew What Was Coming?`] };
    case "you":
      return power
        ? { title: `What If YOU Had ${P}?`, alternates: [`What If YOU Found ${P}?`] }
        : { title: `What If YOU Were In ${w}?`, alternates: [`How Would YOU Survive ${w}?`] };
    default:
      return { title: `What If ${h}…?`, alternates: [] };
  }
}

/** The intro, three moves, in the house voice. */
function introFor(format: FormatId, hero: Hero | null, world: World | null, power: Power | null, target: Hero | null): string[] {
  const h = hero?.name ?? "you";
  const w = world;
  switch (format) {
    case "insert": {
      if (!hero || !w) return [];
      const noun = w.powered ?? "newcomer";
      return [
        `${h} would understand pretty quickly that ${w.truth}.`,
        `${cap(w.institution.name)} would have a much harder time understanding ${h}: ${w.institution.cantClassify}.`,
        `${w.apex.name} would hear about him eventually. At first, he'd probably assume ${h} is just another ${noun} who needs to be reminded who runs things, but that attitude would change once he sees what ${bare(hero.ladder[0]!)} actually does.`,
      ];
    }
    case "survive": {
      if (!hero || !w) return [];
      const first = w.ladder[0];
      return [
        `${h} would have a huge advantage in ${w.name}. ${first ? `${cap(first.name)} would barely be a problem at first — his ${bare(hero.ladder[0]!)} sees to that.` : ""}`,
        `The problem is that ${w.truth}, and nothing about ${h} guarantees that doesn't apply to him.`,
        `So the real question isn't whether ${h} can beat ${first?.name ?? "what's in front of him"}. It's whether he can ${w.goal ?? "get out"} before ${w.name} wears him down.`,
      ];
    }
    case "hunt": {
      if (!hero || !target) return [];
      return [
        `${target.name} has one of the best hiding places there is: ${target.hides ?? target.engine}.`,
        `${h} would approach it differently. He wouldn't start by chasing ${target.name} — he'd start with ${bare(hero.ladder[0]!)}.`,
        `But suspecting ${target.name} is only the beginning. The question would be whether ${h} can build a case before ${target.name} figures out exactly how he's doing it.`,
      ];
    }
    case "versus": {
      if (!hero) return [];
      const other = target?.name ?? w?.name ?? "them";
      return [
        `${h} versus ${other} sounds like it should come down to who hits harder.`,
        `For this, we're using ${hero.version}${target ? `, and ${target.version}` : ""}. ${target ? `${target.name} brings ${list(target.ladder, 3)}` : `${other} brings numbers`} — but all of it still has to deal with ${bare(hero.ladder[0]!)}.`,
        `Once we work through how those abilities actually interact, we'll see whether ${h} can turn ${bare(hero.ladder[0]!)} into an actual win.`,
      ];
    }
    case "power": {
      if (!hero || !power) return [];
      return [
        `${h} would first notice ${power.name} the way he notices anything unusual — something responding that shouldn't.`,
        `${cap(power.name)} would give him ${list(power.grants, 3)}. What it can't give him is ${power.cantCopy}.`,
        `The more it helps him, the easier it becomes to rely on it. The real problem starts when ${power.cost}.`,
      ];
    }
    case "reborn": {
      if (!hero) return [];
      const home = hero.home ? WORLD_BY_ID.get(hero.home) : null;
      return [
        `${h}'s last memory is ${home?.anchors.at(-2) ?? "the end"}.`,
        `Then he wakes up years earlier, back in his younger body, remembering ${list(home?.anchors.slice(0, 3) ?? [], 3)} — and every person he lost.`,
        `This time he knows what's coming, but every change he makes makes everything he remembers after it less reliable.`,
      ];
    }
    case "you": {
      if (power)
        return [
          `You'd probably pick up ${power.name} because it's just there, with no explanation.`,
          `The first time it works, it stops being something you can dismiss. It gives you ${list(power.grants, 2)}.`,
          `From that point on, every use becomes something you'd have to live with.`,
        ];
      if (!w) return [];
      return [
        `You've heard about ${w.name}'s world your whole life — at least, you think you have.`,
        `Then one night you see what ${w.institution.name} does when nobody's watching, and ${w.institution.name} sees you see it.`,
        `By morning, ${w.apex.name} knows you exist.`,
      ];
    }
    default:
      return [];
  }
}

function planParts(format: Format, hero: Hero | null, world: World | null, power: Power | null, target: Hero | null): Array<{ name: string; plan: string; at: number[]; names: string[] }> {
  const h = hero?.name ?? "You";
  const w = world;
  const L = hero?.ladder ?? [];
  const ult = L.at(-1) ?? "his strongest move";
  const early = L.slice(0, 2);
  const mid = L.slice(2, -1);
  switch (format.id) {
    case "insert": {
      if (!hero || !w) return [];
      const insider = w.ladder.find((r) => /insider|truth|done with/i.test(r.test));
      const leader = w.faction?.members[0];
      const conscience = w.faction?.members[1];
      return [
        { name: "Arrival", at: [1], names: [], plan: `Lock the version: ${hero.version}. He lands ${w.arrival}. First public moment: ${w.incident} — with ${bare(L[0]!)}, in front of people, without anyone understanding what they just saw.` },
        { name: `${cap(w.institution.name)} can't classify him`, at: [1, 2], names: [w.institution.name], plan: `${cap(w.institution.cantClassify)}. That one fact is the engine of the script: ${hero.engine}.` },
        { name: "The friendly approach — then the test", at: [2], names: [w.institution.name], plan: `${cap(w.institution.approach)}. ${h} listens because he's curious. The line gets crossed when a test becomes an attack — ${bare(L[0]!)} holds, and that's the moment he stops treating ${w.institution.name} as a joke.` },
        { name: "The roster, one by one", at: [3], names: w.ladder.map((r) => r.name), plan: `Meet them in ascending order — ${w.ladder.slice(0, 4).map((r) => `${r.name} (${r.test})`).join("; ")}. For each, one mechanics beat: exactly how their power meets ${list(early.map(bare))}.${insider ? ` ${insider.name} — ${insider.test} — points him at what ${w.institution.name} is hiding.` : ""}` },
        { name: w.faction ? `${w.faction.name}` : "The other side", at: [4], names: w.faction?.members.map((m) => m.name) ?? [], plan: w.faction ? `${w.faction.name} find him: ${w.faction.members.slice(0, 3).map(who).join("; ")}. ${h} takes what they know but won't become anyone's weapon — his line, in his terms: ${hero.code}.` : `Whoever opposes ${w.institution.name} reaches him; he helps on his own terms (${hero.code}).` },
        { name: `First clash with ${w.apex.name} — inconclusive`, at: [5], names: [w.apex.name], plan: `${w.apex.name} ${w.apex.firstClash}. ${h} answers with ${list(early.map(bare))} and nothing more. Say what neither side used yet: ${h} hasn't shown ${list((mid.length ? mid : [ult]).map(bare))}${mid.length ? ` or ${bare(ult)}` : ""}.` },
        { name: `${w.apex.name} adapts`, at: [6], names: [w.apex.name, w.institution.name], plan: `${cap(w.institution.name)} studies every frame for a real weakness — use the honest ones: ${hero.limits[0] ?? "the limits canon actually shows"}. Then ${w.apex.name} ${w.apex.leverage}. The stakes turn personal and ${h} starts planning instead of reacting.` },
        { name: "Taking the system apart", at: [7, 8], names: [w.institution.name], plan: `${h} goes after what keeps ${w.apex.name} informed and supplied, and gets ${w.faction?.name ?? "the other side"} into places they could never reach: ${w.endgame}.` },
        { name: `The final fight — the ladder`, at: [8, 9], names: [w.apex.name], plan: `Climb in order — ${L.map(bare).join(" → ")} — each step answering what ${w.apex.name} just did. Use the weakness canon actually gives you (${w.apex.weakness}) and one honest caveat where canon is silent. End on ${bare(ult)}, then what ${h} chooses to do with a beaten ${w.apex.name}.` },
        { name: "Aftermath", at: [10], names: [w.institution.name], plan: `${cap(w.aftermath)}. ${h} refuses to take the top spot.` },
      ];
    }
    case "survive": {
      if (!hero || !w) return [];
      const tiers = w.ladder;
      return [
        { name: "Version lock and entry", at: [1], names: [], plan: `${cap(hero.version)}. Say what he has and what he doesn't: ${list(hero.limits, 2)}. He arrives at ${w.anchors[0]}.` },
        { name: "The easy start", at: [2], names: [tiers[0]?.name ?? ""], plan: `${cap(tiers[0]?.name ?? "the first threats")}: ${tiers[0]?.test ?? ""}. His ${list(early.map(bare))} make it look easy — and quietly start the attrition: ${w.attrition ?? "what he can't replace"}.` },
        { name: "Learning the rules", at: [3], names: [], plan: `${cap(w.rules ?? w.truth)}. He works it out before other survivors do because of ${bare(L[0]!)} — and works out which of his strengths don't apply.` },
        ...tiers.slice(1, 4).map((t, i) => ({ name: `Tier: ${t.name}`, at: [4 + i], names: [t.name], plan: `${cap(t.name)} — ${t.test}. ${i === 0 ? `Does ${bare(L[1] ?? L[0]!)} still work the way it does at home?` : i === 1 ? `This is where ${bare(L[0]!)} stops being enough on its own — say exactly why.` : `The fight that costs him something he can't replace.`}` })),
        { name: "Attrition", at: [6], names: [], plan: `${cap(w.attrition ?? "supplies")} becomes the real enemy. Show one decision he'd never have to make at home.` },
        ...(w.cast ? [{ name: "The canon cast", at: [7], names: [], plan: `${cap(w.cast)}. Change one canon beat without replacing them.` }] : []),
        ...(w.dilemma ? [{ name: "The choice", at: [8, 9], names: [], plan: `${cap(w.dilemma)} — decided by his code: ${hero.code}.` }] : []),
        { name: "Endgame", at: [9, 10], names: [w.apex.name], plan: `${cap(tiers.at(-1)?.name ?? w.apex.name)}, and the push to ${w.goal ?? w.endgame}. What it costs him.` },
      ];
    }
    case "hunt": {
      if (!hero || !target) return [];
      return [
        { name: "Rebuilding the case", at: [1], names: [], plan: `${h} ignores the existing theory and rebuilds everything ${target.name} has done onto one record — who, where, when, with what.` },
        { name: "The first pattern", at: [2], names: [], plan: `A pattern nobody compared — around ${list(target.ladder, 2)}. It narrows the field.` },
        { name: "The suspect pool", at: [3], names: [target.name], plan: `${target.name} lands on the list for a boring reason: ${target.engine}.` },
        { name: `${target.name} notices`, at: [4, 5], names: [target.name], plan: `${target.name} realises someone is studying the pattern and starts investigating back — through ${target.ladder.at(-1)}.` },
        { name: "The test", at: [5, 6], names: [], plan: `${h} builds a test only the real ${target.name} would react to — ${bare(hero.ladder[1] ?? hero.ladder[0]!)}.` },
        { name: "The counter-move", at: [6, 7], names: [], plan: `${target.name} hands the case a perfect suspect. ${h} asks who benefits from the search stopping there.` },
        { name: "The mistake", at: [7, 8], names: [], plan: `${target.name}'s weakness — ${target.limits[0] ?? "his need to stay ahead"} — produces the one mistake that survives a courtroom.` },
        { name: "Certainty versus proof", at: [8, 9], names: [], plan: `${h} is certain before he can prove it. Say exactly what's still missing. His own limit matters here: ${hero.limits[0] ?? ""}.` },
        { name: "Endgame", at: [10], names: [target.name], plan: `The confrontation on ${h}'s ground, not ${target.name}'s.` },
      ];
    }
    case "versus": {
      if (!hero) return [];
      const opp = target ? target.ladder.map((a) => ({ name: a, test: `${target.name}'s ${a}` })) : (world?.ladder ?? []);
      return [
        { name: "What the stats say", at: [1], names: [], plan: `Give ${target?.name ?? world?.name ?? "the other side"} every category it wins, honestly.` },
        { name: `How ${hero.ladder[0]} works`, at: [2], names: [], plan: `The mechanics of ${hero.ladder[0]} — why stats don't simply answer it. Limits: ${list(hero.limits, 2)}.` },
        ...opp.slice(0, 5).map((o, i) => ({ name: o.name, at: [3 + i], names: [o.name], plan: `${cap(o.name)} — ${o.test}. Does it get past ${hero.ladder[0]}? ${i >= 3 ? "Take the bypass seriously." : "Answer by mechanics."}` })),
        { name: "The win condition", at: [9], names: [], plan: `${hero.ladder.slice(2).join(" → ")} — where the fight actually ends, and how long it holds.` },
        { name: "The honest verdict", at: [10], names: [], plan: `A clear read plus the one interaction canon doesn't settle.` },
      ];
    }
    case "power": {
      if (!hero || !power) return [];
      const home = hero.home ? WORLD_BY_ID.get(hero.home) : null;
      const fights = home?.anchors ?? [];
      return [
        { name: "Acquisition", at: [1], names: [], plan: `${cap(hero.version)}. How ${power.name} reaches him — and the first time it activates, it's bigger than he expected.` },
        { name: "Testing the rules", at: [2], names: [], plan: `He tests ${list(power.grants, 2)} small and controlled. First limit found: ${power.weakness}.` },
        { name: "What it can't copy", at: [3], names: [], plan: `${cap(power.cantCopy)}. That's what stops it being a straight upgrade.` },
        { name: "The mentor", at: [4], names: [], plan: `${cap(power.mentor)} corrects how he uses it — his stance, not his strength. Tie it to his own ${bare(hero.ladder[0]!)}.` },
        { name: "The first canon fight it changes", at: [5], names: [], plan: fights.length ? `Replay ${fights[Math.min(2, fights.length - 1)]} and show precisely where ${power.name} changes the outcome.` : `Replay a named canon fight and change it precisely.` },
        { name: "The ripple", at: [6], names: [], plan: fights.length > 3 ? `Because of that, ${fights[3]} plays out differently — who survives, who never falls.` : `The canon events downstream shift.` },
        { name: "Temptation", at: [7], names: [], plan: `${cap(power.cost)} — pushing on his existing flaw: ${hero.limits[0] ?? hero.code}.` },
        { name: "Used against him", at: [8], names: [], plan: `Someone targets the power itself: ${power.weakness}.` },
        { name: "The defining fight", at: [9], names: [], plan: `He stops using ${power.name} as the answer and uses it inside his own style — ${bare(hero.ladder[0]!)} first, the power second.` },
        { name: "Who he is after", at: [10], names: [], plan: `The power stays; he decides its place. His code holds: ${hero.code}.` },
      ];
    }
    case "reborn": {
      if (!hero) return [];
      const home = hero.home ? WORLD_BY_ID.get(hero.home) : null;
      const a = home?.anchors ?? [];
      return [
        { name: "Is this real", at: [1], names: [], plan: `The first hours: the date, the younger body, checking it isn't a dream.` },
        { name: "The first fix", at: [2], names: [], plan: `The earliest tragedy he can stop — planned around what his younger body can't do.` },
        { name: "Convincing the skeptic", at: [2, 3], names: [], plan: `Proof the key person can check: a prediction that comes true.` },
        ...a.slice(0, 5).map((ev, i) => ({ name: cap(ev), at: [3 + i], names: [], plan: `${cap(ev)} — what he actually witnessed versus what he never saw; change it precisely.` })),
        { name: "The memories go stale", at: [8], names: [], plan: `The timeline has moved too far; what he knows stops matching.` },
        { name: `The big one: ${a.at(-2) ?? "the end"}`, at: [9, 10], names: [], plan: `Played out with everything they prepared.` },
      ];
    }
    case "you": {
      const w2 = world;
      if (power)
        return [
          { name: "The mundane entry", at: [1], names: [], plan: `How ${power.name} lands in your life — specific and small.` },
          { name: "First small use", at: [2], names: [], plan: `Something you can verify.` },
          { name: "Someone notices", at: [3, 4], names: [], plan: `The one person in that franchise who'd investigate starts closing in.` },
          { name: "Bigger uses", at: [5, 6, 7], names: [], plan: `Each justified, each bigger: ${list(power.grants)}.` },
          { name: "The line", at: [8, 9], names: [], plan: `${cap(power.cost)}.` },
          { name: "The choice", at: [10], names: [], plan: `Keep it or give it up.` },
        ];
      if (!w2) return [];
      return [
        { name: "The mundane entry", at: [1], names: [], plan: `An ordinary night; you see what ${w2.institution.name} does when nobody's watching.` },
        { name: "They know", at: [2], names: [w2.institution.name], plan: `${cap(w2.institution.name)} knows you saw it.` },
        { name: w2.faction?.name ?? "Allies", at: [3, 4], names: w2.faction?.members.map((m) => m.name) ?? [], plan: w2.faction ? `${w2.faction.name}: ${w2.faction.members.slice(0, 3).map((m) => `${m.name} (${m.role})`).join("; ")}.` : "Who helps you." },
        { name: `${w2.apex.name}`, at: [6, 7], names: [w2.apex.name], plan: `You stand in front of ${w2.apex.name} and survive without pretending you had a chance.` },
        { name: "Your own terms", at: [8, 9], names: [], plan: `You stop letting any one side control what you know.` },
        { name: "What changed", at: [10], names: [], plan: `${cap(w2.endgame)}, earlier than it would have happened.` },
      ];
    }
    default:
      return format.beats.map((b) => ({ name: b.name, plan: b.does, at: b.at, names: [] }));
  }
}

function caveatsFor(format: FormatId, hero: Hero | null, world: World | null, target: Hero | null): string[] {
  const out: string[] = [];
  if (hero) for (const l of hero.limits) out.push(`${hero.name}: ${l}.`);
  if (world && format === "insert") out.push(`${world.apex.name}: ${world.apex.weakness}.`);
  if (target) for (const l of target.limits) out.push(`${target.name}: ${l}.`);
  return out;
}

function outroFor(format: FormatId, hero: Hero | null, world: World | null, power: Power | null, target: Hero | null): string {
  const h = hero?.name ?? "you";
  switch (format) {
    case "insert":
      return world ? `The bigger change happens before and after the fight: ${world.institution.name} spends most of the story trying to understand someone who doesn't fit its system, ${world.faction?.name ?? "the other side"} gets access it never had, and ${world.apex.name} loses the fear that holds everyone in place. ${h} doesn't replace him — he leaves ${world.institution.name} weaker than he found it.` : "";
    case "survive":
      return world ? `So could ${h} survive ${world.name}? Probably — but not because ${world.ladder.at(-1)?.name ?? "the threats"} can't hurt him. What makes it hard is ${world.attrition ?? "what runs out"}, and the people he refuses to leave behind — and because he was there, ${world.cast ? world.cast.split(",")[0] : "more people"} come out of it differently.` : "";
    case "hunt":
      return target ? `${h} could figure out ${target.name}. Proving it is the harder part.` : "";
    case "versus":
      return `A clear read with its win condition, and the one interaction canon doesn't settle.`;
    case "power":
      return power ? `${cap(power.name)} would make ${h} stronger almost everywhere that matters in a fight. The harder part is what it does to his choices — ${power.cost}. That's the choice he keeps having to make.` : "";
    case "reborn":
      return `A safer world, but not the one he lost — and ${h} learning to live without knowing what happens next.`;
    case "you":
      return `The hardest part isn't the power or surviving the people with it. It's knowing when to stop.`;
    default:
      return "";
  }
}

export function blueprint(opts: { format: FormatId; hero?: string | null; world?: string | null; power?: string | null; target?: string | null }): Blueprint | null {
  const format = FORMAT_BY_ID.get(opts.format);
  if (!format) return null;
  const hero = opts.hero ? HERO_BY_ID.get(opts.hero) ?? null : null;
  const world = opts.world ? WORLD_BY_ID.get(opts.world) ?? null : null;
  const power = opts.power ? (POWER_BY_ID.get(opts.power) ?? null) : null;
  const target = opts.target ? HERO_BY_ID.get(opts.target) ?? null : null;

  const refs = referencesFor(format.id, hero, world, power, 3);
  const sameFormat = corpus().filter((s) => s.format === format.id);
  const norms = normsFor(sameFormat.length >= 4 ? sameFormat : corpus());
  const planned = planParts(format, hero, world, power, target);
  if (!planned.length) return null;
  const perPart = Math.round(norms.partWords[1] / 10) * 10;

  const parts: PlannedPart[] = planned.map((p, i) => {
    // The reference: the best-matching script's part at this position.
    let ref: PlannedPart["ref"] = null;
    for (const s of refs) {
      const sec = partFor(s, p.at, p.names.filter(Boolean));
      if (sec) {
        ref = { title: s.title, part: sec.name + (sec.label ? ` — ${sec.label}` : ""), line: firstSentence(sec) };
        break;
      }
    }
    return { n: i + 1, name: p.name, plan: p.plan.replace(/\s+/g, " ").trim(), words: perPart, ref };
  });

  const t = titleFor(format.id, hero, world, power, target);
  return {
    format,
    hero,
    world,
    power,
    target,
    title: t.title,
    alternates: t.alternates,
    premise: format.pitch,
    versionLock: hero?.version ?? "",
    intro: introFor(format.id, hero, world, power, target).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean),
    parts,
    outro: outroFor(format.id, hero, world, power, target),
    caveats: caveatsFor(format.id, hero, world, target),
    rules: format.rules,
    refs,
    norms,
  };
}

