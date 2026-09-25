/**
 * Deterministic tests for the rules the model is NOT allowed to do:
 * date shapes, the VO buffer, timezone rendering, channel matching.
 *
 *   npm run test:rules
 *
 * Runs with no API key and no database, so it stays fast enough to run on
 * every change to derive.ts or the catalog.
 */
import { CATEGORIES, CHANNELS, matchChannel } from "../src/catalog.js";
import {
  ORG_TZ,
  dateIn,
  derive,
  instantIn,
  normaliseDate,
  renderBothZones,
  shiftDate,
} from "../src/parse/derive.js";
import type { Extraction } from "../src/parse/schema.js";
import { parseAssignment, parseReview } from "../src/parse/structured.js";
import { calendarGrid, shiftMonth } from "../src/web/page.js";
import { classifyUrl } from "../src/parse/rules.js";
import { parseWhen } from "../src/parse/when.js";

let pass = 0;
let fail = 0;

function t(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass += 1;
    console.log(`\x1b[32mPASS\x1b[0m  ${label}`);
  } else {
    fail += 1;
    console.log(
      `\x1b[31mFAIL\x1b[0m  ${label}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`,
    );
  }
}

const section = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// ── the VO buffer ─────────────────────────────────────────────────────────
section("VO buffer — air date minus 6 days, 11:59 PM ET");
t("shift back six days", shiftDate("2026-10-03", -6), "2026-09-27");
const vo = instantIn("2026-09-27", "23:59", ORG_TZ)!;
t("lands on 27 Sep in ET", dateIn(ORG_TZ, vo), "2026-09-27");
t("renders ET", renderBothZones(vo).org, "9/27/2026 @ 11:59 PM EDT");
t("renders IST the next morning", renderBothZones(vo).team, "9/28/2026 @ 9:29 AM IST");

// A January air date crosses the DST boundary; the offset must follow it.
const winter = instantIn("2027-01-10", "23:59", ORG_TZ)!;
t("winter deadline is still 11:59 PM local", renderBothZones(winter).org, "1/10/2027 @ 11:59 PM EST");

// ── date shapes the posts actually use ────────────────────────────────────
section("Date shapes");
t("MM-DD-YY heading", normaliseDate("10-03-26"), "2026-10-03");
t("M/D/YYYY deadline", normaliseDate("9/19/2026"), "2026-09-19");
t("already ISO", normaliseDate("2026-10-03"), "2026-10-03");
t("nonsense stays null", normaliseDate("sometime next week"), null);

// ── channel matching ──────────────────────────────────────────────────────
section("Channel matching");
t("exact name", matchChannel("Specular FNAF")?.id, "fnaf");
t("bits beats its parent channel", matchChannel("specular fnaf bits")?.id, "fnaf_bits");
t("bare alias", matchChannel("torch")?.id, "torch");
t("inside a sentence", matchChannel("couple more for fnaf bits today")?.id, "fnaf_bits");
t("smp implies the Minecraft channel", matchChannel("v3 of smp ep 9 is up")?.id, "minecraft");
t("no match stays undefined", matchChannel("can we move the thing")?.id, undefined);
t("every channel sits in a known category", CHANNELS.every((c) => CATEGORIES.some((k) => k.id === c.category)), true);

// ── derive, end to end, no API ────────────────────────────────────────────
section("derive()");
const base = {
  kind: "assignment",
  code: "video-008",
  title: "What If Deadpool Was In Jujutsu Kaisen?",
  category: "stories",
  channel: "Specular Studios",
  tag: "Comics",
  air_date: "10-03-26",
  stage: "script",
  word_count: 5000,
  assignee: "@vikram",
  script_due: "2026-09-19T23:59:00-04:00",
  vo_due: null,
  deadline: null,
  version: null,
  links: [],
  brief: null,
  note: null,
  confidence: 0.94,
} as unknown as Extraction;

const rec = derive(base, "no links in this one");
t("code upper-cased", rec.code, "VIDEO-008");
t("air date normalised", rec.airDate, "2026-10-03");
t("VO derived from air date", rec.voDue ? dateIn(ORG_TZ, rec.voDue) : null, "2026-09-27");
t("and labelled calculated", rec.voSource, "calculated");
t("no warnings on a clean post", rec.warnings, []);

const stated = derive({ ...base, vo_due: "2026-10-05T14:00:00-04:00" }, "");
t("a stated VO time wins", stated.voSource, "stated");
t("stated VO keeps its date", stated.voDue ? dateIn(ORG_TZ, stated.voDue) : null, "2026-10-05");

