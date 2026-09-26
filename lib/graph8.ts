import { g8 } from "@graph8/sdk";

/**
 * The one place that talks to graph8. Every method used anywhere in Conductor is listed in CAPABILITIES.md.
 * In dry mode `write()` logs the intended call instead of performing it; reads always run.
 */

export type Mode = "dry" | "live";
export const mode = (): Mode => (process.env.CONDUCTOR_MODE === "live" ? "live" : "dry");

let ready = false;
export function client() {
  if (!ready) {
    if (!process.env.G8_API_KEY) throw new Error("G8_API_KEY is not set (.env.local)");
    g8.init({ apiKey: process.env.G8_API_KEY });
    ready = true;
  }
  return g8;
}

export interface WriteLog {
  at: string;
  mode: Mode;
  op: string;
  args: unknown;
  ok: boolean;
  error?: string;
}

const log: WriteLog[] = [];
export const writeLog = () => log;

/** Run a graph8 write, or just record it in dry mode. Returns null in dry mode or on failure. */
export async function write<T>(op: string, args: unknown, fn: () => Promise<T>): Promise<T | null> {
  const entry: WriteLog = { at: new Date().toISOString(), mode: mode(), op, args, ok: true };
  log.push(entry);
  if (mode() === "dry") {
    console.log(`[dry] ${op}`, JSON.stringify(args));
    return null;
  }
  try {
    return await fn();
  } catch (e) {
    entry.ok = false;
    entry.error = describeError(e);
    console.error(`[graph8] ${op} failed: ${entry.error}`);
    return null;
  }
}

/** Error text that never includes request headers (and so never the key). */
export function describeError(e: unknown): string {
  const err = e as { status?: number; type?: string; code?: string; detail?: unknown; message?: string };
  const detail = typeof err.detail === "string" ? err.detail : err.detail ? JSON.stringify(err.detail) : "";
  return [err.status, err.type, err.code, detail || err.message].filter(Boolean).join(" ").slice(0, 300);
}
