import { CONFIG } from "./config.ts";
import type { World } from "./types.ts";
import { findViolations, type Violation, type ViolationRule } from "./violations.ts";

export interface HarmonyScore {
  score: number;
  violations: Violation[]; // only those inside the 7-day window
  deductions: Record<ViolationRule, number>; // capped points per rule
}

/** 100 − Σ per rule min(cap, each × count) over the last 7 days (see lib/config.ts), clamped 0–100. */
export function harmonyScore(world: World, contactId: string): HarmonyScore {
  const now = new Date(world.now).getTime();
  const violations = findViolations(world, contactId).filter((v) => {
    const at = new Date(v.timestamp).getTime();
    return at <= now && now - at < CONFIG.scoreWindowMs;
  });
  const deductions = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0 } as Record<ViolationRule, number>;
  for (const rule of Object.keys(deductions) as ViolationRule[]) {
    const count = violations.filter((v) => v.rule === rule).length;
    deductions[rule] = Math.min(CONFIG.penalties[rule].cap, CONFIG.penalties[rule].each * count);
  }
  const total = Object.values(deductions).reduce((a, b) => a + b, 0);
  return { score: Math.max(0, Math.min(100, 100 - total)), violations, deductions };
}

/** Account score = the worst contact at that company (one unhappy buyer is an unhappy account). */
export function accountScore(world: World, companyId: string): number {
  const scores = world.contacts.filter((c) => c.companyId === companyId).map((c) => harmonyScore(world, c.id).score);
  return scores.length ? Math.min(...scores) : 100;
}
