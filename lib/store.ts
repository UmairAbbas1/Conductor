import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./world.ts";
import type { Decision, Enrollment, Touch } from "./types.ts";
import type { WriteLog } from "./graph8.ts";
import type { ContradictionCheck, MergedMessage } from "./llm.ts";

export type DecisionOrigin = "scan" | "event" | "preflight" | "simulate";

export interface StoredDecision extends Decision {
  origin: DecisionOrigin;
  /** What was being decided, in plain words: "Nova · AI call", "Enrolled in Q4 Cold Outbound". */
  subject?: string;
  contactName: string;
  companyId: string;
  writeback: WriteLog[];
  /** LLM layer output, when a message was checked (see lib/llm.ts). */
  llm?: { contradiction?: ContradictionCheck; merged?: MergedMessage & { ownerId?: string } };
}

export interface ConductorState {
  decisions: StoredDecision[]; // newest first
  liveTouches: Touch[];
  liveEnrollments: Enrollment[];
  paused: string[]; // "contactId|sequenceId"
  scannedAt?: string;
  lastPollAt?: string;
  seenEvents?: string[]; // graph8 event ids already handled
  knownEnrollments?: string[]; // "contactId|sequenceId" seen by the poller
  /** Live deal amount/stage from graph8, by deal id (refreshed by the poller). */
  dealSync?: Record<string, { amount: number; open: boolean; stage: string; at: string }>;
}

const FILE = path.join(DATA_DIR, "conductor-state.json");
const empty = (): ConductorState => ({ decisions: [], liveTouches: [], liveEnrollments: [], paused: [] });

// One copy per server process (survives Next dev hot reloads).
const g = globalThis as unknown as { __conductor?: ConductorState };

export function state(): ConductorState {
  if (!g.__conductor) {
    try {
      g.__conductor = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
    } catch {
      g.__conductor = empty();
    }
  }
  return g.__conductor!;
}

/** Persist best-effort: a read-only or ephemeral disk must never break a decision. */
export function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state(), null, 2));
  } catch {
    /* memory state still holds; write-back to graph8 is idempotent, so a cold start just re-scans */
  }
}

export function hasDecision(id: string) {
  return state().decisions.some((d) => d.id === id);
}

export function addDecision(d: StoredDecision) {
  if (hasDecision(d.id)) return false;
  state().decisions.unshift(d);
  save();
  return true;
}

export function markPaused(contactId: string, sequenceId: string) {
  const key = `${contactId}|${sequenceId}`;
  if (!state().paused.includes(key)) state().paused.push(key);
}

export function resetState() {
  g.__conductor = empty();
  save();
}
