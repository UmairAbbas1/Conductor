import type { Channel, Source } from "../lib/types.ts";

/**
 * The demo scenario, keyed by stable local keys. `seed/sarah.ts` creates the real records in graph8
 * and writes the key → graph8 id map to data/seed-state.json. Touch times are relative to today
 * ({ d: -6, at: "09:10" } = six days ago at 09:10 local), so the demo is always "this week".
 *
 * Historical touches live here because graph8 has no API to log a past SMS/LinkedIn/dialer touch
 * (see CAPABILITIES.md). Live graph8 events merge on top at runtime.
 */

export interface RelTime {
  d: number;
  at: string; // "HH:MM"
}

export interface ScenarioTouch {
  ref: string;
  contact: string;
  channel: Channel;
  source: Source;
  sender: string; // sender key, or the contact key for inbound
  when: RelTime;
  snippet: string;
}

export const DEMO_TAG = "conductor-demo";

export interface Scenario {
  companies: { key: string; name: string; domain: string }[];
  contacts: { key: string; first: string; last: string; title: string; company: string }[];
  senders: { key: string; name: string; role: string }[];
  deals: { key: string; company: string; contact: string; name: string; amount: number; owner: string; openedAt: RelTime }[];
  sequence: { key: string; name: string; owner: string };
  touches: ScenarioTouch[];
}

export const SCENARIO: Scenario = {
  companies: [
    { key: "acme", name: "Acme Logistics", domain: "acme.example.com" },
    { key: "globex", name: "Globex Retail", domain: "globex.example.com" },
    { key: "initech", name: "Initech Systems", domain: "initech.example.com" },
  ],
  contacts: [
    { key: "sarah", first: "Sarah", last: "Khan", title: "VP Operations", company: "acme" },
    { key: "omar", first: "Omar", last: "Farooq", title: "Director of IT", company: "acme" },
    { key: "hina", first: "Hina", last: "Malik", title: "Operations Manager", company: "acme" },
    { key: "lina", first: "Lina", last: "Chen", title: "Head of Supply Chain", company: "globex" },
    { key: "marco", first: "Marco", last: "Rossi", title: "COO", company: "initech" },
  ],
  senders: [
    { key: "ali", name: "Ali", role: "AE" },
    { key: "bilal", name: "Bilal", role: "SDR" },
    { key: "marketing", name: "graph8 Marketing", role: "Marketing" },
    { key: "nova", name: "Nova", role: "AI voice agent" },
  ],
  deals: [
    { key: "acme-pilot", company: "acme", contact: "sarah", name: "Acme — Ops Pilot", amount: 42000, owner: "ali", openedAt: { d: -6, at: "08:00" } },
    { key: "initech-expansion", company: "initech", contact: "marco", name: "Initech — Expansion", amount: 18500, owner: "ali", openedAt: { d: -7, at: "09:00" } },
  ],
  sequence: { key: "bilal-cold", name: "Bilal — Ops Leaders Cold Outbound", owner: "bilal" },
  touches: [
    // Sarah Khan — the messy week
    { ref: "s1", contact: "sarah", channel: "email", source: "sequence", sender: "bilal", when: { d: -6, at: "09:10" }, snippet: "Quick question about Acme's ops stack" },
    { ref: "s2", contact: "sarah", channel: "linkedin", source: "sequence", sender: "bilal", when: { d: -6, at: "14:30" }, snippet: "Hi Sarah, saw you lead Ops at Acme. Would love to connect." },
    { ref: "s3", contact: "sarah", channel: "newsletter", source: "campaign", sender: "marketing", when: { d: -5, at: "08:05" }, snippet: "The Ops Leader Weekly: 5 ways to cut handoff delays" },
    { ref: "s4", contact: "sarah", channel: "call", source: "dialer", sender: "bilal", when: { d: -5, at: "11:20" }, snippet: "Voicemail: \"Hi Sarah, Bilal from graph8, following up on my email…\"" },
    { ref: "s5", contact: "sarah", channel: "sms", source: "sequence", sender: "bilal", when: { d: -5, at: "16:45" }, snippet: "Hi Sarah, Bilal here. Worth a 15-min chat this week?" },
    { ref: "s6", contact: "sarah", channel: "email", source: "human", sender: "ali", when: { d: -5, at: "17:30" }, snippet: "Sarah, Priya mentioned you're scoping the Q4 ops rollout. Happy to walk you through the pilot." },
    { ref: "s7", contact: "sarah", channel: "meeting", source: "booking", sender: "sarah", when: { d: -4, at: "10:30" }, snippet: "Booked: Acme × graph8 pilot review, tomorrow 2:00 PM with Ali" },
    { ref: "s8", contact: "sarah", channel: "voice_agent", source: "agent", sender: "nova", when: { d: -4, at: "13:15" }, snippet: "Hi Sarah, this is Nova from graph8. Are you still evaluating ops tools for October?" },
    { ref: "s9", contact: "sarah", channel: "email", source: "sequence", sender: "bilal", when: { d: -3, at: "09:00" }, snippet: "Bumping this. Still evaluating for October?" },
    { ref: "s10", contact: "sarah", channel: "email", source: "human", sender: "ali", when: { d: -2, at: "09:30" }, snippet: "Great speaking yesterday. Pilot proposal attached: $42K, 90 days." },
    { ref: "s11", contact: "sarah", channel: "linkedin", source: "sequence", sender: "bilal", when: { d: -2, at: "11:00" }, snippet: "Did you see my note, Sarah? Happy to share a case study." },
    { ref: "s12", contact: "sarah", channel: "newsletter", source: "campaign", sender: "marketing", when: { d: -1, at: "08:05" }, snippet: "Webinar: Is your ops team ready for AI agents?" },
    // Hina Malik — Sarah's colleague, cold-sequenced after Sarah booked
    { ref: "h1", contact: "hina", channel: "email", source: "sequence", sender: "bilal", when: { d: -2, at: "14:00" }, snippet: "Hi Hina, quick question about Acme's ops stack" },
    // Lina Chen — healthy
    { ref: "l1", contact: "lina", channel: "email", source: "sequence", sender: "bilal", when: { d: -5, at: "10:00" }, snippet: "Lina, how is Globex handling peak-season routing?" },
    { ref: "l2", contact: "lina", channel: "email", source: "sequence", sender: "bilal", when: { d: -2, at: "10:00" }, snippet: "Following up with a 2-minute teardown of a similar retailer" },
    { ref: "l3", contact: "lina", channel: "newsletter", source: "campaign", sender: "marketing", when: { d: -1, at: "08:05" }, snippet: "Webinar: Is your ops team ready for AI agents?" },
    // Marco Rossi — mid
    { ref: "m1", contact: "marco", channel: "email", source: "sequence", sender: "bilal", when: { d: -6, at: "10:00" }, snippet: "Marco, a question on Initech's expansion plans" },
    { ref: "m2", contact: "marco", channel: "email", source: "human", sender: "ali", when: { d: -5, at: "09:00" }, snippet: "Marco, updated expansion pricing as promised" },
    { ref: "m3", contact: "marco", channel: "linkedin", source: "sequence", sender: "bilal", when: { d: -4, at: "10:00" }, snippet: "Hi Marco, would love to connect" },
    { ref: "m4", contact: "marco", channel: "newsletter", source: "campaign", sender: "marketing", when: { d: -4, at: "15:00" }, snippet: "The Ops Leader Weekly: 5 ways to cut handoff delays" },
    { ref: "m5", contact: "marco", channel: "sms", source: "sequence", sender: "bilal", when: { d: -3, at: "09:30" }, snippet: "Marco, Bilal from graph8. 10 mins this week?" },
    { ref: "m6", contact: "marco", channel: "call", source: "dialer", sender: "bilal", when: { d: -3, at: "12:00" }, snippet: "Call, no answer" },
    { ref: "m7", contact: "marco", channel: "email", source: "human", sender: "ali", when: { d: -2, at: "10:00" }, snippet: "Marco, can we lock the expansion scope on Friday?" },
  ],
};

