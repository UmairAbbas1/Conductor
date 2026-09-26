import { evaluateAction } from "./policies.ts";
import { harmonyScore } from "./score.ts";
import { isInbound, type Decision, type Touch, type World } from "./types.ts";

export interface ReplayStep {
  touch: Touch;
  inbound: boolean;
  /** What Conductor would have done at that moment, seeing only what had been sent so far. */
  decision: Decision | null;
  kept: boolean;
  /** Harmony Score right after this moment, without and with Conductor (for live dials). */
  scoreWithout: number;
  scoreWith: number;
}

export interface Replay {
  steps: ReplayStep[];
  before: { touches: number; score: number };
  after: { touches: number; score: number };
}

/**
 * Replay one buyer's week through the rules, in time order. Every outbound touch is preflighted
 * against the world as it would have been with Conductor on (blocked touches never happened).
 * Reps' own messages are never silently dropped: an escalation still sends.
 */
export function replayWeek(world: World, contactId: string): Replay {
  const since = new Date(world.now).getTime() - 7 * 24 * 3600_000;
  const week = world.touches
    .filter((t) => t.contactId === contactId && new Date(t.timestamp).getTime() >= since)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const others = world.touches.filter((t) => t.contactId !== contactId);

  const kept: Touch[] = [];
  const sent: Touch[] = [];
  const steps: ReplayStep[] = [];
  const scoresAt = (now: string) => ({
    scoreWithout: harmonyScore({ ...world, now, touches: [...others, ...sent] }, contactId).score,
    scoreWith: harmonyScore({ ...world, now, touches: [...others, ...kept] }, contactId).score,
  });
  for (const t of week) {
    sent.push(t);
    if (isInbound(t)) {
      kept.push(t);
      steps.push({ touch: t, inbound: true, decision: null, kept: true, ...scoresAt(t.timestamp) });
      continue;
    }
    const snapshot: World = { ...world, now: t.timestamp, touches: [...others, ...kept], enrollments: [] };
    const decision = evaluateAction(snapshot, { contactId, action: "send", channel: t.channel, source: t.source, senderId: t.senderId, snippet: t.snippet });
    const ok = decision.decision === "allow" || decision.decision === "escalate";
    if (ok) kept.push(t);
    steps.push({ touch: t, inbound: false, decision, kept: ok, ...scoresAt(t.timestamp) });
  }

  const outbound = (ts: Touch[]) => ts.filter((t) => !isInbound(t)).length;
  const withConductor: World = { ...world, touches: [...others, ...kept] };
  return {
    steps,
    before: { touches: outbound(week), score: harmonyScore(world, contactId).score },
    after: { touches: outbound(kept), score: harmonyScore(withConductor, contactId).score },
  };
}
