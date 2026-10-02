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
import { readFileSync, readdirSync } from "node:fs";
import { fetchScriptReport, readReport } from "../src/web/scriptcheck.js";
import { config, configProblems, siteAddress } from "../src/config.js";
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
import { liveKey, mask, quotaResetAfter, seal, splitKeys, testKey, unseal } from "../src/db/keys.js";
import { channelPauseButton, renderRecord, renderWhatsNew } from "../src/web/page.js";
import { esc, jsonForScript, safeHref, safeUrl } from "../src/web/html.js";
import { RELEASES, releaseNotices } from "../src/web/changelog.js";
import { channelGaps, nextToAssign, uploadGaps } from "../src/web/gaps.js";
import { DEFAULT_ESTIMATES as ESTIMATE_MIN, setEstimates, typeEstimate, channelEstimate, taskCategoryEstimate, dayLoads, doAhead, forgottenWork, projectBatches, toItem, typeOf, voQueue, whatNext, readMinutes } from "../src/web/work.js";
import { renderForgotten, renderMyDay, renderRecording, renderVoQueue, fmtMin } from "../src/web/page.js";
import { renderTasks } from "../src/web/page.js";
import { matchPosts, titleOverlap } from "../src/web/postcheck.js";
import { taskItem, isRequired, shownTypes, spreadDayOff, logDays, logByDay } from "../src/web/work.js";
import { parseTask, properCase } from "../src/tasks/parse.js";
import { nextOccurrence } from "../src/tasks/repeat.js";
import { fmtMoney, parseMoney, monthlyEquivalent, nextBill as finNextBill, monthEnd as finMonthEnd, monthsEnding as finMonthsEnding } from "../src/finance/money.js";
import { computePay, describePay, modelOn, parseTiers } from "../src/finance/pay.js";
import { DEFAULT_THRESHOLDS, breakEven, derived, pnl as finPnl, project as finProject, reportingMonth, sustainability, type ExpenseFact, type Facts } from "../src/finance/metrics.js";
import { parseMultipart } from "../src/web/finance/routes.js";
import { moviePicks, sleepPicks, shapeOf, oneEach, nextMovieSlot, nextSleepSlot, maxOverlap, type Source as CompSource } from "../src/compilations/engine.js";
import { tidyPackage } from "../src/compilations/package.js";
import { clock, outputBlock, packageBlock, parseRuntime, videoIdOf } from "../src/web/specular.js";
import { readSplits, voiceBox, checkMark, channelChips } from "../src/web/finance/ui.js";
import { readByRules, missingFor, amountsIn, channelsIn } from "../src/finance/voice.js";
import { payChannels } from "../src/finance/pay.js";
import type { Task } from "../src/db/tasks.js";
import { scriptFor, setScriptIndex } from "../src/web/scriptindex.js";
import { frameioIsRevision, isAssignmentPost } from "../src/parse/classify.js";
import { commentsFromFrameio, ownNotes, parsePasted } from "../src/revisions/comments.js";
import { scoreRevision, severityOf, themeOf } from "../src/revisions/score.js";
import { channelHistories, streakOf } from "../src/revisions/history.js";
import { summarize } from "../src/revisions/summarize.js";
import { videoKey } from "../src/db/revisions.js";
import { NeighbourIndex, scoreIdea, writeNext } from "../src/web/stories/writenext.js";
import { indexPublic } from "../src/web/stories/lab.js";
import { fromLegacy, fromNpf, oldestStamp, parseTumblrUrl } from "../src/ideas/tumblr.js";
import { decodeEntities, htmlToText, imagesIn } from "../src/ideas/html.js";
import { addsCommentary, basicFilter } from "../src/ideas/filter.js";
import { engagementSignal, recencyWeight, scoreIdea as scoreBitsIdea, triageScore, type ScoreInput, type SimilarMatch } from "../src/ideas/score.js";
import { nearestHistory, wordsOf, type HistoryItem } from "../src/ideas/similar.js";
import { nextPollMinutes, pacedAllowance } from "../src/ideas/pace.js";
import { estimateCost, feedHref, ideaCard, renderIdeaFeed, renderIdeaSources } from "../src/web/bitsfeed/pages.js";
import type { SourceRow } from "../src/db/ideas.js";
import { channelStats, conceptGaps, emergingTopics, myPosition, rowsOf, whatsWorking } from "../src/competitors/analysis.js";
import { conceptKey, ruleConcept } from "../src/competitors/concepts.js";
import type { CompChannel, Concept, NicheVideo } from "../src/db/competitors.js";
import { checkPassword, clearLoginFailures, cookieOptions, hashPassword, issueToken, loginWait, noteLoginFailure, setStoredPassword, verifyToken } from "../src/web/auth.js";
import { contentDisposition, localPath, refererPath } from "../src/web/http.js";
import { COMP_BOUNDS, compSetting } from "../src/db/competitors.js";
import { IDEA_BOUNDS, ideaSetting } from "../src/db/ideas.js";
import { NAME_ARRAYS, NAME_COLUMNS } from "../src/db/channelsettings.js";
import { modelFor } from "../src/ai/claude.js";
import { applyChannelSettings, checkChannelName, newChannelId } from "../src/catalog.js";
import { systemPrompt } from "../src/parse/classify.js";
import { distinctColour } from "../src/jobs/avatars.js";
import { channelProfile, fitsChannel, focusBaseline, focusChoices, nameFocus, piecesOfTitle } from "../src/web/stories/domain.js";
import { norm, perfStats, shapeStats, titleShape, writtenIdea, type LabIdea, type LabVideo } from "../src/web/stories/lab.js";
import { storyRequest, storySystem, vetIdeas } from "../src/web/stories/brainstorm.js";

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

const rec = derive(base, "no links in this one", new Date("2026-09-20T12:00:00Z")); // filed before the VO date, so nothing is already late
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
t("bell: a filter for every kind, plus All", (pages.dashboard.match(/class="nf[^"]*" data-f="/g) ?? []).length, 10);
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
t("commas and semicolons are escaped", ics.replace(/\r\n /g, "").includes("A long\\, long title\\, with commas\\; and semicolons"), true);
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
t("every sidebar item can be switched off", RAIL_ITEMS.length, 15 + CATEGORIES.length + 5);
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
t("a video pushed later leaves no gap before it — only after the last one lined up", gd(channelGaps("E", 4, ["2026-09-24", "2026-10-01"], "2026-09-26")), []);
t("…and past the last scheduled video, the empty days are gaps", gd(channelGaps("E", 4, ["2026-09-24", "2026-09-29"], "2026-09-26")), [["2026-10-03", 7]]);
t("a late video (due before today) still counts as the channel's last", gd(channelGaps("F", 4, ["2026-09-25"], "2026-09-26")), [["2026-09-29", 3], ["2026-10-03", 7]]);
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

section("Work due by day counts revisions as their own layer");
const rtoday = shiftDate(dateIn("America/New_York"), 0);
const chartDash = renderDashboard({ ...shellFix, active: "dashboard" }, {
  stats: { late: 0, dueToday: 0, voToRecord: 0, shippedThisWeek: 0 } as never,
  byDay: [{ date: null, counts: { revisions: 1 }, total: 1 }, { date: rtoday, counts: { stories: 2, revisions: 3 }, total: 5 }],
  grouped: new Map(), channels: {},
});
t("each pill has a revisions layer, in the revisions colour", [chartDash.includes("<title>Revisions: 3</title>"), chartDash.includes("<title>Revisions: 1</title>"), chartDash.includes('fill="url(#revstripe)"')], [true, true, true]);
t("…stacked on top of the categories", chartDash.indexOf("<title>Stories: 2</title>") < chartDash.indexOf("<title>Revisions: 3</title>"), true);
t("…in the legend, after the categories", /Movies<\/span><span class="revkey" style="--c:#7D8AF5"><i><\/i>Revisions<\/span>/.test(chartDash), true);
t("…and today's panel counts them", /Revisions<span class="n">3<\/span>/.test(chartDash), true);
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
const weak = gamingSeries([0.5, 0.6, 0.5].map((m, i) => gv(mc, `Bedwars Part ${i + 1}`, shiftDate("2026-09-18", i * 3), m)), gNow).series;
t("…and one running well below the channel's usual isn't suggested either", [weak[0]!.live, weak[0]!.trend, nextUp(weak, gNow).length], [true, null, 0]);
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
const gWeak = renderUploads(shellFix, {
  channels: [mc], links: [gLink], uploads: gUps, cadence: [cadenceFor(mc, gUps.map((u) => u.publishedAt), gNow, 3)],
  range: 90, hasKey: false, category: "gaming", focus: { channel: mc, all: gUps, series: weak, next: [] },
}, gNow);
t("…and when every running series is weak, it says so rather than 'no series'", [gWeak.includes("Nothing to go on with"), gWeak.includes("No series running yet")], [true, false]);
t("…and with no series yet says how one starts", [gNone.includes("No series running yet"), gNone.includes("held to its own usual pace once it has four uploads")], [true, true]);
setOwnPaces(new Map());

section("Recurring: a tapped segment saves what was tapped");
const recScript = [...renderRecurring(shellFix, { date: "2026-09-26", rows: [{ channel: "Specular DC", total: 5, done: 0, removed: 0 }] }, { date: "2026-09-27", rows: [] }, [], [], 90).matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!).find((x) => x.includes("/recurring/progress"))!;
t("the count is read from the form before the segments step it back", recScript.indexOf("var body = new URLSearchParams(new FormData(form))") < recScript.indexOf("fill(form);"), true);
const recPills = renderRecurring(shellFix, { date: "2026-09-26", rows: [{ channel: "Specular DC", total: 5, done: 2, removed: 0 }] }, { date: "2026-09-27", rows: [] }, [], [], 90);
t("…and each segment asks for its own number (the last filled one steps back)", [...recPills.matchAll(/name="done" value="(\d)"/g)].map((m) => m[1]), ["1", "1", "3", "4", "5"]);

section("Revisions: a reviewed revision stays in History, scored or not");
const doneRev = (id: number, title: string, score: number | null) =>
  ({ ...revRec, id, title, status: "done", reviewScore: score ?? undefined, reviewedAt: new Date("2026-09-26T15:00:00Z") }) as unknown as typeof revRec & { reviewedAt: Date };
const withReviewed = renderRevisions(shellFix, [], undefined, { channels: [], all: [], ch: "", sort: "attention", reviewed: [doneRev(61, "Unscored Cut", null), doneRev(62, "Scored Cut", 8.5)] });
t("History lists every reviewed revision", [withReviewed.includes('id="reviewed"'), (withReviewed.match(/class="rdrow"/g) ?? []).length], [true, 2]);
t("…one without a score offers to score it, one with shows it", [/href="\/r\/61#summary"[^>]*>★ Score it</.test(withReviewed), withReviewed.includes("8.5/10")], [true, true]);
t("…and says how many are unscored", withReviewed.includes("1 without a score"), true);
t("Waiting says where a ✓'d revision goes", renderRevisions(shellFix, [revRec]).includes("moves it to <a href=\"/revisions?view=history\">History</a>"), true);

