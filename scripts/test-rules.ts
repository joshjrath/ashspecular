/**
 * Deterministic tests for the rules the model is NOT allowed to do:
 * date shapes, the VO buffer, timezone rendering, channel matching.
 *
 *   npm run test:rules
 *
 * Runs with no API key and no database, so it stays fast enough to run on
 * every change to derive.ts or the catalog.
 */
import { CATEGORIES, CHANNELS, DARK_SURFACES, channelInk, matchChannel } from "../src/catalog.js";
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
import { calendarGrid, renderCalendar, renderDashboard, renderDay, renderList, renderRecurring, renderScriptBoard, renderUploads, renderWeek, shiftMonth, sortRecords, weekStart } from "../src/web/page.js";
import { classifyUrl } from "../src/parse/rules.js";
import { parseWhen } from "../src/parse/when.js";
import { readFileSync } from "node:fs";
import { fetchScriptReport, readReport } from "../src/web/scriptcheck.js";
import { config, siteAddress } from "../src/config.js";
import { buildIcs, checkFeedKey, feedKey, parseFeedOptions } from "../src/web/ics.js";
import { channelIdFromPage, parseFeed, readChannelInput, readLongFormFeed, readShortsFeed } from "../src/jobs/youtube.js";
import { cadenceFor, dailyFor } from "../src/web/cadence.js";
import { analyzeIdeas, checkIdea, formatOf, subjectsOf, type IdeaVideo } from "../src/web/ideas.js";
import { compactViews, formatMultiple, scoreVideo, typicalViews, viewsAtAge, type VideoViews } from "../src/web/performance.js";
import { breakoutMessage } from "../src/jobs/breakouts.js";
import { factsFromName, inspectFrameLink, mergeFrame, readFramePage } from "../src/parse/frameio.js";
import { relativeDay, usDate } from "../src/parse/derive.js";

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

// ── how dates are shown ───────────────────────────────────────────────────
section("dates on screen");

const fri = new Date("2026-09-25T16:00:00Z");
t("M/D/YYYY", usDate("2026-10-09"), "10/9/2026");
t("no leading zeros", usDate("2026-01-05"), "1/5/2026");
t("the Gojo case: airs in 3 days", relativeDay("2026-09-28", fri), "in 3 days");
t("today", relativeDay("2026-09-25", fri), "today");
t("tomorrow", relativeDay("2026-09-26", fri), "tomorrow");
t("yesterday", relativeDay("2026-09-24", fri), "yesterday");
t("already aired", relativeDay("2026-09-20", fri), "5 days ago");
t("late evening ET is still today, not tomorrow in UTC", relativeDay("2026-09-25", new Date("2026-09-26T03:30:00Z")), "today");

t("the five reading channels open daily", CHANNELS.filter((c) => c.category === "reading").every((c) => c.recurring?.perDay === 1), true);
t("twelve recurring channels in all", CHANNELS.filter((c) => c.recurring).length, 12);
t("a reading channel's day is five uploads", CHANNELS.filter((c) => c.category === "reading").map((c) => c.recurring?.units), [5, 5, 5, 5, 5]);
t(
  "bits uploads per channel",
  Object.fromEntries(CHANNELS.filter((c) => c.category === "bits").map((c) => [c.name, c.recurring?.units])),
  {
    "Specular Studios Bits": 5, "Specular Anime Bits": 5, "Specular FNAF Bits": 5, "Specular Animation Bits": 5,
    "Specular Gaming Bits": 3, "Specular Undertale Bits": 3, "Specular & Kay Bits": 1,
  },
);

// ── channel colours ───────────────────────────────────────────────────────
section("channel colours");

