/**
 * The worlds, characters and powers Stories writes about — each described
 * the way the scripts actually use them: which institution reacts, which
 * insiders get met in which order, which canon moments a script hooks into,
 * and each character's ability ladder from the first thing he'd show to the
 * ultimate he'd end a fight on, with the limits the writers are careful to
 * respect.
 *
 * Built from the 94 scripts in corpus.json; worlds and characters the
 * channel hasn't covered yet are marked `fresh` and described from canon.
 */

export type Tag = "hax" | "brute" | "tech" | "detective" | "regen" | "street" | "cosmic" | "villain" | "moral" | "outsider";

export interface World {
  id: string;
  name: string;
  /** How the world shows up in a title: "The Boys", "Jujutsu Kaisen". */
  aliases: string[];
  kind: "universe" | "setting";
  /** What the world calls its powered people: "Supe", "sorcerer". */
  powered?: string;
  /** The one-line truth the hero reads fast (insertion intros). */
  truth: string;
  /** When in the timeline an outsider should land. */
  arrival: string;
  /** His first public moment here — the world sees his power without understanding it. */
  incident: string;
  /** For survival settings: what "surviving" actually means here. */
  goal?: string;
  institution: { name: string; cantClassify: string; approach: string };
  /** Canon moments a script can hook into, in story order. */
  anchors: string[];
  /** Insiders or threats, weakest first — met one by one. */
  ladder: Array<{ name: string; test: string }>;
  /** The underground side, if there is one. */
  faction?: { name: string; members: Array<{ name: string; role: string }> };
  apex: { name: string; firstClash: string; leverage: string; weakness: string };
  /** How the institution finally loses — the endgame the scripts use. */
  endgame: string;
  aftermath: string;
  /** For survival settings: what kills people here, and what runs out. */
  rules?: string;
  attrition?: string;
  /** The setting's own protagonists and the canon beat to change. */
  cast?: string;
  dilemma?: string;
  /** Which kinds of hero this world makes interesting. */
  wants: Tag[];
  fresh?: boolean;
}

export interface Hero {
  id: string;
  name: string;
  aliases: string[];
  from: string;
  /** The version the scripts lock to, and why. */
  version: string;
  /** From the first thing he'd show to the ultimate he ends on. */
  ladder: string[];
  /** What his strengths don't solve — the limits the writers respect. */
  limits: string[];
  /** His moral line, in his terms. */
  code: string;
  /** Why dropping him somewhere makes a story. */
  engine: string;
  /** As a target: why he's so hard to catch. */
  hides?: string;
  tags: Tag[];
  /** His own world, for stories that stay in it (divergence, reborn). */
  home?: string;
  /** Added from Story Lab's dice: a target only (never a lead), or a detective who hunts them. */
  role?: "target" | "detective";
  /** "she" for a heroine; he otherwise. */
  pronoun?: "she";
  fresh?: boolean;
}

export interface Power {
  id: string;
  name: string;
  aliases: string[];
  from: string;
  grants: string[];
  /** What it can't copy — the part that stops it being a straight upgrade. */
  cantCopy: string;
  /** The catch that pushes on the holder's flaw. */
  cost: string;
  /** Who understands it and can teach it. */
  mentor: string;
  weakness: string;
}

