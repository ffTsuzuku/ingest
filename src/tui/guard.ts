/**
 * Global terminal safety guard.
 * Ensures the terminal is restored to a sane state on unexpected exit,
 * even if an exception occurs while raw mode is active.
 */

let guardInstalled = false;

function restoreTerminal(): void {
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    // Show cursor and exit alt screen
    process.stdout.write('\x1b[?25h');  // showCursor
    process.stdout.write('\x1b[?1049l');  // altScreenExit
  } catch {
    // Best effort - don't throw during cleanup
  }
}

export function installTerminalGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;

  process.on('exit', restoreTerminal);
  process.on('uncaughtException', (err) => {
    restoreTerminal();
    console.error(`\nFatal error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    restoreTerminal();
    console.error(`\nUnhandled rejection: ${reason}`);
    process.exit(1);
  });
}
