import type { Source } from "./types.ts";

const HOUR = 60 * 60 * 1000;

/** Every Conductor threshold and penalty lives here. */
export const CONFIG = {
  /** Harmony Score looks at the last 7 days. */
  scoreWindowMs: 7 * 24 * HOUR,

  /** Automated / cold sources. Human touches and bookings are never "cold". */
  coldSources: ["sequence", "campaign", "agent", "dialer"] as Source[],

  R3: { windowMs: 24 * HOUR, maxChannels: 2 }, // 3+ channels in 24h → delay
  R4: { windowMs: 7 * 24 * HOUR, maxTouches: 6 }, // >6 touches in 7d → hold
  R5: { windowMs: 48 * HOUR, maxSenders: 1 }, // 2+ senders in 48h → reroute

  /**
   * Harmony Score = 100 − Σ per rule min(cap, each × violations in the last 7 days), clamped 0–100.
   * The cap stops one noisy rule from zeroing the score on its own.
   */
  penalties: {
    R1: { each: 12, cap: 36 }, // automated touch after the buyer booked a meeting or replied
    R2: { each: 8, cap: 16 }, // cold touch while the company has an open deal (not from the deal owner)
    R3: { each: 4, cap: 12 }, // touch that makes it 3+ channels in 24h
    R4: { each: 3, cap: 9 }, // each touch beyond the 7-day budget
    R5: { each: 3, cap: 9 }, // touch from a second sender within 48h
  },
} as const;
