import { describe, expect, it } from "vitest";
import { replayWeek } from "../lib/replay.ts";
import { buildWorld } from "../lib/world.ts";

const w = buildWorld(new Date("2026-09-27T12:00:00"), null);

describe("Replay", () => {
  it("collapses Sarah's 11 touches to 3 (plus her own booking) with Conductor on", () => {
    const r = replayWeek(w, "sarah");
    expect(r.before).toEqual({ touches: 11, score: 18 });
    expect(r.after.touches).toBe(3);
    expect(r.after.score).toBeGreaterThanOrEqual(90);
    expect(r.steps.filter((s) => s.kept).map((s) => s.touch.refId)).toEqual(["fx-s3", "fx-s6", "fx-s7", "fx-s10"]);
  });

  it("explains every blocked touch with a rule", () => {
    const blocked = replayWeek(w, "sarah").steps.filter((s) => !s.kept);
    expect(blocked.map((s) => `${s.touch.refId}:${s.decision!.rule}`)).toEqual([
      "fx-s1:R2", "fx-s2:R2", "fx-s4:R2", "fx-s5:R2", "fx-s8:R1", "fx-s9:R1", "fx-s11:R1", "fx-s12:R5",
    ]);
  });

  it("never drops the buyer's own actions", () => {
    expect(replayWeek(w, "sarah").steps.filter((s) => s.inbound).every((s) => s.kept)).toBe(true);
  });
});
