/**
 * Imported first by every entrypoint, so it runs before any other module
 * loads: some modules build date formatters for ORG_TZ as they load, and a
 * misspelt zone has to stop the process with a plain message, not a stack.
 * It also makes one stray promise rejection survivable (process.ts).
 */
import { checkConfig } from "./config.js";
import { guardProcess } from "./process.js";

guardProcess();
checkConfig();