export const WORLDS: World[] = [
  {
    id: "boys",
    arrival: "during the mess after Translucent's death, while Vought insists The Seven is under control",
    incident: "a Vought hero chasing someone through a crowded street decides the people in the way don't matter, and {he} steps in",
    powered: "Supe",
    name: "The Boys",
    aliases: ["The Boys", "Vought"],
    kind: "universe",
    truth: "Vought's heroes aren't what they pretend to be — Supes are products, and the company buries whatever they break",
    institution: {
      name: "Vought",
      cantClassify: "they run {his} face through every database and take a biological sample during recruitment — and find no Compound V, the one thing their whole system is built on",
      approach: "the friendly approach first: money, a place in The Seven, a marketing identity; then testing; then a test that is really an ambush (a sniper round, a hidden explosive)",
    },
    anchors: [
      "the mess after Translucent's death (Season 1)",
      "Stormfront and the chase for Kenji (Season 2)",
      "Soldier Boy's return (Season 3)",
      "Sage, the election and the Singer plot (Season 4)",
      "the Sage Grove adult Compound V trials",
    ],
    ladder: [
      { name: "The Deep", test: "has almost nothing he can do in a direct fight" },
      { name: "A-Train", test: "speed — he can circle and rush from an angle, but still has to reach {him}" },
      { name: "Black Noir", test: "patient and disciplined — the operative Vought sends when it's serious" },
      { name: "Queen Maeve", test: "strength and durability, and already done with Vought" },
      { name: "Stormfront", test: "electricity and flight, and a past Vought is hiding" },
      { name: "Starlight", test: "the insider who stopped buying the image and tells {him} what Vought is" },
    ],
    faction: {
      name: "The Boys",
      members: [
        { name: "Butcher", role: "hates every Supe and wants a weapon against Homelander — he doesn't care who wins as long as someone is dead" },
        { name: "Hughie", role: "cautious; the conscience who actually talks to {him}" },
        { name: "Frenchie", role: "routes, chemistry, gets the doors open" },
        { name: "Mother's Milk", role: "keeps them moving and keeps the records" },
        { name: "Kimiko", role: "close-range protection" },
      ],
    },
    apex: {
      name: "Homelander",
      firstClash: "stays calm for a moment because he wants to see what he's dealing with, then tests {him} with heat vision and a punch — and neither lands the way it should",
      leverage: "stops trying to reach the hero and goes after the people near {him} — Hughie, Starlight, civilians",
      weakness: "concentrated force near the ear and head; his need to be seen makes him predictable; specific weapons can shut Compound V down",
    },
    endgame: "the truth about Compound V going public — records, Sage Grove, a live broadcast Vought can't cut fast enough",
    aftermath: "The Seven collapses, the executives who obeyed out of fear have nobody left to fear, and Butcher still treats every Supe as the next enemy",
    wants: ["outsider", "hax", "moral", "tech", "regen"],
  },
  {
    id: "mcu",
    arrival: "a few weeks before Loki arrives, while Fury is still pulling together people who barely work as a team",
    incident: "something falls out of the sky in New York, and {he}'s the one who catches it",
    powered: "enhanced individual",
    name: "The MCU",
    aliases: ["The Avengers", "Avengers", "MCU", "Infinity War", "Endgame", "Brand New Day", "Thanos"],
    kind: "universe",
    truth: "Earth is weeks away from an invasion nobody on it believes is coming",
    institution: {
      name: "S.H.I.E.L.D.",
      cantClassify: "there are no records, no power signature they've seen, nothing from any program — Fury wants eyes on {him} before anyone decides what {he} is",
      approach: "observation first, then an offer to help with the crisis in front of them — never the title “Avenger” until {he} earns it during it",
    },
    anchors: [
      "Loki, the Tesseract and the Battle of New York (2012)",
      "HYDRA inside S.H.I.E.L.D. (The Winter Soldier)",
      "Ultron and Sokovia",
      "the Sokovia Accords and the airport fight (Civil War)",
      "the Vulture and the Chitauri weapons (Homecoming)",
      "Ebony Maw and Cull Obsidian in New York, then Titan and Wakanda (Infinity War)",
      "the Snap and the five years",
      "the final battle (Endgame)",
      "the No Way Home spell — everyone forgets Peter Parker",
    ],
    ladder: [
      { name: "Hawkeye, Black Widow, Falcon, Winter Soldier", test: "weapons and skill — everything has to physically reach {him}" },
      { name: "Black Panther, War Machine, Ant-Man, Iron Man", test: "better tech, better defences, attacks from range" },
      { name: "Hulk", test: "strength becomes ridiculous — and still has to connect" },
      { name: "Thor", test: "lightning, flight and some of the best durability on the team" },
      { name: "Captain Marvel", test: "the strongest pure physical matchup" },
      { name: "Doctor Strange", test: "portals, the Mirror Dimension, bindings — problems that aren't raw force" },
      { name: "Scarlet Witch", test: "telekinesis and reality effects that may act on {him} directly — the most likely bypass" },
    ],
    faction: {
      name: "The Avengers",
      members: [
        { name: "Steve", role: "distrusts {him} first, then leads {him}" },
        { name: "Tony", role: "wants to scan {him} and understand the rule behind {his} power" },
        { name: "Peter", role: "the one {his} age" },
        { name: "Fury", role: "keeps {him} close because it's safer than letting {him} loose" },
      ],
    },
    apex: {
      name: "Thanos",
      firstClash: "sends the Black Order first and only comes himself once he holds several Stones — every Stone changes the fight",
      leverage: "goes after the Stones on Earth — Vision's Mind Stone, Strange's Time Stone — and whoever is guarding them",
      weakness: "Mantis almost held him on Titan; the Gauntlet can be pulled off; destroying the Stones cost him his body",
    },
    endgame: "stopping the Snap, or undoing it sooner, with everything the hero changed on the way",
    aftermath: "a team that stayed together, and a threat the universe now knows about",
    wants: ["cosmic", "hax", "brute", "outsider", "moral"],
  },
  {
    id: "jjk",
    arrival: "right before Megumi is sent to Sugisawa High for Sukuna's finger",
    incident: "a curse most people can't even see goes for a student, and {he} stops it",
    powered: "sorcerer",
    name: "Jujutsu Kaisen",
    aliases: ["Jujutsu Kaisen", "JJK", "Jujutsu High", "Shibuya", "Culling Game", "Prison Realm"],
    kind: "universe",
    truth: "curses are everywhere, almost nobody can see them, and sorcerers treat every ability like an absolute rule",
    institution: {
      name: "Jujutsu High and the higher-ups",
      cantClassify: "Gojo's Six Eyes read {him} instantly — and {he} doesn't look like a sorcerer; the higher-ups want anything they can't classify controlled or executed",
      approach: "Gojo keeps {him} close at Jujutsu High because that's safer than letting the higher-ups find {him} through reports",
    },
    anchors: [
      "Sukuna's finger at Sugisawa High",
      "the juvenile detention center (Yuji's first death)",
      "Junpei and Mahito",
      "the Hidden Inventory — Riko, Toji and Geto (Gojo's past)",
      "Shibuya — the Prison Realm seals Gojo",
      "the Culling Game",
      "Sukuna takes Megumi's body",
      "Gojo vs Sukuna",
      "Shinjuku — the final fight",
      "the Modulo era (2086)",
    ],
    ladder: [
      { name: "grade 1 and special grade curses", test: "{his} senses have to catch things most people can't see" },
      { name: "Mahito", test: "attacks the soul — and can't touch what he can't perceive" },
      { name: "Toji", test: "no cursed energy at all — invisible to the usual reads" },
      { name: "Kenjaku", test: "plans years ahead around removing whoever's strongest" },
      { name: "Sukuna", test: "Dismantle, Cleave, Malevolent Shrine — the top of the world" },
    ],
    faction: {
      name: "Jujutsu High",
      members: [
        { name: "Yuji", role: "carries Sukuna and won't let anyone use him as ammo" },
        { name: "Megumi", role: "the one who brings the hero in" },
        { name: "Gojo", role: "the strongest; finds the hero interesting" },
        { name: "Nanami", role: "the adult who treats it like work" },
      ],
    },
    apex: {
      name: "Sukuna",
      firstClash: "is curious before he's hostile — a new kind of power is entertainment",
      leverage: "uses Yuji's body against the people Yuji cares about, then takes Megumi's",
      weakness: "Yuji's attacks on the soul boundary; Higuruma's executioner's sword; attrition from Gojo first",
    },
    endgame: "Shibuya never becoming the massacre Kenjaku planned, or Sukuna reaching the final fight in a different state",
    aftermath: "who survives that canon killed — Gojo, Nanami, Nobara, Megumi",
    wants: ["hax", "outsider", "moral", "brute"],
  },
  {
    id: "invincible",
    arrival: "before Omni-Man kills the Guardians of the Globe",
    incident: "an attack on the city gets handled before the Guardians arrive, by someone Cecil has no file on",
    powered: "hero",
    name: "Invincible",
    aliases: ["Invincible", "Viltrumite Invasion"],
    kind: "universe",
    truth: "Earth's strongest hero is secretly softening it up for an empire",
    institution: {
      name: "the GDA",
      cantClassify: "Cecil sees another enormous variable and wants {him} understood — and filed — before the public decides what {he} is",
      approach: "Cecil watches first, then offers resources in exchange for access to what {he} can do",
    },
    anchors: [
      "the Guardians of the Globe massacre",
      "Nolan's reveal and the fight over Chicago",
      "Battle Beast",
      "Angstrom Levy",
      "Allen and the Coalition of Planets",
      "Thraxa",
      "Conquest",
      "the Viltrumite War and Thragg",
    ],
    ladder: [
      { name: "the Teen Team", test: "Robot plans, Rex Splode explodes things, Dupli-Kate multiplies — and Atom Eve rearranges matter" },
      { name: "the Guardians of the Globe", test: "Red Rush can interfere, War Woman and Immortal can actually hurt" },
      { name: "Allen the Alien", test: "the Coalition's champion, sent to test Earth's strongest" },
      { name: "Battle Beast", test: "wants a worthy fight and nothing else" },
      { name: "Atom Eve", test: "the insider who tells {him} what the GDA isn't saying" },
    ],
    faction: {
      name: "Earth's defenders",
      members: [
        { name: "Mark", role: "the son still deciding what kind of hero he is" },
        { name: "Debbie", role: "knows Nolan better than any agency" },
        { name: "Cecil", role: "will do anything to protect Earth, including to his allies" },
        { name: "Allen", role: "the Coalition's link to the war" },
      ],
    },
    apex: {
      name: "Omni-Man",
      firstClash: "plays along while he measures the newcomer — he isn't used to being anything but the strongest alien in the room",
      leverage: "makes it about Mark and Debbie, and moves on the Guardians before anyone can warn them",
      weakness: "a specific sonic frequency disrupts Viltrumite equilibrium; the Scourge Virus left the Empire with fewer than fifty",
    },
    endgame: "Earth becoming too costly for the Empire to take quietly",
    aftermath: "a planet the Empire now treats as a serious problem",
    wants: ["tech", "hax", "moral", "brute"],
  },
  {
    id: "fnaf",
    arrival: "the week {he} takes the night shift at Freddy Fazbear's Pizza",
    incident: "an animatronic reaches the office on the first night and does damage that would kill a normal guard",
    powered: "night guard",
    name: "FNAF",
    aliases: ["FNAF", "Freddy", "Fazbear", "Henry Emily"],
    kind: "universe",
    truth: "the animatronics are carrying what's left of murdered children, and the man who killed them is still close",
    institution: {
      name: "Fazbear Entertainment",
      cantClassify: "a night guard who keeps surviving is a problem nobody at the company has a procedure for",
      approach: "the job pays badly and the man explaining the night shift is leaving half the story out",
    },
    anchors: [
      "Fredbear's Family Diner — William and Henry",
      "Charlie's murder and the Puppet",
      "the Missing Children Incident",
      "the Bite of '83",
      "Circus Baby and Elizabeth (Sister Location)",
      "the springlock failure that makes Springtrap",
      "Fazbear's Fright",
      "Henry's FNAF 6 fire trap",
      "the Pizzaplex (Security Breach)",
    ],
    ladder: [
      { name: "Bonnie and Chica", test: "the first nights — attacks that end the game for a normal guard" },
      { name: "Foxy", test: "doesn't move through the building like the others" },
      { name: "Freddy", test: "patient, harder to read" },
      { name: "the Puppet", test: "the first possession" },
      { name: "Springtrap", test: "William himself" },
    ],
    faction: {
      name: "the people hunting Afton",
      members: [
        { name: "Henry Emily", role: "understands the machines better than anyone" },
        { name: "Michael Afton", role: "spends years cleaning up after his father" },
        { name: "Charlotte", role: "the daughter who gets close to the truth" },
      ],
    },
    apex: {
      name: "William Afton",
      firstClash: "treats {him} like a normal guard he can scare off, blame or kill — and none of those work",
      leverage: "uses the building itself — every hidden room, every camera gap, how each animatronic behaves",
      weakness: "the springlocks, and the children's spirits recognise him",
    },
    endgame: "William trapped with the evidence in front of a witness",
    aftermath: "the children's spirits, and what freeing them would take",
    wants: ["regen", "detective"],
  },
  {
    id: "csm",
    arrival: "early in Public Safety, when Denji has only just started working with Aki and Power",
    incident: "a devil attack that should need several hunters ends before the hunters get there",
    powered: "devil hunter",
    name: "Chainsaw Man",
    aliases: ["Chainsaw Man", "Devil Hunter", "Public Safety", "Makima"],
    kind: "universe",
    truth: "devils are built from fear, and the organization that hunts them is run by someone nobody questions",
    institution: {
      name: "Public Safety",
      cantClassify: "no devil contract, no fiend, no hybrid — there is no file {he} fits",
      approach: "they put {him} to work because {he}'s useful, and put {him} under someone who reports everything",
    },
    anchors: ["Denji joins Aki and Power", "the Katana Man attack", "Reze", "the international assassins and Santa Claus", "the Gun devil and Aki", "Makima's reveal"],
    ladder: [
      { name: "small devils", test: "normally need several hunters" },
      { name: "Katana Man", test: "the first attack on Public Safety itself" },
      { name: "Reze", test: "the one who gets close to Denji" },
      { name: "the Gun devil", test: "the disaster everyone fears" },
      { name: "Makima", test: "the Control devil" },
    ],
    faction: {
      name: "Division 4",
      members: [
        { name: "Denji", role: "wants a normal life and trusts Makima" },
        { name: "Aki", role: "the one who reports on {him} — and clashes with {him}" },
        { name: "Power", role: "chaos {he} ends up protecting" },
      ],
    },
    apex: {
      name: "Makima",
      firstClash: "never fights {him} first — she studies what {he} changes around Denji",
      leverage: "moves Aki and Power into the places she needs them — the people she uses to break Denji",
      weakness: "her contract means force alone doesn't end her; only Denji's own way does",
    },
    endgame: "exposing Makima before she finishes breaking Denji",
    aftermath: "Power and Aki alive, and something closer to a family",
    wants: ["hax", "moral", "outsider"],
  },
  {
    id: "deathnote",
    arrival: "as the first heart attacks start and L makes his broadcast",
    incident: "{he} notices the pattern in the deaths before the task force does",
    powered: "suspect",
    name: "Death Note",
    aliases: ["Death Note"],
    kind: "universe",
    truth: "a name and a face are all the killer needs",
    institution: {
      name: "the Kira task force",
      cantClassify: "deaths with no weapon, no contact and no pattern except who the victims are",
      approach: "L works through intermediaries and never shows his face",
    },
    anchors: ["the first heart attacks and L's broadcast", "Raye Penber and the FBI deaths", "Misa and the second Kira", "Light's confinement", "Yotsuba", "L's death", "Near and Mello"],
    ladder: [
      { name: "the task force", test: "police procedure" },
      { name: "L", test: "tests built around one suspect" },
      { name: "Misa", test: "Shinigami eyes — she only needs {his} face" },
      { name: "Light", test: "patience" },
    ],
    apex: {
      name: "Light Yagami",
      firstClash: "never fights — he waits for the one moment a face and a real name come together",
      leverage: "goes after anyone who knows the name",
      weakness: "his pride and his need to stay ahead of L",
    },
    endgame: "whoever learns the other's secret first",
    aftermath: "who holds the notebook afterwards",
    rules: "name + face; a heart attack after 40 seconds if no cause is written; causes must be physically possible; ownership changes hands",
    wants: ["detective", "regen", "tech"],
  },
  {
    id: "starwars",
    arrival: "the year Qui-Gon finds Anakin on Tatooine",
    incident: "something happens that the Force doesn't explain",
    powered: "Force user",
    name: "Star Wars",
    aliases: ["Star Wars", "Mustafar", "Palpatine"],
    kind: "universe",
    truth: "the Jedi are guarding a galaxy whose Chancellor is the Sith they're looking for",
    institution: {
      name: "the Jedi Council",
      cantClassify: "a power the Force doesn't explain — they can't treat {him} like any other Jedi",
      approach: "train {him}, watch {him}, hold {him} back",
    },
    anchors: ["Tatooine", "Attack of the Clones — Zam Wesell and Dooku", "the Clone Wars", "Order 66", "Mustafar", "the Rebellion and Luke"],
    ladder: [
      { name: "battle droids and clones", test: "armies" },
      { name: "Dooku", test: "skill over strength" },
      { name: "Obi-Wan", test: "discipline" },
      { name: "Darth Sidious", test: "manipulation and lightning" },
    ],
    apex: {
      name: "Palpatine",
      firstClash: "doesn't fight — he offers",
      leverage: "works on the one person the hero is afraid of losing",
      weakness: "every apprentice eventually turns",
    },
    endgame: "Mustafar played differently",
    aftermath: "whether the fall still happens",
    wants: ["brute", "cosmic", "villain", "hax"],
  },
  // ── survival settings ──
  {
    id: "tlou",
    goal: "get Ellie to the Fireflies without losing {himself} on the way",
    arrival: "twenty years after the outbreak, outside a quarantine zone",
    incident: "a group of survivors watches {him} deal with a Runner they were sure would kill {him}",
    name: "The Last of Us",
    aliases: ["The Last Of Us", "Last of Us", "TLOU"],
    kind: "setting",
    truth: "a bite or a lungful of spores and Cordyceps starts working toward the brain",
    institution: { name: "FEDRA and the Fireflies", cantClassify: "someone who doesn't move like anyone they've seen", approach: "suspicion first — strangers are how people die here" },
    anchors: ["the first quarantine zone", "the University of Eastern Colorado", "Salt Lake City and the Firefly hospital"],
    ladder: [
      { name: "Runners", test: "the easiest — almost no chance of catching {him}" },
      { name: "Stalkers", test: "ambushes in the dark" },
      { name: "Clickers", test: "echolocation and a bite that armour won't always stop" },
      { name: "Bloaters", test: "armoured and throwing spores" },
      { name: "hunters and raiders", test: "humans use distance, bait and traps" },
    ],
    apex: {
      name: "the Fireflies",
      firstClash: "they talk about a cure; {he} asks what they intend to do to Ellie",
      leverage: "Ellie, unconscious on a table",
      weakness: "they need her alive until the surgery",
    },
    rules: "a bite or spores infects; infection reaches the brain; masks matter in the game continuity",
    attrition: "ammo, masks, food, and whatever {his} powers run on (web fluid, suit repairs)",
    cast: "Joel and Ellie, met on their way west after Joel's already protective of her",
    dilemma: "the Firefly hospital — a possible cure against Ellie's life, decided without her",
    endgame: "the hospital, and what Ellie is told afterwards",
    aftermath: "Ellie gets to make the choice herself",
    wants: ["regen", "street", "moral"],
  },
  {
    id: "re",
    goal: "get out of Raccoon City with Umbrella's research before the city is destroyed",
    arrival: "the night Raccoon City falls",
    incident: "the first infected {he} meets dies in seconds",
    name: "Resident Evil",
    aliases: ["Resident Evil", "Raccoon City", "Umbrella"],
    kind: "setting",
    truth: "the outbreak isn't an accident — Umbrella built what's walking the streets",
    institution: { name: "Umbrella", cantClassify: "a target their B.O.W.s weren't designed for", approach: "sends its weapons, not its people" },
    anchors: ["the Raccoon Police Department", "the first Umbrella underground site", "the Tyrant", "Nemesis", "the city's destruction"],
    ladder: [
      { name: "the infected", test: "die in seconds — until there are hundreds" },
      { name: "Lickers", test: "fast, on the ceilings, claws that tear through people" },
      { name: "Hunters", test: "built as weapons, aggressive in confined spaces" },
      { name: "the Tyrant", test: "keeps getting back up" },
      { name: "Nemesis", test: "tracks targets, uses weapons, adapts" },
    ],
    apex: { name: "Nemesis", firstClash: "it doesn't stand and take hits — it tracks and returns", leverage: "survivors {he} refuses to leave", weakness: "Umbrella's own research on it" },
    rules: "contaminated blood and bites spread the T-virus; damaged seals are the danger, not claws on intact armour",
    attrition: "suit integrity and contamination",
    cast: "the RPD survivors",
    dilemma: "clearing the streets versus getting people out",
    endgame: "out of Raccoon City before it's destroyed, with the research",
    aftermath: "proof of what Umbrella made",
    wants: ["tech", "brute", "regen"],
  },
  {
    id: "quietplace",
    goal: "build a life where one sound doesn't end it",
    arrival: "in the first days, on an abandoned street",
    incident: "a small noise carries and something answers almost immediately",
    name: "A Quiet Place",
    aliases: ["A Quiet Place", "Quiet Place"],
    kind: "setting",
    truth: "any sound louder than the world around it brings something that crosses the distance before you get a second chance",
    institution: { name: "the survivors", cantClassify: "someone who hears the creatures before anyone else can", approach: "silence and routes planned around sound" },
    anchors: ["the first abandoned streets", "the survivor groups", "the Abbotts' farm", "Regan's hearing aid"],
    ladder: [
      { name: "a single Death Angel", test: "extreme hearing — {his} own quiet isn't quiet enough" },
      { name: "a creature searching versus one locked on", test: "the sounds that tell them apart" },
      { name: "several at once", test: "one noise, many answers" },
    ],
    apex: { name: "the Death Angels", firstClash: "a small noise carries and something answers", leverage: "the people with {him}", weakness: "high-frequency feedback opens the head armour" },
    rules: "they hunt by sound; armour everywhere but the exposed tissue",
    attrition: "sleep, and senses burning out",
    cast: "the Abbotts",
    dilemma: "Lee's death — and whether the hero can change it",
    endgame: "building a routine around the weakness",
    aftermath: "one of the best scouts a survivor group could have",
    wants: ["street", "detective"],
  },
  {
    id: "silenthill",
    goal: "find a way out before the town finishes with {him}",
    arrival: "on the road into town, in the fog",
    incident: "the town lets {him} believe it can be understood",
    name: "Silent Hill",
    aliases: ["Silent Hill"],
    kind: "setting",
    truth: "the town shapes itself around what its visitors carry",
    institution: { name: "the town itself", cantClassify: "a visitor who treats it like a crime scene", approach: "consistency at first, then it turns {his} own past on {him}" },
    anchors: ["the first empty streets", "the apartment building", "the hospital", "the version of home without {him}", "the loop road"],
    ladder: [
      { name: "the creatures", test: "don't match anything {he} can identify" },
      { name: "memories", test: "places that resemble where {he} failed" },
      { name: "the people {he} lost", test: "voices {he} can't reach at the same time" },
      { name: "the identity {he} built", test: "the question of why {he} does it at all" },
    ],
    apex: { name: "Silent Hill", firstClash: "the fog and the roads that don't lead where they should", leverage: "{his} guilt", weakness: "acceptance" },
    rules: "the environment stops obeying normal rules; gadgets fail",
    attrition: "gadgets, maps, certainty",
    dilemma: "whether {he} protects people out of mission or out of guilt",
    endgame: "the exit appears only once {he} stops fighting the town on its terms",
    aftermath: "physically survivable; mentally, something changes",
    wants: ["detective", "tech", "moral"],
  },
  {
    id: "purge",
    goal: "get the records out before the sirens",
    arrival: "a few hours before the sirens",
    incident: "the emergency broadcast lays out the rules",
    name: "The Purge",
    aliases: ["The Purge", "Purge"],
    kind: "setting",
    truth: "for twelve hours nobody can rely on police or paramedics — and some of the violence isn't random",
    institution: { name: "the NFFA", cantClassify: "someone operating outside the rules of the night", approach: "adjust the plan around {him} once {he}'s on their radar" },
    anchors: ["the hours before the sirens", "the opening of the night", "the organised units", "the command site", "the final stretch", "the sirens"],
    ladder: [
      { name: "ordinary purgers", test: "the easiest part of the night" },
      { name: "organised squads", test: "government-funded, targeting the poor" },
      { name: "the command structure", test: "security that knows someone is interfering" },
    ],
    apex: { name: "the NFFA", firstClash: "units start disappearing from their plan", leverage: "the people {he}'s protecting", weakness: "the records that prove what they did" },
    attrition: "time — the clock runs out",
    dilemma: "saving people tonight versus exposing the system",
    endgame: "the records out before the sirens",
    aftermath: "a bigger problem than one vigilante",
    wants: ["detective", "street", "tech"],
  },
  {
    id: "military",
    goal: "stay free for as long as the hunt keeps adapting",
    arrival: "the day the order comes down",
    incident: "the first team sent after {him} learns how little their weapons do",
    name: "The US Military",
    aliases: ["The US Military", "US Military"],
    kind: "setting",
    truth: "destroying one base barely slows down the rest of it",
    institution: { name: "the United States government", cantClassify: "a target whose abilities are known and whose identity isn't", approach: "every escape feeds the map" },
    anchors: ["the first engagement", "cameras, drones and analysts", "the identity hunt", "the nationwide search", "the endgame zone"],
    ladder: [
      { name: "ground teams", test: "easy to escape" },
      { name: "cameras, drones and analysts", test: "every escape is data" },
      { name: "aircraft and sensors", test: "geometry, not dogfights" },
      { name: "heavy bombs", test: "force and heat" },
      { name: "nuclear weapons", test: "the top end canon never tested" },
    ],
    apex: { name: "the system", firstClash: "a disaster for everyone near {him}", leverage: "{his} habits — where {he} goes, whom {he} helps", weakness: "{he} can't stop being {himself}" },
    attrition: "equipment, sleep, safe places",
    dilemma: "the one habit {he} won't give up (helping people)",
    endgame: "containment built around {his} habits",
    aftermath: "a qualified verdict",
    wants: ["brute", "street", "villain"],
  },
  {
    id: "finaldest",
    goal: "break Death's order before {his} turn comes back around",
    arrival: "at the moment of the premonition",
    incident: "{he} gets {himself} and a few others out before the disaster",
    name: "Final Destination",
    aliases: ["Final Destination"],
    kind: "setting",
    truth: "Death doesn't need to punch — it only has to get the order right",
    institution: { name: "Death's design", cantClassify: "a survivor it can't kill with the usual chain of bad luck", approach: "bigger accidents built around {his} real weakness" },
    anchors: ["the premonition", "the first survivor's death", "the order", "{his} turn"],
    ladder: [
      { name: "ordinary accidents", test: "can't touch {him}" },
      { name: "industrial accidents", test: "still not enough" },
      { name: "accidents built on {his} weakness", test: "the one thing that can" },
    ],
    apex: { name: "Death", firstClash: "the survivors start dying in order", leverage: "the people {he} saved", weakness: "interrupting it only moves it down the list" },
    attrition: "the survivors' nerves",
    dilemma: "protecting the next person leaves everyone else exposed",
    endgame: "{his} turn, again",
    aftermath: "{he} only has to be in the wrong place once",
    wants: ["brute", "regen"],
  },
  {
    id: "wwz",
    goal: "get to Cardiff with the people {he} refused to leave",
    arrival: "less than an hour before Philadelphia falls",
    incident: "someone gets bitten and turns in front of {him}",
    name: "World War Z",
    aliases: ["World War Z"],
    kind: "setting",
    truth: "the infection spreads fast enough that cities collapse before anyone understands it",
    institution: { name: "the governments still standing", cantClassify: "someone who can move where armies can't", approach: "use {him} for jobs that need whole teams" },
    anchors: ["Philadelphia", "Jerusalem's wall", "the plane", "the WHO facility in Cardiff", "the camouflage"],
    ladder: [
      { name: "a swarm", test: "turn in seconds" },
      { name: "a city", test: "the numbers" },
      { name: "Jerusalem", test: "the wall that falls" },
    ],
    apex: { name: "the swarm", firstClash: "someone gets bitten and turns immediately", leverage: "civilians {he} goes back for", weakness: "they ignore the terminally ill" },
    attrition: "web fluid and rest",
    cast: "Gerry, Segen and the WHO team",
    dilemma: "going back for one more family",
    endgame: "the camouflage theory tested sooner",
    aftermath: "more people alive because {he} was there",
    wants: ["street", "moral"],
  },
  {
    id: "saw",
    goal: "solve what the machine requires, not what the game wants",
    arrival: "when the first game is discovered",
    incident: "a victim file lands on the investigation",
    name: "Saw",
    aliases: ["Jigsaw", "Saw"],
    kind: "setting",
    truth: "every trap is built from the victim's own life",
    institution: { name: "the police", cantClassify: "a killer who's never at the scene", approach: "react after each game" },
    anchors: ["the victim files", "Lawrence Gordon", "Jill's clinic", "Amanda", "the tape"],
    ladder: [
      { name: "the games", test: "rules and a choice" },
      { name: "a game built for {him}", test: "designed around how {he} thinks" },
    ],
    apex: { name: "John Kramer", firstClash: "he studies the investigator back", leverage: "the leak in the investigation", weakness: "his games have real solutions" },
    attrition: "time on the clock",
    dilemma: "solving the puzzle John wants solved versus what the machine requires",
    endgame: "the investigator chooses the location this time",
    aftermath: "John doesn't stay free for long",
    wants: ["detective"],
  },
  // ── worlds the channel hasn't covered yet ──
  {
    id: "aot",
    arrival: "the day Wall Maria falls",
    incident: "a Titan reaches for someone and doesn't get them",
    powered: "soldier",
    name: "Attack on Titan",
    aliases: ["Attack On Titan", "AOT", "Titans"],
    kind: "universe",
    truth: "humanity lives behind walls, and the walls are the lie",
    institution: { name: "the Survey Corps and the Military Police", cantClassify: "a human the Titans don't treat as food — or can't reach", approach: "Erwin wants to use {him}; the Military Police want {him} in a cell" },
    anchors: ["the fall of Wall Maria", "Trost", "the Female Titan", "the Armored and Colossal reveal", "Shiganshina", "Marley", "the Rumbling"],
    ladder: [
      { name: "pure Titans", test: "nape only" },
      { name: "the Female Titan", test: "hardening and intelligence" },
      { name: "the Armored Titan", test: "armour" },
      { name: "the Colossal Titan", test: "heat and scale" },
      { name: "the Beast Titan", test: "thrown rock at range" },
    ],
    apex: { name: "Eren", firstClash: "an ally first", leverage: "Mikasa and Armin", weakness: "the nape, and the people he loves" },
    endgame: "the Rumbling stopped or never started",
    aftermath: "what the walls meant",
    wants: ["brute", "hax", "moral", "tech"],
    fresh: true,
  },
  {
    id: "demonslayer",
    arrival: "the night Tanjiro's family is killed",
    incident: "a demon regenerates from a wound that should have killed it — and then doesn't",
    powered: "demon slayer",
    name: "Demon Slayer",
    aliases: ["Demon Slayer", "Hashira", "Muzan"],
    kind: "universe",
    truth: "demons die to sunlight and Nichirin blades, and every one of them traces back to one man",
    institution: { name: "the Demon Slayer Corps", cantClassify: "no breathing style, no Nichirin blade — and {he} still kills demons", approach: "the Hashira want to test {him}; Oyakata-sama wants to understand {him}" },
    anchors: ["Tanjiro and Nezuko", "Mount Natagumo", "the Mugen Train (Rengoku)", "the Entertainment District", "the Swordsmith Village", "the Infinity Castle"],
    ladder: [
      { name: "lower demons", test: "regeneration" },
      { name: "the Lower Moons", test: "blood demon arts" },
      { name: "Akaza (Upper Three)", test: "combat instinct and regeneration" },
      { name: "Kokushibo (Upper One)", test: "moon breathing" },
      { name: "Muzan", test: "the source" },
    ],
    apex: { name: "Muzan", firstClash: "he hides among humans and sends the Moons", leverage: "the people he can turn", weakness: "sunlight" },
    endgame: "dawn",
    aftermath: "who survives the Infinity Castle",
    wants: ["brute", "hax", "moral"],
    fresh: true,
  },
  {
    id: "squidgame",
    goal: "reach the end without becoming what the VIPs want to watch",
    arrival: "in the van to the island",
    incident: "Red Light, Green Light starts, and {he} realises what the rules mean",
    name: "Squid Game",
    aliases: ["Squid Game"],
    kind: "setting",
    truth: "456 players, six games, and the rules are the only thing keeping anyone alive",
    institution: { name: "the Front Man's organization", cantClassify: "a player whose body the games weren't designed for", approach: "the VIPs want to bet on {him}" },
    anchors: ["Red Light, Green Light", "Honeycomb", "Tug of War", "Marbles", "the Glass Bridge", "the final game"],
    ladder: [
      { name: "Red Light, Green Light", test: "stillness" },
      { name: "Tug of War", test: "the team" },
      { name: "Marbles", test: "a partner" },
      { name: "the Glass Bridge", test: "chance" },
    ],
    apex: { name: "the Front Man", firstClash: "rules change around {him}", leverage: "the other players", weakness: "the VIPs' island" },
    rules: "break a rule and you're eliminated",
    attrition: "trust and sleep",
    dilemma: "winning versus saving the others",
    endgame: "the island",
    aftermath: "whether it ends or just moves",
    wants: ["street", "detective", "moral"],
    fresh: true,
  },
];

