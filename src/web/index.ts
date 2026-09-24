import { startWeb } from "./server.js";

startWeb().catch((err) => {
  console.error("[web] failed to start:", err);
  process.exit(1);
});
