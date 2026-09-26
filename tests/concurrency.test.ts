import { beforeEach, describe, expect, it } from "vitest";
import { preflight } from "../lib/engine.ts";
import { resetState, state } from "../lib/store.ts";

beforeEach(() => resetState());

describe("concurrent preflights", () => {
  it("record one decision when the same check arrives twice at once", async () => {
    const a = { contactId: "sarah", action: "send" as const, channel: "voice_agent" as const, source: "agent" as const, senderId: "nova" };
    await Promise.all([preflight(a), preflight(a), preflight(a)]);
    expect(state().decisions.filter((d) => d.contactId === "sarah" && d.rule === "R1")).toHaveLength(1);
  });
});
