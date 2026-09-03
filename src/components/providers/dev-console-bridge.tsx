"use client";

import { useEffect } from "react";

/** Browser → server console bridge for development.
 *
 *  Patches `console.debug` / `console.log` / `console.warn` /
 *  `console.error` so that lines matching our diagnostic-prefix pattern
 *  (a string first-arg starting with `[`) and all warnings/errors are
 *  also shipped to `/api/dev/console-log`, which appends them as
 *  NDJSON to `.claude/dev-console.log`.
 *
 *  Why: a continually-running Claude (or `tail -F`) can monitor the
 *  user's actual browser console output while they work — surfaces
 *  `[lesson-triplet]`, `[layout]`, `[vad]`, etc. instrumentation in
 *  real time without owning the browser.
 *
 *  Production: no-ops (the API route also 404s in production).
 */
type Entry = {
  ts: number;
  level: "debug" | "log" | "warn" | "error";
  args: unknown[];
  url?: string;
  pathname?: string;
};

const FLUSH_INTERVAL_MS = 250;
const MAX_QUEUE = 200;
const ENDPOINT = "/api/dev/console-log";

function shouldCapture(level: Entry["level"], args: unknown[]): boolean {
  if (level === "warn" || level === "error") return true;
  const first = args[0];
  return typeof first === "string" && first.startsWith("[");
}

function safeSerialize(value: unknown): unknown {
  if (value === undefined) return "<undefined>";
  if (value === null) return null;
  if (typeof value === "function") return `<function ${value.name || "anon"}>`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return { __error: true, name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "object") {
    try {
      JSON.stringify(value);
      return value;
    } catch {
      try {
        return JSON.parse(JSON.stringify(value, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ));
      } catch {
        return `<unserializable ${Object.prototype.toString.call(value)}>`;
      }
    }
  }
  return value;
}

export function DevConsoleBridge() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
    const w = window as Window & { __devConsolePatched?: boolean };
    if (w.__devConsolePatched) return;
    w.__devConsolePatched = true;

    const queue: Entry[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      if (queue.length === 0) return;
      const entries = queue.splice(0, queue.length);
      try {
        fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entries }),
          keepalive: true,
        }).catch(() => {
          // Swallow network errors — we don't want bridge failures to
          // spam the very console we're patching.
        });
      } catch {
        // ignored — see above
      }
    };

    const schedule = () => {
      if (flushTimer != null) return;
      flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
    };

    const enqueue = (level: Entry["level"], args: unknown[]) => {
      if (queue.length >= MAX_QUEUE) {
        // Drop the oldest to bound memory; flag the drop so a tail can
        // see we lost output.
        queue.shift();
        queue.push({
          ts: Date.now(),
          level: "warn",
          args: ["[dev-console-bridge] queue overflow — older entries dropped"],
        });
      }
      queue.push({
        ts: Date.now(),
        level,
        args: args.map(safeSerialize),
        pathname: window.location.pathname,
      });
      schedule();
    };

    const orig = {
      debug: console.debug.bind(console),
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    (["debug", "log", "warn", "error"] as const).forEach((level) => {
      console[level] = (...args: unknown[]) => {
        try {
          if (shouldCapture(level, args)) enqueue(level, args);
        } catch {
          // Never let bridge failures break the real console.
        }
        orig[level](...(args as []));
      };
    });

    // Flush remaining entries on unload so we don't lose the last
    // batch (e.g. user closes a tab right after a key diagnostic).
    const onBeforeUnload = () => {
      if (queue.length === 0) return;
      const entries = queue.splice(0, queue.length);
      const body = JSON.stringify({ entries });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        } else {
          fetch(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // ignored
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      console.debug = orig.debug;
      console.log = orig.log;
      console.warn = orig.warn;
      console.error = orig.error;
      if (flushTimer != null) clearTimeout(flushTimer);
      flush();
      w.__devConsolePatched = false;
    };
  }, []);

  return null;
}
