import { describe, expect, it } from "vitest";
import { evaluateAction, evaluateContact, ownerFor, touchBudgetRemaining, type ProposedAction } from "../lib/policies.ts";
import { buildWorld } from "../lib/world.ts";
import { DecisionSchemaCheck } from "./helpers.ts";
import type { Enrollment, Touch, World } from "../lib/types.ts";

const NOW = new Date("2026-09-27T12:00:00");
const HOUR = 3600_000;
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
let n = 0;
const touch = (p: Partial<Touch>): Touch => ({
  contactId: "c1", companyId: "co1", channel: "email", source: "sequence", senderId: "bilal",
  timestamp: at(1), snippet: "", refId: `t${n++}`, ...p,
});
const enrol = (contactId: string, p: Partial<Enrollment> = {}): Enrollment => ({
  contactId, sequenceId: "seq1", sequenceName: "Cold", ownerId: "bilal", cold: true, state: "active", ...p,
});
const world = (touches: Touch[], extra: Partial<World> = {}): World => ({
  now: NOW.toISOString(),
  contacts: [
    { id: "c1", name: "Sarah Khan", title: "", companyId: "co1", email: "" },
    { id: "c2", name: "Hina Malik", title: "", companyId: "co1", email: "" },
  ],
  companies: [{ id: "co1", name: "Acme", domain: "acme.example.com" }],
  senders: [],
  deals: [],
  touches,
  enrollments: [],
  ...extra,
});
const deal = { id: "d1", companyId: "co1", name: "Acme Pilot", amount: 42000, ownerId: "ali", open: true };
const act = (p: Partial<ProposedAction> = {}): ProposedAction => ({
  contactId: "c1", action: "send", channel: "email", source: "sequence", senderId: "bilal", ...p,
});
const booking = (contactId = "c1", hoursAgo = 10) =>
  touch({ contactId, senderId: contactId, source: "booking", channel: "meeting", timestamp: at(hoursAgo) });

describe("Decision shape", () => {
  it("matches the locked Decision schema", () => {
    DecisionSchemaCheck(evaluateAction(world([]), act()));
  });
  it("is deterministic (same input → same id)", () => {
    const b = booking();
    expect(evaluateAction(world([b]), act()).id).toBe(evaluateAction(world([b]), act()).id);
  });
});

describe("R1 booked meeting or reply", () => {
  it("holds automated outreach after the buyer booked", () => {
    const d = evaluateAction(world([booking()]), act({ source: "agent", channel: "voice_agent", senderId: "nova" }));
    expect(d).toMatchObject({ rule: "R1", decision: "hold", autonomous: true });
  });
  it("holds a colleague's cold sequence", () => {
    expect(evaluateAction(world([booking("c1")]), act({ contactId: "c2" }))).toMatchObject({ rule: "R1", decision: "hold" });
  });
  it("pauses every active sequence for the engaged buyer, and cold ones for colleagues", () => {
    const w = world([booking("c1")], { enrollments: [enrol("c1"), enrol("c1", { sequenceId: "seq2", cold: false }), enrol("c2")] });
    const own = evaluateContact(w, "c1").find((d) => d.rule === "R1")!;
    expect(own.evidence).toEqual(expect.arrayContaining(["seq1", "seq2"]));
    const colleague = evaluateContact(w, "c2").find((d) => d.rule === "R1")!;
    expect(colleague.decision).toBe("hold");
  });
  it("lets the human owner follow up", () => {
    expect(evaluateAction(world([booking()]), act({ source: "human", senderId: "ali" })).decision).toBe("allow");
  });
});

describe("R2 open deal", () => {
  it("holds cold enrollment and creates a task for the deal owner instead", () => {
    const d = evaluateAction(world([], { deals: [deal] }), act({ action: "enroll" }));
    expect(d).toMatchObject({ rule: "R2", decision: "hold", instead: { type: "task", ownerId: "ali" }, evidence: ["d1"] });
  });
  it("allows the deal owner", () => {
    expect(evaluateAction(world([], { deals: [deal] }), act({ senderId: "ali" })).decision).toBe("allow");
  });
  it("flags standing cold enrollments at a company with an open deal", () => {
    const d = evaluateContact(world([], { deals: [deal], enrollments: [enrol("c2")] }), "c2");
    expect(d.map((x) => x.rule)).toContain("R2");
  });
});