section("Story Lab: Unassigned videos, and a script linked to one");
const uaVideos = [
  { title: "What If Gojo Was In <FNAF>?", channel: "Specular FNAF", url: "https://youtu.be/a", publishedAt: new Date("2026-09-20T12:00:00Z"), views: 120_000 },
  { title: "Could Batman Survive The Purge?", channel: "Specular Studios", url: "https://youtu.be/b", publishedAt: new Date("2026-09-18T12:00:00Z"), views: null },
];
const labBase = {
  scripts: 1, words: 1000, matched: 0, ideas: [], blueprint: null, picked: { format: "insert", hero: "", world: "", power: "", target: "" },
  check: null, contrast: null, results: [], coverage: { heroes: [], worlds: [], done: new Set<string>() }, formats: [],
};
const uaShut = renderStoryLab(shellFix, { ...labBase, unassigned: { videos: uaVideos, total: 10, open: false, linked: "", error: "" } });
t("a section says how many uploads have no script, closed until clicked", [uaShut.includes('<details class="panel ideas unassigned" id="unassigned">'), /Unassigned videos <span class="uacount">2</.test(uaShut), uaShut.includes("8 of 10 have one")], [true, true, true]);
t("…each video can have its script linked right there, by its title", [(uaShut.match(/<form class="sform uaform" method="post" action="\/story-lab\/scripts">/g) ?? []).length, uaShut.includes('name="title" value="Could Batman Survive The Purge?"'), uaShut.includes('name="from" value="unassigned"')], [2, true, true]);
t("…titles are escaped", uaShut.includes("<FNAF>"), false);
t("…and its channel picker's script compiles", [...uaShut.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
const uaBack = renderStoryLab(shellFix, { ...labBase, unassigned: { videos: uaVideos.slice(1), total: 10, open: true, linked: "What If Gojo Was In FNAF?", error: "" } });
t("after linking it comes back open, saying so", [uaBack.includes('id="unassigned" open'), uaBack.includes("Script linked to <b>What If Gojo Was In FNAF?</b>. It's that video's script now")], [true, true]);
t("…and with nothing unassigned it says so", renderStoryLab(shellFix, { ...labBase, unassigned: { videos: [], total: 3, open: true, linked: "", error: "" } }).includes("Every Stories upload has its script"), true);

section("My Day — Ash's work as time");
const wNow = new Date("2026-09-27T15:00:00Z"); // 11 AM ET
const wToday = "2026-09-27";
const mk = (o: Record<string, unknown>) => ({ ...plainRec, pausedAt: null, noScriptAt: null, uploadedAt: null, pinnedAt: null, batchNo: null, kind: "assignment", status: "open", voDue: null, deadline: null, scriptDue: null, airDate: null, code: null, wordCount: null, createdAt: new Date("2026-09-20T12:00:00Z"), ...o }) as typeof plainRec;
const lateVo = mk({ id: 201, category: "stories", title: "Late VO", voDue: new Date("2026-09-26T03:59:00Z"), airDate: "2026-09-29", wordCount: 4500 });
const todayVo = mk({ id: 202, category: "stories", title: "Today VO", voDue: new Date("2026-09-28T03:59:00Z"), airDate: "2026-10-03", wordCount: 3000 });
const aheadVo = mk({ id: 203, category: "stories", title: "Ahead VO", voDue: new Date("2026-10-02T03:59:00Z"), airDate: "2026-10-08" });
const gameVid = mk({ id: 204, category: "gaming", title: "SMP ep 10", deadline: new Date("2026-09-27T22:00:00Z") });
const batchToday = mk({ id: 205, category: "bits", channel: "Specular Anime Bits", batchNo: 1, title: "Specular Anime Bits", airDate: "2026-09-27", deadline: new Date("2026-09-27T22:00:00Z") });
const revToday = mk({ id: 206, kind: "review", category: "stories", title: "Rev", deadline: new Date("2026-09-27T20:00:00Z") });
const wLongForm = mk({ id: 207, category: "movies", channel: "Specular", batchNo: 1, title: "Specular", airDate: "2026-09-30", deadline: new Date("2026-09-30T22:00:00Z") });
t("each kind of work has its estimate: VO 40, Bits batch 10, Gaming 45", [typeOf(lateVo), ESTIMATE_MIN.vo, typeOf(batchToday), ESTIMATE_MIN.bits, typeOf(gameVid), ESTIMATE_MIN.gaming, typeOf(revToday), typeOf(wLongForm)], ["vo", 40, "bits", 10, "gaming", 45, "revision", "longform"]);
t("Reading batches and Movies VOs are their own kinds", [typeOf(mk({ category: "reading", channel: "Specular DC", batchNo: 1 })), typeOf(mk({ category: "movies", title: "A Movie" }))], ["reading", "moviesvo"]);
const wItems = [lateVo, todayVo, aheadVo, gameVid, batchToday, revToday, wLongForm].map((r) => toItem(r, r.id === 202 ? 25 : 0)!);
const loads = dayLoads(wItems, ["2026-09-27", "2026-09-28", "2026-10-01"], wToday);
t("today's load counts what's due today and anything late", [loads[0]!.est, loads[0]!.byType.vo.n, loads[0]!.left], [40 + 40 + 45 + 10 + 15, 2, 40 + 15 + 45 + 10 + 15]);
t("a future day holds what's due that day", loads[2]!.byType.vo, { n: 1, est: 40 });
const proj = projectBatches(["2026-09-28"], [batchToday], { paused: new Set(["Specular Studios Bits"]), daysOff: new Set() });
t("batches that will open on a day count before they're open — a paused channel's don't", [proj.length > 5, proj.every((i) => i.projected && i.id === null), proj.some((i) => i.channel === "Specular Studios Bits")], [true, true, false]);
t("…and a day off has none", projectBatches(["2026-09-28"], [], { paused: new Set(), daysOff: new Set(["2026-09-28"]) }).length, 0);
const next1 = whatNext(wItems, wNow, null)!;
t("What should I do next: the late one first", [next1.items[0]!.id, next1.ahead], [201, false]);
const next30 = whatNext(wItems, wNow, 30)!;
t("…with 30 minutes: the most pressing pieces that fit", [next30.items.map((i) => i.id), next30.minutes <= 30], [[206, 202], true]);
const next15 = whatNext([toItem(lateVo)!], wNow, 15)!;
t("…nothing fits: start the most pressing anyway", [next15.items[0]!.id, next15.reason.startsWith("Nothing fits 15 min")], [201, true]);
const aheadOnly = whatNext([toItem(aheadVo)!, toItem(wLongForm)!], wNow, null)!;
t("…everything due done: from Do ahead", [aheadOnly.ahead, aheadOnly.items[0]!.id], [true, 203]);
t("Do ahead puts VOs first — the team waits on them", doAhead(wItems, wNow).map((i) => i.id), [203, 207]);
t("the VO queue: late first, then by VO time", voQueue(wItems, wNow).map((i) => i.id), [201, 202, 203]);
t("reading time from the word count, at 150 wpm", [readMinutes(4500), readMinutes(null), fmtMin(40), fmtMin(130), fmtMin(60)], [30, null, "40m", "2h 10m", "1h"]);

const myDay = renderMyDay(shellFix, {
  now: wNow, today: wToday, required: wItems.filter((i) => i.day! <= wToday), ahead: doAhead(wItems, wNow), done: [],
  loads, trackedToday: 12, running: { recordId: 202, startedAt: new Date(wNow.getTime() - 60_000), title: "Today VO", est: 40, spentBefore: 24 },
  focus: next30, budget: 30, asked: true, voLeft: { n: 3, minutes: 95 },
});
t("My Day: the load, a timer running, the week by kind, and What next", [myDay.includes('class="timerbar"'), myDay.includes("today&#39;s load"), myDay.includes('class="lrow today"'), myDay.includes("2 pieces that fit 30 min"), /class="fchip on"[^>]*>30 min/.test(myDay)], [true, true, true, true, true]);
t("…each piece shows tracked against its estimate, with start and done", [myDay.includes("25m / 40m"), myDay.includes('action="/timer/start"'), myDay.includes('action="/timer/done"'), myDay.includes('class="wbtn on"')], [true, true, true, true]);
t("My Day switches: a kind switched off leaves the page", [[...shownTypes(["vo", "batch"])].sort(), shownTypes([]).size], [["gaming", "longform", "revision", "task"], 8]);
const bitsRec = mk({ id: 230, category: "bits", channel: "Specular FNAF Bits", title: "Specular FNAF Bits", batchNo: 1, batchTarget: 5, batchDone: 2, airDate: wToday });
const exploded = renderMyDay(shellFix, { now: wNow, today: wToday, required: [toItem(bitsRec)!], ahead: [], done: [{ ...toItem(lateVo)!, untracked: true }, { ...toItem(todayVo)!, spent: 20 }], loads, trackedToday: 0, running: null, focus: null, budget: null, asked: false, voLeft: { n: 0, minutes: 0 }, hidden: ["task"], exploded: true });
t("My Day: switches (Task off), exploded batches one row per channel with their progress, and No time on what's done", [
  (exploded.match(/name="show" value="[a-z]+" checked/g) ?? []).length, exploded.includes('value="task" onchange'), exploded.includes('<span class="wunits">2/5 uploaded</span>'),
  exploded.includes("my-day/unit"), exploded.includes("⤡ Group batches"), exploded.includes("logged · no time"), (exploded.match(/action="\/timer\/clear"/g) ?? []).length,
], [5, true, true, false, true, true, 1]);
const spreadVos = [301, 302, 303, 304].map((id) => ({ ...toItem(mk({ id, category: "stories", title: `VO ${id}`, airDate: "2026-10-04", voDue: new Date("2026-10-03T22:00:00Z") }))! }));
const offDays = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
t("a day off in 5 days with 4 VOs on it: one VO a day until then, not all on the day before", [...spreadDayOff(spreadVos, offDays, new Map([["2026-09-29", 60]])).values()].sort(), offDays);
const sp6 = spreadDayOff([...spreadVos, ...[305, 306].map((id) => toItem(mk({ id, kind: "review", category: "stories", title: `Rev ${id}`, deadline: new Date("2026-10-03T22:00:00Z") }))!)], offDays, new Map([["2026-09-29", 120]]));
const perDay = (m: Map<number, string>) => offDays.map((d) => [...m.values()].filter((x) => x === d).length);
t("…six pieces over four days: two days take two, the lightest ones, and VOs go first", [perDay(sp6), sp6.get(301), sp6.get(305)! > sp6.get(304)!], [[1, 1, 2, 2], "2026-09-29", true]);
t("…nowhere to spread: nothing moves", spreadDayOff(spreadVos, []).size, 0);
const voPage = renderVoQueue(shellFix, { now: wNow, queue: voQueue(wItems, wNow), running: null });
t("VO Queue: count, time left, words and reading time, and recording mode", [voPage.includes("VOs to record"), voPage.includes("7,500"), voPage.includes('href="/vo/record"'), voPage.includes("4,500 words · ~30m read")], [true, true, true, true]);
const wRec = renderRecording(shellFix, { now: wNow, current: toItem(lateVo)!, position: 1, total: 3, next: [toItem(todayVo)!], running: null, skipped: [], brief: "A brief." });
t("recording mode: one VO, a clock, Recorded — next, and Skip", [wRec.includes("VO 1 of 3"), wRec.includes('action="/vo/record/done"'), wRec.includes('href="/vo/record?skip=201"'), wRec.includes("Up next")], [true, true, true, true]);

section("Forgotten work");
const soonNoScript = mk({ id: 210, category: "stories", title: "Airs Soon Unwritten", airDate: "2026-09-30" });
const soonWithCut = mk({ id: 211, category: "stories", title: "Airs Soon Cut", airDate: "2026-09-30" });
const voClose = mk({ id: 212, category: "stories", title: "VO Close", airDate: "2026-09-29", voDue: new Date("2026-09-28T03:59:00Z") });
const oldUnsorted = mk({ id: 213, category: "unknown", title: "What is this", createdAt: new Date("2026-09-23T12:00:00Z") });
const lateRev = mk({ id: 214, kind: "review", category: "gaming", title: "Late Rev", deadline: new Date("2026-09-26T12:00:00Z") });
const pausedLate = mk({ id: 215, category: "stories", title: "Paused", voDue: new Date("2026-09-20T03:59:00Z"), pausedAt: new Date() });
const flags = forgottenWork([lateVo, soonNoScript, soonWithCut, voClose, oldUnsorted, lateRev, pausedLate], wNow, {
  script: (r) => r.id === 212,
  revision: (r) => r.id === 211,
});
t("flags: overdue VO, overdue revision, not started, VO close to air, unsorted — not what's paused", flags.map((f) => `${f.kind}:${f.record.id}`), ["overdue-vo:201", "not-started:210", "vo-close:212", "unsorted:213", "overdue-revision:214"]);
const fPage = renderForgotten(shellFix, { gaps: channelGaps("Specular Anime", 4, ["2026-09-24"], wToday), flags });
t("the Forgotten page: nothing assigned, then each kind with why", [fPage.includes("Nothing assigned"), fPage.includes("Overdue VOs"), fPage.includes("no script, no cut yet"), fPage.includes("Unsorted")], [true, true, true, true]);

section("Tasks");
const tkNow = new Date("2026-09-27T20:00:00Z"); // 4 PM ET, a Sunday
const tk = (comment: string, forwarded?: string) => parseTask({ comment, forwarded, now: tkNow });
t("Pay Divas: Payment, Divas", [tk("Pay Divas").category, tk("Pay Divas").person], ["payment", "Divas"]);
t("Respond to Seb sponsorship thread: Response, Seb", [tk("Respond to Seb sponsorship thread").category, tk("Respond to Seb sponsorship thread").person], ["response", "Seb"]);
t("Check editor revision thread: Production", tk("Check editor revision thread").category, "production");
t("Follow up with Vyasa about X: Response, Vyasa", [tk("Follow up with Vyasa about X").category, tk("Follow up with Vyasa about X").person], ["response", "Vyasa"]);
t("sponsor contract: Business; hiring: Team; monetization: Channel", [tk("Sign the sponsor contract").category, tk("Interview the new editor candidate").category, tk("Turn on monetization for the new channel").category], ["business", "team", "channel"]);
t("priority is separate from category: Payment + Urgent", [tk("Pay Divas urgent").category, tk("Pay Divas urgent").priority], ["payment", "urgent"]);
t("urgency and timing words leave the title", [tk("Pay Divas urgent").title, tk("Pay Divas by Friday, urgent").title, tk("Renew the LLC report whenever").title], ["Pay Divas", "Pay Divas", "Renew the LLC report"]);
t("a date is read, and a near one raises the priority", [Boolean(tk("Pay Divas by Friday").due), tk("Respond to Seb today").priority, tk("Whenever you can, tidy the drive").priority], [true, "urgent", "low"]);
t("urgent with nowhere else to go is the Priority category", tk("urgent: the thing with the thing").category, "priority");
t("just 'urgent!!' on a forward: the title comes from the forward", [tk("urgent!!", "Copyright claim on the new upload").title, tk("urgent!!", "Copyright claim on the new upload").category], ["Copyright claim on the new upload", "channel"]);
t("a known person is recognised", parseTask({ comment: "sort the invoice for divas", people: ["Divas"], now: tkNow }).person, "Divas");

const mkTask = (o: Partial<Task>): Task => ({
  id: 1, title: "T", body: "", category: "general", priority: "normal", person: null, due: null, estMin: null, status: "open",
  snoozedUntil: null, sourceUrl: null, captureUrl: null, author: null, createdAt: tkNow, doneAt: null, notes: "", repeat: null, ...o,
});
const payTask = mkTask({ id: 1, title: "Pay Divas", category: "payment", priority: "urgent", person: "Divas", sourceUrl: "https://discord.com/channels/1/2/3" });
const replyTask = mkTask({ id: 2, title: "Respond to Seb", category: "response", priority: "high" });
const lowTask = mkTask({ id: 3, title: "Tidy the drive", category: "general", priority: "low" });
t("tasks as work: estimate from the category (Pay 2m, Respond 5m) or set by hand", [taskItem(payTask, tkNow).est, taskItem(replyTask, tkNow).est, taskItem(mkTask({ estMin: 25 }), tkNow).est], [2, 5, 25]);
t("an urgent task counts toward today beside the VOs; others go ahead or stay on Tasks", [isRequired(taskItem(payTask, tkNow), "2026-09-27"), isRequired(taskItem(replyTask, tkNow), "2026-09-27"), doAhead([taskItem(replyTask, tkNow), taskItem(lowTask, tkNow)], tkNow).map((i) => i.id)], [true, false, [2]]);
const tasksPage = renderTasks(shellFix, { now: tkNow, todo: [payTask, replyTask, lowTask], snoozed: [mkTask({ id: 4, title: "Later", snoozedUntil: new Date(tkNow.getTime() + 3_600_000) })], done: [mkTask({ id: 5, title: "Old", status: "done", doneAt: tkNow })], running: null });
t("the Tasks page: To do · N, grouped by priority, category beside the title", [tasksPage.includes("To do · 3"), tasksPage.includes("URGENT"), tasksPage.includes("HIGH"), tasksPage.includes("LOW"), tasksPage.includes("· 💰 Payment")], [true, true, true, true, true]);
t("…Complete, Snooze, Open Discord, a timer and Edit on each", [tasksPage.includes('action="/tasks/1/done"'), tasksPage.includes('action="/tasks/1/snooze"'), tasksPage.includes('href="https://discord.com/channels/1/2/3"'), tasksPage.includes('name="kind" value="task"'), tasksPage.includes('action="/tasks/1/edit"')], [true, true, true, true, true]);
t("…snoozed and done folded away", [tasksPage.includes("Snoozed · 1"), tasksPage.includes("Done · 1"), tasksPage.includes('action="/tasks/5/reopen"')], [true, true, true]);

section("Time estimates — one source for every page");
setEstimates(new Map([["type:reading", 8], ["channel:Specular Anime Bits", 14], ["task:payment", 3], ["type:vo", 35]]));
t("a changed kind applies to every channel of that kind; a channel can have its own", [channelEstimate("Specular DC"), channelEstimate("Specular Anime Bits"), channelEstimate("Specular FNAF Bits"), typeEstimate("vo")], [8, 14, 10, 35]);
t("…records and projected batches take them", [toItem(lateVo)!.est, toItem(batchToday)!.est, projectBatches(["2026-09-28"], [], { paused: new Set(), daysOff: new Set() }).find((i) => i.channel === "Specular DC")!.est], [35, 14, 8]);
t("…and tasks: the category's, unless the task has its own", [taskCategoryEstimate("payment"), taskItem(mkTask({ category: "payment" }), tkNow).est, taskItem(mkTask({ category: "payment", estMin: 7 }), tkNow).est], [3, 3, 7]);
const estPage = renderSettings(shellFix, { railHide: [], dashHide: [], daysOff: [], shifted: [], saved: false, scripts: false, estimatesSaved: true });
t("the Settings page: Time estimates with work, each recurring channel, and task categories", [estPage.includes('id="estimates"'), estPage.includes('name="e:type:moviesvo"'), estPage.includes('name="e:channel:Specular DC"'), estPage.includes('name="e:task:payment"'), estPage.includes("everything's recalculated")], [true, true, true, true, true]);
t("…a changed one shows its value, an unchanged one its default as a placeholder", [/name="e:type:reading"[^>]*value="8"/.test(estPage), /name="e:type:gaming"[^>]*value="" placeholder="45"/.test(estPage)], [true, true]);
setEstimates(new Map());
t("…and back to defaults", [channelEstimate("Specular DC"), typeEstimate("vo")], [10, 40]);

section("Tasks — notes, repeats, capitals");
t("repeats: the next falls after today, counted from when it was due", [nextOccurrence("2026-09-28", "daily", "2026-09-28"), nextOccurrence("2026-09-20", "daily", "2026-09-28"), nextOccurrence("2026-09-25", "weekdays", "2026-09-25"), nextOccurrence("2026-01-31", "monthly", "2026-01-31"), nextOccurrence("2026-09-28", "biweekly", "2026-09-28")], ["2026-09-29", "2026-09-29", "2026-09-28", "2026-02-28", "2026-10-12"]);
t("repeats read from the words, and left out of the title", [tk("renew adobe every month").repeat, tk("renew adobe every month").title, tk("send Vyasa the script every monday").repeat, tk("check comments daily").repeat, tk("Pay Divas").repeat], ["monthly", "Renew Adobe", "weekly", "daily", null]);
t("proper nouns get their capitals", [properCase("pay divas for the anime edit on friday", ["Divas"]), properCase("i need to call adobe about the llc card"), properCase("ask @kay about the discord server")], ["pay Divas for the Anime edit on Friday", "I need to call Adobe about the LLC card", "ask @kay about the Discord server"]);
t("…but everyday words stay as they are", [properCase("send you the file and chase up the law firm"), properCase("post to specular law and the fnaf bits channel")], ["send you the file and chase up the law firm", "post to Specular Law and the FNAF Bits channel"]);
t("…in a task's title from the start", parseTask({ comment: "ask vyasa about the fnaf bits thumbnail", people: ["Vyasa"], now: tkNow }).title, "Ask Vyasa about the FNAF Bits thumbnail");
const repTask = mkTask({ id: 21, title: "Renew Adobe", repeat: "monthly", notes: "Card ends in 4411\nCheck the price" });
const repPage = renderTasks(shellFix, { now: tkNow, todo: [mkTask({ id: 20, title: "One-off" }), repTask], snoozed: [], done: [], running: null });
t("recurring tasks have their own section; the count is one-offs", [repPage.includes("↻ RECURRING"), repPage.includes("To do · 1"), repPage.includes("Every month")], [true, true, true]);
t("notes show under the task and are editable", [repPage.includes('class="tnote"'), repPage.includes("Card ends in 4411"), repPage.includes('name="notes"'), repPage.includes('name="repeat"')], [true, true, true, true]);

section("Finance — money, months, bills");
t("money reads with sign and compact", [fmtMoney(800000), fmtMoney(610000, { sign: true }), fmtMoney(-162000), fmtMoney(820000, { compact: true }), fmtMoney(2609, { exact: true })], ["$8,000", "+$6,100", "−$1,620", "$8.2K", "$26.09"]);
t("money is parsed from what's typed", [parseMoney("1,234.50"), parseMoney("$12k"), parseMoney("250"), parseMoney("abc"), parseMoney("")], [123450, 1200000, 25000, null, null]);
t("a subscription's true monthly cost", [monthlyEquivalent(12000, "annual"), monthlyEquivalent(3000, "quarterly"), monthlyEquivalent(900, "monthly")], [1000, 1000, 900]);
t("the next bill, month ends kept", [finNextBill("2026-01-31", "monthly"), finNextBill("2026-02-28", "monthly"), finNextBill("2026-01-15", "annual"), finNextBill("2026-09-01", "weekly")], ["2026-02-28", "2026-03-31", "2027-01-15", "2026-09-08"]);
t("months", [finMonthEnd("2026-02"), finMonthsEnding("2026-02", 3)], ["2026-02-28", ["2025-12", "2026-01", "2026-02"]]);

section("Finance — pay models");
t("$10 a minute", computePay({ model: "per_minute", params: { rate: 1000 } }, { minutes: 12.5 }), { cents: 12500, explain: "12.5 min × $10/min" });
const tiers = parseTiers("10 = 15\nrest = 10");
t("tiers from the form", tiers, [{ upTo: 10, rate: 1500 }, { upTo: null, rate: 1000 }]);
t("first 10 minutes at $15, every minute after at $10", [computePay({ model: "tiered", params: { tiers } }, { minutes: 14 }).cents, computePay({ model: "tiered", params: { tiers } }, { minutes: 8 }).cents], [19000, 12000]);
t("fixed per video; revenue share; retainer adds nothing", [computePay({ model: "per_video", params: { rate: 25000 } }, { videos: 2 }).cents, computePay({ model: "revenue_share", params: { pct: 0.1 } }, { revenue: 920000 }).cents, computePay({ model: "retainer", params: { amount: 200000 } }, { videos: 1 }).cents, computePay({ model: "manual", params: {} }, {}).cents], [50000, 92000, 0, null]);
const payHistory = [{ model: "per_minute" as const, params: { rate: 1000 }, effectiveFrom: "2026-01-01" }, { model: "per_minute" as const, params: { rate: 1200 }, effectiveFrom: "2026-09-15" }];
t("the model in force on a date — a raise never rewrites earlier work", [modelOn(payHistory, "2026-09-10")!.params.rate, modelOn(payHistory, "2026-09-20")!.params.rate, modelOn(payHistory, "2025-12-31")], [1000, 1200, null]);
t("described in words", [describePay({ model: "tiered", params: { tiers } }), describePay({ model: "per_minute", params: { rate: 1000 } })], ["first 10 min at $15/min, then $10/min", "$10/min of finished video"]);

section("Finance — profit, cost vs cash, sustainability");
const fx = (o: Partial<ExpenseFact>): ExpenseFact => ({ month: "2026-09", cashMonth: "2026-09", channel: null, category: "editing", type: "contractor", company: null, person: null, status: "paid", advance: false, cents: 0, ...o });
const ST = "Specular Studios";
const finFacts: Facts = {
  months: ["2026-06", "2026-07", "2026-08", "2026-09"],
  income: [
    { month: "2026-09", channel: ST, stream: "adsense", company: null, cents: 800000 },
    { month: "2026-09", channel: ST, stream: "sponsorship", company: null, cents: 100000 },
    { month: "2026-09", channel: ST, stream: "other", company: null, cents: 20000 },
    ...["2026-06", "2026-07", "2026-08", "2026-09"].map((m, i) => ({ month: m, channel: "Specular Anime", stream: "adsense", company: null, cents: 300000 - i * 30000 })),
  ],
  expenses: [
    fx({ channel: ST, category: "editing", cents: 200000 }),
    fx({ channel: ST, category: "scripts", cents: 60000 }),
    fx({ channel: ST, category: "thumbnails", cents: 30000 }),
    fx({ channel: ST, category: "other", cents: 20000, type: "one_off" }),
    fx({ channel: null, category: "software", cents: 9000, type: "subscription" }),
    // An advance: cash, not cost. The work it covers: cost, not cash.
    fx({ person: 7, advance: true, cents: 1000000, month: "2026-08", cashMonth: "2026-08" }),
    fx({ channel: ST, person: 7, status: "covered", cents: 25000, cashMonth: null }),
    fx({ channel: ST, person: 7, status: "unpaid", cents: 25000, cashMonth: null }),
    ...["2026-06", "2026-07", "2026-08", "2026-09"].map((m) => fx({ month: m, cashMonth: m, channel: "Specular Anime", cents: 320000 })),
  ],
  channels: [
    { channel: ST, month: "2026-09", uploads: 8, views: 1_700_000, viewsSource: "entered", ownerMinutes: 600 },
    { channel: "Specular Anime", month: "2026-09", uploads: 4, views: 400_000, viewsSource: "estimated", ownerMinutes: 300 },
  ],
  recurring: [{ id: 1, vendor: "Adobe", monthly: 9000, category: "software", kind: "subscription", person: null, channels: [] }],
  platformStreams: new Set(["adsense"]),
  scheduledNext: new Map([[ST, 8]]),
};
const stp = finPnl(finFacts, ["2026-09"], { channel: ST });
t("channel revenue counts every stream: AdSense $8,000 + sponsorship $1,000 + other $200", [stp.revenue, stp.platformRevenue], [920000, 800000]);
t("channel costs are direct only — covered and unpaid work count, the advance doesn't", stp.expenses, 200000 + 60000 + 30000 + 20000 + 25000 + 25000);
t("profit and margin", [stp.profit, stp.margin!.toFixed(3)], [920000 - 360000, ((920000 - 360000) / 920000).toFixed(3)]);
const netp = finPnl(finFacts, ["2026-09"], { all: true });
t("the network adds general costs; cash out excludes covered and unpaid work", [netp.expenses - stp.expenses - finPnl(finFacts, ["2026-09"], { channel: "Specular Anime" }).expenses, netp.cashOut], [9000, 200000 + 60000 + 30000 + 20000 + 9000 + 320000]);
t("the advance is cash in the month it was paid, not a cost", [finPnl(finFacts, ["2026-08"], { all: true }).cashOut, finPnl(finFacts, ["2026-08"], { all: true }).expenses], [1000000 + 320000, 320000]);
t("recurring, production and one-off are kept apart", [netp.byGroup.recurring, netp.byGroup.oneoff], [9000, 20000]);
const dv = derived(stp);
t("RPM is AdSense only — a sponsorship never inflates it", [dv.rpm!.toFixed(2), (dv.revenuePerUpload! / 100).toFixed(0), dv.ownerHours, Math.round(dv.profitPerHour!)], [((800000 / 1_700_000) * 1000).toFixed(2), "1150", 10, 56000]);
const lowTime = sustainability(finFacts, "2026-09", ST, { ...DEFAULT_THRESHOLDS, minProfitPerHour: 60000 });
t("Low Return on Time: profitable, under your per-hour threshold", lowTime.map((x) => x.id), ["low_time"]);
t("…Healthy when above every threshold", sustainability(finFacts, "2026-09", ST, DEFAULT_THRESHOLDS).map((x) => x.id), ["healthy"]);
const anime = sustainability(finFacts, "2026-09", "Specular Anime", DEFAULT_THRESHOLDS).map((x) => x.id);
t("Persistent Loss after 3 losing months, and Declining revenue", [anime.includes("persistent_loss"), anime.includes("declining"), anime.includes("loss")], [true, true, false]);
t("the reporting month is the latest with revenue in", reportingMonth(finFacts, "2026-10"), "2026-09");
const finBe = breakEven({ ...finFacts, channels: finFacts.channels.map((c) => ({ ...c })) }, "2026-09", ST)!;
t("break-even: sponsorships reduce what AdSense has to cover", [Math.round(finBe.otherRevenue), Math.round(finBe.remaining), finBe.covered], [40000, Math.round(360000 / 3 - 40000), true]);
const finProj = finProject(finFacts, "2026-09", { channel: ST });
t("projections are ranges, with what they're based on", [finProj.month, finProj.revenue[0] <= finProj.revenue[1], finProj.basis.some((b) => b.startsWith("Revenue: trailing"))], ["2026-10", true, true]);

section("Finance — forms");
t("splits: ticked channels, even unless given %", [readSplits({ ch: ["Specular Studios", "Specular Anime"] }), readSplits({ ch: ["Specular Studios", "Specular Anime"], "w:Specular Studios": "60" }), readSplits({}), readSplits({ ch: "Not A Channel" })], [
  [{ channel: "Specular Studios", weight: 1 }, { channel: "Specular Anime", weight: 1 }],
  [{ channel: "Specular Studios", weight: 60 }, { channel: "Specular Anime", weight: 40 }],
  [], [],
]);
const mp = Buffer.from('--XB\r\nContent-Disposition: form-data; name="amount"\r\n\r\n250\r\n--XB\r\nContent-Disposition: form-data; name="ch"\r\n\r\nA\r\n--XB\r\nContent-Disposition: form-data; name="ch"\r\n\r\nB\r\n--XB\r\nContent-Disposition: form-data; name="receipt"; filename="r.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1\r\n--XB--\r\n');
const parsedMp = parseMultipart(mp, "multipart/form-data; boundary=XB");
t("a receipt upload is read without a dependency", [parsedMp.amount, parsedMp.ch, parsedMp.__files?.[0]?.filename, parsedMp.__files?.[0]?.data.toString()], ["250", ["A", "B"], "r.pdf", "%PDF-1"]);

section("Finance — voice notes and several channels");
const vctx = (tab: "expense" | "income" | "subscription" | "contractor") => ({
  tab, now: new Date("2026-09-28T16:00:00Z"), people: ["Divas", "Vyasa"], methods: ["Chase business card"],
  categories: ["editing", "scripts", "voiceover", "thumbnails", "music", "software", "equipment"].map((id) => ({ id, label: id })),
  streams: ["adsense", "sponsorship", "affiliate", "other"].map((id) => ({ id, label: id })),
});
t("amounts as said", [amountsIn("paid $1,250"), amountsIn("2.5k for the deal"), amountsIn("paid Divas 250"), amountsIn("the 3rd video at 2:30"), amountsIn("on September 12 it was 90")], [[1250], [2500], [250], [], [90]]);
t("channels as said — longest names first", channelsIn("FNAF bits and the anime channel, DC"), ["Specular FNAF Bits", "Specular Anime", "Specular DC"]);
const vx = readByRules("Paid Divas 250 for the Anime edit on the Chase card yesterday. Bought a new mic for 180 dollars", vctx("expense"));
t("one note, two expenses — who, amount, channel, card, yesterday", [vx.length, vx[0]!.amount, vx[0]!.person, vx[0]!.channels, vx[0]!.method, vx[0]!.date, vx[1]!.amount, vx[1]!.category], [2, 250, "Divas", ["Specular Anime"], "Chase business card", "2026-09-27", 180, "equipment"]);
t("guessed fields are marked to check", vx[0]!.unsure.sort(), ["category", "channels"]);
const vw = readByRules("Divas did two Anime edits, 12 and 14 minutes", vctx("contractor"));
t("contractor work: 2 videos, 26 minutes, on Anime", [vw[0]!.kind, vw[0]!.videos, vw[0]!.minutes, vw[0]!.channels], ["work", 2, 26, ["Specular Anime"]]);
t("an advance to someone new, a rate change", [readByRules("Gave Rohan a 2k advance", vctx("contractor"))[0]!.kind, readByRules("Gave Rohan a 2k advance", vctx("contractor"))[0]!.person, readByRules("Divas is 12 a minute now", vctx("contractor"))[0]!.pay_model, readByRules("Divas is 12 a minute now", vctx("contractor"))[0]!.rate], ["advance", "Rohan", "per_minute", 12]);
const vi = readByRules("NordVPN paid 1,000 for the Studios sponsorship in September", vctx("income"));
t("income: sponsorship stream, month, channel", [vi[0]!.stream, vi[0]!.month, vi[0]!.channels, vi[0]!.amount], ["sponsorship", "2026-09", ["Specular Studios"], 1000]);
t("what a draft still needs", [missingFor(readByRules("the thumbnail guy for the FNAF video", vctx("expense"))[0]!, false), missingFor(readByRules("Gave Rohan a 2k advance", vctx("contractor"))[0]!, false), missingFor(vw[0]!, true)], [["amount"], ["person"], []]);
t("pay models keep several channels; the old single one still reads", [payChannels({ channels: ["Specular Anime", "Specular FNAF"] }), payChannels({ channel: "Specular DC" }), payChannels({})], [["Specular Anime", "Specular FNAF"], ["Specular DC"], []]);
t("revenue share of several channels, in words", describePay({ model: "revenue_share", params: { pct: 0.1, channels: ["Specular Anime", "Specular FNAF"] } }), "10% of Anime + FNAF revenue");
const vbox = voiceBox("expense", "/finance/expenses", [{
  id: 9, tab: "expense", transcript: "paid Divas 250", parsedBy: "rules", createdAt: new Date(),
  entries: [
    { entry: { ...vx[0]! }, missing: [], logged: { type: "expense", id: 4, label: "$250 · Divas" }, checked: false },
    { entry: { ...vx[1]!, unsure: [] }, missing: ["amount"], logged: null, checked: false },
  ],
}]);
t("the voice box: mic, logged-but-check (amber), needs (red) with Fill in", [vbox.includes('data-mic'), vbox.includes('class="fvent unsure"'), vbox.includes("Check: category, channels"), vbox.includes('class="fvent missing"'), vbox.includes("/finance/expenses/new?voice=9:1"), vbox.includes("/finance/voice/9/0/ok")], [true, true, true, true, true, true]);
t("…its scripts compile", [...vbox.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }), true);
t("a row that guessed is marked, one that didn't isn't", [checkMark(["category", "next_bill"]).includes("check category, next bill"), checkMark([])], [true, ""]);
t("channel pills: several ticked", [(channelChips("channels", ["Specular Anime", "Specular FNAF"]).match(/checked/g) ?? []).length, channelChips("channels", ["Specular Anime", "Specular FNAF"]).includes(">Anime, FNAF<")], [2, true]);

// ── Specular compilations ──
const cs = (id: string, title: string, published: string, runtime: number | null = 20 * 60, views = 100000): CompSource => ({ id, title, channel: "Specular Survives", published, runtime, runtimeFrom: runtime ? "youtube" : null, views, movieUses: 0, sleepUses: 0 });
t("title shapes: who, what happens, to what", [shapeOf("What If Spider-Man Had Six Eyes?"), shapeOf("Could Goku Survive The Hunger Games?")?.shape, shapeOf("Every Gojo Villain, Ranked")], [{ shape: "power", subject: "Spider-Man", verb: "had", object: "Six Eyes" }, "survive", null]);
const avCat = ["Gojo", "Sukuna", "Batman", "Deadpool", "Naruto", "Goku"].map((h, i) => cs(`av${i}`, `What If ${h} Joined The Avengers?`, `2026-0${i + 1}-10`, 20 * 60, 100000 * (i + 1)));
const mvPicks = moviePicks(avCat, [], { today: "2026-09-28" });
t("a Movie: four sources under one umbrella title, 60-90+ minutes", [mvPicks[0]!.sources.length, /^What If .+, .+, .+, & .+ Joined The Avengers\? \(Full Movie\)$/.test(mvPicks[0]!.title), mvPicks[0]!.runtime], [4, true, 80 * 60]);
const mvPast = [{ kind: "movie" as const, concept: "x", date: "2026-09-01", sources: ["av5", "av4", "av3"] }];
const mvPicks2 = moviePicks(avCat, mvPast, { today: "2026-09-28" });
t("never more than two sources shared with an earlier Movie", [mvPicks2.length > 0, mvPicks2.every((p) => maxOverlap(p.sources.map((x) => x.id), mvPast, "movie") <= 2)], [true, true]);
t("a rerolled combination doesn't come back", moviePicks(avCat, [], { today: "2026-09-28", skipped: new Set([mvPicks[0]!.combo]) }).some((p) => p.combo === mvPicks[0]!.combo), false);
t("Sleep uses don't limit Movies", moviePicks(avCat, [{ kind: "sleep", concept: "y", date: "2026-09-20", sources: ["av0", "av1", "av2", "av3", "av4", "av5"] }], { today: "2026-09-28" }).length, mvPicks.length);
const spCat = ["Joined The Avengers", "Was In Naruto", "Had Six Eyes", "Was In Jujutsu Kaisen", "Had The Omnitrix", "Was In One Piece", "Had Mahoraga", "Was In Invincible", "Was In The Boys", "Had The Sharingan", "Was In Demon Slayer", "Was In Dragon Ball", "Was In My Hero Academia", "Was In Pokemon"]
  .map((x, i) => cs(`sp${i}`, `What If Spider-Man ${x}?`, `2026-0${(i % 9) + 1}-02`, 22 * 60));
const slPick = sleepPicks(spCat, [], { today: "2026-09-28" }).find((p) => p.concept === "sleep:hero:spiderman");
t("a Sleep: one character, about four hours (slightly over is fine)", [slPick?.title, slPick!.runtime >= 4 * 3600 && slPick!.runtime < 4.5 * 3600], ["4 Hours of Custom Spider-Man Lore To Fall Asleep To", true]);
t("the same story uploaded twice is one source, keeping the most-viewed copy", oneEach([cs("a", "What If Gojo Joined The Avengers?", "2026-01-01", null, 5), cs("b", "What if Gojo joined the Avengers", "2026-02-01", 600, 9)]).map((x) => [x.id, x.runtime]), [["b", 600]]);
t("slots: next free day for a Movie (skipping days off), every 4 days for a Sleep", [nextMovieSlot("2026-09-28", new Set(["2026-09-28", "2026-09-29"]), new Set(["2026-09-30"])), nextSleepSlot("2026-09-28", "2026-09-26", new Set()), nextSleepSlot("2026-09-28", "2026-09-20", new Set()), nextSleepSlot("2026-09-28", "2026-09-26", new Set(["2026-09-30"]))], ["2026-10-01", "2026-09-30", "2026-09-28", "2026-10-04"]);
t("runtimes typed in: 24:10, 24, 1:02:03", [parseRuntime("24:10"), parseRuntime("24"), parseRuntime("1:02:03"), parseRuntime("abc"), clock(4800), clock(610)], [1450, 1440, 3723, null, "1:20:00", "10:10"]);
t("video ids from links", [videoIdOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), videoIdOf("https://youtu.be/dQw4w9WgXcQ"), videoIdOf("dQw4w9WgXcQ"), videoIdOf("nope")], ["dQw4w9WgXcQ", "dQw4w9WgXcQ", "dQw4w9WgXcQ", null]);
const pkg = tidyPackage({ title_fits: true, title_note: "ok", better_title: "x", order: ["b", "zz", "a"], intro: " Hi. ", transitions: [{ into: "a", text: "Then A." }] }, ["a", "b", "c"]);
t("the package keeps to its sources: every one once, a transition into each after the first", [pkg.order, pkg.transitions, pkg.intro, pkg.betterTitle], [["b", "a", "c"], ["Then A.", ""], "Hi.", null]);
const comp = { id: 1, kind: "movie" as const, number: 7, title: "What If X? (Full Movie)", concept: "", slotDate: "2026-09-29", status: "planned" as const, recordId: null, uploadVideoId: null, inferred: false,
  sources: [{ id: "a", title: "A", channel: "Specular Survives", runtime: 1200, runtimeFrom: "youtube", published: "2026-01-01" }, { id: "b", title: "B", channel: "Specular Survives", runtime: null, runtimeFrom: null, published: "2026-01-02" }],
  playOrder: ["b", "a"], intro: "Intro.", transitions: ["Into A."], packageNote: null, packagedAt: null };