/** What graph8 automations are about to send next: the Mirror preflights these live. */
export interface QueuedTouch {
  ref: string;
  contact: string;
  channel: Channel;
  source: Source;
  sender: string;
  snippet: string;
}

export const QUEUED: QueuedTouch[] = [
  { ref: "q1", contact: "sarah", channel: "email", source: "sequence", sender: "bilal", snippet: "Sarah, circling back one last time. Are you still evaluating ops platforms for an October rollout? Happy to set up an intro call." },
  { ref: "q2", contact: "sarah", channel: "voice_agent", source: "agent", sender: "nova", snippet: "Hi Sarah, this is Nova from graph8. Is now a good time to learn how we help ops teams cut handoff delays?" },
  { ref: "q3", contact: "hina", channel: "linkedin", source: "sequence", sender: "bilal", snippet: "Hi Hina, would love to connect and share how ops teams like Acme's cut handoffs." },
  { ref: "q4", contact: "lina", channel: "email", source: "sequence", sender: "bilal", snippet: "Lina, one last note on peak-season routing. Worth 15 minutes?" },
  { ref: "q5", contact: "marco", channel: "sms", source: "sequence", sender: "bilal", snippet: "Marco, Bilal from graph8 again. Still keen to show you the platform?" },
];

/** Resolve a relative time against the start of `today` (local time). */
export function resolveRel(rel: RelTime, today: Date): string {
  const [h, m] = rel.at.split(":").map(Number);
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + rel.d);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
