import { z } from "zod";

export const Channel = z.enum(["email", "sms", "linkedin", "call", "voice_agent", "newsletter", "meeting"]);
export type Channel = z.infer<typeof Channel>;

export const Source = z.enum(["sequence", "campaign", "agent", "dialer", "human", "booking"]);
export type Source = z.infer<typeof Source>;

/** One normalized touch. A touch is inbound (from the buyer) when senderId === contactId. */
export const Touch = z.object({
  contactId: z.string(),
  companyId: z.string(),
  channel: Channel,
  source: Source,
  senderId: z.string(),
  timestamp: z.string(), // ISO 8601
  snippet: z.string(),
  refId: z.string(),
});
export type Touch = z.infer<typeof Touch>;

export const DecisionKind = z.enum(["allow", "hold", "delay", "reroute", "escalate"]);
export type DecisionKind = z.infer<typeof DecisionKind>;

export const RuleId = z.enum(["R1", "R2", "R3", "R4", "R5", "none"]);
export type RuleId = z.infer<typeof RuleId>;

export const Decision = z.object({
  id: z.string(),
  contactId: z.string(),
  rule: RuleId,
  decision: DecisionKind,
  reason: z.string(),
  evidence: z.array(z.string()),
  instead: z.object({ type: z.string(), ownerId: z.string() }).optional(),
  autonomous: z.boolean(),
  createdAt: z.string(),
});
export type Decision = z.infer<typeof Decision>;

export interface Person {
  id: string;
  key?: string; // scenario key, e.g. "sarah"
  name: string;
  title: string;
  companyId: string;
  email: string;
}

export interface Company {
  id: string;
  key?: string;
  name: string;
  domain: string;
}

export interface Sender {
  id: string;
  name: string;
  role: string; // "AE", "SDR", "Marketing", "AI voice agent"
  memberId?: string; // graph8 team member id, when mapped
}

export interface Deal {
  id: string;
  companyId: string;
  name: string;
  amount: number;
  ownerId: string; // a Sender id
  open: boolean;
  openedAt?: string; // ISO; R2 only applies to touches after the deal opened
}

/** Everything the rules and the score need to reason about, in one snapshot. */
export interface World {
  now: string;
  contacts: Person[];
  companies: Company[];
  senders: Sender[];
  deals: Deal[];
  touches: Touch[];
}

export const isInbound = (t: Touch) => t.senderId === t.contactId;
