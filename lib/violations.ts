import { CONFIG } from "./config.ts";
import { isInbound, type Touch, type World } from "./types.ts";

export type ViolationRule = "R1" | "R2" | "R3" | "R4" | "R5";

export interface Violation {
  rule: ViolationRule;
  contactId: string;
  refId: string; // the offending touch
  timestamp: string;
  penalty: number;
  reason: string;
  evidence: string[];
}

const ms = (iso: string) => new Date(iso).getTime();
const byTime = (a: Touch, b: Touch) => ms(a.timestamp) - ms(b.timestamp);

const CHANNEL_WORD: Record<string, string> = { email: "email", sms: "SMS", linkedin: "LinkedIn message", call: "call", voice_agent: "AI call", newsletter: "newsletter", meeting: "meeting" };

export const isCold = (t: Touch) =>
  !isInbound(t) && t.channel !== "newsletter" && CONFIG.coldSources.includes(t.source);

/** The buyer engaged: they booked a meeting or replied on any channel. */
export const isEngagement = (t: Touch) => isInbound(t);

/**
 * Every rule violation found in a contact's history, one entry per (rule, offending touch).
 * Pure and deterministic: the same World always gives the same list.
 */
export function findViolations(world: World, contactId: string): Violation[] {
  const contact = world.contacts.find((c) => c.id === contactId);
  if (!contact) return [];
  const mine = world.touches.filter((t) => t.contactId === contactId).sort(byTime);
  const outbound = mine.filter((t) => !isInbound(t));
  const colleagueIds = new Set(
    world.contacts.filter((c) => c.companyId === contact.companyId && c.id !== contactId).map((c) => c.id),
  );
  const colleagueEngagements = world.touches.filter((t) => colleagueIds.has(t.contactId) && isEngagement(t));
  const openDeal = world.deals.find((d) => d.companyId === contact.companyId && d.open);
  const out: Violation[] = [];
  const add = (rule: ViolationRule, t: Touch, reason: string, evidence: string[]) =>
    out.push({ rule, contactId, refId: t.refId, timestamp: t.timestamp, penalty: CONFIG.penalties[rule].each, reason, evidence });

  for (const t of outbound) {
    const at = ms(t.timestamp);

    // R1: automated touch after this buyer engaged, or a cold sequence after a colleague engaged.
    if (isCold(t)) {
      const own = mine.find((e) => isEngagement(e) && ms(e.timestamp) < at);
      const colleague = t.source === "sequence" ? colleagueEngagements.find((e) => ms(e.timestamp) < at) : undefined;
      if (own) add("R1", t, `Automated ${CHANNEL_WORD[t.channel] ?? t.channel} after the buyer ${own.channel === "meeting" ? "booked a meeting" : "replied"}`, [own.refId, t.refId]);
      else if (colleague) add("R1", t, "Cold sequence after a colleague at the same company engaged", [colleague.refId, t.refId]);
    }

    // R2: cold touch while the company has an open deal, from anyone but the deal owner.
    const dealOpenAtTouch = openDeal && (!openDeal.openedAt || ms(openDeal.openedAt) <= at);
    if (openDeal && dealOpenAtTouch && isCold(t) && t.senderId !== openDeal.ownerId) {
      add("R2", t, `Cold ${CHANNEL_WORD[t.channel] ?? t.channel} while ${openDeal.name} is open`, [openDeal.id, t.refId]);
    }

    // R3: this touch adds a 3rd+ distinct channel within 24h.
    const prior24 = outbound.filter((p) => p !== t && ms(p.timestamp) <= at && at - ms(p.timestamp) < CONFIG.R3.windowMs);
    const priorChannels = new Set(prior24.map((p) => p.channel));
    if (!priorChannels.has(t.channel) && priorChannels.size + 1 > CONFIG.R3.maxChannels) {
      add("R3", t, `${priorChannels.size + 1} channels within 24h`, [...prior24.map((p) => p.refId), t.refId]);
    }

    // R4: touch beyond the 7-day budget.
    const inWeek = outbound.filter((p) => ms(p.timestamp) <= at && at - ms(p.timestamp) < CONFIG.R4.windowMs);
    if (inWeek.length > CONFIG.R4.maxTouches) {
      add("R4", t, `Touch #${inWeek.length} in 7 days (budget ${CONFIG.R4.maxTouches})`, [t.refId]);
    }

    // R5: a different sender reached this buyer within the previous 48h.
    const other = outbound.find(
      (p) => p !== t && p.senderId !== t.senderId && ms(p.timestamp) <= at && at - ms(p.timestamp) < CONFIG.R5.windowMs,
    );
    if (other) add("R5", t, "Second sender within 48h", [other.refId, t.refId]);
  }
  return out;
}