export const HEROES: Hero[] = [
  {
    id: "gojo",
    home: "jjk",
    name: "Gojo",
    aliases: ["Gojo", "Satoru Gojo"],
    from: "Jujutsu Kaisen",
    version: "Gojo at his peak during the Sukuna fight — Infinity running automatically, Reverse Cursed Technique keeping his brain refreshed",
    ladder: ["Infinity (automatic)", "the Six Eyes", "Blue", "Red", "Hollow Purple", "Reverse Cursed Technique", "Unlimited Void"],
    limits: [
      "Infinity filters threats by speed, mass, shape and cursed energy — sound and harmless air get through, so poisons and sonic attacks are fair tests",
      "attacks that cut the space itself, or cancel techniques (the Inverted Spear of Heaven), get through",
      "the Six Eyes doesn't hack computers or see every distant camera",
      "he lowers Infinity around people he trusts",
    ],
    code: "judges people by what they do, jokes through authority, and kills when he thinks it's necessary",
    engine: "attacks stop before they reach him and nobody in the world can explain why",
    tags: ["hax", "outsider"],
  },
  {
    id: "sukuna",
    home: "jjk",
    name: "Sukuna",
    aliases: ["Sukuna"],
    from: "Jujutsu Kaisen",
    version: "Sukuna fully incarnated in his Heian-era body — Shrine, Reverse Cursed Technique, Malevolent Shrine and Divine Flame, none of the Ten Shadows",
    ladder: ["Dismantle", "Cleave", "Reverse Cursed Technique", "Divine Flame", "Malevolent Shrine"],
    limits: ["no interest in being anyone's ally", "Ten Shadows and Mahoraga only while he's in Megumi's body"],
    code: "does whatever interests him; strong opponents are entertainment",
    engine: "the ally who might be worse than the invasion",
    tags: ["hax", "villain", "brute"],
  },
  {
    id: "yuji",
    home: "jjk",
    name: "Yuji",
    aliases: ["Yuji", "Itadori", "Modulo Yuji"],
    from: "Jujutsu Kaisen",
    version: "post-Shibuya Yuji — Sukuna still inside him, several Black Flashes landed, body reinforcement far past where he started",
    ladder: ["cursed-energy reinforcement", "Divergent Fist", "Black Flash", "strikes on the soul boundary"],
    limits: ["Sukuna can take over — every fight carries that risk", "no domain until the very end of the manga"],
    code: "won't let anyone use Sukuna, and won't let people treat him as ammo",
    engine: "the kid carrying a mass murderer inside him",
    tags: ["brute", "moral", "outsider"],
  },
  {
    id: "spiderman",
    home: "mcu",
    name: "Spider-Man",
    aliases: ["Spider-Man", "Spider Man", "Peter Parker", "Spidey"],
    from: "the MCU",
    version: "MCU Peter after No Way Home — homemade suit, limited web fluid, no Stark support, and nobody left who remembers him",
    ladder: ["Spider-Sense", "webs", "strength and agility", "intelligence and improvised tech"],
    limits: ["he runs out of web fluid", "he can't stop helping whoever is in front of him — it's his most predictable habit", "no durability against top-tier threats"],
    code: "saves whoever is in front of him, even when it costs him",
    engine: "the most alone Spider-Man has ever been",
    tags: ["street", "moral", "tech"],
  },
  {
    id: "ben10",
    name: "Ben 10",
    aliases: ["Ben 10", "Ben Ten", "Ben Tennyson"],
    from: "Ben 10",
    version: "16-year-old Omniverse Ben — years with the Omnitrix, suspicious of anyone who wants to study it",
    ladder: ["Four Arms", "XLR8", "Heatblast", "Diamondhead", "Upgrade", "Grey Matter", "his strongest aliens"],
    limits: ["the Omnitrix times out and has to recharge — he's a normal kid in between", "nobody touches the watch"],
    code: "responsible for the watch, trained by the Plumbers",
    engine: "a different alien every few minutes",
    tags: ["tech", "outsider", "moral"],
  },
  {
    id: "mark",
    home: "invincible",
    name: "Invincible",
    aliases: ["Invincible", "Mark Grayson"],
    from: "Invincible",
    version: "Mark after Nolan's reveal",
    ladder: ["Viltrumite strength", "flight", "durability and healing"],
    limits: ["a specific sonic frequency disrupts Viltrumite equilibrium", "trained Viltrumites outclass him in experience"],
    code: "won't kill if there's any other way",
    engine: "a Viltrumite who rejected the Empire",
    tags: ["brute", "moral"],
  },
  {
    id: "homelander",
    hides: "everyone who could testify is afraid of him",
    home: "boys",
    name: "Homelander",
    aliases: ["Homelander"],
    from: "The Boys",
    version: "Homelander at his strongest, right before he loses his powers in the series finale",
    ladder: ["flight", "strength and durability", "heat vision", "X-ray vision", "super hearing"],
    limits: ["concentrated force near the ear and head", "radiation and power-removing attacks can weaken him", "he needs to be seen — public, emotional, predictable"],
    code: "none — fear and adoration",
    engine: "the strongest man alive who can't stand being ignored",
    tags: ["villain", "brute"],
  },
  {
    id: "deadpool",
    name: "Deadpool",
    aliases: ["Deadpool", "Wade Wilson"],
    from: "Marvel",
    version: "Earth-616 Wade with his normal healing factor — no temporary immortality stacked on top",
    ladder: ["healing factor", "swords and guns", "coming back"],
    limits: ["regenerating isn't the same as not dying — complete destruction and resurrection are different questions"],
    code: "a mercenary who keeps ending up doing the right thing",
    engine: "the guy you can't get rid of",
    tags: ["regen", "outsider"],
  },
  {
    id: "batman",
    hides: "Gotham can see Batman without ever seeing Bruce Wayne",
    name: "Batman",
    aliases: ["Batman", "Bruce Wayne"],
    from: "DC",
    version: "prime Bruce Wayne",
    ladder: ["preparation", "gadgets", "detective work", "combat training"],
    limits: ["guilt over the people he couldn't save", "the no-kill rule", "his identity"],
    code: "no killing — ever",
    engine: "the man who prepares for everything, in a place that can't be prepared for",
    tags: ["detective", "tech", "street"],
  },
  {
    id: "l",
    home: "deathnote",
    name: "L",
    aliases: ["L"],
    from: "Death Note",
    version: "L as he works the Kira case",
    ladder: ["rebuilding the case on one timeline", "tests aimed at one suspect", "surveillance through Watari and intermediaries", "suspicion before proof"],
    limits: ["must hide his face and name", "physically ordinary"],
    code: "justice, and winning",
    engine: "the investigator who suspects you long before he can prove it",
    tags: ["detective"],
  },
  {
    id: "dexter",
    hides: "he works inside Miami Metro and sees the evidence before anyone else",
    name: "Dexter",
    aliases: ["Dexter", "Dexter Morgan"],
    from: "Dexter",
    version: "Dexter at Miami Metro",
    ladder: ["forensic access", "the Code of Harry", "surveillance and routine", "the kill room"],
    limits: ["the Code needs proof", "access logs and patterns can expose him"],
    code: "only killers who fit the Code",
    engine: "a killer hunting a killer from inside the police",
    tags: ["detective", "villain"],
  },
  {
    id: "doom",
    name: "Doctor Doom",
    aliases: ["Doctor Doom", "Doom"],
    from: "Marvel",
    version: "Earth-616 Doom before he became Sorcerer Supreme — armour, personal magic, field fabrication tools, no Latveria",
    ladder: ["the armour", "personal magic", "Doombots built from local parts", "countermeasures built from studying the enemy"],
    limits: ["no army or labs to start with"],
    code: "studies before he fights; wants control of whatever he doesn't understand yet",
    engine: "he'd be studying them long before they understand what he is",
    tags: ["tech", "hax", "villain"],
  },
  {
    id: "aang",
    name: "Aang",
    aliases: ["Aang", "Avatar"],
    from: "Avatar: The Last Airbender",
    version: "late Book 3 Aang — all four elements, before Ozai",
    ladder: ["airbending", "water", "earth", "fire", "the Avatar State"],
    limits: ["refuses to kill", "the Avatar State is a risk to himself"],
    code: "won't kill, believes people can change",
    engine: "enough power to dominate everyone, and he refuses to use it that way",
    tags: ["moral", "hax"],
  },
  {
    id: "saitama",
    name: "Saitama",
    aliases: ["Saitama"],
    from: "One Punch Man",
    version: "Saitama as he is — bored",
    ladder: ["a normal punch", "serious punches"],
    limits: ["the fight is never the problem — boredom is"],
    code: "does the hero thing because it's the hero thing",
    engine: "the strongest man anywhere, and the least interested",
    tags: ["brute"],
  },
  {
    id: "wolverine",
    name: "Wolverine",
    aliases: ["Wolverine", "Logan"],
    from: "X-Men",
    version: "prime Fox Logan — adamantium, claws, healing factor before the decline",
    ladder: ["healing factor", "claws", "senses"],
    limits: ["healing isn't immunity to what lives inside him"],
    code: "protects kids even when he says he won't",
    engine: "what his body can't solve",
    tags: ["regen", "brute"],
  },
  {
    id: "ironman",
    home: "mcu",
    name: "Iron Man",
    aliases: ["Iron Man", "Tony Stark", "Tony"],
    from: "the MCU",
    version: "late-MCU Tony in the Mark 85",
    ladder: ["repulsors", "FRIDAY's scans", "nanotech repairs", "the unibeam"],
    limits: ["the suit wears down; the man inside can be exposed"],
    code: "fixes what he can, even when it isn't his to fix",
    engine: "the suit as a resource",
    tags: ["tech"],
  },
  {
    id: "thor",
    home: "mcu",
    name: "Thor",
    aliases: ["Thor"],
    from: "the MCU",
    version: "Thor with Mjolnir or Stormbreaker",
    ladder: ["Mjolnir", "lightning", "flight", "Stormbreaker"],
    limits: ["his family is his blind spot"],
    code: "protects the realm",
    engine: "the god who's lost everything once already",
    tags: ["brute", "cosmic"],
  },
  {
    id: "goku",
    name: "Goku",
    aliases: ["Goku"],
    from: "Dragon Ball",
    version: "Tournament of Power Goku",
    ladder: ["Kamehameha", "Instant Transmission", "Super Saiyan", "Super Saiyan Blue", "Ultra Instinct Sign"],
    limits: ["he lets opponents power up because he wants the fight", "Ultra Instinct isn't something he can call on demand"],
    code: "loves the fight, spares people who change",
    engine: "the one who'd rather fight the apex than stop him",
    tags: ["brute", "cosmic"],
    fresh: true,
  },
  {
    id: "jinwoo",
    name: "Sung Jinwoo",
    aliases: ["Jinwoo", "Sung Jinwoo"],
    from: "Solo Leveling",
    version: "Jinwoo after Jeju Island, with his shadow army",
    ladder: ["his own stats", "Shadow Exchange", "the shadow army", "Igris and Beru", "Monarch's Domain"],
    limits: ["shadows come from the dead he extracts"],
    code: "protects his family first",
    engine: "an army that grows from every enemy he beats",
    tags: ["hax", "brute"],
    fresh: true,
  },
  {
    id: "megumi",
    home: "jjk",
    name: "Megumi",
    aliases: ["Megumi"],
    from: "Jujutsu Kaisen",
    version: "Megumi before Shibuya",
    ladder: ["Divine Dogs", "Nue", "Max Elephant", "Chimera Shadow Garden", "Mahoraga"],
    limits: ["Mahoraga can't be controlled — summoning it is a death sentence unless it's tamed"],
    code: "saves people he thinks deserve it",
    engine: "an escape hatch that kills everyone including himself",
    tags: ["hax"],
    fresh: true,
  },
  {
    id: "daredevil",
    name: "Daredevil",
    aliases: ["Daredevil", "Matt Murdock"],
    from: "Marvel",
    version: "Matt Murdock with his radar sense and training",
    ladder: ["radar sense and hearing", "martial arts", "the billy club"],
    limits: ["sound overload", "no durability"],
    code: "won't kill",
    engine: "the man who hears everything",
    tags: ["street", "detective"],
  },
  {
    id: "vader",
    home: "starwars",
    name: "Darth Vader",
    aliases: ["Darth Vader", "Anakin Skywalker", "Anakin", "Vader"],
    from: "Star Wars",
    version: "Vader in the suit, years after Mustafar",
    ladder: ["the Force", "lightsaber", "the Empire"],
    limits: ["a body barely kept alive", "Padmé, always"],
    code: "order, and the family he lost",
    engine: "grief turned into power",
    tags: ["villain", "hax"],
  },
  {
    id: "guts",
    name: "Guts",
    aliases: ["Guts"],
    from: "Berserk",
    version: "Guts in the Black Swordsman period",
    ladder: ["the Dragon Slayer", "the cannon arm", "the repeating crossbow", "the Berserker Armor"],
    limits: ["the Brand of Sacrifice", "the Beast of Darkness"],
    code: "survive, and hunt Apostles",
    engine: "a man who keeps fighting after his body should have stopped",
    tags: ["brute", "regen"],
  },
  {
    id: "denji",
    home: "csm",
    name: "Denji",
    aliases: ["Denji", "Chainsaw Man"],
    from: "Chainsaw Man",
    version: "Denji early in Public Safety",
    ladder: ["the starter cord", "Chainsaw form", "healing from blood"],
    limits: ["trusts Makima"],
    code: "wants a normal life",
    engine: "the kid who died with nothing",
    tags: ["brute", "regen"],
  },
  {
    id: "afton",
    hides: "he built the building, and he knows every room it hides",
    home: "fnaf",
    name: "William Afton",
    aliases: ["William Afton", "Springtrap", "Afton"],
    from: "FNAF",
    version: "William before the springlock failure, or Springtrap after it",
    ladder: ["the springlock suits", "the animatronics", "Remnant"],
    limits: ["the children's spirits recognise him", "springlocks"],
    code: "none",
    engine: "the engineer who always comes back",
    tags: ["villain", "tech"],
  },
  {
    id: "otto",
    name: "Superior Spider-Man",
    aliases: ["Superior Spider-Man", "Otto Octavius"],
    from: "Marvel",
    version: "Otto in Peter's body",
    ladder: ["Spider-Bots and surveillance", "data on every opponent", "spider powers", "experimental counters"],
    limits: ["arrogance — certainty turns into cruelty"],
    code: "power belongs to whoever can use it best",
    engine: "a Spider-Man willing to do more than Peter",
    tags: ["tech", "detective", "villain"],
  },
  {
    id: "hulk",
    home: "mcu",
    name: "Hulk",
    aliases: ["Hulk", "One Below All Hulk", "Bruce Banner"],
    from: "Marvel",
    version: "the Hulk",
    ladder: ["strength", "rage", "regeneration"],
    limits: ["control"],
    code: "Banner's",
    engine: "strength that keeps growing",
    tags: ["brute", "regen"],
  },
  {
    id: "superman",
    name: "Superman",
    aliases: ["Superman"],
    from: "DC",
    version: "modern mainline Earth-0 Superman, no temporary amps",
    ladder: ["strength", "speed", "heat vision", "freeze breath", "invulnerability"],
    limits: ["kryptonite, magic, and anything his durability doesn't answer"],
    code: "saves everyone",
    engine: "the stat sheet",
    tags: ["brute", "cosmic", "moral"],
  },
  {
    id: "avengers",
    home: "mcu",
    name: "The Avengers",
    aliases: ["The Avengers"],
    from: "the MCU",
    version: "the original six before Age of Ultron, or the full late roster",
    ladder: ["Hawkeye and Black Widow", "Iron Man", "Hulk", "Thor", "Captain Marvel", "Doctor Strange", "Scarlet Witch"],
    limits: ["they have to reach you first"],
    code: "protect Earth",
    engine: "a team arriving somewhere that has never had one",
    tags: ["brute", "tech", "cosmic"],
  },
  {
    id: "light",
    hides: "he never has to be in the room — a name and a face are all he needs",
    home: "deathnote",
    name: "Light Yagami",
    aliases: ["Light Yagami", "Kira"],
    from: "Death Note",
    version: "Light with the notebook",
    ladder: ["a name", "a face", "the rules"],
    limits: ["he needs both the face and the real name"],
    code: "his own idea of justice",
    engine: "a killer who never has to be in the room",
    tags: ["detective", "villain"],
  },
  {
    id: "joker",
    hides: "his motive changes whenever he feels like changing it",
    name: "The Joker",
    aliases: ["The Joker", "Joker"],
    from: "DC",
    version: "the Joker",
    ladder: ["crews, chemicals, vehicles", "planted clues"],
    limits: ["his preparation still needs people, materials and routes"],
    code: "none",
    engine: "motive that changes whenever he wants",
    tags: ["villain"],
  },
  {
    id: "walter",
    hides: "the chemistry points at someone the people moving the product look nothing like",
    name: "Walter White",
    aliases: ["Walter White", "Heisenberg"],
    from: "Breaking Bad",
    version: "Walt as Heisenberg",
    ladder: ["the chemistry", "Jesse", "Gus's separation", "Saul"],
    limits: ["his need to stay ahead of everyone"],
    code: "family, he says",
    engine: "the teacher nobody suspects",
    tags: ["villain", "detective"],
  },
  {
    id: "thanos",
    home: "mcu",
    name: "Thanos",
    aliases: ["Thanos"],
    from: "the MCU",
    version: "MCU Thanos",
    ladder: ["strength and experience", "each Stone", "the Gauntlet"],
    limits: ["the Snap cost him Gamora — and his body when he destroyed the Stones"],
    code: "believes it's mercy",
    engine: "a villain who thinks he's right",
    tags: ["villain", "cosmic", "brute"],
  },
];

