import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static APIConnectionTimeoutError = class extends Error {};
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

const { checkContradiction, mergeMessages } = await import("../lib/llm.ts");
const { buildWorld } = await import("../lib/world.ts");
const w = buildWorld(new Date("2026-09-27T12:00:00"), null);
const reply = (obj: object, stop = "end_turn") => ({ stop_reason: stop, content: [{ type: "text", text: JSON.stringify(obj) }] });

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  create.mockReset();
});

describe("LLM layer degrades gracefully", () => {
  it("skips without an API key (and never calls the API)", async () => {
    expect(await checkContradiction(w, "sarah", "Still evaluating for October?")).toEqual({ status: "skipped", reason: "no ANTHROPIC_API_KEY" });
    expect(create).not.toHaveBeenCalled();
  });
  it("skips when the call fails", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    create.mockRejectedValueOnce(new Error("network down"));
    expect((await checkContradiction(w, "sarah", "x")).status).toBe("skipped");
  });
  it("skips on a refusal", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    expect(await checkContradiction(w, "sarah", "x")).toEqual({ status: "skipped", reason: "model declined" });
  });
});

describe("LLM layer with a key", () => {
  it("flags a contradiction, with Sarah's booking in the context", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    create.mockResolvedValueOnce(reply({ contradiction: true, explanation: "She booked a pilot review on Wednesday." }));
    const r = await checkContradiction(w, "sarah", "Still evaluating for October?");
    expect(r).toEqual({ status: "ok", contradiction: true, explanation: "She booked a pilot review on Wednesday." });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.messages[0].content).toContain("BUYER · meeting: Booked");
  });
  it("merges two messages into one from the owner", async () => {
    process.env.ANTHROPIC_API_KEY = "test";
    create.mockResolvedValueOnce(reply({ message: "Sarah, looking forward to Thursday. Pilot proposal attached. Ali" }));
    const r = await mergeMessages(w, "sarah", "ali", "Still evaluating for October?", "Pilot proposal attached");
    expect(r).toEqual({ status: "ok", message: "Sarah, looking forward to Thursday. Pilot proposal attached. Ali" });
    expect(create.mock.calls[0][0].messages[0].content).toContain("Owner (the sender of the merged message): Ali, AE");
  });
});
