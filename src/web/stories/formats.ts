/**
 * The Stories formats, as the writers actually build them — read off the 94
 * scripts in corpus.json, not invented. Each format has its own intro move,
 * its own beat order and its own ending; mixing them is what makes a script
 * feel generic.
 *
 * Numbers that hold across every format (from the corpus):
 *   ~4,750 words · 8–10 parts (42 of 94 use exactly 10) · ~460 words a part
 *   intro ~160 words, never a bare question at the end — it ends on the
 *   escalation hook ("that attitude would change once he sees what Infinity
 *   actually does")
 *   sentences ~17 words, paragraphs ~3 sentences, conditional voice ("would",
 *   "could") throughout — the whole script is reasoned, not narrated
 */

export type FormatId =
  | "insert" // What If X Was In Y / X Joined The Y
  | "power" // What If X Had Y / Got Y / Was A Y
  | "survive" // Could X Survive / Stop / Escape Y
  | "hunt" // Could X Catch / Outsmart Y
  | "versus" // X VS Y, ladders
  | "reborn" // X Reborn With His Memories
  | "divergence" // What If canon went another way
  | "you" // What If YOU…
  | "explainer" // How Does / Why / If X Was Charged
  | "game"; // Clash Royale mechanics

export interface Beat {
  /** Short name for the part. */
  name: string;
  /** What this part has to do, in the writers' terms. */
  does: string;
  /** Where in the script it sits, as part numbers in a ten-part script. */
  at: number[];
}

export interface Format {
  id: FormatId;
  name: string;
  /** Title shapes, with {hero}, {world}, {power}, {target}. */
  titles: string[];
  /** How to recognise the format from a title. */
  match: RegExp;
  pitch: string;
  intro: { open: string; build: string; hook: string };
  beats: Beat[];
  outro: string;
  /** The rules this format lives or dies by. */
  rules: string[];
}

