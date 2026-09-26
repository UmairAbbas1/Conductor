import { beforeAll, describe, expect, it } from "vitest";
import { writeBack } from "../lib/writeback.ts";
import { evaluateContact } from "../lib/policies.ts";
import { buildWorld, type SeedState } from "../lib/world.ts";

const NOW = new Date("2026-09-27T12:00:00");
const seed: SeedState = {
  mode: "dry",
  seededAt: NOW.toISOString(),
  listId: 1,
  sequenceId: "seq-abc",
  companies: { acme: "501", globex: "502", initech: "503" },
  contacts: { sarah: "101", omar: "102", hina: "103", lina: "104", marco: "105" },
  deals: { "acme-pilot": "d-1" },
  members: { ali: "u-ali", bilal: "u-bilal" },
  fields: { harmony_score: 11, touch_budget_remaining: 12, conductor_hold: 13 },
};

beforeAll(() => {
  process.env.CONDUCTOR_MODE = "dry"; // never hits the network
  process.env.G8_API_KEY ??= "test-not-a-key";
});

describe("write-back (dry mode)", () => {
  it("pauses the sequence per contact, notes why, and sets the Conductor fields", async () => {
    const w = buildWorld(NOW, seed);
    const d = evaluateContact(w, "101").find((x) => x.rule === "R1")!;
    const toPause = w.enrollments.filter((e) => e.contactId === "101");
    const logs = await writeBack(w, d, toPause, seed);
    expect(logs.map((l) => l.op)).toEqual(["sequences.pauseSequenceContact", "notes.create", "fields.setValue", "fields.setValue", "fields.setValue"]);
    expect(logs[0].args).toEqual({ path: { sequence_id: "seq-abc", contact_id: 101 } });
    expect(logs.every((l) => l.mode === "dry")).toBe(true);
    expect((logs[2].args as { value: string }).value).toBe("18");
  });

  it("creates a task for the deal owner on an R2 hold", async () => {
    const w = buildWorld(NOW, seed);
    const d = evaluateContact(w, "105").find((x) => x.rule === "R2")!;
    const logs = await writeBack(w, d, [], seed);
    const task = logs.find((l) => l.op === "tasks.create")!;
    expect(task.args).toMatchObject({ contactId: 105, assignee_id: "u-ali" });
  });

  it("refuses to write to contacts the seed did not tag", async () => {
    const w = buildWorld(NOW, seed);
    const d = evaluateContact(w, "101")[0];
    const logs = await writeBack(w, { ...d, contactId: "999" }, [], seed);
    expect(logs.map((l) => l.op)).toEqual(["skip"]);
  });
});
