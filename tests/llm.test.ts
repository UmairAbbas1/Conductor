import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkContradiction, mergeMessages } from "../lib/llm.ts";
import { buildWorld } from "../lib/world.ts";

const w = buildWorld(new Date("2026-09-27T12:00:00"), null);
const fetchMock = vi.fn();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const models = () => json({ data: [{ id: "whisper-large-v3" }, { id: "llama-3.3-70b-versatile" }] });
const chat = (obj: object) => json({ choices: [{ message: { content: JSON.stringify(obj) } }] });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.GROQ_MODEL = "";
});
afterEach(() => {
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_MODEL;
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("AI layer degrades gracefully", () => {
  it("skips without a key and never calls the network", async () => {
    expect(await checkContradiction(w, "sarah", "Still evaluating for October?")).toEqual({ status: "skipped", reason: "no GROQ_API_KEY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("skips when the call fails", async () => {
    process.env.GROQ_API_KEY = "test";
    process.env.GROQ_MODEL = "m";
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect((await checkContradiction(w, "sarah", "x")).status).toBe("skipped");
  });
  it("skips on an HTTP error", async () => {
    process.env.GROQ_API_KEY = "test";
    process.env.GROQ_MODEL = "m";
    fetchMock.mockResolvedValueOnce(json({ error: "nope" }, 401));
    expect(await checkContradiction(w, "sarah", "x")).toEqual({ status: "skipped", reason: "invalid GROQ_API_KEY" });
  });
  it("skips when the model returns the wrong shape", async () => {
    process.env.GROQ_API_KEY = "test";
    process.env.GROQ_MODEL = "m";
    fetchMock.mockResolvedValueOnce(chat({ verdict: "maybe" }));
    expect(await checkContradiction(w, "sarah", "x")).toEqual({ status: "skipped", reason: "unexpected response" });
  });
});

describe("AI layer with a key", () => {
  it("picks a chat model the key can use, and flags a contradiction with Sarah's booking in context", async () => {
    process.env.GROQ_API_KEY = "test";
    fetchMock.mockResolvedValueOnce(models()).mockResolvedValueOnce(chat({ contradiction: true, explanation: "She booked a pilot review on Wednesday." }));
    const r = await checkContradiction(w, "sarah", "Still evaluating for October?");
    expect(r).toEqual({ status: "ok", contradiction: true, explanation: "She booked a pilot review on Wednesday." });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[1].content).toContain("BUYER · meeting: Booked");
  });
  it("merges two messages into one from the owner", async () => {
    process.env.GROQ_API_KEY = "test";
    process.env.GROQ_MODEL = "m";
    fetchMock.mockResolvedValueOnce(chat({ message: "Sarah, looking forward to Thursday. Pilot proposal attached. Ali" }));
    const r = await mergeMessages(w, "sarah", "ali", "Still evaluating for October?", "Pilot proposal attached");
    expect(r).toEqual({ status: "ok", message: "Sarah, looking forward to Thursday. Pilot proposal attached. Ali" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content).toContain("Owner (the sender of the merged message): Ali, AE");
  });
});