const linear = (hex: string) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
const luminance = (hex: string) => {
  const [r, g, b] = linear(hex);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

t("every channel has a colour", CHANNELS.every((c) => /^#[0-9A-F]{6}$/i.test(c.color)), true);
t("all 30 are different", new Set(CHANNELS.map((c) => c.color.toUpperCase())).size, 30);
t("none reuses a category colour", CHANNELS.some((c) => CATEGORIES.some((k) => k.color.toUpperCase() === c.color.toUpperCase())), false);
t("each name reads as text on every dark surface (4.5:1)",
  CHANNELS.filter((c) => DARK_SURFACES.some((bg) => ratio(channelInk(c.color), bg) < 4.5)).map((c) => c.name), []);
t("a readable colour is written as itself", channelInk("#1BD058"), "#1BD058");
t("Verse navy is written lighter", ratio(channelInk("#05157D"), "#18181C") >= 4.5 && channelInk("#05157D") !== "#05157D", true);

const avatar: Record<string, string> = {
  "Specular Studios": "#D21B20", "Specular Anime": "#360D7B", "Specular FNAF": "#D2BD1B",
  "Specular Horror": "#7AC0D1", "Specular Manga": "#959B9D", "Specular Verse": "#05157D",
  "Specular Animation": "#D39B7C", "Specular Comics": "#1BC0D2", "Specular Documentaries": "#1BD058",
  "Specular Force": "#E26570", "Specular YOU": "#F17949", "Specular Battles": "#A20E82",
};
t("Stories channels wear their avatar colours exactly",
  Object.entries(avatar).filter(([n, hex]) => CHANNELS.find((c) => c.name === n)?.color !== hex).map(([n]) => n), []);
t("category colours are unchanged", CATEGORIES.map((c) => c.color), ["#35986A", "#4A5CD4", "#CE7118", "#AC63C8", "#A63F66"]);

// ── sorting lists ─────────────────────────────────────────────────────────
section("sorting");

const sortRec = (code: string | null, airDate: string | null, vo: string | null, title: string, filed: string) =>
  ({
    code, airDate, title, voDue: vo ? new Date(vo) : null, deadline: null, scriptDue: null,
    channel: "Specular Studios", createdAt: new Date(filed), raw: "", note: null, kind: "assignment",
  }) as unknown as Parameters<typeof sortRecords>[0][number];

const sample = [
  sortRec("VIDEO-25", "2026-10-07", "2026-10-01T23:59:00-04:00", "Iron Man", "2026-09-01"),
  sortRec("VIDEO-9", "2026-09-30", "2026-09-24T23:59:00-04:00", "Spider-Man", "2026-09-03"),
  sortRec(null, null, null, "A loose note", "2026-09-05"),
  sortRec("VIDEO-10", "2026-09-26", "2026-09-20T23:59:00-04:00", "Avengers", "2026-09-02"),
];
const codes = (key: Parameters<typeof sortRecords>[1], dir: Parameters<typeof sortRecords>[2]) =>
  sortRecords(sample, key, dir).map((r) => r.code ?? "none");

t("air date, soonest first", codes("air", "asc"), ["VIDEO-10", "VIDEO-9", "VIDEO-25", "none"]);
t("video number counts, not spells: 9 before 10", codes("code", "asc"), ["VIDEO-9", "VIDEO-10", "VIDEO-25", "none"]);
t("reversed, blanks still at the bottom", codes("code", "desc"), ["VIDEO-25", "VIDEO-10", "VIDEO-9", "none"]);
t("deadline", codes("due", "asc"), ["VIDEO-10", "VIDEO-9", "VIDEO-25", "none"]);
t("title A–Z", sortRecords(sample, "title", "asc").map((r) => r.title), ["A loose note", "Avengers", "Iron Man", "Spider-Man"]);
t("newest filed first", codes("filed", "desc"), ["none", "VIDEO-9", "VIDEO-10", "VIDEO-25"]);

// ── the pages' own scripts ────────────────────────────────────────────────
// Inline scripts live in template strings, where a backslash is eaten before
// the browser ever sees it. Compile each one, so a broken regex fails here
// rather than silently killing drag-and-drop on the live board.
section("Page scripts compile; day strip; pins");
const shellFix = {
  active: "calendar", counts: {}, nav: { reviews: 0, queue: 0, recurring: 0, calendar: 0 }, lastIntake: null,
};
const pinnedRec = { ...sample[0]!, id: 7, category: "stories", status: "open", links: [], warnings: [],
  confidence: 1, batchNo: null, batchTarget: null, batchDone: 0, pinnedAt: new Date() } as unknown as
  Parameters<typeof sortRecords>[0][number];
const days = [-1, 0, 1].map((n) => ({ date: shiftDate("2026-09-28", n), list: n === 0 ? [pinnedRec] : [] }));
const plainRec = { ...pinnedRec, id: 8, pinnedAt: null, title: "Unpinned one" } as typeof pinnedRec;
const pages = {
  calendar: renderCalendar(shellFix, "2026-09", "posting", [], [], ["done"]),
  day: renderDay(shellFix, "2026-09-28", "posting", days),
  week: renderWeek(shellFix, "2026-09-27", "posting", days),
  recurring: renderRecurring(shellFix, { date: "2026-09-25", rows: [{ channel: "Specular DC", total: 5, done: 2, removed: 0 }] },
    { date: "2026-09-26", rows: [{ channel: "Specular DC", total: 0, done: 0, removed: 0 }] }, [], []),
  dashboard: renderDashboard({ ...shellFix, active: "dashboard" }, {
    stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
    byDay: [], grouped: new Map([["stories", [plainRec, pinnedRec]]]), channels: {},
    notices: [
      { kind: "revision", at: new Date(Date.now() - 60_000), record: plainRec },
      { kind: "overdue", at: new Date(Date.now() - 3_600_000), record: pinnedRec },
    ],
    seen: Date.now() - 120_000,
  }),
};
for (const [name, html] of Object.entries(pages)) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
  const broken = scripts.filter((src) => {
    try { new Function(src); return false; } catch { return true; }
  }).length;
  t(`${name}: ${scripts.length} inline scripts, none broken`, broken, 0);
}
t("day strip: one column per day", (pages.day.match(/class="daycol/g) ?? []).length, 3);
t("day strip: the clicked day is focused", /daycol[^"]*focus[^"]*" data-date="2026-09-28"/.test(pages.day), true);
const groupsHtml = pages.dashboard.slice(pages.dashboard.indexOf('class="catcols"'));
t("pinned row sits first in its own category", groupsHtml.indexOf("/r/7\"") < groupsHtml.indexOf("/r/8\""), true);
t("no separate pinned section", pages.dashboard.includes("group pinned"), false);
t("a pinned row offers unpin, an unpinned one pin", [pages.dashboard.includes("/r/7/unpin"), pages.dashboard.includes("/r/8/pin")], [true, true]);
t("pinned first survives any sort", sortRecords([plainRec, pinnedRec], "title", "asc").map((r) => r.id), [7, 8]);
t("bell: only what came after the last look is new", (pages.dashboard.match(/class="notice [a-z]+ new-item"/g) ?? []).length, 1);
t("bell: a filter for every kind, plus All", (pages.dashboard.match(/class="nf[^"]*" data-f="/g) ?? []).length, 6);
t("bell: kinds with nothing in them can't be picked", /data-f="upcoming"[^>]*disabled/.test(pages.dashboard), true);
t("bell: each kind has its own icon colour",
  [...new Set([...pages.dashboard.matchAll(/class="ico" style="--nc:([^"]+)"/g)].map((m) => m[1]))].length, 2);
t("bell: badge shows the unread count", /id="bellcount">1</.test(pages.dashboard), true);
t("status toggle: Complete shown off when hidden", /cattoggle st off[^>]*>[\s\S]*?Complete/.test(pages.calendar), true);
t("calendar links carry the status filter", pages.calendar.includes("&amp;st=done"), true);
t("week starts on Sunday", [weekStart("2026-09-23"), weekStart("2026-09-20"), weekStart("2026-09-26")], ["2026-09-20", "2026-09-20", "2026-09-20"]);

const batchRec = { ...pinnedRec, id: 9, pinnedAt: null, batchNo: 1, batchTarget: 5, batchDone: 2, code: null,
  title: "Specular FNAF Bits", channel: "Specular FNAF Bits", category: "bits", airDate: "2026-09-28" } as typeof pinnedRec;
const batchDay = renderDay(shellFix, "2026-09-28", "posting", [{ date: "2026-09-28", list: [batchRec] }]);
t("a batch card is its channel, no number", /class="t"[^>]*>(<i[^>]*><\/i>)?Specular FNAF Bits</.test(batchDay), true);
t("no batch numbers anywhere on it", /batch \d|SFB-\d/.test(batchDay), false);
t("a batch row keeps its full name and day in its tooltip", renderList(shellFix, "Queue", "", [batchRec]).includes("Specular FNAF Bits · 9/28/2026"), true);

// ── reading a Frame.io link, no API ───────────────────────────────────────
section("Frame.io links — what the page itself says");
t("file name → code, version, title", factsFromName("VIDEO-012_Walter_White_Build_Compound_V_v3_FINAL.mp4"),
  { code: "VIDEO-012", version: 3, title: "Walter White Build Compound V", channel: null, category: null });
t("underscored code and padded version", [factsFromName("VIDEO_008 deadpool jjk V03.mov").code, factsFromName("VIDEO_008 deadpool jjk V03.mov").version], ["VIDEO-008", 3]);
t("channel in the name, and out of the title", factsFromName("Specular FNAF - Gojo Ending v2.mov"),
  { code: null, version: 2, title: "Gojo Ending", channel: "Specular FNAF", category: "stories" });
t("an unknown prefix is not a code", factsFromName("MP4-2024 sunset.mp4").code, null);
t("a name that is only export words has no title", factsFromName("Export 1080p.mp4").title, null);

const legacy = `<html><head><title>Frame.io</title>
  <meta property="og:title" content="VIDEO-012_Walter_White_v3.mp4 | Frame.io">
  <meta property="og:description" content="Shared with you on Frame.io"></head><body></body></html>`;
t("preview tags give the name", readFramePage(legacy, "https://app.frame.io/reviews/abc/def").name, "VIDEO-012_Walter_White_v3.mp4");
t("the path gives the kind of link", readFramePage(legacy, "https://app.frame.io/reviews/abc/def").linkType, "review link");
const nextPage = `<html><head><title>Frame.io</title></head><body><script id="__NEXT_DATA__">
  {"props":{"asset":{"name":"Gojo_FNAF_Ending_V2.mov","type":"video"},"logo":"logo.png"}}</script></body></html>`;
t("with no preview tags, file names in the page", readFramePage(nextPage, "https://next.frame.io/share/x/view/y").name, "Gojo_FNAF_Ending_V2.mov");
t("the page's own images aren't taken for the video", readFramePage(nextPage, "https://next.frame.io/share/x").files, ["Gojo_FNAF_Ending_V2.mov"]);
t("a login wall reads as private", readFramePage("<title>Log in | Frame.io</title>", "https://accounts.frame.io/welcome").status, "private");
t("an expired link says so", readFramePage("<title>Frame.io</title><p>This review link has expired.</p>", "https://app.frame.io/reviews/x").status, "expired");

const fakeFetch = (pages: Record<string, { status: number; location?: string; body?: string }>) =>
  (async (url: string) => {
    const p = pages[url] ?? { status: 404 };
    return new Response(p.body ?? "", { status: p.status, headers: p.location ? { location: p.location } : {} });
  }) as unknown as typeof fetch;
const followed = await inspectFrameLink("https://f.io/7bu6f54B", fakeFetch({
  "https://f.io/7bu6f54B": { status: 301, location: "https://app.frame.io/reviews/tok/asset" },
  "https://app.frame.io/reviews/tok/asset": { status: 200, body: legacy },
}));
t("follows the short link to the review", [followed?.finalUrl, followed?.name], ["https://app.frame.io/reviews/tok/asset", "VIDEO-012_Walter_White_v3.mp4"]);
const offsite = await inspectFrameLink("https://f.io/zz", fakeFetch({ "https://f.io/zz": { status: 302, location: "https://evil.example/x" } }));
t("never follows a redirect off Frame.io", [offsite?.status, offsite?.name], ["unreadable", null]);
t("a 403 is a private link", (await inspectFrameLink("https://f.io/p", fakeFetch({ "https://f.io/p": { status: 403 } })))?.status, "private");
t("not Frame.io is not opened", await inspectFrameLink("https://youtube.com/watch?v=1", fakeFetch({})), null);

const bareLink = parseReview("https://f.io/7bu6f54B", new Date("2026-09-25T12:00:00Z"))!;
const merged = mergeFrame(bareLink, "https://f.io/7bu6f54B", followed!);
t("a bareLink link gets its title, code and version from the file",
  [merged.title, merged.code, merged.version], ["Walter White", "VIDEO-012", 3]);
t("the link is labelled with the file name", merged.links[0]!.label, "VIDEO-012_Walter_White_v3.mp4");
t("the which-project prompt is gone once the link names it", /which project/.test(merged.note ?? ""), false);
t("confidence rises when the name carries a code", merged.confidence >= 0.85, true);
const said = parseReview("Walter White v4 is up https://f.io/7bu6f54B", new Date("2026-09-25T12:00:00Z"))!;
t("what the message says wins over the file name", mergeFrame(said, "https://f.io/7bu6f54B", followed!).version, 4);

section("Dashboard columns");
const dashWith = (cols?: string[]) => renderDashboard({ ...shellFix, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [], grouped: new Map([["stories", [plainRec]]]), channels: {}, cols,
});
const visibleCols = (html: string) => [...html.matchAll(/class="catcol" data-cat="([a-z]+)"[^>]*?(hidden)?>/g)].filter((m) => !m[2]).map((m) => m[1]);
t("default columns: Gaming, Stories, Bits side by side", visibleCols(dashWith()), ["gaming", "stories", "bits"]);
t("the number ticked is the number of columns", /data-n="2" style="--n:2"/.test(dashWith(["stories", "reading"])), true);
t("columns keep the studio's order", visibleCols(dashWith(["movies", "gaming"])), ["gaming", "movies"]);
t("nothing ticked shows no columns, and says how to pick", [visibleCols(dashWith([])).length, /class="empty nocols">/.test(dashWith([]))], [0, true]);

section("Scripts — the scriptwriter's board, as data");
// A report produced by his own code (scriptcheck) from its sample threads.
const hisReport = JSON.parse(readFileSync(new URL("./fixtures/scriptcheck-report.json", import.meta.url), "utf8"));
const scriptRows = readReport(hisReport);
t("every script in his report is read", scriptRows.map((r) => [r.code, r.status]),
  [["VIDEO-003", "OVERDUE"], ["VIDEO-002", "SUBMITTED_LATE"], ["VIDEO-001", "SUBMITTED"]]);
t("air date and deadline come through", [scriptRows[0]!.airDate, scriptRows[0]!.deadline?.toISOString()], ["2026-09-25", "2026-09-20T03:59:00.000Z"]);
t("a delivered script carries its doc link", scriptRows[2]!.delivered.length > 0, true);
t("junk in the report is skipped, not thrown", readReport({ assignments: [null, 3, { status: "OVERDUE" }] }), []);
const board = renderScriptBoard(shellFix, "https://scripts.example", { rows: scriptRows, generatedAt: new Date(), error: null });
t("grouped by where each script stands", [...board.matchAll(/class="name">([^<]+)</g)].map((m) => m[1]), ["Overdue", "Delivered late", "Delivered"]);
t("the Scripts tab's own scripts compile", [...board.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
const cfg = config as { scriptsUrl: string; scriptsToken: string };
cfg.scriptsUrl = "https://scripts.example"; cfg.scriptsToken = "";
const locked = await fetchScriptReport((async () => new Response("Not found", { status: 404 })) as unknown as typeof fetch);
t("a password-protected board says which password to set", /SCRIPTS_TOKEN/.test(locked.error ?? ""), true);
cfg.scriptsUrl = ""; cfg.scriptsToken = "";
t("an address without https:// still works", siteAddress("scriptcheck-production.up.railway.app"), "https://scriptcheck-production.up.railway.app");
t("a pasted link keeps only the site", siteAddress(" \"https://his.up.railway.app/report.json?k=abc\" "), "https://his.up.railway.app");
t("nonsense is no address", siteAddress("not a url at all"), "");

section("Google Calendar feed");
const feedVideo = { ...plainRec, id: 41, code: "VIDEO-012", title: "Could Walter White Build Compound V? A long, long title, with commas; and semicolons",
  airDate: "2026-09-29", voDue: new Date("2026-09-24T03:59:00Z"), status: "open", category: "stories", channel: "Specular Verse", batchNo: null } as typeof plainRec;
const feedBatch = { ...feedVideo, id: 42, code: null, title: "Specular DC", channel: "Specular DC", category: "reading", batchNo: 1,
  airDate: "2026-09-25", voDue: null, deadline: new Date("2026-09-25T22:00:00Z") } as typeof plainRec;
const feedDone = { ...feedVideo, id: 43, status: "done" } as typeof plainRec;
const ics = buildIcs([feedVideo, feedBatch, feedDone], [feedVideo, feedBatch, feedDone], parseFeedOptions({}), "https://board.example", new Date("2026-09-25T12:00:00Z"));
const icsLines = ics.split("\r\n");
t("a calendar, CRLF line endings", [icsLines[0], ics.endsWith("END:VCALENDAR\r\n"), ics.includes("\n") && !ics.split("\r\n").some((l) => l.includes("\n"))], ["BEGIN:VCALENDAR", true, true]);
t("every line fits 75 octets", icsLines.every((l) => Buffer.byteLength(l) <= 75), true);
t("an air date is an all-day event", ics.includes("UID:air-41@specular-board") && ics.includes("DTSTART;VALUE=DATE:20260929") && ics.includes("DTEND;VALUE=DATE:20260930"), true);
t("a deadline sits at its time", ics.includes("UID:due-41@specular-board") && ics.includes("DTEND:20260924T035900Z"), true);
t("commas and semicolons are escaped", ics.replace(/\r\n /g, "").includes("A long\\, long title\\, with commas\; and semicolons"), true);
t("daily batches are left out unless asked", [ics.includes("UID:air-42"), buildIcs([feedBatch], [feedBatch], parseFeedOptions({ batches: "1" }), "").includes("UID:air-42")], [false, true]);
t("cleared work stays, ticked", ics.replace(/\r\n /g, "").includes("SUMMARY:✓ 🎬 Airs: VIDEO-012"), true);
t("an open deadline carries a reminder, a cleared one doesn't", (ics.match(/BEGIN:VALARM/g) ?? []).length, 1);
t("air dates or deadlines can be switched off", [buildIcs([feedVideo], [feedVideo], parseFeedOptions({ airs: "0" }), "").includes("UID:air-"), buildIcs([feedVideo], [feedVideo], parseFeedOptions({ due: "0" }), "").includes("UID:due-")], [false, false]);
t("only= limits categories", buildIcs([feedVideo], [feedVideo], parseFeedOptions({ only: "gaming" }), "").includes("BEGIN:VEVENT"), false);
(config as { sessionSecret: string }).sessionSecret ||= "test-secret";
t("the link's key is checked", [checkFeedKey(feedKey()), checkFeedKey("guess"), checkFeedKey(undefined)], [true, false, false]);
const calWithFeed = renderCalendar(shellFix, "2026-09", "posting", [], [], [], "https://board.example/calendar.ics?key=abc");
t("the subscribe panel's script compiles", [...calWithFeed.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);

section("Uploads — reading YouTube without a key");
t("a @handle", readChannelInput("@SpecularStudios"), { page: "https://www.youtube.com/@SpecularStudios" });
t("a channel page link, no https", readChannelInput("youtube.com/@SpecularFNAF/videos"), { page: "https://www.youtube.com/@SpecularFNAF/videos" });
t("a /channel/ link is the id outright", readChannelInput("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"), { id: "UCabcdefghijklmnopqrstuv" });
t("not YouTube is refused", readChannelInput("https://vimeo.com/specular"), null);
t("a page gives up its channel id", channelIdFromPage('<link rel="canonical" href="https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv">'), "UCabcdefghijklmnopqrstuv");
const atom = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
 <title>Uploads from Specular FNAF</title><author><name>Specular FNAF</name></author>
 <entry><id>yt:video:aaaaaaaaaaa</id><yt:videoId>aaaaaaaaaaa</yt:videoId><title>Every FNAF Ending, Ranked &amp; Explained</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=aaaaaaaaaaa"/><published>2026-09-22T16:00:00+00:00</published>
  <media:group><media:community><media:statistics views="48211"/></media:community></media:group></entry>
 <entry><yt:videoId>bbbbbbbbbbb</yt:videoId><title>fnaf short</title>
  <link rel="alternate" href="https://www.youtube.com/shorts/bbbbbbbbbbb"/><published>2026-09-23T16:00:00+00:00</published></entry>
</feed>`;
const parsed = parseFeed(atom);
t("a feed's videos, titles decoded, views read", [parsed.title, parsed.videos[0]!.title, parsed.videos[0]!.views], ["Specular FNAF", "Every FNAF Ending, Ranked & Explained", 48211]);
const longForm = await readLongFormFeed("UCabcdefghijklmnopqrstuv", (async () => new Response(atom)) as unknown as typeof fetch);
t("Shorts never count", longForm.videos.map((v) => v.videoId), ["aaaaaaaaaaa"]);
let asked = "";
await readLongFormFeed("UCabcdefghijklmnopqrstuv", (async (u: string) => { asked ||= String(u); return new Response(atom); }) as unknown as typeof fetch);
t("it asks for the long-form-only list first", asked, "https://www.youtube.com/feeds/videos.xml?playlist_id=UULFabcdefghijklmnopqrstuv");

section("Uploads — the four-day pace");
const at = (d: string, hhmm = "12:00") => new Date(`${d}T${hhmm}:00-04:00`);
const nowET = at("2026-09-25", "15:00");
const steady = cadenceFor("A", ["2026-09-09", "2026-09-13", "2026-09-17", "2026-09-21", "2026-09-24"].map((d) => at(d)), nowET);
t("a day ago: on pace, next due in three", [steady.state, steady.daysSince, steady.nextDue], ["on-pace", 1, "2026-09-28"]);
t("five on-time uploads in a row", steady.streak, 5);
const due = cadenceFor("B", [at("2026-09-21")], nowET);
t("four days ago: due today", [due.state, due.behindBy], ["due", 0]);
const late = cadenceFor("C", [at("2026-09-10"), at("2026-09-18")], nowET);
t("seven days ago: behind by three, streak broken", [late.state, late.behindBy, late.streak], ["behind", 3, 0]);
t("an eight-day gap is counted and not on time", [late.longestGap90, late.onTime90], [8, 0]);
t("11 pm in New York is still that day", cadenceFor("D", [new Date("2026-09-22T03:30:00Z")], nowET).lastDay, "2026-09-21");
t("nothing yet", cadenceFor("E", [], nowET).state, "none");
t("two uploads the same day are one day's posting", cadenceFor("F", [at("2026-09-24", "09:00"), at("2026-09-24", "18:00")], nowET).gaps.length, 0);

const upPage = renderUploads(shellFix, {
  channels: ["Specular Studios", "Specular FNAF"],
  links: [{ channel: "Specular Studios", input: "@x", youtubeId: "UCabcdefghijklmnopqrstuv", title: "Specular Studios", error: null, checkedAt: new Date() }],
  uploads: [{ videoId: "aaaaaaaaaaa", channel: "Specular Studios", title: "A <b>video</b>", publishedAt: at("2026-09-22"), url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", views: 10 }],
  cadence: [cadenceFor("Specular Studios", [at("2026-09-22")], nowET), cadenceFor("Specular FNAF", [], nowET)],
  range: 90, hasKey: false,
}, nowET);
t("the Uploads page's script compiles", [...upPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
t("a video title is escaped", upPage.includes("A <b>video</b>"), false);
t("an unlinked channel asks for its link", upPage.includes("No link yet"), true);

section("Views — breakouts and underperformers");
const H = 3_600_000;
const t0 = new Date("2026-08-01T16:00:00Z");
// A video whose views grow as n * sqrt(hours), snapshotted hourly from publish.
const grow = (id: string, days: number, n: number, trackedFromHour = 1, ageHours = 400): VideoViews => {
  const publishedAt = new Date(t0.getTime() + days * 86_400_000);
  const snapshots = [];
  for (let h = trackedFromHour; h <= ageHours; h += 1) snapshots.push({ at: new Date(publishedAt.getTime() + h * H), views: Math.round(n * Math.sqrt(h)) });
  return { videoId: id, channel: "Specular FNAF", publishedAt, views: snapshots.at(-1)?.views ?? null, snapshots };
};
const vA = grow("a", 0, 1000);
t("views at 24 hours, from a snapshot", viewsAtAge(vA, 24), Math.round(1000 * Math.sqrt(24)));
t("between snapshots, interpolated", viewsAtAge({ ...vA, snapshots: [{ at: new Date(vA.publishedAt.getTime() + 20 * H), views: 100 }, { at: new Date(vA.publishedAt.getTime() + 28 * H), views: 180 }] }, 24), 140);
t("tracking began too late for that age: unknown", viewsAtAge(grow("late", 0, 1000, 300), 24), null);

const history = [grow("h1", 0, 1000), grow("h2", 4, 1100), grow("h3", 8, 900), grow("h4", 12, 1000)];
const nowPerf = new Date(t0.getTime() + 30 * 86_400_000);
const hit = grow("hit", 16, 3200, 1, (nowPerf.getTime() - t0.getTime()) / H - 16 * 24);
const hitScore = scoreVideo(hit, [...history, hit], nowPerf)!;
t("3.2× the channel at 7 days is a breakout", [hitScore.verdict, hitScore.basis, formatMultiple(hitScore.multiple)], ["breakout", "at 7 days", "3.2×"]);
const flop = grow("flop", 16, 400, 1, 14 * 24);
t("0.4× is underperforming", scoreVideo(flop, [...history, flop], nowPerf)!.verdict, "under");
const fresh = { ...grow("fresh", 16, 2500, 1, 10), publishedAt: new Date(nowPerf.getTime() - 10 * H) };
fresh.snapshots = fresh.snapshots.map((sn, i) => ({ at: new Date(fresh.publishedAt.getTime() + (i + 1) * H), views: sn.views }));
t("ten hours old, judged against the others at ten hours", [scoreVideo(fresh, [...history, fresh], nowPerf)?.basis, scoreVideo(fresh, [...history, fresh], nowPerf)?.verdict], ["so far", "breakout"]);
t("too young to judge", scoreVideo({ ...fresh, publishedAt: new Date(nowPerf.getTime() - 2 * H) }, history, nowPerf), null);
t("fewer than three to compare with: no verdict", scoreVideo(hit, [history[0]!, hit], nowPerf), null);
// Day one: no snapshots, only lifetime views on videos two weeks and older.
const bareVid = (id: string, day: number, views: number): VideoViews => ({ videoId: id, channel: "Specular Law", publishedAt: new Date(t0.getTime() + day * 86_400_000), views, snapshots: [] });
const law = [bareVid("l1", 0, 50_000), bareVid("l2", 4, 60_000), bareVid("l3", 8, 40_000), bareVid("l4", 12, 150_000)];
t("with no snapshots yet, lifetime views on older videos", [scoreVideo(law[3]!, law, nowPerf)?.basis, formatMultiple(scoreVideo(law[3]!, law, nowPerf)!.multiple)], ["lifetime", "3.0×"]);
t("a channel's typical views", typicalViews(law, nowPerf), { views: 55_000, basis: "lifetime" });
t("views read compactly", [compactViews(950), compactViews(184_203), compactViews(1_250_000)], ["950", "184K", "1.3M"]);
t("the Discord alert says what, how much and against what",
  breakoutMessage({ channel: "Specular FNAF", title: "Every FNAF Ending", url: "https://youtu.be/x", views: 184203, multiple: 3.42, basis: "at 24 hours", ageHours: 30 }),
  "🔥 **Breakout on Specular FNAF**\n**Every FNAF Ending** — 184,203 views after 30 hours, **3.4×** the channel's usual at 24 hours.\nhttps://youtu.be/x");

section("Ideas — what the numbers say works");
t("formats", ["What If Gojo Joined The Avengers?", "Could Deadpool Survive The Hunger Games?", "Could Walter White Build Compound V?", "Every FNAF Ending, Ranked", "Goku vs Superman", "How Does Goku Actually Train?", "Spider-Man And The Webs"].map(formatOf),
  ["What If", "Could … Survive", "Could / Would …", "Ranked", "Versus", "How …", "Other"]);
t("subjects: the names, not the capitalised words", subjectsOf("Could Walter White Build Compound V?"), ["Walter White", "Compound V"]);
t("possessives dropped", subjectsOf("How Do Spider-Man's Webs Work?"), ["Spider-Man", "Webs"]);
t("acronyms count", subjectsOf("What If FNAF Was Real?"), ["FNAF"]);
t("numbers aren't subjects", subjectsOf("Studios Bits short 34-3 in 2024"), ["Studios Bits"]);
const idea = (title: string, multiple: number, daysAgo: number): IdeaVideo =>
  ({ title, channel: "Specular FNAF", publishedAt: new Date(Date.UTC(2026, 8, 25) - daysAgo * 86_400_000), url: "", multiple });
const pool = [
  idea("What If Gojo Joined The Avengers?", 2.4, 80), idea("What If Gojo Fought Thanos?", 2.0, 70), idea("What If Deadpool Was In FNAF?", 1.6, 30),
  idea("What If Batman Joined The Seven?", 1.4, 20), idea("Could Batman Survive Hogwarts?", 0.8, 40), idea("Could Deadpool Survive The Purge?", 0.9, 35),
  idea("Could Goku Survive Squid Game?", 0.7, 25), idea("Every FNAF Ending, Ranked", 0.6, 15), idea("Every Batman Villain, Ranked", 0.5, 10),
  idea("Every Marvel Movie, Ranked", 0.7, 5), idea("Gojo vs Sukuna", 1.0, 3),
];
const analysis = analyzeIdeas(pool, new Date(Date.UTC(2026, 8, 25)));
t("What If beats the usual, Ranked lags", [analysis.formats[0]?.key, analysis.formats.at(-1)?.key], ["What If", "Ranked"]);
t("Gojo is the strongest subject", analysis.subjects[0]?.key, "Gojo");
t("a proven hit two months back suggests a follow-up", analysis.suggestions.some((x) => x.kind === "sequel" && x.idea.includes("Gojo Joined The Avengers")), true);
const good = checkIdea("What If Gojo Joined The X-Men?", analysis);
const bad = checkIdea("Every Naruto Villain, Ranked", analysis);
t("a What If with Gojo checks out above usual", good.predicted > 1.15, true);
t("a Ranked list checks out below", bad.predicted < 0.9, true);
t("the checker says why", good.reasons.map((r) => r.label), ["What If format", "Gojo"]);
t("too few judged videos: no conclusions", analyzeIdeas(pool.slice(0, 4)).formats, []);

section("Daily targets — Bits and Reading");
const dAt = (d: string, hh = 12) => new Date(`${d}T${String(hh).padStart(2, "0")}:00:00-04:00`);
const five = (d: string) => [9, 11, 13, 15, 17].map((h) => dAt(d, h));
const dc = dailyFor("Specular DC", [...five("2026-09-21"), ...five("2026-09-22"), ...five("2026-09-23"), ...five("2026-09-24").slice(0, 3), dAt("2026-09-25", 9), dAt("2026-09-25", 10)], 5, dAt("2026-09-25", 15));
t("today so far, against five", [dc.today, dc.perDay], [2, 5]);
t("streak broken by yesterday's three", dc.streak, 0);
t("three of four full days on target", dc.hit30, 0.75);
const kay = dailyFor("Specular & Kay Bits", [dAt("2026-09-23"), dAt("2026-09-24"), dAt("2026-09-25", 9)], 1, dAt("2026-09-25", 15));
t("a one-a-day channel: on target today, three days running", [kay.today >= kay.perDay, kay.streak], [true, 3]);
const shortAtom = atom.replace("https://www.youtube.com/watch?v=aaaaaaaaaaa", "https://www.youtube.com/shorts/aaaaaaaaaaa");
let firstAsk = "";
const shorts = await readShortsFeed("UCabcdefghijklmnopqrstuv", (async (u: string) => { firstAsk ||= String(u); return new Response(atom); }) as unknown as typeof fetch);
t("Shorts: the Shorts-only list first", firstAsk, "https://www.youtube.com/feeds/videos.xml?playlist_id=UUSHabcdefghijklmnopqrstuv");
t("everything on that list is a Short", shorts.videos.every((v) => v.url.includes("/shorts/")), true);
const fallback = await readShortsFeed("UCabcdefghijklmnopqrstuv", (async (u: string) => (String(u).includes("UUSH") ? new Response("", { status: 404 }) : new Response(shortAtom))) as unknown as typeof fetch);
t("without that list, long-form videos are left out", fallback.videos.map((v) => v.videoId), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);
process.exit(fail > 0 ? 1 : 0);
