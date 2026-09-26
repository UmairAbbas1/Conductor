import { createHash } from "node:crypto";
import { CONFIG } from "./config.ts";
import { isInbound, type Channel, type Decision, type RuleId, type Source, type Touch, type World } from "./types.ts";

/** Something an automation or a rep is about to do to a buyer. */
export interface ProposedAction {
  contactId: string;
  action: "enroll" | "send";
  channel: Channel;
  source: Source;
  senderId: string;
  sequenceId?: string;
  snippet?: string;
}

const ms = (iso: string) => new Date(iso).getTime();
const now = (w: World) => ms(w.now);

/** Deterministic id: the same situation always produces the same decision id (so polling never duplicates). */
export function decisionId(parts: unknown[]): string {
  return "dec_" + createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 12);
}

function decision(w: World, contactId: string, rule: RuleId, kind: Decision["decision"], reason: string, evidence: string[], extra: Partial<Decision> = {}, key: unknown[] = []): Decision {
  return {
    id: decisionId([contactId, rule, kind, evidence, ...key]),
    contactId,
    rule,
    decision: kind,
    reason,
    evidence,
    autonomous: kind !== "escalate",
    createdAt: w.now,
    ...extra,
  };
}

const isColdAction = (a: { source: Source; channel: Channel }) =>
  a.channel !== "newsletter" && CONFIG.coldSources.includes(a.source);

function context(w: World, contactId: string) {
  const contact = w.contacts.find((c) => c.id === contactId);
  if (!contact) return null;
  const t = now(w);
  const mine = w.touches.filter((x) => x.contactId === contactId && ms(x.timestamp) <= t);
  const outbound = mine.filter((x) => !isInbound(x));
  const colleagues = new Set(w.contacts.filter((c) => c.companyId === contact.companyId && c.id !== contactId).map((c) => c.id));
  const recent = (x: Touch) => t - ms(x.timestamp) < CONFIG.R1.lookbackMs;
  const ownEngagement = mine.filter((x) => isInbound(x) && recent(x)).at(-1);
  const colleagueEngagement = w.touches.filter((x) => colleagues.has(x.contactId) && isInbound(x) && recent(x) && ms(x.timestamp) <= t).at(-1);
  const deal = w.deals.find((d) => d.companyId === contact.companyId && d.open);
  const within = (win: number) => outbound.filter((x) => t - ms(x.timestamp) < win);
  return { contact, outbound, ownEngagement, colleagueEngagement, deal, within };
}

const engagedHow = (e: Touch) => (e.channel === "meeting" ? "booked a meeting" : "replied");

/**
 * Single owner for a buyer: the deal owner, else whoever reached them first in the window.
 * A newsletter can't own a relationship, so broadcast senders are never picked.
 */
export function ownerFor(w: World, contactId: string): string | undefined {
  const c = context(w, contactId);
  if (!c) return undefined;
  return c.deal?.ownerId ?? c.within(CONFIG.R5.windowMs).find((x) => x.channel !== "newsletter")?.senderId;
}

/**
 * Preflight: should this action happen? Rules are checked in priority order R1 → R2 → R4 → R5 → R3;
 * the first that fires decides. Humans are never auto-blocked: a rep's action that breaks a rule escalates.
 */
export function evaluateAction(w: World, a: ProposedAction): Decision {
  const c = context(w, a.contactId);
  const key = [a.action, a.channel, a.source, a.senderId, a.sequenceId ?? null];
  if (!c) return decision(w, a.contactId, "none", "allow", "Unknown contact: nothing to coordinate", [], {}, key);
  const human = a.source === "human" || a.source === "booking";
  const name = c.contact.name.split(" ")[0];

  const hit = (rule: RuleId, kind: Decision["decision"], reason: string, evidence: string[], extra: Partial<Decision> = {}) =>
    human && kind !== "allow"
      ? decision(w, a.contactId, rule, "escalate", `${reason}. A rep is acting, so the owner decides.`, evidence, { instead: extra.instead ?? (c.deal ? { type: "task", ownerId: c.deal.ownerId } : undefined) }, key)
      : decision(w, a.contactId, rule, kind, reason, evidence, extra, key);

  // R1: the buyer (or a colleague, for cold sequences) already engaged.
  if (isColdAction(a) && !human) {
    if (c.ownEngagement)
      return hit("R1", "hold", `${name} ${engagedHow(c.ownEngagement)}. Automated outreach is paused`, [c.ownEngagement.refId]);
    if (c.colleagueEngagement && a.source === "sequence")
      return hit("R1", "hold", `A colleague at ${name}'s company ${engagedHow(c.colleagueEngagement)}. Cold sequences are paused for the account`, [c.colleagueEngagement.refId]);
  }

  // R2: open deal on the company → no cold enrollment; the deal owner gets a task instead.
  if (c.deal && isColdAction(a) && a.senderId !== c.deal.ownerId)
    return hit("R2", "hold", `${c.deal.name} ($${c.deal.amount.toLocaleString()}) is open. Cold outreach is held; the deal owner decides`, [c.deal.id], { instead: { type: "task", ownerId: c.deal.ownerId } });

  // R4: touch budget.
  const week = c.within(CONFIG.R4.windowMs);
  if (week.length >= CONFIG.R4.maxTouches)
    return hit("R4", "hold", `${name} already got ${week.length} touches in 7 days (budget ${CONFIG.R4.maxTouches})`, week.map((x) => x.refId));

  // R5: a different sender reached them in the last 48h → one owner.
  const others = c.within(CONFIG.R5.windowMs).filter((x) => x.senderId !== a.senderId);
  const owner = ownerFor(w, a.contactId);
  if (others.length && owner && owner !== a.senderId)
    return hit("R5", "reroute", `${new Set(others.map((x) => x.senderId)).size + 1} senders within 48h. Routed to a single owner`, others.map((x) => x.refId), { instead: { type: "handoff", ownerId: owner } });

  // R3: this would be a 3rd+ channel in 24h.
  const day = c.within(CONFIG.R3.windowMs);
  const channels = new Set(day.map((x) => x.channel));
  if (!channels.has(a.channel) && channels.size + 1 > CONFIG.R3.maxChannels)
    return hit("R3", "delay", `Would be channel #${channels.size + 1} in 24h. Delayed until the window clears`, day.map((x) => x.refId));

  return decision(w, a.contactId, "none", "allow", "No conflicts. Clear to send", [], {}, key);
}

