import { harmonyScore } from "./score.ts";
import { isInbound, type Touch, type World } from "./types.ts";
import type { Violation } from "./violations.ts";

export interface MirrorItem {
  touch: Touch;
  inbound: boolean;
  senderName: string;
  senderRole: string;
  violations: Violation[];
  /** An automated touch that ignores something the buyer already did (R1). */
  contradiction: boolean;
}

export interface Mirror {
  contact: World["contacts"][number];
  company?: World["companies"][number];
  score: number;
  deductions: ReturnType<typeof harmonyScore>["deductions"];
  items: MirrorItem[]; // oldest first, like a chat thread
  summary: { touches: number; senders: number; channels: number; contradictions: number };
  summaryLine: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The ledger as the buyer experienced it: every touch in their inbox/phone, oldest first. */
export function buildMirror(world: World, contactId: string): Mirror | null {
  const contact = world.contacts.find((c) => c.id === contactId);
  if (!contact) return null;
  const { score, violations, deductions } = harmonyScore(world, contactId);
  const since = new Date(world.now).getTime() - 7 * 24 * 60 * 60 * 1000;

  const items = world.touches
    .filter((t) => t.contactId === contactId && new Date(t.timestamp).getTime() >= since)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((touch): MirrorItem => {
      const inbound = isInbound(touch);
      const sender = world.senders.find((s) => s.id === touch.senderId);
      const mine = violations.filter((v) => v.refId === touch.refId);
      return {
        touch,
        inbound,
        senderName: inbound ? contact.name : sender?.name ?? touch.senderId,
        senderRole: inbound ? "You" : sender?.role ?? "",
        violations: mine,
        contradiction: mine.some((v) => v.rule === "R1"),
      };
    });

  const outbound = items.filter((i) => !i.inbound);
  const summary = {
    touches: outbound.length,
    senders: new Set(outbound.map((i) => i.touch.senderId)).size,
    channels: new Set(outbound.map((i) => i.touch.channel)).size,
    contradictions: items.filter((i) => i.contradiction).length,
  };
  const summaryLine = [
    plural(summary.touches, "touch").replace("touchs", "touches"),
    plural(summary.senders, "sender"),
    plural(summary.channels, "channel"),
    plural(summary.contradictions, "contradiction"),
  ].join(" · ");

  return {
    contact,
    company: world.companies.find((c) => c.id === contact.companyId),
    score,
    deductions,
    items,
    summary,
    summaryLine,
  };
}