t("the output block: DATE | MOVIE ### | TITLE, the list in play order, the total", outputBlock(comp, 600).split("\n"), ["9/29/2026 | MOVIE 007 | What If X? (Full Movie)", "", "1. B — ~10:00 (est.)", "2. A — 20:00", "", "Total Source Runtime: 30:00 (some estimated)"]);
t("the editor package reads as a script", packageBlock(comp), "INTRO\nIntro.\n\n[ 1. B ]\n\nTRANSITION 1\nInto A.\n\n[ 2. A ]");
t("a Sleep's package is the editor notes", packageBlock({ ...comp, kind: "sleep" }).startsWith("Editor Notes:\nKeep stories back to back"), true);

section("Time logged");
t("ranges: this week Mon–Sun; the rest end today in whole weeks", [logDays("week", "2026-09-30")[0], logDays("week", "2026-09-30").at(-1), logDays("month", "2026-09-30").length, logDays("quarter", "2026-09-30")[0], logDays("year", "2026-09-30").length], ["2026-09-28", "2026-10-04", 31, "2026-07-06", 367]);
// 11:30 PM ET on 9/28 to 12:45 AM ET on 9/29: split at midnight.
const lg = logByDay([
  { start: new Date("2026-09-29T03:30:00Z"), end: new Date("2026-09-29T04:45:00Z"), type: "vo", title: "Late VO" },
  { start: new Date("2026-09-29T18:00:00Z"), end: new Date("2026-09-29T18:20:00Z"), type: "revision", title: "Rev" },
], ["2026-09-28", "2026-09-29", "2026-09-30"]);
t("a timer running past midnight counts toward both days", lg.map((x) => [x.day, Math.round(x.minutes)]), [["2026-09-28", 30], ["2026-09-29", 65], ["2026-09-30", 0]]);
t("…each stretch sits at its time of day, by kind", [lg[0]!.pieces[0]!.from, lg[1]!.pieces.map((p) => [p.from, p.type]), lg[1]!.byType], [1410, [[0, "vo"], [840, "revision"]], { vo: 45, revision: 20 }]);
const tlPage = renderMyDay(shellFix, { now: wNow, today: wToday, required: [], ahead: [], done: [], loads, trackedToday: 0, running: null, focus: null, budget: null, asked: false, voLeft: { n: 0, minutes: 0 },
  log: { range: "week", days: logByDay([{ start: new Date("2026-09-27T14:00:00Z"), end: new Date("2026-09-27T15:10:00Z"), type: "vo", title: "Morning VO" }], logDays("week", "2026-09-27")), daysOff: [] } });