/**
 * Standing check for one contact: what should be true right now, given everything that already happened?
 * Used by the scan and after every event. Returns one decision per rule that needs action.
 */
export function evaluateContact(w: World, contactId: string): Decision[] {
  const c = context(w, contactId);
  if (!c) return [];
  const out: Decision[] = [];
  const name = c.contact.name.split(" ")[0];
  const active = w.enrollments.filter((e) => e.contactId === contactId && e.state === "active");
  const cold = active.filter((e) => e.cold);

  // R1: engaged buyer → pause every sequence; colleague engaged → pause cold sequences.
  if (c.ownEngagement && active.length) {
    out.push(decision(w, contactId, "R1", "hold", `${name} ${engagedHow(c.ownEngagement)}. Paused ${active.length} sequence${active.length > 1 ? "s" : ""}: ${active.map((e) => e.sequenceName).join(", ")}`,
      [c.ownEngagement.refId, ...active.map((e) => e.sequenceId)], { instead: { type: "pause_sequences", ownerId: c.deal?.ownerId ?? active[0].ownerId } }));
  } else if (c.colleagueEngagement && cold.length) {
    out.push(decision(w, contactId, "R1", "hold", `A colleague at the company ${engagedHow(c.colleagueEngagement)}. Paused cold sequence for ${name}: ${cold.map((e) => e.sequenceName).join(", ")}`,
      [c.colleagueEngagement.refId, ...cold.map((e) => e.sequenceId)], { instead: { type: "pause_sequences", ownerId: c.deal?.ownerId ?? cold[0].ownerId } }));
  } else if (c.deal && cold.some((e) => e.ownerId !== c.deal!.ownerId)) {
    // R2: open deal → hold cold enrollment, task for the deal owner.
    const held = cold.filter((e) => e.ownerId !== c.deal!.ownerId);
    out.push(decision(w, contactId, "R2", "hold", `${c.deal.name} ($${c.deal.amount.toLocaleString()}) is open. Held ${name}'s cold sequence and handed the account to the deal owner`,
      [c.deal.id, ...held.map((e) => e.sequenceId)], { instead: { type: "task", ownerId: c.deal.ownerId } }));
  }

  // R4: over budget right now.
  const week = c.within(CONFIG.R4.windowMs);
  if (week.length > CONFIG.R4.maxTouches)
    out.push(decision(w, contactId, "R4", "hold", `${name} got ${week.length} touches in 7 days (budget ${CONFIG.R4.maxTouches}). Holding everything automated`, week.map((x) => x.refId)));

  // R5: several senders in 48h → one owner.
  const recent = c.within(CONFIG.R5.windowMs);
  const senders = new Set(recent.map((x) => x.senderId));
  const owner = ownerFor(w, contactId);
  if (senders.size > CONFIG.R5.maxSenders && owner)
    out.push(decision(w, contactId, "R5", "reroute", `${senders.size} senders reached ${name} within 48h. One owner from here on`, recent.map((x) => x.refId), { instead: { type: "handoff", ownerId: owner } }));

  // R3: 3+ channels in the last 24h → delay the next automated touch.
  const day = c.within(CONFIG.R3.windowMs);
  const channels = new Set(day.map((x) => x.channel));
  if (channels.size > CONFIG.R3.maxChannels)
    out.push(decision(w, contactId, "R3", "delay", `${channels.size} channels in 24h. Next automated touch delayed`, day.map((x) => x.refId)));

  return out;
}

/** Touch budget left this week (written to graph8 as `touch_budget_remaining`). */
export function touchBudgetRemaining(w: World, contactId: string): number {
  const c = context(w, contactId);
  return c ? Math.max(0, CONFIG.R4.maxTouches - c.within(CONFIG.R4.windowMs).length) : CONFIG.R4.maxTouches;
}
