import { describe, expect, it } from "vitest";
import { harmonyScore, accountScore } from "../lib/score.ts";
import { buildMirror } from "../lib/mirror.ts";
import { buildWorld } from "../lib/world.ts";
import type { Touch, World } from "../lib/types.ts";

const NOW = new Date("2026-09-27T12:00:00");
const world = () => buildWorld(NOW, null);

const HOUR = 3600_000;
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
let n = 0;
const touch = (p: Partial<Touch>): Touch => ({
  contactId: "c1", companyId: "co1", channel: "email", source: "sequence", senderId: "bilal",
  timestamp: at(1), snippet: "", refId: `t${n++}`, ...p,
});
const tiny = (touches: Touch[], deals: World["deals"] = []): World => ({
  now: NOW.toISOString(),
  contacts: [
    { id: "c1", name: "Buyer", title: "", companyId: "co1", email: "" },
    { id: "c2", name: "Colleague", title: "", companyId: "co1", email: "" },
  ],
  companies: [{ id: "co1", name: "Co", domain: "co.example.com" }],
  senders: [],
  deals,
  touches,
});

describe("Harmony Score", () => {
  it("is 100 with no touches", () => {
    expect(harmonyScore(tiny([]), "c1").score).toBe(100);
  });

  it("is 100 for a single sender on one channel", () => {
    expect(harmonyScore(tiny([touch({ timestamp: at(50) }), touch({ timestamp: at(2) })]), "c1").score).toBe(100);
  });

  it("ignores violations older than 7 days", () => {
    const old = [touch({ timestamp: at(200), channel: "email" }), touch({ timestamp: at(199), senderId: "ali" })];
    expect(harmonyScore(tiny(old), "c1").score).toBe(100);
  });

  it("caps each rule's deduction", () => {
    // 5 automated touches after a booking → R1 5×12=60, capped at 36
    const ts = [touch({ source: "booking", channel: "meeting", senderId: "c1", timestamp: at(100) })];
    for (let i = 0; i < 5; i++) ts.push(touch({ timestamp: at(90 - i * 20) }));
    const s = harmonyScore(tiny(ts), "c1");
    expect(s.deductions.R1).toBe(36);
  });

  it("is deterministic", () => {
    expect(harmonyScore(world(), "sarah")).toEqual(harmonyScore(world(), "sarah"));
  });

  it("scores Sarah's messy week below 40", () => {
    const s = harmonyScore(world(), "sarah");
    expect(s.score).toBeLessThan(40);
    expect(s.score).toBe(18);
    expect(s.deductions).toEqual({ R1: 36, R2: 16, R3: 12, R4: 9, R5: 9 });
  });

  it("gives the demo accounts a healthy / mid / critical spread", () => {
    const w = world();
    expect(accountScore(w, "globex")).toBe(97);
    expect(accountScore(w, "initech")).toBe(64);
    expect(accountScore(w, "acme")).toBe(18);
    expect(harmonyScore(w, "hina").score).toBe(80);
    expect(harmonyScore(w, "omar").score).toBe(100);
  });
});

describe("Buyer Mirror", () => {
  it("summarizes Sarah's week from her point of view", () => {
    const m = buildMirror(world(), "sarah")!;
    expect(m.summaryLine).toBe("11 touches · 4 senders · 6 channels · 3 contradictions");
    expect(m.items).toHaveLength(12); // 11 outbound + her booking
    expect(m.items.filter((i) => i.inbound).map((i) => i.touch.channel)).toEqual(["meeting"]);
    expect(m.items.filter((i) => i.contradiction).map((i) => i.touch.refId)).toEqual(["fx-s8", "fx-s9", "fx-s11"]);
  });
});