t("My Day: the week's timeline, a block where the work happened, tabs for longer ranges", [tlPage.includes('id="logged"'), (tlPage.match(/class="tlb"/g) ?? []).length, tlPage.includes("Morning VO · 10:00 AM–11:10 AM · 1h 10m"), tlPage.includes('href="/my-day?log=year#logged"'), [...tlPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } })], [true, 1, true, true, true]);

section("Next to assign");
const naChans = [
  { channel: "Specular Anime", every: 4, days: ["2026-09-26", "2026-10-02", "2026-10-06", "2026-10-30"] },
  { channel: "Specular FNAF", every: 4, days: ["2026-09-28", "2026-10-10"] },
  { channel: "Specular Comics", every: 4, days: ["2026-08-01"] },
];
const na = nextToAssign(naChans, "2026-09-30");
t("the channel that runs out first, however far ahead, and when its next upload would be", [na.map((g) => [g.channel, g.date, g.after])], [[["Specular FNAF", "2026-10-14", "2026-10-10"], ["Specular Anime", "2026-11-03", "2026-10-30"]]]);
t("…add a video on it and the next channel takes its place", nextToAssign([{ ...naChans[0]! }, { ...naChans[1]!, days: [...naChans[1]!.days, "2026-11-20"] }], "2026-09-30")[0]!.channel, "Specular Anime");
t("…a day cleared by hand is skipped for the one after", nextToAssign([naChans[1]!], "2026-09-30", (g) => g.date === "2026-10-14")[0]!.date, "2026-10-18");

section("Posting check");
t("titles: the same video reads as the same, a different one doesn't", [titleOverlap("What If Freddy Joined The Avengers?", "What If FREDDY Joined the Avengers? (FNAF)") >= 0.5, titleOverlap("What If Batman Was In The Boys?", "What If Spider-Man Was In The Boys?") >= 0.5], [true, false]);
const pcm = matchPosts(
  [{ id: 1, title: "What If Freddy Joined The Avengers?" }, { id: 2, title: "Could Springtrap Survive Resident Evil?" }, { id: 3, title: "What If Foxy Was In The Boys?" }],
  [{ videoId: "v1", title: "Springtrap Vs Umbrella Corp" }, { videoId: "v2", title: "What If Freddy Joined the Avengers? (FNAF)" }],
);
t("matched by title first, a retitled upload stands in for the next, the rest missed", [[...pcm.posted.entries()], pcm.missed], [[[1, "v2"], [2, "v1"]], [3]]);
t("nothing uploaded: everything missed", matchPosts([{ id: 7, title: "X" }], []).missed, [7]);
const missedPage = renderRecord(shellFix, mk({ id: 240, category: "stories", channel: "Specular FNAF", title: "Foxy In The Boys", airDate: "2026-09-30" }), { missed: { id: 5, day: "2026-09-29", pushedTo: "2026-09-30", moved: 2 } });
t("the record says it was pushed, with It was posted to put it back", [missedPage.includes("Not seen on Specular FNAF on 9/29/2026, so it was pushed to 9/30/2026 with 2 later videos"), missedPage.includes('action="/missed/5/undo"')], [true, true]);

section("Idea Feed");
t("post HTML as text: paragraphs and bullets kept, tags gone, entities decoded", htmlToText("<p>Sans &amp; Papyrus</p><p>It&#8217;s a <b>bad</b> time<br>really</p><ul><li>one</li><li>two</li></ul><link rel=x>"), "Sans & Papyrus\n\nIt’s a bad time\nreally\n\n• one\n• two");
t("…images in order, once each, web links only; entities", [imagesIn('<img src="https://64.media.tumblr.com/a.jpg"><img src="https://64.media.tumblr.com/a.jpg"> <img alt="x" src=\'http://x.com/b.png\'> <img src="data:image/png;base64,AAA">'), decodeEntities("&lt;3 &#x1F480; &hellip; &bogus;")], [["https://64.media.tumblr.com/a.jpg", "http://x.com/b.png"], "<3 💀 … &bogus;"]);
t("Tumblr links: every shape Tumblr uses; tag pages, blogs and junk aren't posts", [
  parseTumblrUrl("https://www.tumblr.com/gojo-fan/734219876543210987/when-gojo-meets"),
  parseTumblrUrl("gojo-fan.tumblr.com/post/734219876543210987/slug"),
  parseTumblrUrl("https://www.tumblr.com/blog/view/gojo-fan/734219876543210987"),
  parseTumblrUrl("https://blog.example.com/post/734219876543210987"),
  parseTumblrUrl("https://www.tumblr.com/tagged/undertale"),
  parseTumblrUrl("https://www.tumblr.com/gojo-fan"),
  parseTumblrUrl("not a link at all"),
], [{ blog: "gojo-fan", id: "734219876543210987" }, { blog: "gojo-fan", id: "734219876543210987" }, { blog: "gojo-fan", id: "734219876543210987" }, { blog: "blog.example.com", id: "734219876543210987" }, null, null, null]);

