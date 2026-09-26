import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./world.ts";
import type { Decision, Enrollment, Touch } from "./types.ts";
import type { WriteLog } from "./graph8.ts";

export type DecisionOrigin = "scan" | "event" | "preflight" | "simulate";

export interface StoredDecision extends Decision {
  origin: DecisionOrigin;
  contactName: string;
  companyId: string;
  writeback: WriteLog[];
}

export interface ConductorState {
  decisions: StoredDecision[]; // newest first
  liveTouches: Touch[];
  liveEnrollments: Enrollment[];
  paused: string[]; // "contactId|sequenceId"
  scannedAt?: string;
  lastPollAt?: string;
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

export function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state(), null, 2));
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
