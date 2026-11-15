/** Simple structured stdout logger (no external deps, no remote sending). */
export const logger = {
  info(...args: unknown[]): void {
    console.log(`[${new Date().toISOString()}] [info]`, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`[${new Date().toISOString()}] [warn]`, ...args);
  },
  error(...args: unknown[]): void {
    console.error(`[${new Date().toISOString()}] [error]`, ...args);
  }
};
