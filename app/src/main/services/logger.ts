import { app } from 'electron';
import { appendFileSync, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';

type Level = 'debug' | 'info' | 'warn' | 'error';

const MAX_LOG_BYTES = 1024 * 1024; // rotate after 1 MB

let logFile: string | null = null;

function ensureFile(): string {
  if (logFile) return logFile;
  const dir = join(app.getPath('userData'), 'logs');
  mkdirSync(dir, { recursive: true });
  logFile = join(dir, 'main.log');
  return logFile;
}

function rotate(file: string): void {
  try {
    if (statSync(file).size > MAX_LOG_BYTES) {
      renameSync(file, `${file}.1`);
    }
  } catch {
    // ignore rotation errors
  }
}

function format(level: Level, args: unknown[]): string {
  const ts = new Date().toISOString();
  const body = args
    .map((a) => {
      if (a instanceof Error) return a.stack ?? a.message;
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
  return `[${ts}] [${level}] ${body}\n`;
}

/** Lightweight local logger. Nothing is ever sent to a remote server. */
export const logger = {
  debug(...args: unknown[]): void {
    this.write('debug', args);
  },
  info(...args: unknown[]): void {
    this.write('info', args);
  },
  warn(...args: unknown[]): void {
    this.write('warn', args);
  },
  error(...args: unknown[]): void {
    this.write('error', args);
  },
  write(level: Level, args: unknown[]): void {
    const line = format(level, args);
    if (level === 'error') process.stderr.write(line);
    try {
      const file = ensureFile();
      rotate(file);
      appendFileSync(file, line, 'utf-8');
    } catch {
      // logging must never crash the app
    }
  }
};