const legacyReblog = {
  id_string: "734300000000000001", blog_name: "papyrus-cooks", type: "photo", timestamp: 1790000000, note_count: 812, tags: ["undertale", "sans"],
  post_url: "https://www.tumblr.com/papyrus-cooks/734300000000000001/sans-never",
  caption: "<p>skele-theories:</p><blockquote><p>Sans has a key to every door in the Underground.</p></blockquote><p>and he has never once used one to go home</p>",
  photos: [{ original_size: { url: "https://64.media.tumblr.com/big.jpg", width: 1280, height: 960 }, alt_sizes: [{ url: "https://64.media.tumblr.com/640.jpg", width: 640, height: 480 }, { url: "https://64.media.tumblr.com/250.jpg", width: 250, height: 188 }] }],
  reblogged_root_id: "734200000000000000",
  trail: [
    { blog: { name: "skele-theories" }, post: { id: "734200000000000000" }, content_raw: "<p>Sans has a key to every door in the Underground.</p>", is_root_item: true },
    { blog: { name: "papyrus-cooks" }, post: { id: "734300000000000001" }, content_raw: "<p>and he has never once used one to go home</p>", is_current_item: true },
  ],
};
const lr = fromLegacy(legacyReblog)!;
t("a reblog: the whole chain in order, keyed to its original, what it added kept apart, a picture at a readable size", [lr.externalId, lr.url, lr.rootKey, lr.isReblog, lr.addedText, lr.body, lr.media.map((m) => m.url), lr.notes, lr.postedAt?.toISOString()], [
  "734300000000000001", "https://www.tumblr.com/papyrus-cooks/734300000000000001/sans-never", "tumblr:734200000000000000", true, "and he has never once used one to go home",
  "skele-theories: Sans has a key to every door in the Underground.\n\npapyrus-cooks: and he has never once used one to go home", ["https://64.media.tumblr.com/640.jpg"], 812, "2026-09-21T14:13:20.000Z",
]);
const plainReblog = fromLegacy({ ...legacyReblog, id_string: "734300000000000002", post_url: "", trail: [legacyReblog.trail[0]] })!;
t("…a plain reblog adds nothing: same original, no commentary, linked by blog and id", [plainReblog.rootKey, plainReblog.addedText, addsCommentary(plainReblog), addsCommentary(lr), plainReblog.url], ["tumblr:734200000000000000", null, false, true, "https://www.tumblr.com/papyrus-cooks/734300000000000002"]);
const legacyAsk = fromLegacy({ id_string: "734400000000000002", blog_name: "fnaf-lore", type: "answer", timestamp: 1790003600, asking_name: "springbonnie-stan", question: "<p>Does Freddy ever get a day off?</p>", answer: "<p>No. They run 24/7 and <b>that's</b> the horror.</p>", tags: Array.from({ length: 80 }, (_, i) => `t${i}`) })!;
t("an ask names who asked; an original isn't a reblog; tags capped at 60; no id, no post", [legacyAsk.body, legacyAsk.isReblog, legacyAsk.rootKey, legacyAsk.tags.length, fromLegacy({ type: "text", body: "x" })], ["springbonnie-stan asked: Does Freddy ever get a day off?\n\nNo. They run 24/7 and that's the horror.", false, "tumblr:734400000000000002", 60, null]);
const npfAsk = fromNpf({
  id_string: "734219876543210987", blog_name: "pkmn-thoughts", timestamp: 1790007200, note_count: 3400, tags: ["pokemon"],
  content: [
    { type: "text", text: "Is Psyduck's headache why it's so powerful?" },
    { type: "text", text: "Yes. It only uses its full power when the headache peaks." },
    { type: "image", media: [{ url: "https://64.media.tumblr.com/p1280.jpg", width: 1280, height: 720 }, { url: "https://64.media.tumblr.com/p540.jpg", width: 540, height: 304 }], alt_text: "Psyduck holding its head" },
  ],
  layout: [{ type: "ask", blocks: [0], attribution: { type: "blog", blog: { name: "duck-appreciator" } } }],
  trail: [],
})!;
t("NPF: the ask's asker named, the picture's description kept as text", [npfAsk.body, npfAsk.media, npfAsk.isReblog, npfAsk.url], [
  "duck-appreciator asked: Is Psyduck's headache why it's so powerful?\nYes. It only uses its full power when the headache peaks.\n[image: Psyduck holding its head]",
  [{ url: "https://64.media.tumblr.com/p540.jpg", width: 540, height: 304, alt: "Psyduck holding its head" }], false, "https://www.tumblr.com/pkmn-thoughts/734219876543210987",
]);
const npfReblog = fromNpf({ id_string: "734500000000000003", blog_name: "b", content: [{ type: "text", text: "and nobody ever asks Psyduck how it feels" }], layout: [], trail: [{ blog: { name: "a" }, post: { id: "734219876543210987" }, content: [{ type: "text", text: "Psyduck's headache is its power" }], layout: [] }] })!;
t("…an NPF reblog: every voice, keyed to its original, its own words kept apart", [npfReblog.body, npfReblog.rootKey, npfReblog.addedText], ["a: Psyduck's headache is its power\n\nb: and nobody ever asks Psyduck how it feels", "tumblr:734219876543210987", "and nobody ever asks Psyduck how it feels"]);
t("paging back: the oldest stamp on the page, featured tags by their featured time", [oldestStamp([{ timestamp: 1790000500 }, { timestamp: 1790000100 }, { timestamp: 1700000000, featured_timestamp: 1790000300 }]), oldestStamp([])], [1790000100, null]);

const fsrc = (body: string, o: { tags?: string[]; notes?: number | null; media?: Array<{ url: string }> } = {}) => ({ body, title: null, media: [] as Array<{ url: string }>, tags: [] as string[], notes: 10 as number | null, ...o });
t("the gentle filter: ads, promos, tag spam, empty posts, a tag's excluded words, too few notes", [
  basicFilter(fsrc("GIVEAWAY! Reblog to win a Sans plush"), null).reason,
  basicFilter(fsrc("Commissions open! Check my Etsy"), null).reason,
  basicFilter(fsrc("sans", { tags: Array.from({ length: 35 }, (_, i) => `tag${i}`) }), null).reason,
  basicFilter(fsrc(""), null).reason,
  basicFilter(fsrc("Mettaton would host the Oscars", { tags: ["undertale", "nsfw"] }), { exclusions: ["NSFW"], minNotes: 0 }).reason,
  basicFilter(fsrc("Mettaton would host the Oscars", { notes: 3 }), { exclusions: [], minNotes: 20 }).reason,
], ["Looks like an ad or giveaway", "Looks promotional", "Tag spam (35 tags)", "Empty post", "Excluded word: nsfw", "Under 20 notes when found"]);
t("…and lets the rest through: a real post, a picture with no words, an excluded word inside another word", [
  basicFilter(fsrc("Sans has a key to every door in the Underground and never goes home"), { exclusions: [], minNotes: 5 }).keep,
  basicFilter(fsrc("", { media: [{ url: "https://64.media.tumblr.com/x.jpg" }] }), null).keep,
  basicFilter(fsrc("Asgore has the biggest heart in the Underground"), { exclusions: ["art"], minNotes: 0 }).keep,
  basicFilter(fsrc("Asgore makes pottery", { tags: ["fan art"] }), { exclusions: ["art"], minNotes: 0 }).reason,
], [true, true, true, "Excluded word: art"]);

t("similar work counts less the older it is; a rejected idea half as much; an idea approved but not made yet in full", [
  recencyWeight("bit", "2026-09-27", "2026-09-30"), recencyWeight("bit", "2026-09-10", "2026-09-30"), recencyWeight("bit", "2026-07-15", "2026-09-30"),
  recencyWeight("bit", "2026-01-10", "2026-09-30"), recencyWeight("bit", "2024-01-01", "2026-09-30"), recencyWeight("rejected", "2026-09-29", "2026-09-30"),
  recencyWeight("idea", null, "2026-09-30"), recencyWeight("bit", null, "2026-09-30"),
], [1, 0.85, 0.6, 0.35, 0.2, 0.5, 1, 0.35]);
const readAt = new Date("2026-09-30T12:00:00Z");
const fast = engagementSignal(100, new Date("2026-09-30T11:30:00Z"), readAt)!;
const slow = engagementSignal(200, new Date("2023-09-30T12:00:00Z"), readAt)!;
t("engagement is read against age: 100 notes in half an hour beats 200 over three years; no count, no signal", [fast > 0.85, slow < 0.1, engagementSignal(null, readAt, readAt), engagementSignal(5, null, readAt)], [true, true, null, null]);

const baseInput: ScoreInput = {
  scores: { franchise_specificity: 0.9, comedy_potential: 0.9, visual_potential: 0.8, originality: 0.8, context_efficiency: 0.7, source_specificity: 0.9, character_recognition: 0.9, audience_fit: 0.8 },
  whyItWorks: ["Sans's shortcuts are already a running joke"], warnings: [], classification: "CANON_INSPIRED", canonConfidence: 0.8, canonCheckRequired: false, canonChecks: [],
  engines: ["escalation"], notes: null, postedAt: null, readAt, matches: [], usedSource: null,
};
const ib = scoreBitsIdea(baseInput);
t("the Idea Score: the parts' weighted mean, the three strongest parts as reasons, then the AI's", [ib.score, ib.base, ib.adjustments, ib.why, ib.problems, ib.similarity], [
  84, 84, [], ["Extremely franchise-specific", "Strong comedic scenario", "Built on one specific detail", "No recent premise collision", "Sans's shortcuts are already a running joke"], [], 0,
]);
const sm = (o: Partial<SimilarMatch>): SimilarMatch => ({ kind: "bit", ref: "bit:a", title: "Flowey Tries To Grow Up", channel: "Specular Undertale Bits", date: "2026-09-25", similarity: 0.82, sameMechanism: false, reason: "", recency: 1, effective: 0.82, ...o });
const near82 = scoreBitsIdea({ ...baseInput, matches: [sm({})] });
t("…close to a recent Bit costs points (82% → −27) and says so", [near82.score, near82.adjustments, near82.problems, near82.why.includes("No recent premise collision")], [57, [{ label: "Similar to existing work", points: -27 }], ["82% similar to “Flowey Tries To Grow Up”"], false]);
const exactOld = scoreBitsIdea({ ...baseInput, matches: [sm({ similarity: 0.9, sameMechanism: true, date: "2024-05-01", recency: 0.2, effective: 0.18 })] });
t("…the same premise costs at least 20, however old", [exactOld.score, exactOld.adjustments, exactOld.problems[0]], [64, [{ label: "Same premise as an existing Bit", points: -20 }], "Same premise as “Flowey Tries To Grow Up” (5/1/2024)"]);
const unavailable = scoreBitsIdea({ ...baseInput, matches: null, similarityNote: "no Bits uploads or ideas on record yet" });
t("…a check that couldn't run is shown as unavailable, never as 0% similar", [unavailable.score, unavailable.similarity, unavailable.problems, unavailable.why.includes("No recent premise collision")], [84, null, ["Similarity check unavailable — no Bits uploads or ideas on record yet"], false]);
t("…a source already used: −50", [scoreBitsIdea({ ...baseInput, usedSource: "Sans Finally Sleeps" }).score, scoreBitsIdea({ ...baseInput, usedSource: "Sans Finally Sleeps" }).problems], [34, ["This post (or its original) already became “Sans Finally Sleeps”"]]);
const hot = scoreBitsIdea({ ...baseInput, notes: 100, postedAt: new Date("2026-09-30T11:30:00Z") });
const cold = scoreBitsIdea({ ...baseInput, notes: 2, postedAt: new Date("2023-09-30T12:00:00Z") });
t("…engagement for its age is a small nudge, −3 to +6", [hot.adjustments, hot.why.includes("Unusually high engagement velocity"), cold.adjustments], [[{ label: "Engagement for its age", points: 5 }], true, [{ label: "Little engagement for its age", points: -3 }]]);
const canonUnsure = scoreBitsIdea({ ...baseInput, classification: "CANON", canonConfidence: 0.4, canonChecks: ["Does Sans hold every key in canon?"] });
const headcanon = scoreBitsIdea({ ...baseInput, classification: "HEADCANON" });
t("…an unsure canon claim: −4 and a check to make; fan interpretation is named, not penalised", [canonUnsure.adjustments, canonUnsure.problems, headcanon.score, headcanon.problems], [[{ label: "Canon claim not certain", points: -4 }], ["Canon check: Does Sans hold every key in canon?"], 84, ["Based on fan interpretation (headcanon)"]]);
const weakParts = scoreBitsIdea({ ...baseInput, scores: { ...baseInput.scores, visual_potential: 0.3, context_efficiency: 0.4 }, engines: ["fourth_wall_meta"] });
t("…weak parts are its problems, weakest first; meta concepts −3; the score stays 0–100", [weakParts.problems, weakParts.adjustments, scoreBitsIdea({ ...baseInput, scores: {}, usedSource: "x" }).score], [["Hard to show — mostly explanation", "Needs a lot of set-up"], [{ label: "Meta concepts are easy to overuse", points: -3 }], 0]);
t("a quick look scores 0–35, so every full read ranks above it", [triageScore(1), triageScore(0.5), triageScore(2), triageScore(Number.NaN)], [35, 18, 35, 0]);

const hist: HistoryItem[] = [
  { kind: "bit", ref: "bit:a", title: "Flowey Tries To Grow Up", channel: "Specular Undertale Bits", date: "2026-09-25" },
  { kind: "bit", ref: "bit:b", title: "Sans Takes A Day Off", channel: "Specular Undertale Bits", date: "2026-08-01" },
  { kind: "bit", ref: "bit:c", title: "Sans Sleeps Through The Whole Game", channel: "Specular Undertale Bits", date: "2026-06-01" },
  { kind: "idea", ref: "idea:3", title: "Gojo Meets Female Gojo", premise: "Gojo meets his genderbent counterpart", channel: "Specular Anime Bits", date: null },
  { kind: "idea", ref: "idea:4", title: "A Door With Every Key", channel: "Specular Anime Bits", date: null },
  { kind: "rejected", ref: "src:9", title: "Pikachu Learns To Cook", channel: "Specular Pokemon Bits", date: "2026-09-01" },
];
const nq = { characters: ["Sans"], franchises: ["Undertale"], text: "Sans has a key to every door and never takes a day off to sleep", channel: "Specular Undertale Bits" };
t("likely repeats: shared characters first, then shared words and the same channel; the unrelated left out", [nearestHistory(nq, hist).map((h) => h.ref), nearestHistory(nq, hist, 2).map((h) => h.ref), wordsOf("What If Gojo's Aliens Were In The Boys?")], [["bit:b", "bit:c", "idea:4"], ["bit:b", "bit:c"], ["gojo", "alien", "boys"]]);

t("reading pace: busy tags twice as often (not under 5 min), quiet ones half again as rarely (up to 4× their pace, 4 hours at most), the rest drift back", [
  nextPollMinutes(3, 30, { filled: true, fresh: 60 }), nextPollMinutes(3, 30, { filled: false, fresh: 0 }), nextPollMinutes(3, 45, { filled: false, fresh: 0 }),
  nextPollMinutes(3, 120, { filled: false, fresh: 0 }), nextPollMinutes(3, 60, { filled: false, fresh: 5 }), nextPollMinutes(5, 6, { filled: true, fresh: 60 }),
  nextPollMinutes(1, 200, { filled: false, fresh: 0 }), nextPollMinutes(3, 0, { filled: false, fresh: 5 }),
], [15, 45, 68, 120, 45, 5, 240, 30]);
t("…the day's Tumblr calls spread across the day: an hour's share at midnight, all of it by the end", [pacedAllowance(4000, 0), pacedAllowance(4000, 720), pacedAllowance(4000, 1439)], [167, 2167, 4000]);

