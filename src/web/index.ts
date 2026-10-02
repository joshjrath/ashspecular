import { startWeb } from "./server.js";
import { guardProcess } from "../process.js";
import { checkConfig } from "../config.js";

guardProcess();
checkConfig();

startWeb().catch((err) => {
  console.error("[web] failed to start:", err);
  process.exit(1);
});
