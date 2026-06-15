/**
 * Shared file logger for agent-canvas dev scripts.
 *
 * Writes log output to a daily-rotating file under <project-root>/logs/
 * alongside the existing console output (which is unchanged).
 *
 * File naming:  logs/agent-canvas.YYYY-MM-DD.log
 * Retention:    7 days (files older than 7 days are automatically deleted)
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createLogger, format } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

// Mirror the state-directory logic from dev-safe.mjs so log files live
// alongside all other agent-canvas runtime state (e.g. ~/.openhands/agent-canvas).
// The same env var (OH_CANVAS_SAFE_STATE_DIR) overrides both.
const stateDir =
  process.env.OH_CANVAS_SAFE_STATE_DIR ||
  join(homedir(), ".openhands", "agent-canvas");
const logDir = join(stateDir, "logs");

// Ensure the logs directory exists before the transport tries to open a file.
mkdirSync(logDir, { recursive: true });

// Matches any ANSI CSI escape sequence (colors, cursor movement, etc.).
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Remove ANSI escape codes so log files contain clean plain text.
 * @param {string} str
 * @returns {string}
 */
export function stripAnsi(str) {
  return typeof str === "string" ? str.replace(ANSI_RE, "") : String(str);
}

const fileTransport = new DailyRotateFile({
  dirname: logDir,
  filename: "agent-canvas.%DATE%.log",
  datePattern: "YYYY-MM-DD",
  maxFiles: "7d",
  // Audit file tracks which rotated files exist; kept alongside log files.
  auditFile: join(logDir, ".log-audit.json"),
  createSymlink: false,
});

const fileLogger = createLogger({
  level: "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(
      ({ timestamp, level, message }) =>
        `${timestamp} [${level.toUpperCase().padEnd(5)}] ${message}`,
    ),
  ),
  transports: [fileTransport],
});

// Swallow any transport-level errors (e.g. disk full) so a logging failure
// never crashes the dev server.
fileLogger.on("error", () => {});
fileTransport.on("error", () => {});

/**
 * Write a message to the rotating log file.
 * ANSI escape codes are stripped automatically; console output is unaffected.
 *
 * @param {'info' | 'warn' | 'error' | 'debug'} level
 * @param {string} message
 */
export function fileLog(level, message) {
  fileLogger.log(level, stripAnsi(message));
}