t("feed links: tabs and filters in the address, back to page one on any change", [
  feedHref({ tab: "foryou", channel: null, cls: null, canon: false, min: null, q: "", page: 3 }),
  feedHref({ tab: "foryou", channel: null, cls: null, canon: false, min: null, q: "", page: 0 }, { tab: "saved", channel: "Specular Undertale Bits", canon: true }),
  feedHref({ tab: "new", channel: null, cls: "AU", canon: false, min: 70, q: "sans", page: 0 }, { page: 2 }),
], ["/ideas", "/ideas?tab=saved&ch=Specular+Undertale+Bits&canon=1", "/ideas?tab=new&cls=AU&min=70&q=sans&page=2"]);

const srcRow: SourceRow = {
  id: 41, provider: "tumblr", externalId: "734300000000000001", url: "https://www.tumblr.com/papyrus-cooks/734300000000000001/sans-never", author: "papyrus-cooks",
  authorUrl: "https://www.tumblr.com/papyrus-cooks", postedAt: new Date("2026-09-29T12:00:00Z"), ingestedAt: new Date("2026-09-29T13:00:00Z"), postType: "photo", title: null,
  body: "skele-theories: Sans has a key to every door in the Underground.\n\npapyrus-cooks: and he has never once used one to go home <script>", media: [], tags: ["undertale", "sans"],
  notes: 812, likes: 600, reblogs: 200, replies: null, engagementAt: new Date("2026-09-29T13:00:00Z"), rootKey: "tumblr:734200000000000000", isReblog: true,
  addedText: "and he has never once used one to go home", channels: ["Specular Undertale Bits"], discoveredVia: "tag:undertale", stage: "analyzed", pending: null, processingAt: null,
  attempts: 1, filterReason: null, error: null, duplicateOf: null, depth: "full", score: 84, channel: "Specular Undertale Bits", classification: "CANON_INSPIRED",
  classificationManual: false, canonCheck: true, canonVerifiedAt: null, similarity: null, decision: null, decidedAt: null, rejectReason: null, rejectNote: null,
  analysis: {
    id: 5, depth: "full", version: "bits-feed-1", model: null, similarity: null, similarityStatus: "unavailable", at: new Date("2026-09-29T13:01:00Z"), breakdown: unavailable,
    result: { headline: "Sans has every key and never goes home", irreplaceable_detail: "A key to every door, and he never once uses one to go home", suggested_title: "Sans Finally Uses His Keys", suggested_premise: "Papyrus locks him out.", comedy_engines: ["escalation"], canon_confidence: 0.55, canon_checks: ["Does Sans hold every key in canon?"] },
  },
  ideaId: null, ideaStatus: null,
};
const card = ideaCard(srcRow);
t("a card: the original post linked, the AI's canon confidence called an estimate, verification and similarity flagged honestly", [
  card.includes('<a class="iview" href="https://www.tumblr.com/papyrus-cooks/734300000000000001/sans-never" target="_blank" rel="noreferrer">View original post ↗</a>'),
  card.includes("⚠ Canon verification needed"), card.includes("Canon confidence <b>55%</b> <small>AI estimate</small>"),
  card.includes("⚠ Similarity check unavailable — no Bits uploads or ideas on record yet"), card.includes("Why this ranked high"), card.includes("Potential problems"),
  card.includes('action="/ideas/s/41/approve"'), card.includes('value="weak_joke"'), card.includes("<script>"), card.includes("600 likes · 200 reblogs"),
], [true, true, true, true, true, true, true, true, false, true]);
t("…a bad link is never linked; filtered and failed posts stay, with a way on", [
  ideaCard({ ...srcRow, url: "javascript:alert(1)" }).includes('href="javascript:'),
  ideaCard({ ...srcRow, stage: "filtered", filterReason: "Looks promotional", depth: null, score: null, analysis: null }).includes("Filtered before analysis: Looks promotional"),
  ideaCard({ ...srcRow, stage: "error", error: "Claude was busy", depth: null, score: null, analysis: null }).includes("Analysis failed: Claude was busy"),
  ideaCard({ ...srcRow, stage: "error", error: "Claude was busy", depth: null, score: null, analysis: null }).includes("Retry analysis"),
], [false, true, true, true]);
const simCard = ideaCard({ ...srcRow, analysis: { ...srcRow.analysis!, similarityStatus: "ok", similarity: [sm({ reason: "Both escalate Flowey's attempts" })] } });
t("…similar work shown with its date and why", [simCard.includes('<details class="isim warn">'), simCard.includes("82% similar</b> to “Flowey Tries To Grow Up” · 9/25/2026"), simCard.includes("Both escalate Flowey&#39;s attempts")], [true, true, true]);

const ifSettings = { polling: true, ai: true, triageCap: 600, fullCap: 60, fullThreshold: 0.55, tumblrDailyCap: 4000 };
const ifFeed = { id: 3, provider: "tumblr", query: "undertale", channels: ["Specular Undertale Bits"], enabled: true, weight: 4, exclusions: ["nsfw"], minNotes: 0, cursor: {}, pollMinutes: 15,
  nextPollAt: new Date(Date.now() + 600_000), lastAttemptAt: null, lastSuccessAt: null, lastError: null, lastPostAt: null, found24h: 12, found7d: 80 };
const reader = { pausedUntil: null, reason: "", callsThisHour: 4 };
const srcOff = renderIdeaSources(shellFix, { feeds: [ifFeed], settings: ifSettings, usage: new Map(), tumblr: false, ai: false, model: "x", reader });
const srcOn = renderIdeaSources(shellFix, { feeds: [ifFeed], settings: ifSettings, usage: new Map([["ai-triage", { kind: "ai-triage", calls: 1, items: 20, input: 0, output: 0, cacheRead: 0 }]]), tumblr: true, ai: true, model: "x", reader });
t("Sources: how to connect when there's no key; caps, pace and the watched tags when there is", [
  srcOff.includes("tumblr.com/oauth/apps") && srcOff.includes('href="/settings#key-tumblr"'), srcOff.includes("Waiting for a Claude key"),
  srcOn.includes("(1 batch)"), srcOn.includes("Spread across the day: up to"), srcOn.includes("<b>#undertale</b>"), srcOn.includes('value="nsfw"'), estimateCost("not-a-model", { input: 1, output: 1, cacheRead: 1 }),
], [true, true, true, true, true, true, null]);
const feedPage = renderIdeaFeed(shellFix, {
  query: { tab: "foryou", channel: null, cls: null, canon: false, min: null, q: "", page: 0 }, rows: [srcRow], total: 1,
  counts: { foryou: 1, new: 3, high: 1, gems: 0, saved: 0, approved: 0, used: 0, rejected: 0 },
  pulse: { scanned: 9, strong: 1, high: 1, waiting: 2, errors: 0, filtered: 2 },
  status: { tumblr: true, ai: true, lastRead: new Date(), feeds: 18, failing: 0, aiCapped: false, paused: "" },
});
t("the feed: tabs, the card, and scripts that parse", [feedPage.includes("High priority"), feedPage.includes('id="s-41"'), [...feedPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } })], [true, true, true]);

section("Channels — added and renamed in Settings");
const animeCh = CHANNELS.find((c) => c.id === "anime")!;
const animeColour = catalogColour("Specular Anime");
applyChannelSettings([
  { id: "anime", name: "Specular Anime Stories", added: false, category: null, colour: null, units: null, previous: [] },
  { id: "u_pets", name: "Specular Pets", added: true, category: "bits", colour: "#12AB34", units: 3, previous: [] },
]);
const petsCh = CHANNELS.find((c) => c.id === "u_pets");
t("a rename keeps the channel's id and colour; the old name still finds it in a message", [animeCh.name, animeCh.id, matchChannel("Specular Anime")?.id, matchChannel("posted on specular anime stories today")?.id, catalogColour("Specular Anime Stories")], ["Specular Anime Stories", "anime", "anime", "anime", animeColour]);
t("an added channel joins the end of its category, with its colour and daily batch", [CHANNELS[CHANNELS.map((c) => c.category).lastIndexOf("bits")]?.id, petsCh?.category, petsCh?.recurring?.units, catalogColour("Specular Pets"), matchChannel("new video for specular pets")?.id], ["u_pets", "bits", 3, "#12AB34", "u_pets"]);
t("…the @ tag and the bot's channel list use the new names", [parseAssignment("### 10-03-26 | VIDEO-030 | Something\n\n@ Anime")?.channel, systemPrompt().includes("Specular Anime Stories"), systemPrompt().includes("Specular Pets"), systemPrompt().includes("Specular Anime,"), systemPrompt().includes("- Specular Anime Stories was called Specular Anime — a message that uses that name means Specular Anime Stories."), animeCh.formerly], ["Specular Anime Stories", true, true, false, true, ["Specular Anime"]]);
t("names: tidied, and never one another channel has", [checkChannelName("  Specular   Goats  ", null), checkChannelName("specular comics", null), checkChannelName("x", null), checkChannelName("Bad|Name", null), checkChannelName("Specular Anime Stories", "anime")],
  [{ name: "Specular Goats" }, { error: "There's already a channel called Specular Comics." }, { error: "A channel needs a name." }, { error: "“Bad|Name” has characters a channel name can't use." }, { name: "Specular Anime Stories" }]);
