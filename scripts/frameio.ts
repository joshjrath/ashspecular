/**
 * What the board can read from a Frame.io link, with no API:
 *
 *   npm run frameio -- https://f.io/7bu6f54B
 */
import { factsFromName, inspectFrameLink } from "../src/parse/frameio.js";

const url = process.argv[2];
if (!url) {
  console.error("Usage: npm run frameio -- <frame.io or f.io link>");
  process.exit(1);
}
const info = await inspectFrameLink(url, fetch, 10_000);
if (!info) {
  console.log("Couldn't open that link (not Frame.io, or no internet).");
  process.exit(1);
}
console.log(JSON.stringify(info, null, 2));
const name = info.name ?? info.files[0];
if (name) console.log("\nFrom the name:", JSON.stringify(factsFromName(name), null, 2));