export const POWERS: Power[] = [
  {
    id: "omnitrix",
    name: "the Omnitrix",
    aliases: ["Omnitrix"],
    from: "Ben 10",
    grants: ["a handful of alien forms", "Upgrade and Grey Matter for tech", "scanning new DNA"],
    cantCopy: "the species' training — he gets the body, not the years of using it",
    cost: "it times out, and anyone who learns that waits for it",
    mentor: "Azmuth, or whoever built it",
    weakness: "the timeout",
  },
  {
    id: "gauntlet",
    name: "the Infinity Gauntlet",
    aliases: ["Infinity Gauntlet", "Gauntlet", "Infinity Stones"],
    from: "the MCU",
    grants: ["Space", "Time", "Reality", "Mind", "Soul", "Power — and all six at once"],
    cantCopy: "a body that can survive it — Hulk barely did and Tony didn't",
    cost: "every problem starts looking like one more thing only he can fix",
    mentor: "Doctor Strange (warning, not teaching)",
    weakness: "the energy wrecks the wearer",
  },
  {
    id: "venom",
    name: "the Venom symbiote",
    aliases: ["Venom", "Symbiote"],
    from: "Marvel",
    grants: ["strength and speed", "healing", "tendrils and shapeshifting", "a second voice in his head"],
    cantCopy: "his judgement — it makes whatever he already is stronger",
    cost: "it feeds on the part of him that's already angry",
    mentor: "the symbiote itself",
    weakness: "sound and fire",
  },
  {
    id: "mjolnir",
    name: "Mjolnir",
    aliases: ["Mjolnir", "Worthy"],
    from: "the MCU",
    grants: ["the hammer answering his call", "flight", "lightning", "the power of Thor"],
    cantCopy: "an Asgardian body — he's still himself holding it",
    cost: "treating worthiness as a verdict he has to keep earning",
    mentor: "Thor",
    weakness: "it's only his while he's worthy",
  },
  {
    id: "force",
    name: "the Force",
    aliases: ["The Force", "Force", "Sith"],
    from: "Star Wars",
    grants: ["Force sense", "telekinesis", "precognition", "the dark side's power from anger"],
    cantCopy: "Jedi training — nobody in his world can teach it",
    cost: "anger gets results faster",
    mentor: "nobody — he learns it alone",
    weakness: "the dark side",
  },
  {
    id: "compoundv",
    name: "Compound V",
    aliases: ["Compound V"],
    from: "The Boys",
    grants: ["one new mutation", "whatever Vought couldn't predict"],
    cantCopy: "control — Vought never knew what V would do to an adult",
    cost: "Vought wants to study him",
    mentor: "nobody honest",
    weakness: "the power-removing weapons",
  },
  {
    id: "lantern",
    name: "a Green Lantern ring",
    aliases: ["Green Lantern", "Lantern Ring"],
    from: "DC",
    grants: ["constructs", "flight", "space travel", "the Oath"],
    cantCopy: "willpower — the ring picks it, it doesn't give it",
    cost: "a sector to protect, and a city left without him",
    mentor: "Kilowog",
    weakness: "fear, and a yellow ring",
  },
  {
    id: "mahoraga",
    name: "Mahoraga",
    aliases: ["Mahoraga", "Ten Shadows"],
    from: "Jujutsu Kaisen",
    grants: ["the Ten Shadows", "Nue and the Divine Dogs", "Mahoraga — adapts to anything"],
    cantCopy: "control — nobody has tamed Mahoraga",
    cost: "the biggest hammer is always right there",
    mentor: "a book, or Megumi",
    weakness: "summoning it can kill the summoner",
  },
  {
    id: "shadows",
    name: "Shadow Extraction",
    aliases: ["Shadow Extraction", "Shadow Monarch", "System"],
    from: "Solo Leveling",
    grants: ["the System's quests", "Arise", "Shadow Exchange", "an army of the dead"],
    cantCopy: "his permission — raising the dead goes against who he is",
    cost: "every enemy becomes a soldier",
    mentor: "the System",
    weakness: "the one behind the System",
  },
  {
    id: "deathnote",
    name: "the Death Note",
    aliases: ["Death Note"],
    from: "Death Note",
    grants: ["a name and a face — and a death"],
    cantCopy: "a clean conscience",
    cost: "protecting the secret becomes the whole of your life",
    mentor: "Ryuk, who won't help",
    weakness: "L",
  },
  {
    id: "ghostrider",
    name: "the Spirit of Vengeance",
    aliases: ["Ghost Rider", "Spirit of Vengeance"],
    from: "Marvel",
    grants: ["hellfire", "the Penance Stare", "a burning skull", "attacks that reach the soul"],
    cantCopy: "his say over when it comes out",
    cost: "vengeance picks its targets, not him",
    mentor: "nobody — the Spirit itself",
    weakness: "holy ground and the host's own will",
  },
  {
    id: "viltrumite",
    name: "Viltrumite biology",
    aliases: ["Viltrumite"],
    from: "Invincible",
    grants: ["strength", "flight", "durability", "a lifespan measured in centuries"],
    cantCopy: "experience — trained Viltrumites outclass him",
    cost: "the Empire finds out",
    mentor: "Mark",
    weakness: "the sonic frequency",
  },
];