t("an added channel's id never clashes", [newChannelId("Specular Pets"), newChannelId("Specular Goats!")], ["u_pets2", "u_goats"]);
applyChannelSettings([
  { id: "anime", name: "Specular Anime Stories", added: false, category: null, colour: null, units: null, previous: [] },
  { id: "u_x", name: "Specular Anime", added: true, category: "stories", colour: null, units: null, previous: [] },
]);
t("…an old name another channel has taken since finds that one", [matchChannel("Specular Anime")?.id, (animeCh.aliases ?? []).includes("specular anime")], ["u_x", false]);
applyChannelSettings([]);
t("…and the catalog is back as written once they're gone", [animeCh.name, CHANNELS.some((c) => c.id.startsWith("u_")), animeCh.aliases ?? null, catalogColour("Specular Anime")], ["Specular Anime", false, null, animeColour]);
const inUse = ["#D21B20", "#360D7B", "#1BC0D2", "#D39B7C"];
const newCol = distinctColour(inUse);
t("a new channel's colour stands apart from every one in use", [/^#[0-9A-F]{6}$/.test(newCol), Math.min(...inUse.map((c) => deltaE(newCol, c))) > 25], [true, true]);
const setPage2 = renderSettings({ ...shellFix, active: "settings" }, {
  railHide: [], dashHide: [], daysOff: [], shifted: [], saved: false, scripts: false, newColour: "#AABBCC", channelError: "There's already a channel called Specular Comics.",
  colours: [
    { id: "anime", name: "Specular Anime Stories", category: "stories", colour: "#360D7B", source: "catalog", sampled: false, linked: true, error: null, previous: ["Specular Anime"] },
    { id: "u_pets", name: "Specular Pets", category: "bits", colour: "#12AB34", source: "catalog", sampled: true, linked: false, error: null, added: true, removable: true, daily: 3 },
  ],
});
t("Settings: every name can be changed, an added one taken off, a channel added to any category", [
  setPage2.includes('name="n_anime" value="Specular Anime Stories"'), setPage2.includes("was Specular Anime"), setPage2.includes('formaction="/settings/channels/remove" name="remove" value="u_pets"'),
  setPage2.includes('action="/settings/channels/add"'), setPage2.includes('<option value="bits">Bits</option>'), setPage2.includes("There&#39;s already") || setPage2.includes("There's already a channel called Specular Comics."),
  [...setPage2.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }),
], [true, true, true, true, true, true, true]);

section("Story Lab — each channel's focus");
t("a channel's name says what it's about", ["Specular Anime", "Specular Manga", "Specular Comics", "Specular FNAF", "Specular Survives", "Specular YOU", "Specular Horror", "Specular Force", "Specular Battles", "Specular Studios"].map((c) => nameFocus(c).map((f) => `${f.kind}:${f.value}`).join(",")),
  ["lead:anime", "lead:anime", "lead:comics", "franchise:fnaf", "format:survive", "format:you", "genre:horror", "franchise:star wars", "format:versus", ""]);
const verseTitles = ["What If Spider-Man Was In The Boys?", "Could Spider-Man Survive World War Z?", "Spider-Man vs Homelander", "What If Spider-Man Had The Omnitrix?", "Could Spider-Man Survive Saw?", "What If Batman Was In Invincible?"];
const netTitles = [...verseTitles, "What If Batman Was In The Boys?", "Could Superman Survive Saw?", "What If Deadpool Was In FNAF?", "What If Homelander Had Mjolnir?", "Could Wolverine Survive The Last of Us?", "What If Thor Was In Invincible?", "What If Hulk Was In The Boys?", "What If Gojo Was In The MCU?"];
const verseProfile = channelProfile("Specular Verse", verseTitles, null, focusBaseline(netTitles));
t("…or its videos do: the thing most of them share that sets it apart (Spider-Man, not 'comic book characters')", verseProfile.focus.map((f) => [f.kind, f.value, f.from, f.shared, f.of]), [["hero", "spiderman", "videos", 5, 6]]);
t("…without the network to compare, the broadest thing they share", channelProfile("Specular Verse", verseTitles).focus.map((f) => f.value), ["comics"]);
t("…too few videos to read, or nothing most of them share: no focus", [channelProfile("Specular Studios", verseTitles.slice(0, 3)).focus.length, channelProfile("Specular Studios", ["What If Gojo Was In The Boys?", "Could Batman Survive Saw?", "Every FNAF Ending, Ranked", "What If YOU Were In Star Wars?"]).focus.length], [0, 0]);
t("…and one set by hand wins: a focus, or anything at all", [channelProfile("Specular Anime", [], { kind: "franchise", value: "jujutsu kaisen", note: "JJK only" }).focus.map((f) => [f.label, f.from]), channelProfile("Specular Anime", [], { kind: "any", value: null, note: null }).open, channelProfile("Specular Anime", [], { kind: null, value: null, note: "Shounen leads" }).note],
  [[["Jujutsu Kaisen", "set"]], true, "Shounen leads"]);
const animeProfile = channelProfile("Specular Anime", []);
const piecesOf = (title: string) => piecesOfTitle(title);
t("an idea goes only where it belongs: Invincible with a Green Lantern ring isn't an anime video", [
  fitsChannel(animeProfile, piecesOf("What If Invincible Had A Green Lantern Ring?")), fitsChannel(animeProfile, piecesOf("What If Gojo Had A Green Lantern Ring?")).ok,
  fitsChannel(channelProfile("Specular FNAF", []), piecesOf("What If Deadpool Was In FNAF?")).ok, fitsChannel(channelProfile("Specular Survives", []), piecesOf("What If Gojo Was In The Boys?")).ok,
  fitsChannel(channelProfile("Specular Horror", []), piecesOf("Could Batman Survive Silent Hill?")).ok, fitsChannel(channelProfile("Specular YOU", []), piecesOf("What If YOU Were In Jujutsu Kaisen?")).ok,
], [{ ok: false, why: "not anime & manga characters" }, true, true, false, true, true]);
const allIdeas = labIdeas([], new Date("2026-09-26T12:00:00Z"), 100_000, [], [], false);
const animeLab = channelLab("Specular Anime", [], allIdeas, 60, 2);
const mediaOfLead = (i: LabIdea) => (i.hero ? piecesOf(i.title).hero?.from : null);
t("Story Lab's ideas for Specular Anime all lead with an anime character", [animeLab.length > 10, animeLab.every((r) => fitsChannel(animeProfile, r.idea).ok), animeLab.some((r) => ["mark", "batman", "superman"].includes(r.idea.hero?.id ?? "")), animeLab[0]!.fit[0]], [true, true, false, "fits the channel: anime & manga characters"]);
void mediaOfLead;
const wnFocus = writeNext({ channels: ["Specular Studios", "Specular Anime", "Specular Comics", "Specular Survives"].map((channel) => ({ channel, titles: [] as string[], profile: channelProfile(channel, []) })), ideas: allIdeas, marks: [], neighbours: [] });
t("Write next: every channel's cards fit it", [
  wnFocus.get("Specular Anime")!.every((c) => fitsChannel(animeProfile, c.idea).ok), wnFocus.get("Specular Comics")!.every((c) => fitsChannel(channelProfile("Specular Comics", []), c.idea).ok),
  wnFocus.get("Specular Survives")!.every((c) => c.idea.format === "survive"), wnFocus.get("Specular Studios")!.length,
], [true, true, true, 2]);

section("Story Lab — Claude's ideas");
t("title shapes: the names taken out", [titleShape("Every Batman Villain, Ranked"), titleShape("Every Sukuna Villain, Ranked"), titleShape("How Does Gojo's Infinity Actually Work?"), titleShape("Could Goku Survive The Hunger Games?")],
  ["every * villain ranked", "every * villain ranked", "how does * actually work", "could * survive the *"]);
const shapeVids: LabVideo[] = [
  { title: "Every Batman Villain, Ranked", multiple: 2.4, publishedAt: new Date("2026-08-01") },
  { title: "Every Spider-Man Villain, Ranked", multiple: 2.0, publishedAt: new Date("2026-08-05") },
  { title: "Every Homelander Villain, Ranked", multiple: 2.2, publishedAt: new Date("2026-08-09") },
  { title: "What If Gojo Joined The Avengers?", multiple: 1.0, publishedAt: new Date("2026-08-10") },
  { title: "Could Batman Survive Saw?", multiple: 0.8, publishedAt: new Date("2026-08-11") },
  { title: "What If Deadpool Was In FNAF?", multiple: 1.0, publishedAt: new Date("2026-08-12") },
];
const shapesNow = shapeStats(shapeVids);
t("…and how each shape did, pulled toward no effect", [shapesNow.get("every * villain ranked")?.n, Number(shapesNow.get("every * villain ranked")?.lift.toFixed(2)), shapesNow.has("could * survive *")], [3, 1.23, false]);
const wIdea = writtenIdea(
  { id: 7, title: "Every Sukuna Villain, Ranked", premise: "Sukuna ranks everyone who ever crossed him.", beats: ["Mahito", "Jogo", "Gojo"], why: "Its rankings do 2× its usual.", modelledOn: ["Every Batman Villain, Ranked", "Not one of its videos"], createdAt: new Date("2026-09-29") },
  "Specular Anime", perfStats(shapeVids), shapesNow, new Map(shapeVids.map((v) => [norm(v.title), v.multiple])),
);
t("one of Claude's ideas is scored from the network's results, never Claude's say-so", [wIdea.key, wIdea.hero?.id, Number(wIdea.score.toFixed(2)), wIdea.reasons[0]!.text.startsWith("Titles shaped “every … villain ranked”: 3 uploads"), wIdea.ai?.modelledOn],
  ["ai:7", "sukuna", 1.23, true, [{ title: "Every Batman Villain, Ranked", multiple: 2.4 }, { title: "Not one of its videos", multiple: null }]]);
const brief = {
  id: "anime", name: "Specular Anime", profile: animeProfile,
  videos: [{ title: "What If Gojo Joined The Avengers?", multiple: 2.1 }, { title: "Could Sukuna Survive Saw?", multiple: 0.6 }, { title: "What If Megumi Was In The Boys?", multiple: null }],
  planned: ["What If Yuji Was In The MCU?"], avoid: ["What If Denji Was In FNAF?"],
};
const vetted = vetIdeas([
  { title: "What If Invincible Had A Green Lantern Ring?", premise: "p", beats: ["a"], why: "w", modelled_on: [] },
  { title: "Could Gojo Survive Saw?", premise: "p", beats: ["a"], why: "w", modelled_on: [] },
  { title: "What If Yuji Joined The Avengers?", premise: "p", beats: ["a"], why: "w", modelled_on: [] },
  { title: "What If Denji Was In FNAF?", premise: "p", beats: ["a"], why: "w", modelled_on: [] },
  { title: "Every Sukuna Villain, Ranked", premise: " Sukuna ranks them. ", beats: [" Mahito ", ""], why: "Rankings do well.", modelled_on: ["What If Gojo Joined The Avengers?", "Made up"] },
  { title: "Every Sukuna Villain, Ranked", premise: "again", beats: [], why: "", modelled_on: [] },
], brief, [{ title: "Could Gojo Survive Saw", url: "u1", channel: "Specular Horror" }], [{ title: "What If Yuji Was In The MCU?", url: "", channel: "Specular Anime" }]);
t("every idea is checked before it's kept: off the channel's focus, public anywhere, planned, turned down, twice", [vetted.kept.map((k) => [k.title, k.premise, k.beats, k.modelledOn]), vetted.dropped.map((d) => d.why)], [
  [["Every Sukuna Villain, Ranked", "Sukuna ranks them.", ["Mahito"], ["What If Gojo Joined The Avengers?"]]],
  ["doesn't fit Specular Anime: not anime & manga characters", "repeats “Could Gojo Survive Saw” (Specular Horror)", "repeats “What If Yuji Was In The MCU?” (Specular Anime)", "already suggested or made", "already suggested or made"],
]);
const req = storyRequest(brief, 6, ["Could Batman Survive Saw?"]);
const sys = storySystem([brief, { ...brief, id: "survives", name: "Specular Survives", profile: channelProfile("Specular Survives", []) }]);
t("Claude reads the channel's focus, its videos best first, what's planned and what's turned down — and every channel's focus", [
  req.includes("FOCUS: Anime & manga characters (its name)"), req.indexOf("2.1× What If Gojo") < req.indexOf("0.6× Could Sukuna"), req.includes("TOO NEW TO JUDGE:\n- What If Megumi Was In The Boys?"),
  req.includes("- What If Yuji Was In The MCU?"), req.includes("- What If Denji Was In FNAF?"), req.endsWith("Write 6 new ideas for Specular Anime."),
  sys.includes("- Specular Survives: Survival tests"), sys.includes("You are not limited to any list"),
], [true, true, true, true, true, true, true, true]);
const aiCardIdea: LabIdea = { ...wIdea, key: "ai:7" };
const wnWritten = writeNext({
  channels: ["Specular Anime", "Specular Comics"].map((channel) => ({ channel, titles: [] as string[], profile: channelProfile(channel, []) })),
  ideas: allIdeas, marks: [], neighbours: [], written: new Map([["Specular Anime", [aiCardIdea]]]),
});
t("Write next: Claude's idea beside the lore's, on its own channel only", [wnWritten.get("Specular Anime")!.map((c) => Boolean(c.idea.ai)).sort(), wnWritten.get("Specular Comics")!.some((c) => c.idea.ai)], [[false, true], false]);
const claudeLabPage = renderStoryLab(shellFix, {
  scripts: 0, words: 0, matched: 0, ideas: [], blueprint: null, picked: { format: "insert", hero: "", world: "", power: "", target: "" }, check: null, contrast: null, results: [],
  coverage: { heroes: [], worlds: [], done: new Set() }, formats: [],
  writeNext: [{ channel: "Specular Anime", id: "anime", cards: wnWritten.get("Specular Anime")!.map((c) => ({ ...c, blueprint: null })), saved: [], skipped: 0, profile: animeProfile, set: null, writtenLeft: 3, lastRun: null }],
  claude: { on: true, today: 4, cap: 30, kept: 12, want: 4 }, focusChoices: focusChoices(),
});
t("the page: each channel's focus (changeable), Claude's idea with its beats and the videos it builds on", [
  claudeLabPage.includes("📌 Anime &amp; manga characters · its name"), claudeLabPage.includes('action="/story-lab/focus"'), claudeLabPage.includes('<option value="franchise:jujutsu kaisen">Jujutsu Kaisen</option>'),
  claudeLabPage.includes("✨ Claude's idea"), claudeLabPage.includes("<li>Mahito</li>"), claudeLabPage.includes("builds on “Every Batman Villain, Ranked”"), claudeLabPage.includes("✨ 3 of Claude&#39;s ideas waiting") || claudeLabPage.includes("✨ 3 of Claude's ideas waiting"),
  claudeLabPage.includes("4 of 30 calls today"), [...claudeLabPage.matchAll(/<script>([\s\S]*?)<\/script>/g)].every((m) => { try { new Function(m[1]!); return true; } catch { return false; } }),
], [true, true, true, true, true, true, true, true, true]);

section("Login password");
const tokenBefore = issueToken();
setStoredPassword({ hash: await hashPassword("newpass123", "salt1"), salt: "salt1", generation: "g1", changedAt: new Date() });
t("a password set in Settings takes over; the old sign-ins end", [await checkPassword("newpass123"), await checkPassword(config.dashboardPassword || "test"), await checkPassword(""), verifyToken(tokenBefore), verifyToken(issueToken())], [true, false, false, false, true]);
const tokenG1 = issueToken();
setStoredPassword({ hash: await hashPassword("another-one", "salt2"), salt: "salt2", generation: "g2", changedAt: new Date() });
t("…and changing it again ends those too", [verifyToken(tokenG1), await checkPassword("newpass123"), await checkPassword("another-one")], [false, false, true]);
setStoredPassword(null);
t("…none set: sign-ins from before still hold", verifyToken(tokenBefore), true);
t("a forged or expired sign-in is refused", [verifyToken(undefined), verifyToken(""), verifyToken("123.abc"), verifyToken(`${Date.now() - 1000}.x`), verifyToken(tokenBefore.replace(/.$/, (c) => (c === "A" ? "B" : "A")))], [false, false, false, false, false]);
{
  const ip = "203.0.113.9";
  const t0 = Date.parse("2026-10-02T12:00:00Z");
  for (let i = 0; i < 9; i++) noteLoginFailure(ip, t0 + i);
  const afterNine = loginWait(ip, t0 + 10);
  noteLoginFailure(ip, t0 + 10);
  t("wrong passwords: ten in fifteen minutes and that address waits; others don't; it lifts, and a right one clears it", [
    afterNine, loginWait(ip, t0 + 20) > 890, loginWait("198.51.100.1", t0 + 20), loginWait(ip, t0 + 15 * 60_000 + 1),
    (clearLoginFailures(ip), noteLoginFailure(ip, t0), loginWait(ip, t0 + 1)),
  ], [0, true, 0, 0, 0]);
  clearLoginFailures(ip);
  // Two hundred wrong from many addresses (a forged X-Forwarded-For each time): everyone waits.
  for (let i = 0; i < 200; i++) noteLoginFailure(`10.0.${Math.floor(i / 250)}.${i % 250}`, t0 + i);
  t("…and a ceiling across every address, which a forged address can't get round", [loginWait("192.0.2.200", t0 + 300) > 0, loginWait("192.0.2.200", t0 + 15 * 60_000 + 300)], [true, 0]);
}
t("cookies are Secure over https, and only left off for plain http", [cookieOptions(true).secure, cookieOptions(false).secure === config.publicUrl.startsWith("https://"), cookieOptions(true).httpOnly, cookieOptions(true).sameSite], [true, true, true, "lax"]);

section("Configuration is checked before anything runs");
{
  const ok = configProblems({ ORG_TZ: "America/New_York", PORT: "8080", DASHBOARD_PASSWORD: "x", SESSION_SECRET: "y", PUBLIC_URL: "https://board.example" });
  const bad = configProblems({ ORG_TZ: "Eastern", TEAM_TZ: "Asia/Kolkata", PORT: "eighty", DEADLINE_TIME: "11:59pm", SERVICE: "both", DASHBOARD_PASSWORD: "x", PUBLIC_URL: "board.example" });
  t("a good environment passes; a misspelt zone, a word for a number, a 12-hour time and an unknown SERVICE stop it", [
    ok, bad.fatal.length, bad.fatal[0]!.startsWith('ORG_TZ="Eastern"'), bad.warnings.some((w) => w.startsWith("PUBLIC_URL")), bad.warnings.some((w) => w.startsWith("SESSION_SECRET")),
  ], [{ fatal: [], warnings: [] }, 4, true, true, true]);
}

section("Every environment variable is documented");
{
  // Read every variable the code reads; each must be in .env.example (commented out is fine).
  const used = new Set<string>();
  const walk = (dir: URL): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
      else if (e.name.endsWith(".ts")) {
        const src = readFileSync(new URL(e.name, dir), "utf8");
        for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)|\bopt\("([A-Z][A-Z0-9_]+)"|\benv: "([A-Z][A-Z0-9_]+)"/g)) used.add(m[1] ?? m[2] ?? m[3]!);
      }
    }
  };
  walk(new URL("../src/", import.meta.url));
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const documented = new Set([...example.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!));
  t("each variable the code reads is in .env.example, and nothing there is unused", [[...used].filter((v) => !documented.has(v)).sort(), [...documented].filter((v) => !used.has(v)).sort(), used.size > 30], [[], [], true]);
}

section("Claude models: one table");
{
  const saved = { a: process.env.ANTHROPIC_MODEL, i: process.env.IDEAS_MODEL };
  delete process.env.ANTHROPIC_MODEL; delete process.env.IDEAS_MODEL;
  const defaults = [modelFor("intake"), modelFor("ideas"), modelFor("storylab")];
  process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
  const everywhere = [modelFor("intake"), modelFor("competitors")];
  process.env.IDEAS_MODEL = "claude-haiku-4-5";
  const own = [modelFor("ideas"), modelFor("finance")];
  if (saved.a === undefined) delete process.env.ANTHROPIC_MODEL; else process.env.ANTHROPIC_MODEL = saved.a;
  if (saved.i === undefined) delete process.env.IDEAS_MODEL; else process.env.IDEAS_MODEL = saved.i;
  t("each feature's default, ANTHROPIC_MODEL for all, a feature's own variable for one", [defaults, everywhere, own], [["claude-opus-5", "claude-opus-5-5", "claude-opus-5-5"], ["claude-sonnet-5-5", "claude-sonnet-5-5"], ["claude-haiku-4-5", "claude-sonnet-5-5"]]);
}

section("Database: channel names");
{
  // Every column that stores a channel's name, read from the migrations themselves.
  const dir = new URL("../src/db/migrations/", import.meta.url);
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(new URL(file, dir), "utf8").replace(/--.*$/gm, "");
    for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/g)) {
      for (const c of m[2]!.matchAll(/^\s*(channel|board_channel|channels)\s+TEXT/gim)) found.add(`${m[1]}.${c[1]!.toLowerCase()}`);
    }
    for (const m of sql.matchAll(/ALTER TABLE (\w+) ADD COLUMN IF NOT EXISTS (channel|board_channel|channels) TEXT/gi)) found.add(`${m[1]}.${m[2]!.toLowerCase()}`);
  }
  const listed = new Set([...NAME_COLUMNS.map(([t, c]) => `${t}.${c}`), ...NAME_ARRAYS.map(([t, c]) => `${t}.${c}`)]);
  t("every table that stores a channel's name moves with a rename (add a new one to NAME_COLUMNS)", [[...found].filter((x) => !listed.has(x)).sort(), [...listed].filter((x) => !found.has(x)).sort(), found.size > 15], [[], [], true]);
}

