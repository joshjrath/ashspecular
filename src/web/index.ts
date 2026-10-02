import { startWeb } from "./server.js";
import { guardProcess } from "../process.js";

guardProcess();

startWeb().catch((err) => {
  console.error("[web] failed to start:", err);
  process.exit(1);
});
