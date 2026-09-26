import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as webhook } from "../app/api/webhooks/graph8/route.ts";
import { handleEvent } from "../lib/intake.ts";
import { resetState, state } from "../lib/store.ts";
import { currentWorld } from "../lib/engine.ts";

const SECRET = "whsec_test";
process.env.G8_WEBHOOK_SECRET = SECRET;

const deliver = (body: object, sign: "good" | "bad" | "none" = "good") => {
  const raw = JSON.stringify(body);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", SECRET).update(`${ts}.${raw}`).digest("hex");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sign !== "none") {
    headers["x-studio-timestamp"] = ts;
    headers["x-studio-signature"] = sign === "good" ? sig : "0".repeat(64);
  }
  return webhook(new Request("http://localhost/api/webhooks/graph8", { method: "POST", headers, body: raw }));
};

beforeEach(() => resetState());

describe("webhook signature", () => {
  it("rejects unsigned deliveries", async () => {
    expect((await deliver({ event: "meeting.booked", data: { contact_id: "lina" } }, "none")).status).toBe(401);
  });
  it("rejects a bad signature", async () => {
    expect((await deliver({ event: "meeting.booked", data: { contact_id: "lina" } }, "bad")).status).toBe(401);
  });
  it("accepts a valid signature and acts on it", async () => {
    const res = await deliver({ id: "evt_1", event: "meeting.booked", timestamp: new Date().toISOString(), org_id: "o", data: { contact_id: "lina" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decisions.length).toBeGreaterThan(0);
    expect(state().decisions[0]).toMatchObject({ rule: "R1", decision: "hold", contactName: "Lina Chen" });
  });
});

describe("events → decisions", () => {
  it("booking a meeting pauses the buyer's sequences", async () => {
    await handleEvent({ id: "e1", name: "meeting.booked", occurredAt: new Date().toISOString(), contactId: "lina" }, "event");
    const w = currentWorld();
    expect(w.enrollments.find((e) => e.contactId === "lina")!.state).toBe("paused");
  });

  it("enrolling Sarah's colleague into a cold sequence is held (she booked)", async () => {
    const ds = await handleEvent({ id: "e2", name: "sequence.contact_enrolled", occurredAt: new Date().toISOString(), contactId: "omar", sequenceId: "seq-new", sequenceName: "Q4 Cold Outbound" }, "event");
    expect(ds[0]).toMatchObject({ rule: "R1", decision: "hold", contactName: "Omar Farooq" });
    expect(currentWorld().enrollments.find((e) => e.contactId === "omar" && e.sequenceId === "seq-new")!.state).toBe("paused");
  });

  it("ignores contacts Conductor does not coordinate", async () => {
    expect(await handleEvent({ id: "e3", name: "meeting.booked", occurredAt: new Date().toISOString(), contactId: "nobody" }, "event")).toEqual([]);
  });

  it("does not duplicate decisions when the same event arrives twice", async () => {
    const e = { id: "e4", name: "meeting.booked", occurredAt: "2026-09-26T10:00:00.000Z", contactId: "marco" };
    await handleEvent(e, "event");
    const n = state().decisions.length;
    await handleEvent(e, "event");
    expect(state().decisions.length).toBe(n);
  });
});