section("Limits: one range for each setting, wherever it's set");
t("Competitors: kept in range, whole where it counts, empty or junk keeps what's there", [
  compSetting("quota", "50000", 6000), compSetting("quota", "50", 6000), compSetting("aiCalls", "12.6", 40), compSetting("outlier", "2.25", 2), compSetting("aiCalls", "", 40), compSetting("aiCalls", "lots", 40),
], [COMP_BOUNDS.quota.max, COMP_BOUNDS.quota.min, 13, 2.25, 40, 40]);
t("Idea Feed: the same, from its own table", [ideaSetting("tumblrDailyCap", "9999", 4000), ideaSetting("fullThreshold", "1.5", 0.55), ideaSetting("triageCap", " ", 600), ideaSetting("fullCap", "-3", 60)], [IDEA_BOUNDS.tumblrDailyCap.max, 1, 600, 0]);

section("HTML safety");
t("text is escaped for elements and either quote", esc(`<b a="1" b='2'>&`), "&lt;b a=&quot;1&quot; b=&#39;2&#39;&gt;&amp;");
t("links from outside: http(s) only — never javascript: or data:", [
  safeUrl("https://www.youtube.com/watch?v=x"), safeUrl(" http://a.example/ "), safeUrl("javascript:alert(1)"), safeUrl("JaVaScRiPt:alert(1)"), safeUrl("data:text/html,x"), safeUrl("/r/4"), safeUrl(null),
], ["https://www.youtube.com/watch?v=x", "http://a.example/", "", "", "", "", ""]);
t("…or a path on this site, where a link may be either", [safeHref("/r/4#script"), safeHref("https://docs.google.com/document/d/x"), safeHref("//evil.example"), safeHref("javascript:alert(1)")], ["/r/4#script", "https://docs.google.com/document/d/x", "", ""]);
t("a value inside an inline script can't end it", [jsonForScript("</script><script>alert(1)</script>"), JSON.parse(jsonForScript("a</b>&\u2028"))], ['"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"', "a</b>&\u2028"]);

section("Redirects stay on this site");
t("a form's back field: only a path here", [
  localPath("/my-day", "/x"), localPath("/ideas?tab=approved#s-4", "/x"), localPath("//evil.example/a", "/x"), localPath("/\\evil.example", "/x"),
  localPath("https://evil.example/", "/x"), localPath("javascript:alert(1)", "/x"), localPath("/a\r\nSet-Cookie: x=1", "/x"), localPath(undefined, "/x"), localPath(["/a"], "/x"),
], ["/my-day", "/ideas?tab=approved#s-4", "/x", "/x", "/x", "/x", "/x", "/x", "/x"]);
t("the page someone came from: its path and query, never its host", [
  refererPath("https://board.example/r/4?moved=1", "/x"), refererPath("https://evil.example/calendar", "/x"), refererPath("https://board.example//evil.example/a", "/x"),
  refererPath(undefined, "/x"), refererPath("not a url at all", "/x"),
], ["/r/4?moved=1", "/calendar", "/x", "/x", "/not%20a%20url%20at%20all"]);
t("a download's name survives any language, and can't break the header", [
  contentDisposition("attachment", "receipt.pdf"), contentDisposition("inline", "收据 \"1\".png"),
], ['attachment; filename="receipt.pdf"; filename*=UTF-8\'\'receipt.pdf', 'inline; filename="__ 1.png"; filename*=UTF-8\'\'%E6%94%B6%E6%8D%AE%20%221%22.png']);

section("Competitors");
const cNow = new Date("2026-10-01T12:00:00Z");
const cDay = 86_400_000;
const cCh = (id: number, mine = false): CompChannel => ({ id, groupId: 1, youtubeId: `UC${id}`, input: "", mine, boardChannel: null, title: `Ch${id}`, handle: null, avatar: null, subscribers: null, videoCount: null, backfilledAt: null, refreshedAt: null, error: null });
const cVid = (id: string, ch: number, daysAgo: number, views: number, title = "x"): NicheVideo => ({ videoId: id, channelId: ch, title, publishedAt: new Date(cNow.getTime() - daysAgo * cDay), durationS: 1300, isShort: false, thumbnail: "", views, url: `https://www.youtube.com/watch?v=${id}`, snapshots: [] });
const cCon = (ref: string, lead: string | null, other: string | null, trend = "Marvel × Anime crossover", format = "what_if"): Concept => ({ ref, title: ref, lead, other, characters: lead ? [lead] : [], franchises: other ? [other] : [], format, trend, shape: null, source: "ai" });
const cChannels = [cCh(1), cCh(2), cCh(3), cCh(9, true)];
const cVideos: NicheVideo[] = [];
const cConcepts = new Map<string, Concept>();
for (const ch of [1, 2, 3]) for (let i = 0; i < 5; i++) { const id = `b${ch}${i}`; cVideos.push(cVid(id, ch, 40 + i * 10, 10_000)); cConcepts.set(id, cCon(id, `Hero${ch}${i}`, "Somewhere")); }
// Spider-Man × JJK breaks out on two channels; Batman × The Boys on one, which I covered 14 months ago; Gojo × The MCU, which I covered last month.
cVideos.push(cVid("o1", 1, 20, 60_000)); cConcepts.set("o1", cCon("o1", "Spider-Man", "Jujutsu Kaisen"));
cVideos.push(cVid("o2", 2, 18, 40_000)); cConcepts.set("o2", cCon("o2", "Spider-Man", "Jujutsu Kaisen"));
cVideos.push(cVid("o3", 3, 25, 30_000)); cConcepts.set("o3", cCon("o3", "Batman", "The Boys", "Superhero crossover"));
cVideos.push(cVid("o4", 3, 16, 25_000)); cConcepts.set("o4", cCon("o4", "Gojo", "The MCU"));
cVideos.push(cVid("m1", 9, 425, 5_000)); cConcepts.set("m1", cCon("m1", "Batman", "The Boys", "Superhero crossover"));
cVideos.push(cVid("m2", 9, 30, 5_000)); cConcepts.set("m2", cCon("m2", "Gojo", "The MCU"));
cVideos.push(cVid("m3", 9, 200, 5_000)); cConcepts.set("m3", cCon("m3", "Spider-Man", "The Boys"));
const cRows = rowsOf(cVideos, cChannels, cConcepts, cNow);
const rowOf = (id: string) => cRows.find((r) => r.video.videoId === id)!;
t("competitor videos are scored by the board's own engine, against their channel's normal", [rowOf("o1").multiple, rowOf("o1").basis, rowOf("b10").multiple, Math.round(rowOf("o1").perDay!)], [6, "lifetime", 1, 3000]);
const cGaps = conceptGaps(cRows, [{ ref: "rec:1", title: "Gojo In The MCU", channel: "Specular Anime", date: "2026-10-09", concept: null }], { days: 30, outlier: 2, staleMonths: 9, now: cNow });
const gapOf = (k: string) => cGaps.find((g) => g.key === k);
t("concept gaps: never covered, stale, recently covered — matched on lead and other, not title", [
  cGaps.map((g) => g.key), gapOf("spider man|jujutsu kaisen")?.coverage, gapOf("spider man|jujutsu kaisen")?.channels, gapOf("spider man|jujutsu kaisen")?.strong,
  gapOf("batman|boys")?.coverage, gapOf("gojo|mcu")?.coverage,
], [["spider man|jujutsu kaisen", "batman|boys", "gojo|mcu"], "never", 2, true, "stale", "recent"]);
t("…Spider-Man in The Boys doesn't count as covering Spider-Man in JJK, and the why is all numbers from the videos", [gapOf("spider man|jujutsu kaisen")!.mine.length, gapOf("spider man|jujutsu kaisen")!.why],
  [0, "2 independent competitors produced 2 2×+ outliers on Spider-Man × Jujutsu Kaisen in the last 30 days (highest 6.0×, the latest 18 days ago). None of the channels marked as yours have covered it."]);
const plannedGaps = conceptGaps(cRows, [{ ref: "rec:1", title: "Spider-Man Goes To Jujutsu High", channel: "Specular Anime", date: "2026-10-09", concept: cCon("rec:1", "Spider-Man", "Jujutsu Kaisen") }], { days: 30, outlier: 2, staleMonths: 9, now: cNow });
t("…a planned video on the board counts as planned", plannedGaps.find((g) => g.key === "spider man|jujutsu kaisen")?.coverage, "planned");
t("…outside the window it isn't surfaced", conceptGaps(cRows, [], { days: 7, outlier: 2, staleMonths: 9, now: cNow }).length, 0);
t("concepts read by rules when there's no key: lead and other from the lore, format and shape", [ruleConcept("x", "What If Spider-Man Was In Jujutsu Kaisen?").lead, ruleConcept("x", "What If Spider-Man Was In Jujutsu Kaisen?").other, ruleConcept("x", "Every Batman Villain, Ranked").format, conceptKey(cCon("x", "Spider-Man", "The Boys"))], ["Spider-Man", "Jujutsu Kaisen", "ranking", "spider man|boys"]);
const cStats = cChannels.map((c) => channelStats(c, cRows, 2));
const s1 = cStats[0]!;
t("a channel's numbers: medians of settled videos, uploads a week, outlier rate and strength", [s1.medianViews, s1.uploads90, Number(s1.perWeek.toFixed(2)), s1.outliers90, Number(s1.outlierRate!.toFixed(2)), s1.outlierStrength, s1.best?.video.videoId], [10_000, 6, 0.47, 1, 0.33, 6, "o1"]);
const pos = myPosition(cStats);
t("my position: every channel's real numbers beside the competitors' median, no made-up rank", [pos.stats.map((x) => x.channel.id), pos.niche.medianViews], [[1, 2, 3, 9], 10_000]);
const working = whatsWorking(cRows, { days: 90, outlier: 2 });
t("what's working: what outliers share more than the niche, from 2+ channels", [working.map((p) => `${p.dimension}:${p.value}`).slice(0, 2), working.some((p) => p.dimension === "trend")], [["character:Spider-Man", "franchise:Jujutsu Kaisen"], false]);
const emerge = emergingTopics([...cRows, ...[1, 2, 3].map((ch) => ({ ...rowOf(`b${ch}0`), ageDays: 5, concept: cCon("e", "Invincible", "Dragon Ball") }))]);
const emergeC = emerge.find((e) => e.kind === "concept");
t("emerging: three channels on one thing in two weeks, flagged as early", [emergeC?.label, emergeC?.channels, emergeC?.fact.startsWith("3 channels uploaded 3 videos on Invincible × Dragon Ball in the last 14 days")], ["Invincible × Dragon Ball", 3, true]);

// ── Settings: API keys and limits ───────────────────────────────────────────
{
  const sealed = seal("sk-ant-api03-SECRETSECRETSECRET-abcd");
  t("keys are stored encrypted and come back whole; a tampered one doesn't", [sealed.includes("SECRET"), unseal(sealed), unseal(sealed.slice(0, -4) + "AAAA")], [false, "sk-ant-api03-SECRETSECRETSECRET-abcd", null]);
  t("keys are only ever shown masked", [mask("AIzaSyB1234567890abcdQFk3"), mask("short")], ["AIzaSy…QFk3", "••••"]);
  t("several YouTube keys: one per line or comma-separated, repeats dropped", splitKeys(" AIzaA1, AIzaB2\nAIzaA1\n\n AIzaC3 "), ["AIzaA1", "AIzaB2", "AIzaC3"]);
  const rest = new Map([["k1", Date.now() + 60_000]]);
  t("a key out of quota rests; the next takes over, and when all are out the first is tried", [liveKey(["k1", "k2"], rest), liveKey(["k1"], rest), liveKey(["k1", "k2"], new Map()), liveKey([], rest)], ["k2", "k1", "k1", undefined]);
  t("quotas reset at midnight Pacific", new Date(quotaResetAfter(new Date("2026-10-01T20:00:00Z"))).toISOString(), "2026-10-02T07:00:00.000Z");
  const fake = (status: number, body = "") => (async () => new Response(body, { status })) as unknown as typeof fetch;
  t("testing a key: works, wrong key, quota, API not enabled, Tumblr secret by mistake, no network", [
    (await testKey("anthropic", "k", fake(200))).ok, (await testKey("anthropic", "k", fake(401))).note, (await testKey("youtube", "k", fake(403, '{"error":{"errors":[{"reason":"quotaExceeded"}],"message":"quota"}}'))).note,
    (await testKey("youtube", "k", fake(403, "YouTube Data API v3 has not been used in project"))).note, (await testKey("tumblr", "k", fake(401))).note,
    (await testKey("tumblr", "k", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).note,
  ], [true, "not accepted", "out of quota today", "YouTube Data API v3 isn't enabled for it", "not accepted — use the OAuth consumer key, not the secret", "couldn't reach the service"]);
  const setPage = renderSettings(shellFix, {
    railHide: [], dashHide: [], daysOff: [], shifted: [], saved: false, scripts: false,
    password: { changedAt: null, saved: false, error: "" },
    keys: {
      services: [
        { id: "anthropic", label: "Claude (Anthropic)", what: "w", where: "console.anthropic.com", many: false, source: "settings", unreadable: false, keys: [{ masked: "sk-ant…abcd", test: { ok: true, note: "works" } }] },
        { id: "youtube", label: "YouTube Data API", what: "w", where: "g", many: true, source: "railway", unreadable: false, keys: [{ masked: "AIzaSy…AAAA" }, { masked: "AIzaSy…BBBB", resting: true }] },
        { id: "tumblr", label: "Tumblr", what: "w", where: "t", many: false, source: "none", unreadable: false, keys: [] },
      ],
      flash: { id: "anthropic", text: "Saved and working. In use now." },
    },
    limits: { saved: true, rows: [{ group: "Story Lab", name: "story", label: "Claude calls a day", value: 30, min: 0, max: 500, today: 4 }] },
  });
  t("Settings opens on a menu of every section, like a phone's", ["#keys", "#limits", "#password", "#estimates", "#daysoff", "#layout"].every((h) => setPage.includes(`href="${h}"`)) && setPage.includes("2 of 3 connected"), true);
  t("…each key card: where it comes from, masked keys, tests, quota rest; Remove only for one set here", [
    setPage.includes("Set here") && setPage.includes("From Railway") && setPage.includes("Not set"), setPage.includes("✓ works"), setPage.includes("out of quota until midnight Pacific"),
    (setPage.match(/value="clear"/g) ?? []).length, setPage.includes("<textarea name=\"value\""), setPage.includes('type="password" name="value"'), setPage.includes("Saved and working"),
  ], [true, true, true, 1, true, true, true]);
  t("…limits: each cap with today's count", [setPage.includes('name="story"') && setPage.includes('value="30"'), setPage.includes("4 today"), setPage.indexOf('id="keys"') < setPage.indexOf('id="layout"')], [true, true, true]);
}

console.log(
  `\n${pass} passed, ${fail} failed\n`,
);
process.exit(fail > 0 ? 1 : 0);
