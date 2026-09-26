import type { Channel, Source, Touch, World } from "./types.ts";

const time = (t: Touch) => new Date(t.timestamp).getTime();

/** A contact's timeline, oldest first. */
export const contactTimeline = (world: World, contactId: string) =>
  world.touches.filter((t) => t.contactId === contactId).sort((a, b) => time(a) - time(b));

/** Every touch to anyone at a company, oldest first. */
export const companyTimeline = (world: World, companyId: string) =>
  world.touches.filter((t) => t.companyId === companyId).sort((a, b) => time(a) - time(b));

/** Merge touches, dropping duplicates by refId (the same event can arrive by webhook and by polling). */
export function mergeTouches(...lists: Touch[][]): Touch[] {
  const seen = new Map<string, Touch>();
  for (const list of lists) for (const t of list) if (!seen.has(t.refId)) seen.set(t.refId, t);
  return [...seen.values()];
}

interface EventShape {
  channel: Channel;
  source: Source;
  inbound?: boolean;
}

/**
 * graph8 event name → touch shape. Names are verified: webhook events from `KNOWN_WEBHOOK_EVENTS`
 * (@graph8/sdk) and org-event names documented on `g8.api.events.listOrgEvents`. See CAPABILITIES.md.
 */
export const EVENT_MAP: Record<string, EventShape> = {
  // webhook events
  "engagement.email_sent": { channel: "email", source: "sequence" },
  "engagement.email_replied": { channel: "email", source: "human", inbound: true },
  "engagement.sms_sent": { channel: "sms", source: "sequence" },
  "engagement.sms_replied": { channel: "sms", source: "human", inbound: true },
  "engagement.whatsapp_sent": { channel: "sms", source: "sequence" },
  "engagement.linkedin_connection_sent": { channel: "linkedin", source: "sequence" },
  "engagement.linkedin_message_sent": { channel: "linkedin", source: "sequence" },
  "engagement.linkedin_inmail_sent": { channel: "linkedin", source: "sequence" },
  "engagement.linkedin_reply_received": { channel: "linkedin", source: "human", inbound: true },
  "engagement.call_completed": { channel: "call", source: "dialer" },
  "engagement.voicemail_left": { channel: "call", source: "dialer" },
  "voice_ai.call_completed": { channel: "voice_agent", source: "agent" },
  "voice_ai.voicemail_left": { channel: "voice_agent", source: "agent" },
  "meeting.booked": { channel: "meeting", source: "booking", inbound: true },
  // org event feed names
  sequence_email_sent: { channel: "email", source: "sequence" },
  sequence_email_replied: { channel: "email", source: "human", inbound: true },
  "inbox.email_received": { channel: "email", source: "human", inbound: true },
  "sdr.call_ended": { channel: "call", source: "dialer" },
  booking_created: { channel: "meeting", source: "booking", inbound: true },
};

export interface RawEvent {
  id: string;
  name: string;
  contactId: string;
  companyId: string;
  occurredAt: string;
  senderId?: string;
  message?: string | null;
}

/** Normalize one graph8 event into a Touch, or null when the event is not a touch (e.g. deal.updated). */
export function normalizeEvent(e: RawEvent): Touch | null {
  const shape = EVENT_MAP[e.name];
  if (!shape) return null;
  return {
    contactId: e.contactId,
    companyId: e.companyId,
    channel: shape.channel,
    source: shape.source,
    senderId: shape.inbound ? e.contactId : e.senderId ?? shape.source,
    timestamp: e.occurredAt,
    snippet: e.message?.trim() || e.name,
    refId: `g8-${e.id}`,
  };
}
