/**
 * The bot, the board and the background jobs share one process, so one stray
 * failure must not end all three. A promise rejection nobody handled would
 * (Node's default); here it's logged and the process carries on. An
 * exception thrown outside any handler still ends it after Node logs it —
 * the state is unknown then — and Railway starts it again.
 */
let guarded = false;
export function guardProcess(): void {
  if (guarded) return;
  guarded = true;
  process.on("unhandledRejection", (reason) => {
    console.error("[process] a promise failed and nothing handled it:", reason);
  });
}