describe("R3 channel stacking", () => {
  it("delays a 3rd channel within 24h", () => {
    const w = world([touch({ timestamp: at(10) }), touch({ channel: "sms", timestamp: at(5) })]);
    expect(evaluateAction(w, act({ channel: "linkedin" }))).toMatchObject({ rule: "R3", decision: "delay" });
  });
  it("allows a channel already used today", () => {
    const w = world([touch({ timestamp: at(10) }), touch({ channel: "sms", timestamp: at(5) })]);
    expect(evaluateAction(w, act({ channel: "sms" })).decision).toBe("allow");
  });
});

describe("R4 touch budget", () => {
  const six = () => Array.from({ length: 6 }, (_, i) => touch({ timestamp: at(150 - i * 25) }));
  it("holds the 7th touch in 7 days", () => {
    expect(evaluateAction(world(six()), act())).toMatchObject({ rule: "R4", decision: "hold" });
    expect(touchBudgetRemaining(world(six()), "c1")).toBe(0);
  });
  it("allows the 6th", () => {
    expect(evaluateAction(world(six().slice(1)), act()).decision).toBe("allow");
    expect(touchBudgetRemaining(world(six().slice(1)), "c1")).toBe(1);
  });
});

describe("R5 sender collision", () => {
  it("reroutes to the deal owner when a second sender shows up within 48h", () => {
    const w = world([touch({ senderId: "ali", source: "human", timestamp: at(20) })], { deals: [{ ...deal, companyId: "other" }] });
    const d = evaluateAction(w, act({ senderId: "marketing", source: "campaign", channel: "email" }));
    expect(d).toMatchObject({ rule: "R5", decision: "reroute", instead: { type: "handoff", ownerId: "ali" } });
  });
  it("falls back to the earliest sender when there is no deal", () => {
    const w = world([touch({ senderId: "bilal", timestamp: at(30) }), touch({ senderId: "ali", source: "human", timestamp: at(10) })]);
    expect(evaluateAction(w, act({ senderId: "nova", source: "agent", channel: "email" })).instead).toEqual({ type: "handoff", ownerId: "bilal" });
  });
  it("never makes a newsletter the owner", () => {
    const w = world([touch({ senderId: "marketing", source: "campaign", channel: "newsletter", timestamp: at(30) })]);
    expect(evaluateAction(w, act({ senderId: "bilal" })).decision).toBe("allow");
  });
  it("allows the owner themselves", () => {
    const w = world([touch({ senderId: "bilal", timestamp: at(30) }), touch({ senderId: "ali", source: "human", timestamp: at(10) })]);
    expect(evaluateAction(w, act({ senderId: "bilal" })).decision).toBe("allow");
  });
});

describe("Escalation", () => {
  it("never auto-blocks a rep: a human action that breaks a rule escalates and waits", () => {
    const w = world([touch({ senderId: "bilal", timestamp: at(30) }), touch({ senderId: "nova", source: "agent", timestamp: at(10) })]);
    const d = evaluateAction(w, act({ senderId: "ali", source: "human" }));
    expect(d).toMatchObject({ decision: "escalate", autonomous: false });
  });
});

describe("Sarah's week", () => {
  it("produces R1 and R4 decisions for Sarah and R1 for her colleague Hina", () => {
    const w = buildWorld(NOW, null);
    // Her last two senders were 49-50h before NOW, just outside the 48h R5 window.
    expect(evaluateContact(w, "sarah").map((d) => d.rule).sort()).toEqual(["R1", "R4"]);
    expect(evaluateContact(w, "hina").map((d) => d.rule)).toEqual(["R1"]);
    expect(evaluateContact(w, "omar")).toEqual([]);
  });
  it("routes Sarah to Ali, the deal owner", () => {
    const w = buildWorld(NOW, null);
    expect(ownerFor(w, "sarah")).toBe("ali");
    expect(evaluateContact(w, "sarah").find((d) => d.rule === "R1")!.instead).toEqual({ type: "pause_sequences", ownerId: "ali" });
  });
});