const noAir = derive({ ...base, air_date: null }, "");
t("no air date means no VO", noAir.voDue, null);
t("and voSource says none", noAir.voSource, "none");

const mismatch = derive({ ...base, category: "gaming", channel: "Specular FNAF Bits" } as Extraction, "");
t("named channel overrides the model's category", mismatch.category, "bits");
t("and it warns about the override", mismatch.warnings.length > 0, true);

const unknownChannel = derive({ ...base, channel: "Specular Nonexistent" } as Extraction, "");
t("an unknown channel is dropped", unknownChannel.channel, null);
t("and warned about", unknownChannel.warnings.length > 0, true);

const links = derive(
  base,
  "see https://f.frame.io/reviews/a41c9 and https://drive.google.com/drive/folders/1kQ",
);
t("links recovered from raw text", links.links.length, 2);
t("frame.io classified by host", links.links.find((l) => l.url.includes("frame.io"))?.kind, "frameio");

// ── the pattern parser ────────────────────────────────────────────────────
section("pattern parser (no API key)");

const POST = [
  "### 10-03-26 | VIDEO-008 | What If Deadpool Was In Jujutsu Kaisen?",
  "",
  "📁 **Project**",
  "**TBD**",
  "",
  "@ Comics",
  "",
  "━━━━━━━━━━━━━━━━━━",
  "",
  "📝 **SCRIPT** <@717794467314270278> ",
  "",
  "* Deadline:",
  "",
  "  * 🇺🇸 **9/19/2026 @ 11:59 PM ET**",
  "  * 🇮🇳 **9/20/2026 @ 9:29 AM IST**",
  "* Word Count: **5000 Words**",
  "",
  "**Story Brief** <@717794467314270278> Place Deadpool into the JJK universe.",
].join("\n");

const post = parseAssignment(POST)!;
t("recognises the assignment post", post !== null, true);
t("code copied as written", post.code, "VIDEO-008");
t("heading date is the air date", post.air_date, "2026-10-03");
t("title read from the heading", post.title, "What If Deadpool Was In Jujutsu Kaisen?");
t("tag read from the @ line", post.tag, "Comics");
t("stage read from the header", post.stage, "script");
t("assignee is the mention", post.assignee, "<@717794467314270278>");
t("word count stripped of the label", post.word_count, 5000);
t("brief captured", (post.brief ?? "").includes("JJK universe"), true);
t("the @ tag names the channel", post.channel, "Specular Comics");
t("and files it under Stories", post.category, "stories");
t(
  "an @ tag that names no channel files it with none",
  parseAssignment("### 10-03-26 | VIDEO-030 | Something\n\n@ Cooking")?.channel,
  null,
);
t("never calculates the VO deadline", post.vo_due, null);
t("script deadline takes the ET line", dateIn(ORG_TZ, new Date(post.script_due!)), "2026-09-19");
t("ET resolved on daylight time", post.script_due, "2026-09-19T23:59:00-04:00");

const winterPost = parseAssignment(
  "### 01-20-27 | VIDEO-009 | Winter\n🇺🇸 **1/14/2027 @ 11:59 PM ET**",
);
t("ET resolved on standard time", winterPost?.script_due, "2027-01-14T23:59:00-05:00");

t("refuses a message with no heading", parseAssignment("v3 of smp ep 9 is up"), null);
t("refuses a heading with no title", parseAssignment("### 10-03-26 | VIDEO-008"), null);
t(
  "the post derives the VO deadline downstream",
  dateIn(ORG_TZ, derive(post, POST).voDue!),
  "2026-09-27",
);

// ── forwarded revisions ───────────────────────────────────────────────────
section("forwarded Frame.io revisions");

const rev = parseReview("v3 of smp ep 9 is up https://f.frame.io/r/9bd21x — needs your eyes before tomorrow")!;
t("a frame.io forward is a review", rev.kind, "review");
t("version read from v3", rev.version, 3);
t("channel read from the sentence", rev.channel, "Specular Minecraft");
t("title is the message's own words", rev.title, "smp ep 9");
t("the link is labelled", rev.links[0]?.label, "Frame.io review");
t("confident when the project is named", rev.confidence, 0.9);

const bare = parseReview("https://f.frame.io/r/9bd21x")!;
t("a bare link still files", bare.kind, "review");
t("but says it doesn't know the project", bare.channel, null);
t("with honest confidence", bare.confidence, 0.5);

