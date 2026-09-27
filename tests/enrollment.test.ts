import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleEvent } from "../lib/intake.ts";
import { scan } from "../lib/engine.ts";
import { resetState, state } from "../lib/store.ts";

// A seeded world (numeric graph8 ids), in dry mode: write-back logs instead of calling graph8.
const seed = {
  mode: "dry",
  seededAt: new Date().toISOString(),
  listId: 1,
  sequenceId: "seq-bilal",
  companies: { acme: "501", globex: "502", initech: "503" },
  contacts: { sarah: "101", omar: "102", hina: "103", lina: "104", marco: "105" },
  deals: {},
  members: { ali: "u-ali", bilal: "u-bilal" },
  fields: {},
};

beforeAll(() => {
  process.env.CONDUCTOR_SEED_STATE = JSON.stringify(seed);
  process.env.G8_API_KEY ??= "test-not-a-key";
  resetState();
});
afterAll(() => {
  delete process.env.CONDUCTOR_SEED_STATE;
  resetState();
});

describe("real enrollments are always stopped in graph8", () => {
  it("stops Hina's real enrollment even though the scan already paused her scenario enrollment", async () => {
    await scan(); // marks (103, seq-bilal) paused locally from the scenario history
    const [d] = await handleEvent(
      { id: "enroll-103", name: "sequence.contact_enrolled", occurredAt: new Date().toISOString(), contactId: "103", sequenceId: "seq-bilal", sequenceName: "Bilal — Ops Leaders Cold Outbound" },
      "event",
    );
    expect(d).toMatchObject({ rule: "R1", decision: "hold", contactName: "Hina Malik" });
    const pause = d.writeback.find((w) => w.op === "sequences.pauseSequenceContact");
    expect(pause?.args).toEqual({ path: { sequence_id: "seq-bilal", contact_id: 103 } });
    expect(state().decisions.filter((x) => x.contactId === "103" && x.subject?.startsWith("Enrolled"))).toHaveLength(1);
  });
});
