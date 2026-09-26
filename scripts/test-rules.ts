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
import { cadenceFor, dailyFor, usualGap } from "../src/web/cadence.js";
import { analyzeIdeas, checkIdea, formatOf, subjectsOf, type IdeaVideo } from "../src/web/ideas.js";
import { compactViews, formatMultiple, scoreVideo, typicalViews, viewsAtAge, type VideoViews } from "../src/web/performance.js";
import { breakoutMessage } from "../src/jobs/breakouts.js";
import { channelHealth, postingSlots, scoreShort, scoreShorts, tierOf, typicalShort } from "../src/web/shorts-perf.js";
import { factsFromName, inspectFrameLink, mergeFrame, readFramePage } from "../src/parse/frameio.js";
import { relativeDay, shortsDay, usDate } from "../src/parse/derive.js";
import { batchDay as ownDay } from "../src/jobs/batches.js";
import { everyFor, describeTarget, isOwnPace, ownPaceChannels, setOwnPaces } from "../src/web/targets.js";
import { episodeOf, gamingSeries, nextUp, seriesKey, type SeriesVideo } from "../src/web/gaming/series.js";
import { isLongFormRecurring } from "../src/catalog.js";
import { boardOpenings, corpus, setBoardScripts, splitScript } from "../src/web/stories/corpus.js";
import { docId, readDoc } from "../src/web/gdoc.js";
import { formatOfTitle } from "../src/web/stories/formats.js";
import { readTitle } from "../src/web/stories/lore.js";
import { blueprint } from "../src/web/stories/blueprint.js";
import { checkDraft } from "../src/web/stories/check.js";
import { channelLab, keyOfTitle, labIdeas, publicMatch } from "../src/web/stories/lab.js";
import { HERO_BY_ID, WORLD_BY_ID, HEROES, WORLDS, POWERS } from "../src/web/stories/lore.js";
import { DICE_HEROES, DICE_POWERS, DICE_SHAPES, DICE_TARGETS, DICE_WORLDS } from "../src/web/stories/dice.js";
import { SHAPES, applyAdditions, currentAdditions } from "../src/web/stories/added.js";
import { diceCard, diceLeft, rollDice } from "../src/web/stories/roll.js";
import { renderStoryLab, renderPaused, renderSettings, renderRevisions, RAIL_ITEMS } from "../src/web/page.js";
import { cardRows } from "../src/bot/render.js";
import { cascadeText, planCascade } from "../src/web/cascade.js";
import { apart, avatarAt, avatarColour, avatarFromPage, deltaE, sampledChannels } from "../src/jobs/avatars.js";
import { applyChannelColours, catalogColour } from "../src/catalog.js";
import jpegJs from "jpeg-js";
import { channelPauseButton, esc, renderRecord, renderWhatsNew } from "../src/web/page.js";
import { RELEASES, releaseNotices } from "../src/web/changelog.js";
import { channelGaps, uploadGaps } from "../src/web/gaps.js";
import { scriptFor, setScriptIndex } from "../src/web/scriptindex.js";
import { frameioIsRevision, isAssignmentPost } from "../src/parse/classify.js";
import { commentsFromFrameio, ownNotes, parsePasted } from "../src/revisions/comments.js";
import { scoreRevision, severityOf, themeOf } from "../src/revisions/score.js";
import { channelHistories, streakOf } from "../src/revisions/history.js";
import { summarize } from "../src/revisions/summarize.js";
import { videoKey } from "../src/db/revisions.js";
import { NeighbourIndex, scoreIdea, writeNext } from "../src/web/stories/writenext.js";
import { indexPublic } from "../src/web/stories/lab.js";

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