t("no frame.io link is not a review", parseReview("torch is at 3 today"), null);
t(
  "a stated VO time goes to the model",
  parseReview("cut is up https://f.frame.io/r/9bd21x — need the vo by 3 latest"),
  null,
);

// ── voiceover times written in prose ──────────────────────────────────────
section("voiceover times in prose");

const statedVo = parseAssignment(
  "### 10-15-26 | VIDEO-016 | FNAF Movie 2\n\nVO needs to be recorded by Oct 5 at 2pm ET, earlier than usual.",
)!;
t("a stated VO time is read, not defaulted", statedVo.vo_due, "2026-10-05T14:00:00-04:00");

t(
  "an unreadable VO line defers to the model",
  parseAssignment("### 10-15-26 | VIDEO-016 | FNAF Movie 2\n\nvo whenever you get a chance"),
  null,
);

const header = parseAssignment("### 10-15-26 | VIDEO-016 | FNAF Movie 2\n\n🎙️ **VO** <@1>")!;
t("a VO stage header is not a deadline", header.vo_due, null);
t("and is read as the stage", header.stage, "vo");

// ── the calendar's date arithmetic ────────────────────────────────────────
section("calendar dates");

t("next month", shiftMonth("2026-09", 1), "2026-10");
t("previous month", shiftMonth("2026-09", -1), "2026-08");
t("crosses new year forwards", shiftMonth("2026-12", 1), "2027-01");
t("crosses new year backwards", shiftMonth("2026-01", -1), "2025-12");
t("a year of steps lands a year later", shiftMonth("2026-03", 12), "2027-03");

const sept = calendarGrid("2026-09");
t("the grid is whole weeks", sept.length % 7, 0);
t("it starts on a Sunday", new Date(`${sept[0]}T12:00:00Z`).getUTCDay(), 0);
t("it ends on a Saturday", new Date(`${sept[sept.length - 1]}T12:00:00Z`).getUTCDay(), 6);
t("it covers the 1st", sept.includes("2026-09-01"), true);
t("it covers the last day", sept.includes("2026-09-30"), true);
t("and leads with the trailing days of August", sept[0], "2026-08-30");

// February 2026 starts on a Sunday and ends on a Saturday: exactly four weeks,
// the case an off-by-one in either direction would pad wrongly.
const feb = calendarGrid("2026-02");
t("a month that fits its weeks exactly is not padded", feb.length, 28);
t("no day is repeated", new Set(feb).size, feb.length);

const leap = calendarGrid("2028-02");
t("a leap day is included", leap.includes("2028-02-29"), true);

// ── which links are Frame.io ──────────────────────────────────────────────
section("Frame.io links");

t("a full frame.io link", classifyUrl("https://frame.io/reviews/abc"), "frameio");
t("the f.io short link", classifyUrl("https://f.io/7bu6f54B"), "frameio");
t("next.frame.io share links", classifyUrl("https://next.frame.io/share/abc"), "frameio");
t("app.frame.io", classifyUrl("https://app.frame.io/player/abc"), "frameio");
t("a lookalike is not Frame.io", classifyUrl("https://surf.io/abc"), "other");
t("nor is a domain that merely contains it", classifyUrl("https://notframe.io/abc"), "other");
t("youtu.be still youtube", classifyUrl("https://youtu.be/abc"), "youtube");

// The exact message that came in: a bare short link and nothing else.
const bareShort = parseReview("https://f.io/7bu6f54B")!;
t("a bare f.io link is read by pattern", bareShort !== null, true);
t("as a revision", bareShort.kind, "review");
t("says what it's missing instead of '(no title)'", (bareShort.note ?? "").includes("which project"), true);
t("and doesn't guess a channel", bareShort.channel, null);

const namedShort = parseReview("v2 of smp ep 10 https://f.io/Xy12ab")!;
t("a short link with a name finds its channel", namedShort.channel, "Specular Minecraft");
t("and its version", namedShort.version, 2);

// ── the master channel list ───────────────────────────────────────────────
section("master channel list");

t("five categories, in the studio's order", CATEGORIES.map((c) => c.id), ["gaming", "stories", "reading", "bits", "movies"]);
t("30 channels", CHANNELS.length, 30);
t("every bits channel opens daily", CHANNELS.filter((c) => c.category === "bits").every((c) => c.recurring), true);
t("roblox finds its channel", matchChannel("roblox doors ep 4 is up")?.name, "Specular Roblox");
t("the full name finds a Stories channel", matchChannel("specular horror ep 2")?.name, "Specular Horror");
t("the longer bits name beats its parent", matchChannel("specular anime bits today")?.name, "Specular Anime Bits");
t("& Kay Bits by its full name", matchChannel("specular & kay bits batch")?.name, "Specular & Kay Bits");

