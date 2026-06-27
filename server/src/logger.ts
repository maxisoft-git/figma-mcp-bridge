/**
 * Lightweight structured logger.
 *
 * - Dev mode (default): human-readable lines with timestamp + level + msg
 * - JSON mode (LOG_JSON=1): one JSON object per line, suitable for log
 *   aggregators (CloudWatch, Datadog, Loki, etc.)
 *
 * No external dependency — the whole logger is ~60 LOC.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const LOG_LEVEL = (process.env.LOG_LEVEL as Level) || "info";
const LOG_JSON = process.env.LOG_JSON === "1";

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[LOG_LEVEL];
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  if (LOG_JSON) {
    process.stderr.write(JSON.stringify(record) + "\n");
    return;
  }
  // Human-readable: "2026-06-26T22:55:01.123Z INFO  msg { field: value }"
  const extras =
    fields && Object.keys(fields).length > 0
      ? " " +
        Object.entries(fields)
          .map(([k, v]) => {
            try {
              return `${k}=${JSON.stringify(v)}`;
            } catch {
              return `${k}=[unserializable]`;
            }
          })
          .join(" ")
      : "";
  process.stderr.write(`${record.ts} ${level.toUpperCase().padEnd(5)} ${msg}${extras}\n`);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) =>
    emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) =>
    emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) =>
    emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) =>
    emit("error", msg, fields),
};

/**
 * Drop-in replacement for `console.error` so existing call-sites keep
 * working but route through the structured logger.
 */
export function installConsoleShim(): void {
  console.error = (...args: unknown[]) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    emit("error", msg);
  };
  console.warn = (...args: unknown[]) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    emit("warn", msg);
  };
  console.log = (...args: unknown[]) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    emit("info", msg);
  };
}