// ── lookups ────────────────────────────────────────────────────────────────

function aliasRe(aliases: string[]): RegExp {
  const esc = aliases.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[- ]/g, "[- ]?"));
  return new RegExp(`\\b(${esc.join("|")})\\b`, "i");
}
const WORLD_RE = WORLDS.map((w) => ({ w, re: aliasRe(w.aliases) }));
const HERO_RE = HEROES.map((h) => ({ h, re: aliasRe(h.aliases) }));
const POWER_RE = POWERS.map((p) => ({ p, re: aliasRe(p.aliases) }));

/** Where in a title each thing is named — the first named is the lead. */
function found<T>(title: string, list: Array<{ re: RegExp } & T>): Array<T & { at: number }> {
  return list
    .map((x) => ({ ...x, at: title.search(x.re) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
}

export function readTitle(title: string): { heroes: Hero[]; worlds: World[]; powers: Power[] } {
  const t = title.replace(/[’]/g, "'");
  const hs = found(t, HERO_RE);
  const ws = found(t, WORLD_RE);
  const ps = found(t, POWER_RE);
  // A name that's both a character and a world ("Invincible", "The Avengers",
  // "Chainsaw Man") is the character when it leads the title and the world
  // when it comes later: "Could Invincible Survive…" / "…Was In Invincible".
  const first = Math.min(...[...hs, ...ws, ...ps].map((x) => x.at), Infinity);
  const clash = (at: number, list: Array<{ at: number }>) => list.some((x) => Math.abs(x.at - at) <= 4);
  const heroes = hs.filter((h) => !clash(h.at, ws) || h.at === first).map((x) => x.h);
  const worlds = ws.filter((w) => !clash(w.at, hs) || w.at !== first).map((x) => x.w);
  const powers = ps.filter((p) => !clash(p.at, hs) || p.at !== first).map((x) => x.p);
  // "Spider-Man" inside "Superior Spider-Man" is Otto; "Thanos" in a Thanos-led
  // title is the hero, not the MCU.
  return {
    heroes: /superior spider/i.test(t) ? heroes.filter((h) => h.id !== "spiderman") : heroes,
    worlds: heroes[0]?.id === "thanos" ? worlds.filter((w) => w.id !== "mcu" || /avengers|mcu/i.test(t)) : worlds,
    powers,
  };
}

export const WORLD_BY_ID = new Map(WORLDS.map((w) => [w.id, w]));
export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
export const POWER_BY_ID = new Map(POWERS.map((p) => [p.id, p]));

/**
 * The worlds' texts say {he}, {him}, {his} and {himself} wherever they mean
 * whoever is dropped into them; this fills those in for the hero at hand (he
 * when there isn't one). Every other pronoun in the lore is about the world's
 * own characters and is left as written.
 */
export function voice(text: string, hero?: Hero | null): string {
  const she = hero?.pronoun === "she";
  const forms: Record<string, [string, string]> = {
    he: ["he", "she"], him: ["him", "her"], his: ["his", "her"], himself: ["himself", "herself"], He: ["He", "She"], His: ["His", "Her"],
  };
  return text.replace(/\{(he|him|his|himself|He|His)\}/g, (_, t: string) => forms[t]![she ? 1 : 0]!);
}

/** A text that only ever means the character — a format's pitch — said for a heroine. */
export function forHeroine(text: string, hero?: Hero | null): string {
  if (hero?.pronoun !== "she") return text;
  const swap: Record<string, string> = { he: "she", him: "her", his: "her", himself: "herself", He: "She", His: "Her" };
  return text.replace(/\b(he|him|his|himself|He|His)\b/g, (w) => swap[w] ?? w);
}

// ── added from Story Lab's dice ────────────────────────────────────────────

/** The lore as written, before anything was added at runtime. */
const BASE = { worlds: WORLDS.length, heroes: HEROES.length, powers: POWERS.length };

/**
 * Add a world, hero or power: from now on it's lore like any other — read
 * in titles, offered in ideas and the builder, used by blueprints.
 */
export function addLore(kind: "world" | "hero" | "power", item: World | Hero | Power): void {
  if (kind === "world") {
    const w = item as World;
    if (WORLD_BY_ID.has(w.id)) return;
    WORLDS.push(w);
    WORLD_RE.push({ w, re: aliasRe(w.aliases) });
    WORLD_BY_ID.set(w.id, w);
  } else if (kind === "hero") {
    const h = item as Hero;
    if (HERO_BY_ID.has(h.id)) return;
    HEROES.push(h);
    HERO_RE.push({ h, re: aliasRe(h.aliases) });
    HERO_BY_ID.set(h.id, h);
  } else {
    const p = item as Power;
    if (POWER_BY_ID.has(p.id)) return;
    POWERS.push(p);
    POWER_RE.push({ p, re: aliasRe(p.aliases) });
    POWER_BY_ID.set(p.id, p);
  }
}

/** Back to the lore as written: everything added is taken out again. */
export function resetLore(): void {
  for (const w of WORLDS.splice(BASE.worlds)) WORLD_BY_ID.delete(w.id);
  for (const h of HEROES.splice(BASE.heroes)) HERO_BY_ID.delete(h.id);
  for (const p of POWERS.splice(BASE.powers)) POWER_BY_ID.delete(p.id);
  WORLD_RE.splice(BASE.worlds);
  HERO_RE.splice(BASE.heroes);
  POWER_RE.splice(BASE.powers);
}