// The main channel is called just "Specular", which is in nearly every message.
t("'Specular' on its own is the main channel", matchChannel("Specular")?.name, "Specular");
t("but never matched from inside a sentence", matchChannel("the specular edit is up"), undefined);
t("Specular Sleep is still found", matchChannel("specular sleep upload tonight")?.name, "Specular Sleep");

// Words that are channel names but also ordinary title words.
t("'YOU' in a title is not Specular YOU", matchChannel("What If YOU Had The Infinity Gauntlet"), undefined);
t("'law' in a title is not Specular Law", matchChannel("the law of the jungle"), undefined);
t("a name only matches as whole words", matchChannel("specular torchlight"), undefined);

// ── reading a written date ────────────────────────────────────────────────
section("dates as people write them");

// Pinned to a Thursday so "friday" and "tomorrow" never drift with the calendar.
const thu = new Date("2026-09-24T16:00:00Z");

t("6 am friday 25th 2026 (the real message)", parseWhen("6 am friday 25th 2026", thu), "2026-09-25T06:00:00-04:00");
t("a month name and a time", parseWhen("Oct 5 at 2pm ET", thu), "2026-10-05T14:00:00-04:00");
t("numeric with minutes", parseWhen("10/5 11:59pm", thu), "2026-10-05T23:59:00-04:00");
t("a weekday and a time", parseWhen("friday 6pm", thu), "2026-09-25T18:00:00-04:00");
t("tomorrow noon", parseWhen("tomorrow noon", thu), "2026-09-25T12:00:00-04:00");
t("midnight is the end of the day", parseWhen("midnight friday", thu), "2026-09-25T23:59:00-04:00");
t("a day with no time lands on 11:59 PM", parseWhen("25th september", thu), "2026-09-25T23:59:00-04:00");
t("IST is read as IST", parseWhen("Oct 5 at 9:30 am IST", thu), "2026-10-05T09:30:00+05:30");
t("January is on standard time", parseWhen("Jan 14 2027 6pm", thu), "2027-01-14T18:00:00-05:00");
t("'Jan 5' in December means next January", parseWhen("jan 5", new Date("2026-12-20T16:00:00Z")), "2027-01-05T23:59:00-05:00");

const tue25 = parseWhen("tuesday 25th", thu);
// Read the weekday off the local date: 11:59 PM ET is already tomorrow in UTC.
t("a weekday and a day find the month where they agree", tue25 ? new Date(`${tue25.slice(0, 10)}T12:00:00Z`).getUTCDay() : null, 2);
t("and it's the 25th", tue25?.slice(8, 10), "25");

t("'by 3' could be morning or afternoon, so no guess", parseWhen("by 3", thu), null);
t("'at 6' likewise", parseWhen("friday at 6", thu), null);
t("no date at all", parseWhen("whenever you get a chance", thu), null);
t("an impossible date", parseWhen("feb 30", thu), null);

// The whole message, not just the date.
const gauntlet = parseReview(
  "What If YOU Had The Infinity Gauntlet\nhttps://f.io/7bu6f54B\nDeadline: 6 am friday 25th 2026",
  thu,
)!;
t("the deadline line is not part of the title", gauntlet.title, "What If YOU Had The Infinity Gauntlet");
t("it becomes the deadline", gauntlet.deadline, "2026-09-25T06:00:00-04:00");
t("a deadline on the same line as the title", parseReview("smp ep 9 cut - due: tomorrow 5pm https://f.io/a", thu)?.deadline, "2026-09-25T17:00:00-04:00");
t("a labelled VO time is read as the VO", parseReview("smp ep 9 https://f.io/a\nVO: friday 2pm", thu)?.vo_due, "2026-09-25T14:00:00-04:00");
t("an unreadable VO label goes to the model, not a guess", parseReview("smp ep 9 https://f.io/a\nVO: by 3", thu), null);
const unread = parseReview("smp ep 9 https://f.io/a\nDeadline: soonish", thu)!;
t("an unreadable deadline is left blank", unread.deadline, null);
t("and says so", (unread.note ?? "").includes("couldn't read it"), true);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);
process.exit(fail > 0 ? 1 : 0);