t("five categories, Stories first", CATEGORIES.map((c) => c.id), ["stories", "gaming", "reading", "bits", "movies"]);
t("channels are listed Stories first too", [...new Set(CHANNELS.map((c) => c.category))], ["stories", "gaming", "reading", "bits", "movies"]);
t("31 channels", CHANNELS.length, 31);
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
t("thirteen recurring Shorts channels", CHANNELS.filter((c) => c.recurring && c.category !== "movies").length, 13);
t("a reading channel's day is five uploads", CHANNELS.filter((c) => c.category === "reading").map((c) => c.recurring?.units), [5, 5, 5, 5, 5]);
t(
  "bits uploads per channel",
  Object.fromEntries(CHANNELS.filter((c) => c.category === "bits").map((c) => [c.name, c.recurring?.units])),
  {
    "Specular Studios Bits": 5, "Specular Anime Bits": 5, "Specular FNAF Bits": 5, "Specular Animation Bits": 5,
    "Specular Gaming Bits": 5, "Specular Undertale Bits": 5, "Specular Pokemon Bits": 5, "Specular & Kay Bits": 1,
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
t("every channel colour is different", new Set(CHANNELS.map((c) => c.color.toUpperCase())).size, CHANNELS.length);
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
t("category colours are unchanged", Object.fromEntries(CATEGORIES.map((c) => [c.id, c.color])), { stories: "#4A5CD4", gaming: "#35986A", reading: "#CE7118", bits: "#AC63C8", movies: "#A63F66" });

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
t("bell: a filter for every kind, plus All", (pages.dashboard.match(/class="nf[^"]*" data-f="/g) ?? []).length, 9);
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
const dashWith = (cols?: string[], order?: string[], hideParts?: string[]) => renderDashboard({ ...shellFix, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [], grouped: new Map([["stories", [plainRec]], ["unknown", [{ ...plainRec, id: 30, category: "unknown", channel: null }]]]),
  channels: {}, cols, order, hideParts,
});
const visibleCols = (html: string) => [...html.matchAll(/class="catcol" data-cat="([a-z]+)"[^>]*?(hidden)?>/g)].filter((m) => !m[2]).map((m) => m[1]);
t("default columns: Stories, Gaming, Bits side by side", visibleCols(dashWith()), ["stories", "gaming", "bits"]);
t("the number ticked is the number of columns", /data-n="2" style="--n:2"/.test(dashWith(["stories", "reading"])), true);
t("columns keep the studio's order until they're rearranged", visibleCols(dashWith(["movies", "gaming", "stories"])), ["stories", "gaming", "movies"]);
t("rearranged, they go in that order", visibleCols(dashWith(["movies", "gaming", "stories"], ["movies", "stories", "reading", "gaming", "bits"])), ["movies", "stories", "gaming"]);
t("a saved order missing a category still shows it, at the end", visibleCols(dashWith(["stories", "bits", "gaming"], ["bits", "stories"])), ["bits", "stories", "gaming"]);
t("the Columns menu lists them in the same order", [...dashWith(undefined, ["bits", "stories"]).matchAll(/class="colopt" data-cat="([a-z]+)"/g)].map((m) => m[1]).slice(0, 2), ["bits", "stories"]);
t("every column has a grip to drag it by", (dashWith().match(/class="grip" draggable="true"/g) ?? []).length, 5);
t("Unsorted and Channels show until switched off", [/data-part="unsorted">/.test(dashWith()), /class="group dashpart" data-part="channels">/.test(dashWith())], [true, true]);
t("…and hide when they are", [/data-part="unsorted" hidden/.test(dashWith(undefined, undefined, ["unsorted", "channels"])), /data-part="channels" hidden/.test(dashWith(undefined, undefined, ["unsorted", "channels"]))], [true, true]);
t("…with their boxes unticked to match", /data-part="channels">/.test(dashWith(undefined, undefined, ["channels"]).slice(dashWith(undefined, undefined, ["channels"]).indexOf('class="colparts"'))), true);
t("the dashboard's column script compiles", [...dashWith().matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
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
const sequel = analysis.suggestions.find((x) => x.kind === "sequel" && x.details.source?.title === "What If Gojo Joined The Avengers?");
t("a proven hit two months back suggests a follow-up", Boolean(sequel), true);
t("its drafts are real titles, not templates", sequel!.details.drafts.length > 0 && sequel!.details.drafts.every((d) => !d.includes("…")), true);
t("a follow-up keeps its lead and changes something", sequel!.details.drafts.every((d) => d.includes("Gojo") && d !== "What If Gojo Joined The Avengers?"), true);
t("a name only takes a slot it has held — never \"Joined The Gojo\"", analysis.suggestions.flatMap((x) => x.details.drafts).some((d) => /The (Gojo|Batman|Deadpool)\b/.test(d)), false);
t("no two suggestions lead with the same draft", new Set(analysis.suggestions.map((x) => x.idea)).size, analysis.suggestions.length);
t("a suggestion shows the numbers it rests on", sequel!.details.evidence.map((e) => e.label), ["What If format", "Gojo"]);
t("evidence lists the videos behind it, best first", analysis.formats[0]!.videos[0]!.title, "What If Gojo Joined The Avengers?");
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

section("Bits and Reading days run 3 AM to 3 AM");
t("2:59 AM ET belongs to the day before", shortsDay(new Date("2026-09-26T02:59:00-04:00")), "2026-09-25");
t("3:00 AM ET starts the new day", shortsDay(new Date("2026-09-26T03:00:00-04:00")), "2026-09-26");
t("in winter too (EST)", shortsDay(new Date("2026-12-10T02:30:00-05:00")), "2026-12-09");
section("Specular — one long-form video a day");
const mainCh = CHANNELS.find((c) => c.name === "Specular")!;
const gamingBits = CHANNELS.find((c) => c.name === "Specular Gaming Bits")!;
t("Specular has a daily long-form batch", [isLongFormRecurring(mainCh), mainCh.recurring?.units, mainCh.recurring?.perDay], [true, 1, 1]);
t("Shorts channels aren't long-form", isLongFormRecurring(gamingBits), false);
t("at 1:30 AM ET Specular is already on the new day", ownDay(mainCh, new Date("2026-09-26T01:30:00-04:00")), "2026-09-26");
t("…while the Shorts are still on the day before", ownDay(gamingBits, new Date("2026-09-26T01:30:00-04:00")), "2026-09-25");
t("uploads: Specular one a day, Sleep untargeted, Stories every four", [everyFor("Specular"), everyFor("Specular Sleep"), everyFor("Specular FNAF")], [1, null, 4]);
t("Movies says so", describeTarget("movies").includes("Specular: one a day"), true);
const recLF = renderRecurring(shellFix, {
  date: "2026-09-25",
  rows: [
    { channel: "Specular Gaming Bits", total: 5, done: 2, removed: 0 },
    { channel: "Specular", total: 1, done: 0, removed: 0, date: "2026-09-26" },
  ],
}, { date: "2026-09-27", rows: [] }, [], [], 90);
t("the Recurring page marks it long-form, on its own day", [recLF.includes('class="lfbadge"'), recLF.includes("video due"), recLF.includes('name="date" value="2026-09-26"'), recLF.includes("long-form · midnight to midnight")], [true, true, true, true]);

const lateNight = dailyFor("Specular DC", [new Date("2026-09-25T20:00:00-04:00"), new Date("2026-09-26T01:30:00-04:00")], 5, new Date("2026-09-26T02:00:00-04:00"));
t("a 1:30 AM Short counts toward yesterday, which is still 'today' until 3", [lateNight.today, lateNight.counts.get("2026-09-25")], [2, 2]);
const after3 = dailyFor("Specular DC", [new Date("2026-09-26T01:30:00-04:00")], 5, new Date("2026-09-26T09:00:00-04:00"));
t("after 3 AM it's a new day with nothing up yet", after3.today, 0);
t("Stories still turn over at midnight", cadenceFor("Specular FNAF", [new Date("2026-09-26T01:30:00-04:00")], new Date("2026-09-26T09:00:00-04:00")).lastDay, "2026-09-26");

section("Shorts outliers — Bits and Reading");
t("tiers by typical spreads", [3.2, 2.1, 0.4, -1.3, -2.5].map(tierOf), ["viral", "breakout", "normal", "soft", "flop"]);
const sNow = new Date("2026-09-25T18:00:00-04:00");
let sSeed = 3;
const noise = () => { sSeed = (sSeed * 16807) % 2147483647; return sSeed / 2147483647; };
// Seventy ordinary Shorts, five a day, views ~ 4,000·√hours with honest noise.
const shortAt = (id: string, hoursAgo: number, scale: number): VideoViews => {
  const publishedAt = new Date(sNow.getTime() - hoursAgo * H);
  const snaps = [];
  for (let h = 1; h <= Math.min(hoursAgo, 200); h += h < 48 ? 1 : 6) snaps.push({ at: new Date(publishedAt.getTime() + h * H), views: Math.round(scale * Math.sqrt(h)) });
  return { videoId: id, channel: "Specular DC", publishedAt, views: snaps.at(-1)?.views ?? 0, snapshots: snaps };
};
const ordinary = Array.from({ length: 70 }, (_, i) => shortAt(`o${i}`, 30 + i * 4.8, 4000 * (0.75 + noise() * 0.5)));
const viral = shortAt("viral", 20, 4000 * 12);
const flopShort = shortAt("flop", 26, 4000 * 0.12);
const young = shortAt("young", 2, 4000 * 1.0);
const dcAll = [...ordinary, viral, flopShort, young];
const vs = scoreShort(viral, dcAll, sNow)!;
t("a Short at 12× the usual is viral, near the top", [vs.tier, vs.basis, vs.percentile >= 98], ["viral", "at 6 hours", true]);
t("its multiple (about 12×) is read against sixty", [vs.multiple > 10 && vs.multiple < 15, vs.sample], [true, 60]);
t("a Short at an eighth of the usual is a flop", scoreShort(flopShort, dcAll, sNow)!.tier, "flop");
t("two hours old: judged at one hour", scoreShort(young, dcAll, sNow)!.basis, "at 1 hour");
t("an ordinary Short is normal", scoreShort(ordinary[5]!, dcAll, sNow)!.tier, "normal");
t("fewer than eight to compare with: no verdict", scoreShort(viral, [...ordinary.slice(0, 5), viral], sNow), null);
const allScores = scoreShorts(dcAll, sNow);
const hDC = channelHealth("Specular DC", dcAll, allScores, sNow);
t("the week's health counts its outliers", [hDC.counts.viral, hDC.counts.flop], [1, 1]);
// Tracking just switched on: no snapshots at all, only each Short's views now.
const unsnapped = (v: VideoViews): VideoViews => ({ ...v, snapshots: [] });
const untracked = [...ordinary.map(unsnapped), unsnapped(shortAt("old-hit", 100, 4000 * 12)), unsnapped(shortAt("new", 20, 4000))];
const oldHit = scoreShort(untracked.find((v) => v.videoId === "old-hit")!, untracked, sNow);
t("no snapshots yet: a Short 3+ days old is scored on its views now", [oldHit?.basis, oldHit?.tier], ["lifetime", "viral"]);
t("no snapshots yet: a day-old Short waits", scoreShort(untracked.find((v) => v.videoId === "new")!, untracked, sNow), null);
t("typical Short views without snapshots", typicalShort(untracked, sNow)?.basis, "lifetime");
t("typical Short views at 3 days once tracked", typicalShort(dcAll, sNow)?.basis, "at 3 days");
const slotVideos = [...Array.from({ length: 6 }, (_, i) => ({ ...ordinary[i]!, videoId: `m${i}`, publishedAt: new Date(`2026-09-2${i % 5}T09:30:00-04:00`) })),
  ...Array.from({ length: 6 }, (_, i) => ({ ...ordinary[i]!, videoId: `e${i}`, publishedAt: new Date(`2026-09-2${i % 5}T20:30:00-04:00`) }))];
const slotScores = new Map(slotVideos.map((v) => [v.videoId, { multiple: v.videoId.startsWith("m") ? 2 : 0.6 } as never]));
t("posting slots, best first", postingSlots(slotVideos, slotScores).map((sl) => sl.label), ["9 AM–12 PM", "6 PM–9 PM"]);

section("Story Lab — learned from the Stories scripts");
const cps = corpus();
t("the corpus loads every script", cps.length >= 90, true);
t("most scripts are 8–10 parts", cps.filter((x) => x.metrics.parts >= 8 && x.metrics.parts <= 10).length > cps.length * 0.7, true);
t("formats read from titles", ["What If Gojo Was In The Boys?", "Could Spider Man Survive The Last Of Us", "Could L Catch Batman", "Gojo VS Superman", "What If Guts Had The Venom Symbiote", "What If Thor Was Reborn With His Memories", "What If William Afton Never Had Children", "What If YOU Found The Death Note"].map(formatOfTitle), ["insert", "survive", "hunt", "versus", "power", "reborn", "divergence", "you"]);
const rt = readTitle("What If Ben 10 Was In Invincible?");
t("a name that's a hero and a world is the world when it comes second", [rt.heroes.map((h) => h.id), rt.worlds.map((w) => w.id)], [["ben10"], ["invincible"]]);
const rt2 = readTitle("Could Invincible Survive Final Destination?");
t("…and the hero when it leads", [rt2.heroes.map((h) => h.id), rt2.worlds.map((w) => w.id)], [["mark"], ["finaldest"]]);
t("Springtrap eating Homelander counts as Afton in The Boys", keyOfTitle("What If Springtrap Ate Homelander On Accident").pairs.includes("afton|boys"), true);
const split = splitScript("[INTRO]\nHe would notice.\n**PART 1\nFirst beat here.\n[PART 2 — The Test] Second beat.\nOUTRO\nDone.");
t("drafts split on every header style", split.map((x) => x.name), ["INTRO", "PART 1", "PART 2", "OUTRO"]);
const bpG = blueprint({ format: "insert", hero: "gojo", world: "invincible" })!;
t("a blueprint has the format's ten beats", bpG.parts.length, 10);
t("its title and version lock come from the lore", [bpG.title, bpG.versionLock.startsWith("Gojo at his peak")], ["What If Gojo Was In Invincible?", true]);
t("the first clash names what wasn't used", /hasn't shown .*Unlimited Void/.test(bpG.parts[5]!.plan), true);
t("the final fight climbs the whole ladder", bpG.parts[8]!.plan.includes("Infinity → the Six Eyes → Blue → Red → Hollow Purple"), true);
t("every part is modelled on a real script", bpG.parts.every((x) => x.ref && x.ref.title === "What If The Avengers Were In Invincible"), true);
t("the intro ends on the hook, not a question", /attitude would change once he sees what Infinity actually does\.$/.test(bpG.intro.at(-1)!), true);
const bpS = blueprint({ format: "survive", hero: "gojo", world: "tlou" })!;
t("a survival blueprint climbs the setting's threat tiers", ["Stalkers", "Clickers", "Bloaters"].every((x) => bpS.parts.some((p) => p.name.includes(x))), true);
t("…and meets the canon cast", bpS.parts.some((p) => p.plan.includes("Joel and Ellie")), true);
t("a blueprint without its world is refused", blueprint({ format: "insert", hero: "gojo" }), null);
const gojoBoys = cps.find((x) => x.title === "What If Gojo Was In The Boys")!;
const drafted = gojoBoys.sections.map((x) => `${x.name}\n${x.paras.join("\n")}`).join("\n");
const chk = checkDraft(drafted, "What If Gojo Was In The Boys?")!;
t("a real script checks out: the right part count", chk.findings.some((x) => x.level === "good" && /parts$/.test(x.label)), true);
t("it knows when Homelander's big part lands", chk.findings.some((x) => x.label.startsWith("Homelander peaks")), true);
t("the ultimate is saved for the end", chk.findings.some((x) => x.label === "Unlimited Void saved for the end"), true);
const flat = checkDraft(Array.from({ length: 60 }, () => "Gojo punched Homelander very hard and then walked away from the building.").join(" "), "What If Gojo Was In The Boys?")!;
t("a draft with no parts is told to split", flat.findings.some((x) => x.level === "fix" && x.label === "No parts"), true);
t("…and that it reads as narration", flat.findings.some((x) => x.label === "Reads as narration"), true);
const labs = labIdeas([], new Date("2026-09-25"));
t("ideas never repeat something written", labs.some((x) => x.title === "What If Gojo Was In The Boys?" || x.title === "What If Yuji Was In The Boys?"), false);
t("ideas are spread across heroes", Math.max(...[...new Set(labs.map((x) => x.hero?.id))].map((h) => labs.filter((x) => x.hero?.id === h).length)) <= 2, true);
const withData = labIdeas(
  Array.from({ length: 8 }, (_, i) => ({ title: i % 2 ? `What If Deadpool Was In The Boys Part ${i}` : `What If Gojo Joined The Avengers ${i}`, multiple: i % 2 ? 3 : 0.4, publishedAt: new Date("2026-06-01") })),
  new Date("2026-09-25"),
);
const deadpoolIdea = withData.find((x) => x.hero?.id === "deadpool");
t("a hero whose uploads do well rises", deadpoolIdea ? deadpoolIdea.reasons.some((r) => r.text.startsWith("Deadpool:") && r.lift > 1) : false, true);
const pubVids = [
  { title: "Could Spider-Man Survive World War Z", url: "https://youtu.be/a", channel: "Specular Studios" },
  { title: "What If Iron Man Was In The Boys?", url: "https://youtu.be/b", channel: "Specular Gaming" },
  { title: "What If YOU Were In Chainsaw Man?", url: "https://youtu.be/c", channel: "Specular FNAF" },
];
const heldOut: typeof pubVids = [];
const labsPub = labIdeas([], new Date("2026-09-25"), 60, pubVids, heldOut);
t("a public video's idea is never suggested", labsPub.some((x) => x.title === "What If Iron Man Was In The Boys?"), false);
t("…in any format: the same character and world is the same idea", labsPub.some((x) => x.hero?.id === "spiderman" && x.world?.id === "wwz"), false);
t("…from any channel, and for YOU stories too", labsPub.some((x) => x.format === "you" && x.world?.id === "csm"), false);
t("the page can say what was held back", heldOut.some((v) => v.url === "https://youtu.be/b"), true);
t("a reworded title is still the same video", publicMatch({ hero: HERO_BY_ID.get("spiderman"), world: WORLD_BY_ID.get("wwz"), title: "How Long Would Spider-Man Last In World War Z?" }, pubVids)?.url, "https://youtu.be/a");
t("a different pairing is fine", publicMatch({ hero: HERO_BY_ID.get("spiderman"), world: WORLD_BY_ID.get("re"), title: "Could Spider-Man Survive Resident Evil?" }, pubVids), null);
t("titles the lore can't read are caught by their words", publicMatch({ title: "What If Spider-Man Had Roblox Physics?" }, [{ title: "What If Spider Man Had Roblox Physics", url: "u", channel: "c" }])?.url, "u");
const labPage = renderStoryLab(shellFix, {
  scripts: cps.length, words: 446_000, matched: 0,
  ideas: labs.slice(0, 3).map((idea) => ({ idea, blueprint: blueprint({ format: idea.format, hero: idea.hero?.id, world: idea.world?.id, power: idea.power?.id, target: idea.target?.id }) })),
  blueprint: bpG, picked: { format: "insert", hero: "gojo", world: "invincible", power: "", target: "" },
  check: { title: "What If <Gojo>", text: drafted, result: chk }, contrast: null, results: [],
  coverage: { heroes: [], worlds: [], done: new Set() }, formats: [],
});
t("the Story Lab page escapes what's typed into it", labPage.includes("What If <Gojo>"), false);
t("the Story Lab page's scripts compile", [...labPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);

// ── pause and no script ───────────────────────────────────────────────────
section("Pause and no script");
const openCard = renderList(shellFix, "Queue", "", [plainRec]);
t("an open card offers pause and no script under clear and remove",
  ["/r/8/done", "/r/8/remove", "/r/8/pause", "/r/8/noscript"].map((a) => openCard.indexOf(a) >= 0), [true, true, true, true]);
const pausedRec = { ...plainRec, id: 10, pausedAt: new Date("2026-09-20T12:00:00Z") } as typeof plainRec;
const pausedCard = renderList(shellFix, "Queue", "", [pausedRec]);
t("a paused card offers resume, not pause", [pausedCard.includes("/r/10/resume"), pausedCard.includes("/r/10/pause")], [true, false]);
t("a paused card has no deadline", /class="due paused"[^>]*><b>Paused<\/b>no deadline/.test(pausedCard), true);
t("a paused card says so", pausedCard.includes('class="paused-tag"'), true);
const waitingRec = { ...plainRec, id: 11, noScriptAt: new Date() } as typeof plainRec;
const waitingCard = renderList(shellFix, "Queue", "", [waitingRec]);
t("no script colours the whole card", /class="row[^"]* noscript"/.test(waitingCard), true);
t("…and the button becomes 'script arrived'", [waitingCard.includes("/r/11/script\""), waitingCard.includes("/r/11/noscript")], [true, false]);
t("a daily batch has no script to wait on", renderList(shellFix, "Queue", "", [batchRec]).includes("/r/9/noscript"), false);
const doneCard = renderList(shellFix, "Queue", "", [{ ...plainRec, id: 12, status: "done", noScriptAt: new Date() } as typeof plainRec]);
t("a cleared card is only reopen and remove", [doneCard.includes("/r/12/pause"), doneCard.includes("/r/12/noscript"), doneCard.includes("/r/12/open")], [false, false, true]);
t("…and isn't magenta once it's done", /class="row[^"]* noscript"/.test(doneCard), false);
const pausedPage = renderPaused({ ...shellFix, active: "paused", paused: 1 }, [pausedRec]);
t("the Paused page lists them with the way back", pausedPage.includes("/r/10/resume"), true);
t("the rail links to Paused when anything is", pausedPage.includes('href="/paused"'), true);
t("…and not when nothing is", renderList(shellFix, "Queue", "", []).includes('href="/paused"'), false);
const ids = (rows: ReturnType<typeof cardRows>) => rows.flatMap((r) => r.components.map((c) => (c.toJSON() as { custom_id?: string }).custom_id ?? ""));
const cardIds = ids(cardRows("m1", { category: "stories", channel: "Specular Studios" } as never, true));
t("the Discord card has Pause and No script too", ["pause:m1", "noscript:m1"].every((x) => cardIds.includes(x)), true);
t("…five buttons, Discord's most for a row", cardRows("m1", { category: "stories", channel: "Specular Studios" } as never, true).at(-1)!.components.length, 5);
const markedIds = ids(cardRows("m1", { category: "stories", channel: "Specular Studios" } as never, true, { paused: true, noScript: true }));
t("…and they flip to Resume and Script in", ["resume:m1", "script:m1"].every((x) => markedIds.includes(x)), true);
t("Discord never gets more than five rows", cardRows("m1", { category: "unknown", channel: null } as never, true).length <= 5, true);

// ── moving a video moves the rest of its channel ──────────────────────────
section("Moving a video moves the rest of its channel");
const sched = [
  { id: 1, date: "2026-09-20", label: "V-1" },
  { id: 2, date: "2026-09-28", label: "V-2" },
  { id: 3, date: "2026-10-02", label: "V-3" },
  { id: 4, date: "2026-10-06", label: "V-4" },
];
const onDay = "2026-09-26";
const fwd = planCascade({ id: 2, from: "2026-09-28", to: "2026-09-30" }, sched, onDay);
t("later: every video after it goes later by the same days", fwd.moves.map((m) => [m.id, m.to]), [[3, "2026-10-04"], [4, "2026-10-08"]]);
t("…the ones before it stay where they are", fwd.moves.some((m) => m.id === 1), false);
const bwd = planCascade({ id: 2, from: "2026-09-28", to: "2026-09-27" }, sched, onDay);
t("earlier: the ones after it come earlier", bwd.moves.map((m) => [m.id, m.to]), [[3, "2026-10-01"], [4, "2026-10-05"]]);
const far = planCascade({ id: 2, from: "2026-09-28", to: "2026-09-18" }, sched, onDay);
t("never pulled back past today: it stops where the first lands on today", [far.asked, far.days, far.moves.map((m) => m.to)], [-10, -6, ["2026-09-26", "2026-09-30"]]);
const fromPast = planCascade({ id: 1, from: "2026-09-20", to: "2026-09-22" }, [...sched, { id: 5, date: "2026-09-24", label: "V-5" }], onDay);
t("post history never moves: nothing dated before today", fromPast.moves.map((m) => m.id), [2, 3, 4]);
const pastBack = planCascade({ id: 1, from: "2026-09-20", to: "2026-09-19" }, [...sched, { id: 5, date: "2026-09-24", label: "V-5" }], onDay);
t("…backwards either", pastBack.moves.map((m) => m.id), [2, 3, 4]);
t("…and a backward shift that would reach into the past stops at today", [pastBack.days, pastBack.moves[0]!.to], [-1, "2026-09-27"]);
t("the same day isn't later", planCascade({ id: 3, from: "2026-10-02", to: "2026-10-03" }, [...sched, { id: 6, date: "2026-10-02", label: "V-6" }], onDay).moves.map((m) => m.id), [4]);
t("nothing after it, nothing else moves", planCascade({ id: 4, from: "2026-10-06", to: "2026-10-09" }, sched, onDay).moves.length, 0);
t("today is the floor: a video today can't be pulled back", planCascade({ id: 2, from: "2026-09-25", to: "2026-09-24" }, [{ id: 2, date: "2026-09-25", label: "a" }, { id: 7, date: "2026-09-26", label: "b" }], onDay).moves.length, 0);
t("the note says what moved and by how much", cascadeText("Specular Studios", fwd), "Also moved 2 later Specular Studios videos 2 days later: V-3, V-4.");
t("…and when today stopped it", cascadeText("Specular Studios", far).includes("(not 10: nothing goes before today)"), true);
t("…naming three and counting the rest", cascadeText("Specular FNAF", { days: 1, asked: 1, moves: [1, 2, 3, 4, 5].map((n) => ({ id: n, from: "", to: "", label: `V-${n}` })) }),
  "Also moved 5 later Specular FNAF videos 1 day later: V-1, V-2, V-3 and 2 more.");
const recPage = renderRecord(shellFix, { ...plainRec, airDate: "2026-09-30" } as typeof plainRec, { later: 3, moved: { token: "tok", text: "Also moved <3> later" } });
t("the record's date box offers to move the rest, ticked", /class="restbox"><input type="checkbox" name="rest" value="1" checked>\s*Move the 3 later Specular Studios videos/.test(recPage), true);
t("…and after a move, an Undo for it", recPage.includes('action="/moves/undo"') && recPage.includes('value="tok"'), true);
t("…with the note escaped", recPage.includes("Also moved <3> later"), false);
t("no later videos, no box", renderRecord(shellFix, plainRec, { later: 0 }).includes(`class="restbox"`), false);

// ── days off ──────────────────────────────────────────────────────────────
section("Days off");
const todayET = dateIn(ORG_TZ);
const offDay = shiftDate(todayET, 3);
const dayBeforeOff = shiftDate(offDay, -1);
const offShell = { ...shellFix, daysOff: [offDay] };
const at2359 = (d: string) => instantIn(d, "23:59", ORG_TZ)!;
const shiftedRec = { ...plainRec, id: 13, code: "VIDEO-040", voDue: at2359(dayBeforeOff), offFrom: at2359(offDay) } as typeof plainRec;
const md = (d: string) => usDate(d).replace(/\/\d{4}$/, "");
const wd = (d: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const offRow = renderList(offShell, "Queue", "", [shiftedRec]);
t("a deadline a day off moved says so on its card", offRow.includes(`Day off ${md(offDay)} · due ${wd(dayBeforeOff)} ${md(dayBeforeOff)}`), true);
t("…and the pill's tooltip keeps the time it was set for", offRow.includes(", a day off"), true);
t("no day off, no tag", renderList(offShell, "Queue", "", [plainRec]).includes('class="off-tag"'), false);
const offCal = renderCalendar(offShell, offDay.slice(0, 7), "deadlines", [], [], []);
t("the calendar stripes a day off", new RegExp(`class="cell[^"]* off" data-date="${offDay}"`).test(offCal), true);
t("…and its moon makes it a working day again", new RegExp(`action="/days-off/${offDay}">\\s*<input type="hidden" name="on" value="0">`).test(offCal), true);
const plainFuture = shiftDate(todayET, 1);
if (plainFuture.slice(0, 7) === offDay.slice(0, 7))
  t("any other day from today on can be marked off", new RegExp(`action="/days-off/${plainFuture}">\\s*<input type="hidden" name="on" value="1">`).test(offCal), true);
const pastCal = renderCalendar(offShell, shiftDate(todayET, -40).slice(0, 7), "deadlines", [], [], []);
t("a day already past can't be marked off", /name="on" value="1"/.test(pastCal.slice(0, pastCal.indexOf(`data-date="${todayET}"`) > 0 ? pastCal.indexOf(`data-date="${todayET}"`) : undefined)), false);
const offDash = renderDashboard({ ...offShell, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [], grouped: new Map([["stories", [shiftedRec]]]), channels: {}, shifted: [shiftedRec],
  notices: [{ kind: "dayoff", at: new Date(), record: shiftedRec }], seen: 0,
});
t("the dashboard lists the day off and what it moved", offDash.includes(`1 deadline now due ${wd(dayBeforeOff)} ${usDate(dayBeforeOff)} — VIDEO-040`), true);
t("…with a box to add another", offDash.includes('action="/days-off"'), true);
t("the bell rings for it", offDash.includes(`Day off ${usDate(offDay)} · now due`), true);
t("…in its own colour", (offDash.match(/data-f="dayoff"/g) ?? []).length, 1);
t("no days off: the strip says how they work", renderDashboard({ ...shellFix, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never, byDay: [], grouped: new Map(), channels: {},
}).includes("None coming up. A deadline on a day off is due the working day before."), true);
const offDayView = renderDay(offShell, offDay, "deadlines", [{ date: offDay, list: [] }]);
t("the day view shows it too", /class="daycol[^"]* off"/.test(offDayView) && offDayView.includes("Day off — nothing can be due."), true);
const offIcs = buildIcs([], [], parseFeedOptions({}), "https://board.example", new Date("2026-09-26T12:00:00Z"), ["2026-09-28"]);
t("the Google Calendar feed carries days off as all-day events", offIcs.includes("DTSTART;VALUE=DATE:20260928") && offIcs.includes("SUMMARY:🌙 Day off"), true);
t("the dashboard's scripts still compile", [...offDash.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);

// ── settings ──────────────────────────────────────────────────────────────
section("Settings — hide anything on the sidebar");
const railOf = (html: string) => html.slice(html.indexOf("<aside>"), html.indexOf("</aside>"));
const slim = railOf(renderList({ ...shellFix, removed: 2, paused: 1, railHide: ["queue", "cat-gaming", "live", "search", "removed"] }, "Queue", "", []));
t("a switched-off page leaves the sidebar", slim.includes('href="/queue"'), false);
t("…a category too", [slim.includes("/category/gaming"), slim.includes("/category/stories")], [false, true]);
t("…and the search box, the #intake line and Removed", [slim.includes('role="search"'), slim.includes("#intake"), slim.includes('href="/removed"')], [false, false, false]);
t("what's left stays", [slim.includes('href="/calendar"'), slim.includes('href="/paused"')], [true, true]);
t("Settings is always there", slim.includes('href="/settings"'), true);
const noCats = railOf(renderList({ ...shellFix, railHide: CATEGORIES.map((c) => `cat-${c.id}`) }, "Queue", "", []));
t("no categories left, no Categories heading", noCats.includes("<h3>Categories</h3>"), false);
t("every sidebar item can be switched off", RAIL_ITEMS.length, 8 + CATEGORIES.length + 5);
const setPage = renderSettings({ ...shellFix, active: "settings" }, { railHide: ["queue"], dashHide: ["channels"], daysOff: [], shifted: [], saved: true, scripts: false });
t("Settings shows each item, ticked unless it's off", [/value="queue">/.test(setPage), /value="calendar" checked>/.test(setPage)], [true, true]);
t("…Scripts only when there's a Scripts tab", setPage.includes('value="scripts"'), false);
t("…the dashboard's lists", [/value="channels">/.test(setPage), /value="unsorted" checked>/.test(setPage)], [true, true]);
t("…the days off", setPage.includes('action="/days-off"'), true);
t("…and says when it's saved", setPage.includes("Saved."), true);

// ── Shorts channel colours from their avatars ─────────────────────────────
section("Shorts channels wear their avatars' colours");
const fakeAvatar = (ring: [number, number, number], middle: [number, number, number], size = 96) => {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const d = Math.hypot(x - (size - 1) / 2, y - (size - 1) / 2) / (size / 2);
    const [r, g, b] = d > 0.55 ? ring : middle;
    data.set([r, g, b, 255], (y * size + x) * 4);
  }
  return { width: size, height: size, data };
};
t("the background ring's colour, not the character's", avatarColour(fakeAvatar([208, 32, 32], [250, 250, 250])), "#D02020");
t("a black or white background: the character's strong colour", avatarColour(fakeAvatar([12, 12, 12], [40, 90, 220])), "#285ADC");
t("grey all over: no colour to take", avatarColour(fakeAvatar([128, 128, 128], [200, 200, 200])), null);
const jpg = jpegJs.encode(fakeAvatar([46, 160, 90], [240, 220, 40], 176), 85).data;
const fromJpeg = avatarColour(jpegJs.decode(jpg, { useTArray: true }));
t("…read through a real JPEG, within a hair of it", fromJpeg !== null && deltaE(fromJpeg, "#2EA05A") < 3, true);
t("the avatar asked for big enough to read", avatarAt("https://yt3.ggpht.com/abc123=s88-c-k-c0x00ffffff-no-rj"), "https://yt3.ggpht.com/abc123=s176-c-k-c0x00ffffff-no-rj");
t("…even when the address has no size", avatarAt("https://yt3.googleusercontent.com/xyz"), "https://yt3.googleusercontent.com/xyz=s176-c-k-c0x00ffffff-no-rj");
t("the avatar found on a channel page", avatarFromPage('<meta property="og:image" content="https://yt3.googleusercontent.com/a=s900-c-k?x=1&amp;y=2">'), "https://yt3.googleusercontent.com/a=s900-c-k?x=1&y=2");
t("a colour like another channel's is nudged apart", deltaE(apart("#D21B20", ["#D21B20"]), "#D21B20") >= 10, true);
t("…one already apart is left exactly as it is", apart("#1BD058", ["#D21B20", "#4A5CD4"]), "#1BD058");
const crowd: string[] = [];
for (let i = 0; i < 12; i += 1) crowd.push(apart("#E57712", crowd));
t("twelve avatars the same orange still come out twelve different colours", new Set(crowd).size, 12);
t("…each clear of the others", crowd.every((c, i) => crowd.every((o, j) => i === j || deltaE(c, o) >= 10)), true);
t("only Bits and Reading are read from their avatars", sampledChannels().every((n) => ["bits", "reading"].includes(CHANNELS.find((c) => c.name === n)!.category)) && sampledChannels().length > 0, true);
const fnafBits = CHANNELS.find((c) => c.id === "fnaf_bits") ?? CHANNELS.find((c) => c.category === "bits")!;
applyChannelColours(new Map([[fnafBits.name, "#123456"]]));
t("a new colour is worn everywhere at once", CHANNELS.find((c) => c.name === fnafBits.name)!.color, "#123456");
applyChannelColours(new Map());
t("…and without one it's back to the catalog's", CHANNELS.find((c) => c.name === fnafBits.name)!.color, catalogColour(fnafBits.name));
const colourPage = renderSettings({ ...shellFix, active: "settings" }, {
  railHide: [], dashHide: [], daysOff: [], shifted: [], saved: false, scripts: false,
  colours: CHANNELS.map((c) => ({ id: c.id, name: c.name, category: c.category, colour: c.color,
    source: c.id === fnafBits.id ? "hand" as const : "catalog" as const, sampled: sampledChannels().includes(c.name), linked: false, error: null })),
});
t("Settings has a colour picker for every channel", (colourPage.match(/<input type="color" name="c_/g) ?? []).length, CHANNELS.length);
t("…a hand-set one can be reset", colourPage.includes(`name="reset" value="${fnafBits.id}"`), true);
t("…and a Shorts channel with no link says where to add it", colourPage.includes("no YouTube link yet"), true);

// ── one channel on its own ────────────────────────────────────────────────
section("Uploads — one channel on its own");
const chName = "Specular FNAF";
const chUps = Array.from({ length: 70 }, (_, i) => ({
  videoId: `v${i}`, channel: chName, title: `FNAF video ${i}`, publishedAt: new Date(Date.UTC(2026, 8, 25) - i * 4 * 86_400_000),
  url: `https://youtu.be/v${i}`, views: 10_000 + i * 100,
}));
const chPerf = new Map(chUps.slice(0, 30).map((u, i) => [u.videoId, { videoId: u.videoId, value: 1, baseline: 1, multiple: i === 0 ? 3 : i === 1 ? 0.4 : 1 + (i % 5) / 10, verdict: i === 0 ? "breakout" as const : i === 1 ? "under" as const : "normal" as const, basis: "at 7 days" }]));
const chPage = renderUploads(shellFix, {
  channels: [chName], links: [{ channel: chName, input: "@x", youtubeId: "UC0000000000000000000008", title: "Specular FNAF", error: null, checkedAt: new Date() }],
  uploads: chUps, cadence: [cadenceFor(chName, chUps.map((u) => u.publishedAt), new Date("2026-09-26T12:00:00Z"), 4)],
  range: 90, hasKey: false, perf: chPerf, typical: new Map([[chName, { views: 12_000, basis: "at 7 days" }]]), category: "stories",
  focus: { channel: chName, all: chUps, lab: [] },
}, new Date("2026-09-26T12:00:00Z"));
t("the page is the channel's", chPage.includes("<h1>Specular FNAF</h1>"), true);
t("…with the way back and every Stories channel to switch to", [chPage.includes('href="/uploads?cat=stories">← All Stories'), chPage.includes('href="/uploads/channel/studios"')], [true, true]);
t("every video is listed, sixty showing", [(chPage.match(/class="evrow /g) ?? []).length, (chPage.match(/class="evrow [^"]*"[^>]*data-k="[a-z]+" hidden/g) ?? []).length], [70, 10]);
t("…each with how it did against the usual", chPage.includes('data-m="3.0000" data-k="up"'), true);
t("outliers: the usual, the best, the weakest", [chPage.includes("Outliers"), chPage.includes("11K") || chPage.includes("12K"), chPage.includes("The spread")], [true, true, true]);
t("the range tabs stay on the channel", chPage.includes('href="/uploads/channel/fnaf?range=30"'), true);
t("the page's scripts compile", [...chPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
const catPage = renderUploads(shellFix, {
  channels: [chName], links: [{ channel: chName, input: "@x", youtubeId: "UC0000000000000000000008", title: "Specular FNAF", error: null, checkedAt: new Date() }],
  uploads: chUps, cadence: [cadenceFor(chName, chUps.map((u) => u.publishedAt), new Date("2026-09-26T12:00:00Z"), 4)],
  range: 90, hasKey: false, category: "stories",
}, new Date("2026-09-26T12:00:00Z"));
t("the category page links each channel to its own page", catPage.includes('href="/uploads/channel/fnaf"'), true);
const fitted = channelLab("Specular FNAF", ["What If Gojo Was In FNAF?", "What If Deadpool Was In FNAF?", "Every FNAF Ending, Ranked", "Could Batman Survive FNAF?", "What If Goku Was In FNAF?"],
  labIdeas([], new Date("2026-09-25"), 5000, [], [], false), 8);
t("Story Lab ideas for a channel lead with its own world", fitted.slice(0, 3).every((x) => x.idea.world?.id === "fnaf"), true);
t("…and say why", fitted[0]?.fit.some((f) => f.startsWith("FNAF is in")), true);
const named = channelLab("Specular FNAF", ["What If Goku Joined The Avengers?", "Every Batman Villain, Ranked"], labIdeas([], new Date("2026-09-25"), 5000, [], [], false), 8);
t("a channel named for a world leans to it before its titles do", named.some((x) => x.idea.world?.id === "fnaf" && x.fit.includes("the channel is named for FNAF")), true);

// ── Story Lab's dice ──────────────────────────────────────────────────────
section("Story Lab's dice — new formats, heroes, worlds, powers, targets");
const baseCounts = [WORLDS.length, HEROES.length, POWERS.length];
const allDiceHeroes = [...DICE_HEROES, ...DICE_TARGETS];
t("nothing on the dice is already in the lore", [
  DICE_WORLDS.filter((w) => WORLDS.some((x) => x.id === w.id)).map((w) => w.id),
  allDiceHeroes.filter((h) => HEROES.some((x) => x.id === h.id)).map((h) => h.id),
  DICE_POWERS.filter((p) => POWERS.some((x) => x.id === p.id)).map((p) => p.id),
], [[], [], []]);
t("…nor on the dice twice", [new Set(DICE_WORLDS.map((w) => w.id)).size === DICE_WORLDS.length, new Set(allDiceHeroes.map((h) => h.id)).size === allDiceHeroes.length,
  new Set(DICE_POWERS.map((p) => p.id)).size === DICE_POWERS.length, new Set(DICE_SHAPES.map((x) => x.id)).size === DICE_SHAPES.length], [true, true, true, true]);
t("every world is written out: truth, arrival, institution, roster, apex, endgame",
  DICE_WORLDS.filter((w) => !(w.truth && w.arrival && w.incident && w.institution.name && w.institution.cantClassify && w.institution.approach && w.anchors.length >= 4
    && w.ladder.length >= 4 && w.apex.name && w.apex.firstClash && w.apex.leverage && w.apex.weakness && w.endgame && w.aftermath && w.wants.length
    && (w.kind === "universe" || (w.goal && w.rules && w.attrition && w.dilemma)))).map((w) => w.id), []);
t("every hero: a version lock, an ability ladder, limits, a code",
  allDiceHeroes.filter((h) => !(h.version && h.ladder.length >= 3 && h.limits.length >= 2 && h.code && h.engine && h.tags.length)).map((h) => h.id), []);
t("every target says why he's hard to catch", DICE_TARGETS.filter((h) => !h.hides || h.role !== "target").map((h) => h.id), []);
t("every power: what it grants, its catch, what it can't copy", DICE_POWERS.filter((p) => !(p.grants.length >= 3 && p.cost && p.cantCopy && p.mentor && p.weakness)).map((p) => p.id), []);
t("every title shape is on a format the scripts built", DICE_SHAPES.every((x) => ["insert", "survive", "hunt", "you", "power"].includes(x.base) && /\{(hero|world|target)\}/.test(x.title)), true);
const everything = [
  ...DICE_SHAPES.map((x) => ({ kind: "shape" as const, id: x.id })), ...DICE_HEROES.map((x) => ({ kind: "hero" as const, id: x.id })),
  ...DICE_WORLDS.map((x) => ({ kind: "world" as const, id: x.id })), ...DICE_POWERS.map((x) => ({ kind: "power" as const, id: x.id })),
  ...DICE_TARGETS.map((x) => ({ kind: "target" as const, id: x.id })),
];
applyAdditions(everything);
t("added, they're lore like any other", [WORLDS.length - baseCounts[0]!, HEROES.length - baseCounts[1]!, POWERS.length - baseCounts[2]!, SHAPES.length],
  [DICE_WORLDS.length, allDiceHeroes.length, DICE_POWERS.length, DICE_SHAPES.length]);
t("…read in titles", [readTitle("What If Naruto Was In My Hero Academia?").heroes[0]?.id, readTitle("What If Naruto Was In My Hero Academia?").worlds[0]?.id,
  readTitle("Could Levi Survive The Walking Dead?").worlds[0]?.id], ["naruto", "mha", "twd"]);
const everyBlueprint = [
  ...DICE_WORLDS.map((w) => blueprint({ format: w.kind === "setting" ? "survive" : "insert", hero: "batman", world: w.id })),
  ...DICE_HEROES.map((h) => blueprint({ format: "insert", hero: h.id, world: h.home === "boys" ? "mcu" : "boys" })),
  ...DICE_TARGETS.map((h) => blueprint({ format: "hunt", hero: "l", target: h.id })),
  ...DICE_POWERS.map((p) => blueprint({ format: "power", hero: "batman", power: p.id })),
];
t("every addition builds a full blueprint", everyBlueprint.filter((b) => !b || b.parts.length < 6).length, 0);
const shaped = blueprint({ format: "survive", hero: "batman", world: "twd", shape: "hundreddays" });
t("a title shape keeps its format's structure under the new title", [shaped?.title, shaped?.format.id, (shaped?.parts.length ?? 0) >= 6],
  ["Could Batman Survive 100 Days In The Walking Dead?", "survive", true]);
const withDice = labIdeas([], new Date("2026-09-25"), 20_000, [], [], false);
t("ideas use what was added", ["naruto", "hannibal", "sharingan", "mha"].every((id) => withDice.some((i) => [i.hero?.id, i.target?.id, i.power?.id, i.world?.id].includes(id))), true);
t("…in the new title shapes too", withDice.some((i) => i.shape === "hundreddays" && i.title.includes("Survive 100 Days In")), true);
t("…and new detectives hunt new targets", withDice.some((i) => i.hero?.id === "sherlock" && i.target?.id === "hannibal"), true);
t("nobody is dropped into their own story", withDice.filter((i) => !["reborn", "divergence"].includes(i.format) && i.hero && i.world && (i.hero.home === i.world.id || i.hero.from.toLowerCase() === i.world.name.toLowerCase())).map((i) => i.title).slice(0, 3), []);
const wandaBoys = blueprint({ format: "insert", hero: "wanda", world: "boys" });
const wandaText = wandaBoys ? [wandaBoys.title, ...wandaBoys.intro, ...wandaBoys.parts.map((x) => `${x.name} ${x.plan}`), wandaBoys.outro, wandaBoys.premise].join(" ") : "";
t("a heroine's blueprint says her where it means her", ["Homelander would hear about her eventually", "still has to reach her", "talks to her", "tests her with heat vision", "she leaves Vought weaker than she found it"].filter((x) => !wandaText.includes(x)), []);
t("…while Homelander and the rest keep theirs", [wandaText.includes("he'd probably assume"), wandaText.includes("Butcher (hates every Supe and wants a weapon against Homelander — he doesn't care")], [true, true]);
t("…and nothing is left unfilled", /\{(he|him|his|himself|He|His)\}/.test(wandaText), false);
t("…and her rebirth is hers", withDice.find((i) => i.format === "reborn" && i.hero?.id === "eleven")?.title ?? "", "What If Eleven Was Reborn With Her Memories?");
const gojoInBoys = blueprint({ format: "insert", hero: "gojo", world: "boys" });
t("a hero's still says him, and nothing is left unfilled", [/\bhim\b/.test([...(gojoInBoys?.intro ?? []), ...(gojoInBoys?.parts.map((x) => x.plan) ?? [])].join(" ")),
  /\{(he|him|his|himself|He|His)\}/.test([gojoInBoys?.title, ...(gojoInBoys?.intro ?? []), ...(gojoInBoys?.parts.map((x) => x.name + x.plan) ?? []), gojoInBoys?.outro].join(" "))], [true, false]);
t("targets never lead", withDice.some((i) => i.format !== "hunt" && i.hero?.role === "target"), false);
t("with everything in, there's nothing left to roll", [rollDice(null), Object.values(diceLeft()).every((n) => n === 0)], [null, true]);
applyAdditions([]);
t("taking them out puts the lore back exactly", [WORLDS.length, HEROES.length, POWERS.length, SHAPES.length, readTitle("What If Naruto Was In Bleach?").heroes.length], [...baseCounts, 0, 0]);
const rolled = rollDice(null, () => 0.3);
t("a roll is always something new", rolled !== null && !currentAdditions().some((a) => a.kind === rolled.kind && a.id === rolled.id), true);
t("…from the group asked for", rollDice("power", () => 0.5)?.kind, "power");
const heroCard = diceCard("hero", "naruto", [], []);
t("a rolled card says what it is and what it opens up", [heroCard?.name, heroCard?.group, (heroCard?.opens.length ?? 0) > 0, heroCard?.opens.every((o) => o.href.startsWith("/story-lab?"))], ["Naruto", "Hero", true, true]);
t("…without adding it", HEROES.some((h) => h.id === "naruto"), false);
const labWithDice = renderStoryLab(shellFix, {
  scripts: 1, words: 1000, matched: 0, ideas: [], blueprint: null, picked: { format: "insert", hero: "", world: "", power: "", target: "" },
  check: null, contrast: null, results: [], coverage: { heroes: [], worlds: [], done: new Set() }, formats: [],
  dice: { rolled: heroCard, added: null, additions: [{ kind: "world", id: "mha", name: "My <Hero> Academia" }], left: diceLeft(), group: null, nonce: "1", rolledNothing: false },
});
t("the Story Lab page has the dice, an Add, and what's been added", [labWithDice.includes('id="dice"'), labWithDice.includes('action="/story-lab/add"'), labWithDice.includes('action="/story-lab/remove"')], [true, true, true]);
t("…escaped", labWithDice.includes("My <Hero> Academia"), false);
t("…and its scripts compile", [...labWithDice.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);

// ── revisions ─────────────────────────────────────────────────────────────
section("Revisions — their own card, their own deadline, their own place");
const filed = new Date("2026-09-26T14:00:00Z");
const revExtraction = { ...base, kind: "review", stage: "review", version: 3, vo_due: "2026-09-17T23:59:00-04:00", script_due: null } as unknown as Extraction;
const revDerived = derive(revExtraction, "https://app.frame.io/reviews/abc v3", filed);
t("a revision never gets a VO deadline or an air date", [revDerived.voDue, revDerived.voSource, revDerived.airDate], [null, "none", null]);
t("…it's due for review twelve hours after it came in", revDerived.deadline?.toISOString(), "2026-09-27T02:00:00.000Z");
t("…unless its message gives a deadline", derive({ ...revExtraction, deadline: "2026-09-26T18:00:00-04:00" } as Extraction, "", filed).deadline?.toISOString(), "2026-09-26T22:00:00.000Z");
t("an assignment still gets its VO from the air date", derive(base, "").voSource, "calculated");
const revRec = { ...plainRec, id: 40, kind: "review", version: 3, voDue: null, airDate: null, createdAt: filed,
  deadline: new Date(filed.getTime() + 12 * 3_600_000), links: [{ kind: "frameio", url: "https://f.io/x", label: "" }] } as unknown as typeof plainRec;
const revCard = renderList(shellFix, "Revisions", "", [revRec]);
t("a revision is its own kind of card", [/class="row revision"/.test(revCard), revCard.includes('class="rev-tag"'), revCard.includes("Revision v3")], [true, true, true]);
t("…its pill says Review, not VO", [/<b>Review<\/b>/.test(revCard), /<b>VO<\/b>/.test(revCard)], [true, false]);
t("…its tick says reviewed, and there's no script to wait on", [revCard.includes("Reviewed — clear it"), revCard.includes("/r/40/noscript")], [true, false]);
const dashRev = renderDashboard({ ...shellFix, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [], grouped: new Map([["stories", [plainRec]]]), channels: {}, revisions: [revRec],
});
t("the dashboard gives revisions their own section", [dashRev.includes('class="panel revpanel dashpart" data-part="revisions"'), dashRev.includes("/r/40\"")], [true, true]);
t("…switchable like Unsorted and Channels", dashRev.includes('data-part="revisions" checked'), true);
const revPage = renderRevisions(shellFix, [revRec]);
t("the Revisions page lists revisions, and nothing else as 'other Frame.io work'", [revPage.includes("/r/40\""), revPage.includes("Other work with a Frame.io link")], [true, false]);

section("Calendar — Day · 4 days · Week · Month, and a channel dropdown");
const tabOrder = (html: string) => [...html.matchAll(/class="tab(?: on)?"[^>]*href="\/(day|4day|week|calendar)\//g)].map((m) => m[1]);
t("views run Day, 4 days, Week, Month", tabOrder(pages.week).slice(0, 4), ["day", "4day", "week", "calendar"]);
const fourDays = [0, 1, 2, 3].map((n) => ({ date: shiftDate("2026-09-28", n), list: n === 0 ? [pinnedRec] : [] }));
const four = renderWeek(shellFix, "2026-09-28", "posting", fourDays, [], [], [], 4);
t("4 days: four columns from the day picked", [(four.match(/class="daycol/g) ?? []).length, four.includes("weekgrid span4")], [4, true]);
t("4 days: its tab is the one lit", /class="tab on"[^>]*href="\/4day\//.test(four), true);
t("4 days: steps four days at a time", [four.includes('href="/4day/2026-10-02'), four.includes('href="/4day/2026-09-24')], [true, true]);
const picked = renderWeek(shellFix, "2026-09-27", "posting", days, [], [], ["comics", "nochannel"]);
t("every calendar view has the channel dropdown", [pages.calendar, pages.day, pages.week, four].map((h) => h.includes('id="chanpick"')), [true, true, true, true]);
t("…a hidden channel is unticked, the rest ticked", [/value="nochannel"(?! checked)/.test(picked), /value="nochannel" checked/.test(pages.week)], [true, true]);
const fourScripts = [...four.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
t("4 days: inline scripts compile", fourScripts.filter((src) => { try { new Function(src); return false; } catch { return true; } }).length, 0);

section("Scripts — pasted or read from a Google Doc, and learned from");
const para = (w: string) => Array.from({ length: 12 }, (_, i) => `${w} would test the limits of the arena in round ${i + 1}.`).join(" ");
const boardBody = `INTRO\n${para("Gojo")}\nPART 1\n${para("Invincible")}\nPART 2\n${para("Omni-Man")}\nOUTRO\n${para("Everyone")}`;
t("a Google Docs link gives its id", docId("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit?usp=sharing"), "1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
t("…anything else doesn't", [docId("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view"), docId("not a link")], [null, null]);
const docFetch = (status: number, type: string, body: string) =>
  (async () => new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;
t("a shared doc is read as plain text", await readDoc("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit", docFetch(200, "text/plain; charset=utf-8", "\uFEFFINTRO\r\nHello")), { ok: true, text: "INTRO\nHello" });
const priv = await readDoc("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit", docFetch(200, "text/html", "<html>Sign in</html>"));
t("a private doc says so, and isn't kept as the script", [priv.ok, !priv.ok && priv.error.includes("private")], [false, true]);
t("a link that isn't a doc is refused before any fetch", (await readDoc("https://example.com/x", docFetch(200, "text/plain", "x"))).ok, false);
const driveCount = corpus().length;
const firstTitle = corpus()[0]!.title;
setBoardScripts([
  { id: 1, recordId: 50, category: "stories", title: "What If Gojo Was In Invincible?", body: boardBody },
  { id: 2, recordId: null, category: null, title: firstTitle, body: boardBody },
  { id: 3, recordId: 51, category: "reading", title: "Every Batman Villain Explained", body: boardBody },
  { id: 4, recordId: 52, category: "stories", title: "Too Short", body: "INTRO\nA line." },
]);
const learned = corpus();
t("a Stories video's script joins what Story Lab reads", learned.some((x) => x.board?.id === 1), true);
t("…read by its title like the Drive's", learned.find((x) => x.board?.id === 1)?.format, formatOfTitle("What If Gojo Was In Invincible?"));
t("…and split into its parts", learned.find((x) => x.board?.id === 1)?.metrics.parts, 2);
t("a newer copy of a Drive script takes its place", [learned.length, learned.filter((x) => x.title === firstTitle).length, learned.find((x) => x.title === firstTitle)?.board?.id], [driveCount + 1, 1, 2]);
t("another category's script stays out of Story Lab, and so does one too short", [learned.some((x) => x.board?.id === 3), learned.some((x) => x.board?.id === 4)], [false, false]);
t("…but every category's opening feeds the idea hooks", boardOpenings().has("every batman villain explained"), true);
const now0 = new Date("2026-09-26T12:00:00Z");
const keptScripts = [{ id: 1, recordId: 50, category: "stories", title: "What If Gojo Was In Invincible?", body: boardBody, url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit", words: 400, addedAt: now0, updatedAt: now0 }];
const withScript = renderRecord(shellFix, { ...plainRec, id: 50 } as typeof plainRec, { scripts: keptScripts });
t("a video's page shows its script, and whether Story Lab learns from it", [withScript.includes('id="script"'), withScript.includes("Story Lab learns from it"), withScript.includes("/scripts/1/refresh")], [true, true, true]);
t("…with a box for another draft", withScript.includes("Add another draft"), true);
const docRec = { ...plainRec, id: 53, links: [{ kind: "docs", url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit", label: "" }] } as unknown as typeof plainRec;
t("a video with a doc linked has it ready to read", renderRecord(shellFix, docRec, { scripts: [] }).includes('name="url" value="https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit"'), true);
t("a script that couldn't be read says why", renderRecord(shellFix, plainRec, { scripts: [], scriptError: "The doc is private." }).includes("The doc is private."), true);
t("a revision has no script box", renderRecord(shellFix, revRec, { scripts: [] }).includes('id="script"'), false);
setBoardScripts([]);
t("…and removing them puts the Drive's back", corpus().length, driveCount);

section("What's new — every change to the board, in its own kind of notification");
const relNow = new Date("2026-09-26T15:00:00Z");
t("every release has an id, a title and at least one change", RELEASES.every((r) => r.id && r.title && r.changes.length), true);
t("…and no two share an id", new Set(RELEASES.map((r) => r.id)).size, RELEASES.length);
const relTimes = new Map([[RELEASES[0]!.id, new Date(relNow.getTime() - 3_600_000)], [RELEASES[1]!.id, new Date(relNow.getTime() - 40 * 86_400_000)]]);
const updates = releaseNotices(relTimes, relNow);
t("a release live in the last month is a notification; an older one isn't", updates.map((u) => u.release.id), [RELEASES[0]!.id]);
t("…one not yet live isn't either", releaseNotices(new Map(), relNow).length, 0);
const dashNew = renderDashboard({ ...shellFix, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [], grouped: new Map(), channels: {},
  notices: [...updates, { kind: "overdue", at: new Date(relNow.getTime() - 7_200_000), record: pinnedRec }],
  seen: relNow.getTime() - 5_400_000,
});
t("…it has its own kind in the bell, with its own filter", [/class="notice update new-item" data-kind="update"/.test(dashNew), /data-f="update"[^>]*><i><\/i>What's new<span>1</.test(dashNew)], [true, true]);
t("…summed up in its title, and linking to the full list", [dashNew.includes(esc(RELEASES[0]!.title)), dashNew.includes(`href="/whats-new#${RELEASES[0]!.id}"`)], [true, true]);
t("…counted as unread like any other", /id="bellcount">1</.test(dashNew), true);
const newPage = renderWhatsNew(shellFix, RELEASES.map((r) => ({ ...r, at: relTimes.get(r.id) ?? null })));
t("the What's new page lists every release, newest first, each change a line", [newPage.indexOf(`id="${RELEASES[0]!.id}"`) < newPage.indexOf(`id="${RELEASES[1]!.id}"`), (newPage.match(/<li>/g) ?? []).length], [true, RELEASES.reduce((n, r) => n + r.changes.length, 0)]);
t("the sidebar links to it", pages.week.includes('href="/whats-new"'), true);

section("Nothing assigned — an expected upload with no video on the day");
const gd = (list: ReturnType<typeof channelGaps>) => list.map((g) => [g.date, g.inDays]);
t("every four days from the last video: the empty days in the next eight", gd(channelGaps("A", 4, ["2026-09-24"], "2026-09-26")), [["2026-09-28", 2], ["2026-10-02", 6]]);
t("a video scheduled on (or before) the day fills it", gd(channelGaps("B", 4, ["2026-09-24", "2026-09-28", "2026-10-02"], "2026-09-26")), []);
t("posting early moves the next one earlier", gd(channelGaps("B", 4, ["2026-09-24", "2026-09-27"], "2026-09-26")), [["2026-10-01", 5]]);
t("a channel already behind is expected today", gd(channelGaps("C", 4, ["2026-09-16"], "2026-09-26"))[0], ["2026-09-26", 0]);
t("a channel quiet for over a month with nothing ahead is resting", channelGaps("D", 4, ["2026-08-01"], "2026-09-26"), []);
t("…each gap says the last video before it", channelGaps("A", 4, ["2026-09-24"], "2026-09-26")[1]!.after, "2026-09-24");
t("every channel, soonest first", uploadGaps([{ channel: "Z", every: 4, days: ["2026-09-23"] }, { channel: "A", every: 4, days: ["2026-09-24"] }], "2026-09-26").map((g) => `${g.channel} ${g.date}`), ["Z 2026-09-27", "A 2026-09-28", "Z 2026-10-01", "A 2026-10-02"]);
const gapShell = { ...shellFix, gaps: channelGaps("Specular Anime", 4, ["2026-09-24"], "2026-09-26") };
const gapDash = renderDashboard({ ...gapShell, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [], grouped: new Map(), channels: {}, gaps: gapShell.gaps,
  notices: [{ kind: "gap", at: new Date(), gap: gapShell.gaps[0]! }],
});
t("the dashboard warns, with a count and a chip a channel naming each day", [gapDash.includes('class="gapstrip"'), /class="gapn">2</.test(gapDash), (gapDash.match(/class="gapchip[ "]/g) ?? []).length, gapDash.includes("Fri 10/2")], [true, true, 1, true]);
t("…the sidebar's Calendar carries the count", /Calendar<span class="gapbadge"[^>]*>2</.test(gapDash), true);
t("…and the bell has its own kind for it", [/class="notice gap/.test(gapDash), /data-f="gap"[^>]*><i><\/i>Nothing assigned<span>1</.test(gapDash)], [true, true]);
const gapWeek = renderWeek(gapShell, "2026-09-27", "posting", [0, 1, 2, 3, 4, 5, 6].map((n) => ({ date: shiftDate("2026-09-27", n), list: [] })));
t("the calendar shows a dashed slot on each empty day", (gapWeek.match(/class="gapcard"/g) ?? []).length, 2);
t("…but not in Deadlines, and not for a hidden channel", [
  renderWeek(gapShell, "2026-09-27", "deadlines", [{ date: "2026-09-28", list: [] }]).includes('class="gapcard"'),
  renderWeek(gapShell, "2026-09-27", "posting", [{ date: "2026-09-28", list: [] }], [], [], ["anime"]).includes('class="gapcard"'),
], [false, false]);
t("a month cell gets its slot", renderCalendar(gapShell, "2026-10", "posting", [], [], []).includes('class="gapslot"'), true);

section("Uploaded — live on the channel, green on the calendar");
const upRec = { ...plainRec, id: 60, status: "done", uploadedAt: new Date("2026-09-26T15:00:00Z"), airDate: "2026-09-28" } as typeof plainRec;
const upList = renderList(shellFix, "Queue", "", [upRec, plainRec]);
t("every card has the Uploaded button", [upList.includes("/r/60/notuploaded"), upList.includes("/r/8/uploaded")], [true, true]);
t("…lit once it's uploaded, with a tag", [/class="tick uploaded"[^>]*>\s*<button[^>]*class="on"/.test(upList), upList.includes('class="uploaded-tag"')], [true, true]);
t("a revision has nothing to upload", renderList(shellFix, "R", "", [revRec]).includes("/uploaded"), false);
const upCal = renderCalendar(shellFix, "2026-09", "posting", [{ day: "2026-09-28", record: upRec } as never], [], []);
t("the calendar shows it green", upCal.includes('class="chip done uploaded"'), true);
t("…and so does its card", renderWeek(shellFix, "2026-09-27", "posting", [{ date: "2026-09-28", list: [upRec] }]).includes("dcard cleared uploaded"), true);

section("Story Lab — Write next, channel by channel");
const wnAll = labIdeas([], new Date("2026-09-26T12:00:00Z"), 100_000, [], [], false);
const wnChannels = ["Specular Studios", "Specular Anime", "Specular Comics"].map((channel) => ({ channel, titles: [] as string[] }));
const wn = writeNext({ channels: wnChannels, ideas: wnAll, marks: [], neighbours: [] });
t("two cards for every channel", wnChannels.map((c) => wn.get(c.channel)!.length), [2, 2, 2]);
const wnKeys = [...wn.values()].flat().map((c) => c.idea.key);
t("…never the same idea twice on the page", new Set(wnKeys).size, wnKeys.length);
t("…a channel's two share no hero or world", wnChannels.every((c) => {
  const [a, b] = wn.get(c.channel)!;
  return a!.idea.hero?.id !== b!.idea.hero?.id && (!a!.idea.world || a!.idea.world.id !== b!.idea.world?.id);
}), true);
t("…best score first, each out of 100", wnChannels.every((c) => {
  const [a, b] = wn.get(c.channel)!;
  return a!.score >= b!.score && a!.score >= 1 && a!.score <= 99;
}), true);
t("the score: 50 is the channel's usual, higher predicts better", [scoreIdea({ score: 1 } as never, 0, null).score, scoreIdea({ score: 2 } as never, 0, null).score, scoreIdea({ score: 0.5 } as never, 0, null).score], [50, 80, 20]);
t("…a close fit to the channel and a clash with another video move it", [scoreIdea({ score: 1 } as never, 1, null).score > 50, scoreIdea({ score: 1 } as never, 0, { title: "x", channel: null, source: "uploaded", why: "" }).score < 50], [true, true]);
const first = wn.get("Specular Studios")![0]!;
const rerolled = writeNext({
  channels: wnChannels, ideas: wnAll, neighbours: [],
  marks: [
    ...[...wn].flatMap(([channel, cards]) => cards.map((c) => ({ channel, key: c.idea.key, mark: "show" as const, title: c.idea.title, format: c.idea.format, hero: null, world: null, power: null, target: null, shape: null, score: c.score, markedAt: new Date() }))),
  ].map((m) => (m.key === first.idea.key ? { ...m, mark: "skip" as const } : m)),
});
t("↻ reroll: a fresh idea in its place, and no other card moves", [
  rerolled.get("Specular Studios")!.some((c) => c.idea.key === first.idea.key),
  rerolled.get("Specular Studios")!.length,
  wn.get("Specular Anime")!.map((c) => c.idea.key).join(),
], [false, 2, rerolled.get("Specular Anime")!.map((c) => c.idea.key).join()]);
const nIdx = new NeighbourIndex([{ title: "What If Invincible Was In The MCU", channel: "Specular Anime", source: "uploaded" }]);
t("too close: the same pairing, on another channel, is flagged", nIdx.match("What If Invincible Was In The Avengers?")?.channel, "Specular Anime");
t("…a different world for the same hero isn't", nIdx.match("What If Invincible Was In Jujutsu Kaisen?"), null);
t("…nearly the same words are", new NeighbourIndex([{ title: "The Scariest Cursed Lighthouse Ever Found", channel: null, source: "script" }]).match("The Scariest Cursed Lighthouse Ever Found Again")?.why, "nearly the same words");
// Everything already made on another channel: the cards still come, each with its warning.
const flagged = writeNext({ channels: [wnChannels[0]!], ideas: wnAll, marks: [], neighbours: wnAll.slice(0, 400).map((i) => ({ title: i.title, channel: "Specular Anime", source: "uploaded" as const })) });
t("a close idea is still offered, with its warning", flagged.get("Specular Studios")!.map((c) => c.similar?.channel), ["Specular Anime", "Specular Anime"]);
const heroCounts = (list: typeof wnAll, id: string) => list.findIndex((i) => i.hero?.id === id || i.target?.id === id);
const someHero = wnAll[wnAll.length - 1]!.hero?.id ?? wnAll.find((i) => i.hero)!.hero!.id;
const boosted = labIdeas([], new Date("2026-09-26T12:00:00Z"), 100_000, [], [], false, new Set([`hero:${someHero}`]));
t("just added from the dice: brought forward, so rerolls reach it", heroCounts(boosted, someHero) < heroCounts(wnAll, someHero), true);
t("…and it says so", boosted.find((i) => i.hero?.id === someHero)!.reasons.some((r) => r.text.includes("just added from the dice")), true);
const bigPub = Array.from({ length: 3000 }, (_, i) => ({ title: `Video number ${i} about things`, url: `u${i}`, channel: "c" }));
const tIdx = performance.now();
indexPublic(bigPub);
labIdeas([], new Date(), 100_000, bigPub, [], false);
t("ideas against 3,000 public videos in well under a second", performance.now() - tIdx < 1500, true);

section("Revisions — a Frame.io link is a revision");
const fioFwd = { ...base, kind: "update", links: [{ url: "https://f.io/abc", kind: "frameio", label: "" }], air_date: "2026-10-01", vo_due: "2026-09-25T23:59:00-04:00" } as unknown as Extraction;
t("a forward with a Frame.io link is a revision, whatever it was read as", [frameioIsRevision(fioFwd, "here's the new cut https://f.io/abc").kind, frameioIsRevision(fioFwd, "x").vo_due, frameioIsRevision(fioFwd, "x").air_date], ["review", null, null]);
t("…but the studio's own assignment post keeps its kind", frameioIsRevision({ ...fioFwd, kind: "assignment" } as Extraction, "### 10-03-26 | VIDEO-008 | Title\nhttps://f.io/abc").kind, "assignment");
t("…an assignment post is known by its heading", [isAssignmentPost("**10-03-26 | VIDEO-008 | What If**"), isAssignmentPost("new cut is up")], [true, false]);
t("…and a message with no Frame.io link is left alone", frameioIsRevision({ ...fioFwd, links: [] } as Extraction, "x").kind, "update");

section("Revisions — Summarize: the notes, a summary, a score out of 10");
const csv = 'Comment Number,Commenter,Comment,Timecode\n1,Josh,"Audio is way too loud here",00:00:12:03\n2,Josh,"Typo in the caption, ""Wolverene""",00:01:05:10\n3,Josh,"The whole video drags — tighten the structure throughout",';
const fromCsv = parsePasted(csv);
t("Frame.io's CSV export is read, quotes and all", fromCsv.map((c) => [c.text, c.author, c.timecode]), [["Audio is way too loud here", "Josh", "00:00:12:03"], ["Typo in the caption, \"Wolverene\"", "Josh", "00:01:05:10"], ["The whole video drags — tighten the structure throughout", "Josh", null]]);
const fromText = parsePasted("#1 00:00:12 Josh\nAudio too loud\n\n#2 00:01:05 Josh\nTypo in the caption");
t("…so is the plain-text export, a note a block", fromText.map((c) => [c.text, c.author, c.timecode]), [["Audio too loud", "Josh", "00:00:12"], ["Typo in the caption", "Josh", "00:01:05"]]);
t("…and notes copied a line each", parsePasted("0:12 audio too loud\n1:05 - typo in caption").map((c) => [c.timecode, c.text]), [["0:12", "audio too loud"], ["1:05", "typo in caption"]]);
t("each note gets its kind", [themeOf("Audio is way too loud"), themeOf("Typo in the caption"), themeOf("pacing drags"), themeOf("nice")], ["audio", "text", "pacing", "other"]);
t("…and its size: a small bug, a fix, or the whole video", fromCsv.map((c) => severityOf(c)), ["moderate", "minor", "major"]);
const revClean = scoreRevision([], 1, []);
const revFew = scoreRevision([{ text: "tiny typo at 0:12", source: "pasted" }], 1, []);
const revHeavy = scoreRevision(fromCsv, 3, []);
t("no notes is a 10; a small note costs little; a lot over three versions costs a lot", [revClean.score, revFew.score >= 9.5, revHeavy.score < revFew.score], [10, true, true]);
t("…every point taken off says why", revHeavy.penalties.map((p) => p.what), ["frequency", "type"]);
const revPast = [
  { title: "Video A", themes: ["audio", "text"], comments: ["audio way too loud in the intro"] },
  { title: "Video B", themes: ["audio"], comments: ["music drowns the VO"] },
];
const revRepeated = scoreRevision([{ text: "Audio is way too loud here", source: "pasted" }], 1, revPast);
t("the same issue on the channel's recent videos costs extra", [revRepeated.repeats.map((r) => r.theme), revRepeated.repeatedNotes.map((r) => r.before), revRepeated.score < scoreRevision([{ text: "Audio is way too loud here", source: "pasted" }], 1, []).score], [["audio"], ["Video A"], true]);
const revOwn = scoreRevision(fromCsv, 1, [], 9);
t("your own rating is half the score", revOwn.score, Math.round(((revOwn.auto + 9) / 2) * 10) / 10);
t("your own summary counts as notes of its own", ownNotes("Great pacing overall. Fix the intro music.\n- captions late").map((n) => n.text), ["Great pacing overall.", "Fix the intro music.", "captions late"]);
const revSum = await summarize({ title: "What If Gojo Was In Invincible?", channel: "Specular Anime", comments: fromCsv, versions: 2, past: revPast, own: null });
t("without a model the summary is written by rules, and says what repeats", [revSum.by, revSum.text.includes("3 notes over 2 versions"), revSum.text.includes("Again: audio levels")], ["rules", true, true]);
t("the versions of one video share a key", [videoKey("video-012", "x"), videoKey(null, "Walter White v3"), videoKey(null, "Walter White")], ["VIDEO-012", "walter white", "walter white"]);
const apiCalls: string[] = [];
const fakeApi = (async (url: string) => {
  apiCalls.push(url);
  const body = url.includes("/review_links/") ? [{ asset_id: "a1" }] : url.endsWith("/assets/a1") ? { type: "version_stack", name: "x" } : url.includes("/children") ? [{ id: "v1" }, { id: "v2" }] : url.includes("/v1/comments") ? [{ text: "audio loud", timestamp: 72, owner: { name: "Josh" } }] : [{ text: "better", timestamp: null }];
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as unknown as typeof fetch;
const fioApi = await commentsFromFrameio("https://app.frame.io/reviews/1234abcd-0000-0000-0000-000000000000/x", "tok", fakeApi);
t("with a Frame.io token, a review link's comments come from the API — every version", fioApi.ok ? [fioApi.versions, fioApi.comments.map((c) => [c.text, c.version, c.timecode])] : fioApi.error, [2, [["audio loud", 1, "1:12"], ["better", 2, null]]]);
t("…and without one, it says to paste them", (await commentsFromFrameio("https://f.io/x", "")).ok, false);

section("Revisions — history, flags and trophies");
t("3 in a row at 5 or below is cause for concern; 3 at 8 or more, a trophy", [streakOf([9, 5, 4, 3]), streakOf([4, 8, 9, 8.5]), streakOf([4, 9, 5]), streakOf([4, 4])], ["concern", "trophy", null, null]);
const hp = (channel: string, scores: number[]) => scores.map((score, i) => ({ recordId: 100 + i, title: `${channel} ${i}`, version: 1, score, at: new Date(Date.UTC(2026, 8, 1 + i)), channel }));
const revHist = channelHistories([...hp("Specular Anime", [9, 8, 8.5]), ...hp("Specular Law", [5, 4, 3]), ...hp("Specular Comics", [7])], new Map(), "attention");
t("needs attention first", revHist.map((h) => [h.channel, h.streak]), [["Specular Law", "concern"], ["Specular Comics", null], ["Specular Anime", "trophy"]]);
t("…or best first, or A–Z", [channelHistories(hp("A", [5]).concat(hp("B", [9])), new Map(), "best").map((h) => h.channel), channelHistories(hp("B", [5]).concat(hp("A", [9])), new Map(), "name").map((h) => h.channel)], [["B", "A"], ["A", "B"]]);
const histPage = renderRevisions(shellFix, [], undefined, { channels: revHist, all: revHist.map((h) => h.channel), ch: "", sort: "attention" });
t("the history draws a timeline a channel, a point a video", [(histPage.match(/class="timeline"/g) ?? []).length, (histPage.match(/class="tldot"/g) ?? []).length], [3, 7]);
t("…suggests the flag and the trophy", [histPage.includes('class="histalert bad"'), histPage.includes("🚩 Flag the channel"), histPage.includes("🏆 Give it a trophy")], [true, true, true]);
const flagged2 = channelHistories(hp("Specular Law", [5, 4, 3]), new Map([["Specular Law", "flag" as const]]));
t("…and shows a flag once it's set, without asking again", [renderRevisions(shellFix, [], undefined, { channels: flagged2, all: ["Specular Law"], ch: "", sort: "attention" }).includes("🚩 Flagged"), renderRevisions(shellFix, [], undefined, { channels: flagged2, all: ["Specular Law"], ch: "", sort: "attention" }).includes('class="histalert bad"')], [true, false]);
const revScored = { ...revRec, reviewScore: 4.5 } as typeof revRec;
t("a scored revision's card shows its score; every revision card has ★ Summarize", [renderList(shellFix, "R", "", [revScored]).includes(">4.5/10<"), renderList(shellFix, "R", "", [revRec]).includes('href="/r/40#summary"')], [true, true]);
const revPageSum = renderRecord(shellFix, revRec, { review: { recordId: 40, channel: "Specular Anime", video: "x", title: "x", version: 3, versions: 3, comments: revSum.comments, source: "pasted", summary: revSum.text, summaryBy: revSum.by, ownSummary: null, ownScore: null, autoScore: revSum.breakdown.auto, score: revSum.breakdown.score, breakdown: revSum.breakdown, summarizedAt: new Date() } });
t("a revision's page has its Summary: score, why, and the notes", [revPageSum.includes('id="summary"'), revPageSum.includes('class="scoreball"'), revPageSum.includes("How big:"), revPageSum.includes("Summarize again")], [true, true, true, true]);

section("Days off have no daily batches");
const offRec = renderRecurring({ ...shellFix, daysOff: ["2026-09-28"] } as typeof shellFix, { date: "2026-09-28", rows: [] },
  { date: "2026-09-28", rows: [{ channel: "Specular Studios Bits", total: 0, done: 0, removed: 0 }] }, [],
  [{ date: "2026-09-28", channels: 0, total: 0, done: 0 }, { date: "2026-09-29", channels: 0, total: 0, done: 0 }]);
t("today, a day off says so instead of listing batches", offRec.includes("A day off — no batches."), true);
t("…its day in the strip reads 'day off', and it can't be opened", [/daychip none dayoff[^>]*>[\s\S]*?day off<\/small>/.test(offRec), offRec.includes('value="2026-09-28"><button class="clear">Open this day')], [true, false]);

section("Pause a whole channel");
const pShell = { ...shellFix, pausedChannels: { "Specular Studios Bits": "2026-09-26" } } as typeof shellFix;
t("a channel's button pauses it, or resumes it once paused", [channelPauseButton(shellFix, "Specular Studios Bits").includes('action="/channels/pause"'), channelPauseButton(pShell, "Specular Studios Bits").includes('action="/channels/resume"')], [true, true]);
t("…pausing asks first; resuming doesn't", [channelPauseButton(shellFix, "Specular Studios Bits").includes("confirm("), channelPauseButton(pShell, "Specular Studios Bits").includes("confirm(")], [true, false]);
const pRec = renderRecurring(pShell, { date: "2026-09-26", rows: [{ channel: "Specular Studios Bits", total: 5, done: 0, removed: 0, paused: true }, { channel: "Specular Anime Bits", total: 5, done: 2, removed: 0 }] },
  { date: "2026-09-27", rows: [{ channel: "Specular Studios Bits", total: 0, done: 0, removed: 0, paused: true }, { channel: "Specular Anime Bits", total: 5, done: 0, removed: 0 }] }, []);
t("a paused recurring channel shows as paused on the Recurring tab, with Resume", [pRec.includes('class="batch chpaused"'), pRec.includes("Paused since 9/26/2026"), pRec.includes('action="/channels/resume"')], [true, true, true]);
t("…and leaves the day's count and the 'not open yet' count", [pRec.includes("2/5 uploads"), pRec.includes("Open the 1 channel")], [true, false]);
t("the sidebar's Paused link counts paused channels too", renderList(pShell, "Queue", "", []).includes("Paused · 0 · 1 channel"), true);

section("Where's the script? — attached, Story Lab, or the Scripts tab");
setScriptIndex({
  attached: [{ recordId: 70, title: "What If Gojo Was In Invincible?" }],
  lab: [{ title: "Could Batman Stop The Purge" }],
  delivered: [{ id: "t1", code: "VIDEO-031", title: "Thanos In The Boys", airDate: null, deadline: null, status: "SUBMITTED", role: "", delivered: ["https://docs.google.com/document/d/abc"], deliveredAt: null, discordUrl: null, needsReview: false },
    { id: "t2", code: "VIDEO-032", title: "Not Delivered Yet", airDate: null, deadline: null, status: "PENDING", role: "", delivered: [], deliveredAt: null, discordUrl: null, needsReview: false }],
});
t("a script attached on the video's page is found by the video", scriptFor({ id: 70 })?.where, ["attached"]);
t("…Story Lab's by its title, whatever the punctuation", scriptFor({ title: "Could Batman Stop the Purge?" })?.where, ["Story Lab"]);
t("…the Scripts tab's by its code, linking to the delivered doc", [scriptFor({ code: "video-031" })?.where, scriptFor({ code: "VIDEO-031" })?.href], [["Scripts tab"], "https://docs.google.com/document/d/abc"]);
t("…and nothing when it isn't delivered anywhere", [scriptFor({ code: "VIDEO-032", title: "Not Delivered Yet" }), scriptFor({ title: "Something Else" })], [null, null]);
const withS = { ...plainRec, id: 70, title: "What If Gojo Was In Invincible?", noScriptAt: null } as typeof plainRec;
const noS = { ...plainRec, id: 71, title: "Nothing Anywhere", code: null, noScriptAt: null } as typeof plainRec;
const sList = renderList(shellFix, "Q", "", [withS, noS]);
t("every video card says whether its script is somewhere", [/class="scriptmark has" href="\/r\/70#script" title="Script: attached"/.test(sList), sList.includes('class="scriptmark none"')], [true, true]);
t("…a batch or a revision has none to show", renderList(shellFix, "Q", "", [revRec, batchRec]).includes("class=\"scriptmark"), false);
t("…calendar cards carry it as an icon", renderWeek(shellFix, "2026-09-27", "posting", [{ date: "2026-09-28", list: [withS] }]).includes('class="scriptmark has icon"'), true);
t("…and the video's page says where", renderRecord(shellFix, withS).includes("found: attached"), true);
setScriptIndex({ attached: [], lab: [], delivered: [] });

section("Nothing assigned — clear a day by hand");
const gapShell2 = { ...shellFix, gaps: channelGaps("Specular Anime", 4, ["2026-09-24"], "2026-09-26") };
const gapDash2 = renderDashboard({ ...gapShell2, active: "dashboard" }, { stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never, byDay: [], grouped: new Map(), channels: {}, gaps: gapShell2.gaps });
t("each chip has × to clear its days", /action="\/gaps\/dismiss"[\s\S]*?name="days" value="2026-09-28,2026-10-02"/.test(gapDash2), true);
t("…each calendar slot × clears its own day", [renderWeek(gapShell2, "2026-09-27", "posting", [{ date: "2026-09-28", list: [] }]).includes('name="days" value="2026-09-28"'), renderCalendar(gapShell2, "2026-10", "posting", [], [], []).includes('name="days" value="2026-10-02"')], [true, true]);

section("Dashboard: Revisions as a column; daily batches are never late");
const lateBatch = { ...batchRec, id: 90, status: "open", deadline: new Date(Date.now() - 5 * 3_600_000), voDue: null, scriptDue: null } as typeof batchRec;
const bList = renderList(shellFix, "Q", "", [lateBatch]);
t("a daily batch past its time isn't late", [/class="due late"/.test(bList), bList.includes(" late</em>")], [false, false]);
t("…nor red on the calendar", renderWeek(shellFix, "2026-09-27", "deadlines", [{ date: "2026-09-28", list: [lateBatch] }]).includes('class="at over"'), false);
const oneOff = { ...plainRec, id: 91, deadline: new Date(Date.now() - 5 * 3_600_000), voDue: null, scriptDue: null } as typeof plainRec;
t("…one-off work still is", /class="due late"/.test(renderList(shellFix, "Q", "", [oneOff])), true);
const lowConf = { ...revRec, confidence: 0.4 } as typeof revRec;
t("a revision never says 'needs a look'", renderList(shellFix, "R", "", [lowConf]).includes("needs a look"), false);
const shortRev = { ...revRec, id: 41, title: "A" } as typeof revRec;
const longRev = { ...revRec, id: 42, title: "A Much Longer Revision Title That Wraps Onto Two Lines Or More Easily" } as typeof revRec;
const colDash = renderDashboard({ ...shellFix, active: "dashboard" }, { stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never, byDay: [], grouped: new Map(), channels: {}, revisions: [shortRev, longRev] });
t("revisions sit in the top row, between the chart and today", /class="split withrev"[\s\S]*?Work due by day[\s\S]*?class="panel revpanel dashpart"[\s\S]*?class="panel today"/.test(colDash), true);
t("…each card the same shape: title, chips, then the time and the buttons", (colDash.match(/<article class="revmini[^"]*">\s*<a class="rt"[\s\S]*?<div class="rchips">[\s\S]*?<div class="rfoot"><span class="rwhen/g) ?? []).length, 2);

section("Gaming — series, episodes and each channel's own pace");
const ep = (title: string) => {
  const m = episodeOf(title);
  return m ? [m.series, m.episode] : null;
};
t("an episode number after the series", ep("Minecraft Hardcore Ep 4: The Nether"), ["Minecraft Hardcore", 4]);
t("…before it, across a bar", ep("Episode 4 | Minecraft Hardcore"), ["Minecraft Hardcore", 4]);
t("…in brackets after a title of its own", ep("I Built a Castle (Minecraft Hardcore #3)"), ["Minecraft Hardcore", 3]);
t("…as a day, a part or a season", [ep("Day 5 of Roblox Doors"), ep("Roblox Doors Part 2"), ep("SMP S2 E5: Betrayal")], [["Roblox Doors", 5], ["Roblox Doors", 2], ["SMP Season 2", 5]]);
t("a count isn't an episode, nor is a #1 fan", [ep("I Survived 100 Days in Minecraft"), ep("Roblox #1 Fan Reacts"), ep("Top 10 Minecraft Seeds")], [null, null, null]);
t("the same series in any word order", seriesKey("Hardcore Minecraft") === seriesKey("Minecraft Hardcore"), true);

const gAt = (d: string) => new Date(`${d}T15:00:00-04:00`);
const threeDays = ["2026-08-20", "2026-08-23", "2026-08-26", "2026-08-29", "2026-09-01", "2026-09-04"].map(gAt);
t("a channel's own pace is its usual gap over 90 days", usualGap(threeDays, gAt("2026-09-06")), 3);
t("…with fewer than three gaps there's none to go on", usualGap(threeDays.slice(0, 3), gAt("2026-09-06")), null);
t("…and uploads older than 90 days don't count", usualGap(threeDays, gAt("2027-01-01")), null);
t("Gaming channels are held to their own pace", [ownPaceChannels(), isOwnPace("Specular FNAF"), isOwnPace("Specular Gaming Bits")], [["Specular Minecraft", "Specular Roblox"], false, false]);
setOwnPaces(new Map());
t("…with no target until it's read", everyFor("Specular Minecraft"), null);
setOwnPaces(new Map([["Specular Minecraft", 3], ["Specular Roblox", null]]));
t("…then its usual gap, like a Stories channel's four days", [everyFor("Specular Minecraft"), everyFor("Specular Roblox"), everyFor("Specular FNAF")], [3, null, 4]);
t("…so a gap past it is late, and an empty day is Nothing assigned", [cadenceFor("Specular Minecraft", [gAt("2026-09-20")], gAt("2026-09-25"), everyFor("Specular Minecraft")!).state, channelGaps("Specular Minecraft", everyFor("Specular Minecraft")!, ["2026-09-24"], "2026-09-26").map((g) => g.date)], ["behind", ["2026-09-27", "2026-09-30", "2026-10-03"]]);
t("Gaming says what it's held to", describeTarget("gaming").includes("its own usual gap"), true);

const gv = (channel: string, title: string, day: string, multiple: number | null): SeriesVideo =>
  ({ title, channel, publishedAt: gAt(day), url: `https://youtu.be/${encodeURIComponent(title)}`, views: 1000, multiple });
const gNow = gAt("2026-09-26");
const mc = "Specular Minecraft";
const gVideos = [
  // A series losing its audience: 2× down to under half.
  ...[2.1, 1.9, 2.0, 1.6, 0.8, 0.6, 0.5].map((m, i) => gv(mc, `Minecraft Hardcore Ep ${i + 1}`, shiftDate("2026-09-06", i * 3), m)),
  // One finding it: each episode better than the last.
  ...[0.7, 0.8, 0.9, 1.4, 1.6, 1.8].map((m, i) => gv(mc, `Skyblock #${i + 1}`, shiftDate("2026-09-10", i * 3), m)),
  // One that did well and stopped two months ago.
  ...[1.6, 1.5, 1.8].map((m, i) => gv(mc, `Day ${i + 1} of Roblox Doors`, shiftDate("2026-07-01", i * 4), m)),
  gv(mc, "I Survived 100 Days in Minecraft", "2026-09-20", 1.1),
  gv(mc, "Top 10 Minecraft Seeds", "2026-09-18", 0.9),
];
const gs = gamingSeries(gVideos, gNow);
const byName = new Map(gs.series.map((x) => [x.name, x]));
t("every numbered series, the one-offs counted apart", [gs.series.length, gs.oneOffs, gs.episodes], [3, 2, 16]);
t("live first, latest first", gs.series.map((x) => [x.name, x.live]), [["Skyblock", true], ["Minecraft Hardcore", true], ["Roblox Doors", false]]);
t("a series whose latest episodes draw less is fading", [byName.get("Minecraft Hardcore")!.trend, byName.get("Minecraft Hardcore")!.advice.startsWith("The latest episodes are drawing")], ["fading", true]);
t("…one whose latest draw more is growing", byName.get("Skyblock")!.trend, "rising");
t("the next episode, its title and when it's due at its pace", [byName.get("Skyblock")!.next, byName.get("Skyblock")!.draft, byName.get("Skyblock")!.gap, byName.get("Skyblock")!.nextDue], [7, "Skyblock #7", 3, "2026-09-28"]);
t("a series gone quiet is resting, and says when it was strong", [byName.get("Roblox Doors")!.live, byName.get("Roblox Doors")!.advice.includes("worth bringing back with Day 4")], [false, true]);
const nu = nextUp(gs.series, gNow);
t("what to make next: the growing one first, the resting hit after, the fading one left out", nu.map((n) => n.title), ["Skyblock #7", "Roblox Doors Day 4"]);
t("a single numbered episode this month starts a series; an old one is a one-off", [gamingSeries([gv(mc, "Bedwars Ep 1", "2026-09-20", null)], gNow).series.length, gamingSeries([gv(mc, "Bedwars Ep 1", "2026-05-20", null)], gNow).oneOffs], [1, 1]);
t("the Ideas engine reads gaming titles' shapes", ["Minecraft Hardcore Ep 4", "I Survived 100 Days in Minecraft", "Minecraft But Every Block Is TNT Challenge", "Roblox Tower Of Hell Obby", "Minecraft Speedrun", "What If Gojo Joined The Avengers?"].map(formatOf),
  ["Series episode", "100 Days", "Ranked", "Obby / Escape", "Speedrun", "What If"]);

const gLink = { channel: mc, input: "@x", youtubeId: "UC0000000000000000000009", title: mc, error: null, checkedAt: new Date() };
const gUps = gVideos.map((v, i) => ({ videoId: `g${i}`, channel: v.channel, title: v.title, publishedAt: v.publishedAt, url: v.url, views: v.views }));
const gCat = renderUploads(shellFix, {
  channels: [mc, "Specular Roblox"], links: [gLink], uploads: gUps,
  cadence: [cadenceFor(mc, gUps.map((u) => u.publishedAt), gNow, 3), cadenceFor("Specular Roblox", [], gNow, 36_500)],
  range: 90, hasKey: false, category: "gaming", series: gs,
}, gNow);
t("the Gaming tab: its pace and its series", [gCat.includes("each channel's own usual pace"), gCat.includes('id="series"'), (gCat.match(/class="srow[ "]/g) ?? []).length, gCat.includes("▼ Fading"), gCat.includes("▲ Growing"), gCat.includes("Resting")], [true, true, 3, true, true, true]);
t("…each series links its channel's own page, and its episodes carry their numbers", [gCat.includes('href="/uploads/channel/minecraft"'), gCat.includes("Ep 7 · Minecraft Hardcore Ep 7")], [true, true]);
t("…and its scripts compile", [...gCat.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
const gCh = renderUploads(shellFix, {
  channels: [mc], links: [gLink], uploads: gUps, cadence: [cadenceFor(mc, gUps.map((u) => u.publishedAt), gNow, 3)],
  range: 90, hasKey: false, category: "gaming", focus: { channel: mc, all: gUps, series: gs.series, next: nu },
}, gNow);
t("a Gaming channel's page: what it could make next, and its series", [gCh.includes("What Specular Minecraft could make next"), gCh.includes("<b>Skyblock #7</b>"), gCh.includes("<b>Roblox Doors Day 4</b>") && gCh.includes("Bring it back"), gCh.includes('id="series"')], [true, true, true, true]);
t("…held to its own usual pace, and says so", gCh.includes("every 3 days — its own usual pace over 90 days"), true);
const gNone = renderUploads(shellFix, {
  channels: ["Specular Roblox"], links: [{ ...gLink, channel: "Specular Roblox", title: "Specular Roblox" }], uploads: [], cadence: [cadenceFor("Specular Roblox", [], gNow, 36_500)],
  range: 90, hasKey: false, category: "gaming", focus: { channel: "Specular Roblox", all: [], series: [], next: [] },
}, gNow);
t("…and with no series yet says how one starts", [gNone.includes("No series running yet"), gNone.includes("held to its own usual pace once it has four uploads")], [true, true]);
setOwnPaces(new Map());

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);
process.exit(fail > 0 ? 1 : 0);
