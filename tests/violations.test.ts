import { describe, expect, it } from "vitest";
import { findViolations } from "../lib/violations.ts";
import { normalizeEvent, mergeTouches } from "../lib/ledger.ts";
import type { Touch, World } from "../lib/types.ts";

const NOW = new Date("2026-09-27T12:00:00");
const HOUR = 3600_000;
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
let n = 0;
const touch = (p: Partial<Touch>): Touch => ({
  contactId: "c1", companyId: "co1", channel: "email", source: "sequence", senderId: "bilal",
  timestamp: at(1), snippet: "", refId: `t${n++}`, ...p,
});
const world = (touches: Touch[], deals: World["deals"] = []): World => ({
  now: NOW.toISOString(),
  contacts: [
    { id: "c1", name: "Buyer", title: "", companyId: "co1", email: "" },
    { id: "c2", name: "Colleague", title: "", companyId: "co1", email: "" },
  ],
  companies: [{ id: "co1", name: "Co", domain: "co.example.com" }],
  senders: [],
  deals,
  touches,
  enrollments: [],
});
const rules = (w: World, id = "c1") => findViolations(w, id).map((v) => v.rule);
const booking = (contactId: string, hoursAgo: number) =>
  touch({ contactId, senderId: contactId, source: "booking", channel: "meeting", timestamp: at(hoursAgo) });

describe("R1 booked meeting or reply", () => {
  it("flags an automated touch after the buyer booked", () => {
    expect(rules(world([booking("c1", 10), touch({ timestamp: at(5) })]))).toEqual(["R1"]);
  });
  it("flags an automated touch after the buyer replied", () => {
    const reply = touch({ senderId: "c1", source: "human", timestamp: at(10) });
    expect(rules(world([reply, touch({ timestamp: at(5), source: "agent", channel: "voice_agent" })]))).toContain("R1");
  });
  it("does not flag the human owner following up", () => {
    expect(rules(world([booking("c1", 10), touch({ source: "human", senderId: "ali", timestamp: at(5) })]))).toEqual([]);
  });
  it("flags a colleague's cold sequence after someone at the company booked", () => {
    expect(rules(world([booking("c1", 10), touch({ contactId: "c2", timestamp: at(5) })]), "c2")).toEqual(["R1"]);
  });
  it("does not flag touches before the booking", () => {
    expect(rules(world([touch({ timestamp: at(20) }), booking("c1", 10)]))).toEqual([]);
  });
});

describe("R2 open deal", () => {
  const deal = { id: "d1", companyId: "co1", name: "Deal", amount: 1000, ownerId: "ali", open: true };
  it("flags cold touches while a deal is open", () => {
    expect(rules(world([touch({})], [deal]))).toEqual(["R2"]);
  });
  it("allows the deal owner", () => {
    expect(rules(world([touch({ senderId: "ali" })], [deal]))).toEqual([]);
  });
  it("ignores closed deals and touches before the deal opened", () => {
    expect(rules(world([touch({})], [{ ...deal, open: false }]))).toEqual([]);
    expect(rules(world([touch({ timestamp: at(10) })], [{ ...deal, openedAt: at(5) }]))).toEqual([]);
  });
  it("does not treat newsletters as cold outreach", () => {
    expect(rules(world([touch({ channel: "newsletter", source: "campaign" })], [deal]))).toEqual([]);
  });
});

describe("R3 channel stacking", () => {
  it("flags the touch that makes 3 channels within 24h", () => {
    const w = world([touch({ timestamp: at(20) }), touch({ channel: "sms", timestamp: at(10) }), touch({ channel: "linkedin", timestamp: at(2) })]);
    expect(findViolations(w, "c1").filter((v) => v.rule === "R3").map((v) => v.refId)).toHaveLength(1);
  });
  it("does not flag 3 channels spread over more than 24h", () => {
    expect(rules(world([touch({ timestamp: at(60) }), touch({ channel: "sms", timestamp: at(30) }), touch({ channel: "linkedin", timestamp: at(2) })]))).toEqual([]);
  });
});

describe("R4 touch budget", () => {
  it("allows 6 touches in 7 days and flags the 7th", () => {
    const six = Array.from({ length: 6 }, (_, i) => touch({ timestamp: at(150 - i * 25) }));
    expect(rules(world(six))).toEqual([]);
    expect(rules(world([...six, touch({ timestamp: at(1) })]))).toEqual(["R4"]);
  });
});

describe("R5 sender collision", () => {
  it("flags a second sender within 48h", () => {
    expect(rules(world([touch({ timestamp: at(40) }), touch({ senderId: "ali", source: "human", timestamp: at(2) })]))).toEqual(["R5"]);
  });
  it("allows a second sender after 48h", () => {
    expect(rules(world([touch({ timestamp: at(60) }), touch({ senderId: "ali", source: "human", timestamp: at(2) })]))).toEqual([]);
  });
});

describe("Touch Ledger", () => {
  it("normalizes verified graph8 events and skips non-touches", () => {
    const base = { id: "e1", contactId: "7", companyId: "9", occurredAt: at(1), message: "Hi" };
    expect(normalizeEvent({ ...base, name: "meeting.booked" })).toMatchObject({ channel: "meeting", source: "booking", senderId: "7", refId: "g8-e1" });
    expect(normalizeEvent({ ...base, name: "voice_ai.call_completed" })).toMatchObject({ channel: "voice_agent", source: "agent" });
    expect(normalizeEvent({ ...base, name: "deal.updated" })).toBeNull();
  });
  it("dedupes by refId", () => {
    const a = touch({ refId: "x" });
    expect(mergeTouches([a], [{ ...a }], [touch({ refId: "y" })])).toHaveLength(2);
  });
});