export const FORMATS: Format[] = [
  {
    id: "insert",
    name: "Crossover insertion",
    titles: ["What If {hero} Was In {world}?", "What If {hero} Joined {world}?", "What If {hero} Became A {role}?"],
    match: /^what if .+ (was|were) in |^what if .+ joined |^what if .+ met |^what if .+ became a devil hunter/i,
    pitch:
      "Drop one character into a world with its own power system and its own institution. The story isn't whether he wins fights — it's how the world's institution, its insiders and its apex react to someone who doesn't fit their system.",
    intro: {
      open: "Open on the hero reading the world correctly and fast: “{Hero} would understand pretty quickly that {world truth}.”",
      build: "Flip it: the institution can't read him — name the exact thing it can't classify (no Compound V in his blood, no devil contract, no records).",
      hook: "End on the apex hearing about him and misjudging him: “At first, {apex} would probably assume {wrong read}, but that attitude would change once he sees what {signature ability} actually does.”",
    },
    beats: [
      { name: "Arrival", does: "Version-lock him (which point in his story), place him at a named moment in the world's timeline, and give him a first public incident where the world sees his power without understanding it.", at: [1] },
      { name: "The institution can't classify him", does: "The institution investigates — records, samples, footage — and comes back with nothing that fits. The one fact that doesn't fit becomes the engine of the script.", at: [1, 2] },
      { name: "Friendly approach, then the test", does: "They offer money, a place, a public role; he listens because he's curious. Then the tests start, and one test crosses a line (an ambush during recruitment) — the moment he stops treating it as a joke.", at: [2] },
      { name: "The roster, one by one", does: "He meets the world's powered insiders in ascending order. Each meeting is a mechanics beat: how that person's power interacts with his. One insider (the disillusioned one) tells him the truth.", at: [3] },
      { name: "The resistance faction", does: "The underground side finds him. Their leader wants to use him as a weapon; the conscience of the group actually talks to him. He takes their evidence but refuses to become anyone's weapon — his moral line is stated here.", at: [4] },
      { name: "First clash with the apex — inconclusive", does: "The apex finds him personally. It stays calm for a moment, then the apex tests him with his signature attacks and fails. Neither side shows everything: list the abilities the hero hasn't used yet.", at: [5] },
      { name: "The apex adapts — leverage", does: "The institution studies the footage for real weaknesses (the honest ones), and the apex stops attacking him and attacks the people near him. The stakes turn personal; he starts planning instead of reacting.", at: [6, 7] },
      { name: "Dismantling the system", does: "He goes after what keeps the apex informed and supplied, or gives the faction the access they never had — labs, records, a broadcast. The institution's usual moves stop working.", at: [7, 8] },
      { name: "The final fight — the ladder", does: "Climb his ability ladder in order, each step answering what the apex just did, with one honesty caveat where canon doesn't settle it. End on the ultimate — and what he chooses to do with the beaten apex.", at: [8, 9] },
      { name: "Aftermath", does: "What the world looks like without the apex's grip. He refuses to take the throne; the faction, the insiders and the public each change.", at: [9, 10] },
    ],
    outro: "Two or three sentences on what changed before and after the fight (not a recap of the fight), then the thematic line: he leaves the institution weaker than he found it and doesn't replace it.",
    rules: [
      "The institution's reaction carries the first third — not fights.",
      "The first apex clash must be inconclusive and must name what neither side used.",
      "The apex's real move is leverage on the people near the hero, not a bigger punch.",
      "The hero never becomes the faction leader's weapon; say why in his own terms.",
      "Every power interaction is explained by mechanics (why it works), with one “that doesn't mean…” caveat where canon is silent.",
    ],
  },
  {
    id: "power",
    name: "Power swap",
    titles: ["What If {hero} Had {power}?", "What If {hero} Got {power}?", "What If {hero} Was A {power}?", "What If {hero} Bonded With {power}?"],
    match: /^what if .+ (had|got|bonded with|scanned|was worthy|was a |was trained by|became a green|became ghost|ate )/i,
    pitch:
      "Give a character a power from another franchise. The power is the hook, but the script is about how it collides with who he already is — his fighting style, his flaw, his moral line.",
    intro: {
      open: "Open on the first uncontrolled manifestation, or on the one thing the power gives him that he's wanted (Vader: Padmé).",
      build: "Say exactly what the power copies and what it can't copy (the Omnitrix copies Aang's body, not the Avatar Cycle).",
      hook: "End on the cost: “The real problem starts when that strength begins affecting the way he fights and how far he's willing to go.”",
    },
    beats: [
      { name: "Acquisition", does: "How he gets it, version-locked to a point in his story, with the first manifestation going wrong or being bigger than expected.", at: [1] },
      { name: "Testing the rules", does: "He tests it like he tests anything — small, controlled. Establish what it does, what it costs, and its first limit.", at: [2] },
      { name: "What it can't do", does: "The part of the power that doesn't transfer (training, lineage, a spirit, a contract). This is what stops it being a straight upgrade.", at: [3] },
      { name: "The mentor or the voice", does: "Someone who understands the power (Aang, Kilowog, Thor, the symbiote itself) corrects how he uses it — usually by fixing his stance, not his strength.", at: [4] },
      { name: "The first canon fight it changes", does: "Replay a named canon fight (the Snake Baron, the Vulture, Toji at the Hidden Inventory) and show exactly where the power changes the outcome.", at: [4, 5] },
      { name: "The ripple", does: "Canon events downstream shift because that fight went differently — who survives, who never falls.", at: [5, 6] },
      { name: "Temptation", does: "The power keeps producing results when he's angry or reckless (the Beast, the biggest hammer, the Gauntlet for every problem). Show him leaning on it.", at: [6, 7] },
      { name: "Someone uses it against him", does: "An enemy or an institution targets the power itself — its weakness (sound for symbiotes, timeout for the Omnitrix) or its owner.", at: [7, 8] },
      { name: "The defining fight", does: "The big fight where he stops using the power as the answer and uses it as a tool inside his own style.", at: [8, 9] },
      { name: "Who he is after", does: "The power stays, but he decides its place in his life.", at: [9, 10] },
    ],
    outro: "The power made him stronger almost everywhere that matters in a fight; the harder part is what it does to his choices. End on the choice he keeps having to make.",
    rules: [
      "Say what the power can't copy — a straight upgrade is a boring script.",
      "Replay at least one named canon fight and change it precisely.",
      "The power must push on his existing flaw.",
      "The ending is a choice, not a stat.",
    ],
  },
  {
    id: "survive",
    name: "Survival test",
    titles: ["Could {hero} Survive {world}?", "Could {hero} Stop {world}?", "Could {hero} Escape {world}?"],
    match: /^could .+ (survive|stop|escape|build)|^how i'?d survive/i,
    pitch:
      "Put a strong character in a setting built to kill people like him. Concede his advantages up front; the script is the setting finding what his strengths don't solve.",
    intro: {
      open: "Concede the obvious: “The first zombie Tony sees in Raccoon City probably dies in seconds.”",
      build: "Then the problem: the specific way this setting gets around what he's good at (Cordyceps can still take hold; the Death Angels hunt sound; Death doesn't need to punch).",
      hook: "Reframe the question: “So the real question isn't whether Iron Man can kill zombies. It's whether Tony can…”",
    },
    beats: [
      { name: "Version lock and entry", does: "Which version (and why that one), what he has and doesn't (no Stark support, limited web fluid), and how he gets in.", at: [1] },
      { name: "The easy early phase", does: "The first threats go his way — show his advantages working, and quietly start the attrition (suit damage, supplies).", at: [2] },
      { name: "Learning the rules", does: "He figures out how the setting actually kills people, often before other survivors do, because of his particular senses or skills.", at: [3] },
      { name: "The threat ladder", does: "Climb the setting's threat tiers in order (Runners → Clickers → Bloaters; infected → Lickers → Hunters → Tyrant → Nemesis). Each tier tests a different strength.", at: [3, 4, 5] },
      { name: "Attrition", does: "What he can't replace — equipment, sleep, fluid, armour integrity — becomes the real enemy.", at: [5, 6] },
      { name: "The canon cast", does: "He meets the setting's protagonists at a named canon beat (Joel and Ellie, the Abbotts, Gerry) and changes that beat without replacing them.", at: [6, 7] },
      { name: "The moral choice", does: "The setting's defining dilemma (the Fireflies' surgery, the cure, saving one versus many) with his code deciding it.", at: [8, 9] },
      { name: "Endgame", does: "The last and hardest tier, or the escape, with the cost it takes.", at: [9, 10] },
    ],
    outro: "The verdict, qualified: “So could he survive? Probably — but not because…”. Name what made it hard and what his being there changed for others.",
    rules: [
      "Concede his strengths in the first 30 seconds; the tension is what they don't solve.",
      "Name the setting's threat tiers and climb them in order.",
      "Attrition, not a boss, is the real antagonist.",
      "Change one canon beat for the setting's own cast.",
      "End on a qualified verdict.",
    ],
  },
  {
    id: "hunt",
    name: "Detective duel",
    titles: ["Could {hero} Catch {target}?", "Could {hero} Outsmart {target}?"],
    match: /^could .+ (catch|outsmart|find|expose)/i,
    pitch:
      "One investigator, one hidden target. The script alternates their perspectives, and the key idea is always that identifying the target is not the same as proving it.",
    intro: {
      open: "Open on the target's hiding advantage: “Batman has spent years making sure Gotham can see him without ever seeing Bruce Wayne.”",
      build: "Then the investigator's method — what he studies instead of what everyone else chases.",
      hook: "End on the race: “the question would be whether L can build a case before Batman figures out exactly how he's doing it.”",
    },
    beats: [
      { name: "Rebuilding the case", does: "The investigator ignores the existing theory and rebuilds the record from zero (every attack on one timeline).", at: [1] },
      { name: "The first pattern", does: "A pattern nobody compared: vehicles, timing, access, money. It narrows the field.", at: [2] },
      { name: "The suspect pool", does: "The target lands on a list for a boring reason (fits the profile, unexplained gaps).", at: [3] },
      { name: "The target notices", does: "The target realizes someone is studying the pattern, and starts investigating back.", at: [4, 5] },
      { name: "The test", does: "The investigator builds a test only the real target would react to.", at: [5, 6] },
      { name: "The counter-move", does: "The target plants evidence or a fall guy (Doakes); the investigator asks who benefits from a suddenly perfect suspect.", at: [6, 7] },
      { name: "The mistake", does: "The target makes one mistake under pressure — the only kind of evidence that survives a courtroom.", at: [7, 8] },
      { name: "Proof versus certainty", does: "The investigator is certain before he can prove it. Show exactly what's still missing.", at: [8, 9] },
      { name: "Endgame", does: "The confrontation or the arrest attempt — on the investigator's ground, not the target's.", at: [9, 10] },
    ],
    outro: "Split the verdict: “L can solve Batman. Catching Bruce Wayne is the harder part.”",
    rules: [
      "Identifying is not proving — the whole script turns on that gap.",
      "Alternate perspectives: the target must investigate back.",
      "Use real canon facts and dates for the target's timeline.",
      "The split verdict at the end.",
    ],
  },
  {
    id: "versus",
    name: "Versus / ladder",
    titles: ["{hero} VS {target}", "{hero} VS {world} Isn't Even Close", "What If {world} Fought {hero}?"],
    match: /\bvs\.?\b|fought /i,
    pitch:
      "A matchup broken down by how abilities interact, not by stats. Either ability-by-ability against one opponent, or opponent-by-opponent up a ladder from weakest to strongest.",
    intro: {
      open: "State the lopsided read: “Gojo versus the Avengers sounds like a fight the Avengers should win on numbers alone.”",
      build: "Version-lock both sides explicitly (peak, which continuity, no temporary amps), then name the one interaction the stats don't explain.",
      hook: "“Once we work through those interactions, we'll see…” — promise the breakdown, not the winner.",
    },
    beats: [
      { name: "Stats concession", does: "Give the physically stronger side every category it wins — honestly.", at: [1] },
      { name: "The defensive core", does: "Explain the one ability the fight turns on (Infinity), by mechanics.", at: [2] },
      { name: "Ladder, weakest first", does: "Opponents (or abilities) in ascending order; group the ones with the same problem.", at: [1, 2, 3] },
      { name: "The first real problem", does: "The first opponent who has a genuine answer, and why it's only partial.", at: [4, 5, 6] },
      { name: "The hardest individual", does: "The one who can bypass the core (Wanda, Strange) — take it seriously.", at: [6, 7] },
      { name: "Combinations", does: "Pairs that cover each other's gaps are worse than the strongest single.", at: [8, 9] },
      { name: "Everyone at once", does: "The full team, and the order the stronger side removes them in.", at: [10] },
    ],
    outro: "A clear read with its win condition and the one unresolved interaction: “Gojo has a credible hax-based win condition, but…”",
    rules: [
      "Lock versions both sides in the intro.",
      "Stats aren't the argument; interactions are.",
      "Ladder ascending; combinations before the full team.",
      "Say plainly where canon doesn't settle it.",
    ],
  },
  {
    id: "reborn",
    name: "Reborn with memories",
    titles: ["What If {hero} Was Reborn With His Memories?", "What If {hero} Was Reborn As {target}?"],
    match: /reborn/i,
    pitch:
      "The character wakes up years earlier knowing everything. The drama is that every change he makes makes his memories less useful.",
    intro: {
      open: "Open on his last memory: “Peter's last memory is Titan.”",
      build: "He wakes years earlier; list what he remembers — and the people he remembers who don't exist yet.",
      hook: "End on the first person he has to convince, or the flaw that will make him change too much.",
    },
    beats: [
      { name: "Is this real", does: "The first hours: proving to himself it isn't a dream, checking the date, the body.", at: [1] },
      { name: "The first fix", does: "The earliest tragedy he can prevent, planned around what he couldn't do physically at that age.", at: [1, 2] },
      { name: "Convincing the skeptic", does: "Proof the key person can check (technology, a prediction that comes true).", at: [2] },
      { name: "Canon milestones, one by one", does: "Walk the canon events in order and change each — precisely, with what he actually knew versus what he never saw.", at: [3, 4, 5, 6] },
      { name: "The memories go stale", does: "The timeline has moved too far; his knowledge stops matching.", at: [6, 7] },
      { name: "The big event, changed", does: "The event that killed him the first time, played out with everything they prepared.", at: [8, 9, 10] },
    ],
    outro: "A safer world that isn't the one he lost — and learning to live without knowing what happens next.",
    rules: [
      "Only use what he actually witnessed; say where his memory has gaps.",
      "Every change costs predictive power — show it.",
      "The emotional anchor is someone who doesn't exist yet.",
    ],
  },
  {
    id: "divergence",
    name: "Alternate history",
    titles: ["What If {hero} Never {event}?", "What If {event} Failed?", "What If {hero} Killed {target}?"],
    match: /never|failed|killed|snapped the other|trapped .* forever|became a killer|opened|was never|didn'?t|what if the mcu/i,
    pitch:
      "Change one canon event and walk forward through everything that depended on it. The pleasure is precision: what still happens, what changes, what can no longer happen at all.",
    intro: {
      open: "Name the pivot and why it matters: “William Afton's springlock failure is the moment that turns him into Springtrap…”",
      build: "Change it in one sentence. Then list what disappears and what survives.",
      hook: "End on the question of whether the change helps the person who made it in the long run.",
    },
    beats: [
      { name: "The point of divergence", does: "The exact moment, with the canon details that lead up to it unchanged.", at: [1] },
      { name: "Immediate consequences", does: "Who gains control of what, who loses their role.", at: [2] },
      { name: "Canon events, walked in order", does: "For each later event: does it still happen, does it change, can it no longer happen? Say which and why.", at: [3, 4, 5, 6, 7] },
      { name: "The new threat", does: "What this timeline produces that canon didn't.", at: [7, 8] },
      { name: "The new ending", does: "How the story's final confrontation works now.", at: [9, 10] },
    ],
    outro: "Net effect in two lines: what the change bought and what it cost.",
    rules: [
      "Don't erase what doesn't depend on the change — say it still happens.",
      "Walk canon chronologically.",
      "Flag lore that isn't settled instead of picking silently.",
    ],
  },
  {
    id: "you",
    name: "Second person",
    titles: ["What If YOU {event}?"],
    match: /what if you\b|how i'?d/i,
    pitch: "The viewer is the protagonist — a normal person with one extraordinary thing. The arc is the moral slope of using it.",
    intro: {
      open: "A mundane moment: “You wake up in New York expecting another normal day.”",
      build: "The extraordinary thing arrives with a rule; you test it small.",
      hook: "End on the question the whole script answers: “How much are you willing to change?”",
    },
    beats: [
      { name: "The mundane entry", does: "How it lands in your life — specific and small.", at: [1] },
      { name: "First small use", does: "You test it on something you can verify.", at: [2] },
      { name: "Someone notices", does: "The world's investigator (L, Strange, Cecil, Vought) starts closing in.", at: [3, 4] },
      { name: "Bigger uses", does: "Each use is justified and each is bigger than the last.", at: [5, 6, 7] },
      { name: "The line", does: "The moment you almost cross the line the canon villain crossed.", at: [8, 9] },
      { name: "The choice", does: "Keep it or give it up.", at: [10] },
    ],
    outro: "“So if you had…” — the hardest part isn't the power, it's knowing when to stop.",
    rules: ["Grounded, sensory, present tense.", "Each escalation must feel justified.", "Canon characters react to you, you don't replace them."],
  },
  {
    id: "explainer",
    name: "Explainer / theory",
    titles: ["How Does {hero}'s {power} Actually Work?", "Why {hero} Needs {target} Alive", "If {hero} Was Charged For His Crimes"],
    match: /^how does|^why |charged for|actually work|could the death note/i,
    pitch: "A lecture with a spine: one misconception, then the mechanics in order, then the edge cases people argue about.",
    intro: {
      open: "The simple-looking version: “Gojo's Infinity looks simple from the outside.”",
      build: "The correction: “But Infinity isn't an invisible wall.”",
      hook: "“So to understand X, you first have to understand Y.”",
    },
    beats: [
      { name: "The base mechanic", does: "The rule everything else is built from.", at: [1] },
      { name: "Each application", does: "One part per application, in the order they build on each other.", at: [2, 3, 4, 5] },
      { name: "How it's beaten", does: "The canon counters, precisely.", at: [6, 7] },
      { name: "The questions people ask", does: "FAQ-style edge cases with short answers.", at: [8, 9, 10] },
    ],
    outro: "Restate the base mechanic as the key that makes the rest make sense.",
    rules: ["Cite canon precisely.", "Separate confirmed from theory."],
  },
  {
    id: "game",
    name: "Game mechanics",
    titles: ["What If {power} Cost {n} Elixir?", "What If Clash Royale Had {change}?"],
    match: /clash royale|elixir|mega knight|town hall/i,
    pitch: "One rules change, then the meta walking forward from the first hours to tournament play.",
    intro: {
      open: "Make the change concrete in the first line.",
      build: "“Nothing else changes.”",
      hook: "Promise the meta, not the joke.",
    },
    beats: [
      { name: "First hours", does: "Everyone adds it; chaos.", at: [1] },
      { name: "The mechanics", does: "What actually constrains it.", at: [2] },
      { name: "Counters", does: "Which cards rise.", at: [3] },
      { name: "Abuse", does: "The stupid interactions.", at: [4] },
      { name: "Ranked and pros", does: "Where it breaks.", at: [5, 6] },
      { name: "Supercell's response", does: "The patch.", at: [7, 8] },
    ],
    outro: "Could the game survive it? Technically — but would it still feel like the game?",
    rules: ["Numbers, not vibes.", "Counters and archetypes by name."],
  },
];

export function formatOfTitle(title: string): FormatId {
  const t = title.trim();
  // Order matters: the specific shapes before the general ones.
  if (FORMATS.find((f) => f.id === "game")!.match.test(t)) return "game";
  if (/^what if you\b|^how i'?d/i.test(t)) return "you";
  if (/reborn/i.test(t)) return "reborn";
  if (/\bvs\.?\b|fought /i.test(t)) return "versus";
  if (/^could .+ (catch|outsmart|find|expose)/i.test(t)) return "hunt";
  if (/^could the death note|^how does|^why |charged for/i.test(t)) return "explainer";
  if (/^could |^how i'?d survive/i.test(t)) return "survive";
  if (/\bnever\b|failed|killed|snapped the other|forever|became a killer|opened/i.test(t)) return "divergence";
  if (/(had|got|bonded with|scanned|worthy|trained by|became a green|became ghost|ate |was a (sith|viltrumite))/i.test(t)) return "power";
  return "insert";
}

export const FORMAT_BY_ID = new Map(FORMATS.map((f) => [f.id, f]));
