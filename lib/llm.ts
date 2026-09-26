import Anthropic from "@anthropic-ai/sdk";
import type { Touch, World } from "./types.ts";

/**
 * The only two things Conductor asks an LLM:
 *  (a) does a queued message contradict what the buyer already did?
 *  (b) merge two colliding messages into one, from the chosen owner.
 * Everything degrades gracefully: no key, a timeout, a refusal or any error → { status: "skipped" }
 * and the deterministic rules still decide. The UI shows "LLM check skipped".
 */

const MODEL = "claude-opus-5";

export type LlmResult<T> = ({ status: "ok" } & T) | { status: "skipped"; reason: string };
export type ContradictionCheck = LlmResult<{ contradiction: boolean; explanation: string }>;
export type MergedMessage = LlmResult<{ message: string }>;

let client: Anthropic | null = null;
function llm(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: 8_000, maxRetries: 1 });
  return client;
}

const skipped = (reason: string) => ({ status: "skipped" as const, reason });

function describe(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "invalid ANTHROPIC_API_KEY";
  if (e instanceof Anthropic.RateLimitError) return "rate limited";
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "timed out";
  if (e instanceof Anthropic.APIError) return `API error ${e.status}`;
  return "unavailable";
}

/** One structured-output call; returns parsed JSON or a skip reason. */
async function ask<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<{ ok: T } | { skip: string }> {
  const c = llm();
  if (!c) return { skip: "no ANTHROPIC_API_KEY" };
  try {
    const res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { skip: "model declined" };
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return { skip: "empty response" };
    return { ok: JSON.parse(text.text) as T };
  } catch (e) {
    return { skip: describe(e) };
  }
}

const fmt = (w: World, t: Touch) => {
  const who = t.senderId === t.contactId ? "BUYER" : w.senders.find((s) => s.id === t.senderId)?.name ?? t.senderId;
  return `- ${t.timestamp.slice(0, 16)} · ${who} · ${t.channel}: ${t.snippet}`;
};

/** The buyer's recent history, as context for both prompts. */
function history(w: World, contactId: string): string {
  return w.touches
    .filter((t) => t.contactId === contactId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-15)
    .map((t) => fmt(w, t))
    .join("\n");
}

export async function checkContradiction(w: World, contactId: string, queued: string): Promise<ContradictionCheck> {
  const name = w.contacts.find((c) => c.id === contactId)?.name ?? "the buyer";
  const r = await ask<{ contradiction: boolean; explanation: string }>(
    "You review outbound sales messages before they are sent. Decide whether the queued message contradicts facts already established in the buyer's history (for example, asking whether they are still evaluating after they booked a meeting, re-pitching an intro after a deal is in progress, or ignoring their reply). Tone or style is not a contradiction. Keep the explanation to one sentence that quotes the conflicting fact.",
    `Buyer: ${name}\n\nHistory (oldest first):\n${history(w, contactId)}\n\nQueued message:\n"${queued}"`,
    {
      type: "object",
      properties: { contradiction: { type: "boolean" }, explanation: { type: "string" } },
      required: ["contradiction", "explanation"],
      additionalProperties: false,
    },
    1024,
  );
  return "ok" in r ? { status: "ok", ...r.ok } : skipped(r.skip);
}

export async function mergeMessages(w: World, contactId: string, ownerId: string, queued: string, other: string): Promise<MergedMessage> {
  const owner = w.senders.find((s) => s.id === ownerId);
  const name = w.contacts.find((c) => c.id === contactId)?.name ?? "the buyer";
  const r = await ask<{ message: string }>(
    "Two teammates were about to message the same buyer. Write ONE short message (under 90 words) from the named owner that keeps whatever is still useful from both, drops anything the buyer's history makes redundant or wrong, and reads as one coherent voice. Plain text, no subject line, no placeholders.",
    `Buyer: ${name}\nOwner (the sender of the merged message): ${owner?.name ?? ownerId}, ${owner?.role ?? ""}\n\nHistory (oldest first):\n${history(w, contactId)}\n\nMessage A (queued):\n"${queued}"\n\nMessage B (from another sender):\n"${other}"`,
    {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
      additionalProperties: false,
    },
    2048,
  );
  return "ok" in r ? { status: "ok", ...r.ok } : skipped(r.skip);
}
