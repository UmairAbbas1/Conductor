import type { Touch, World } from "./types.ts";

/**
 * The only two things Conductor asks an LLM:
 *  (a) does a queued message contradict what the buyer already did?
 *  (b) merge two colliding messages into one, from the chosen owner.
 *
 * Provider: Groq (OpenAI-compatible chat completions, called with fetch, no extra dependency).
 * The model is discovered from the key's own model list (or GROQ_MODEL), never hardcoded blindly.
 * Everything degrades gracefully: no key, a timeout, a bad response or any error → { status: "skipped" }
 * and the deterministic rules still decide. The UI shows "AI check off".
 */

const GROQ = "https://api.groq.com/openai/v1";
const TIMEOUT_MS = 8_000;
/** Preferred models, best first. The first one the key can use wins. */
const PREFERRED = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];

export type LlmResult<T> = ({ status: "ok" } & T) | { status: "skipped"; reason: string };
export type ContradictionCheck = LlmResult<{ contradiction: boolean; explanation: string }>;
export type MergedMessage = LlmResult<{ message: string }>;

export const llmEnabled = () => !!process.env.GROQ_API_KEY;

let chosenModel: string | null = null;

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${GROQ}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Pick a model this key can actually use: GROQ_MODEL, else the first preferred model listed. */
async function model(): Promise<string> {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  if (chosenModel) return chosenModel;
  const res = await call("/models");
  if (!res.ok) throw new Error(`models ${res.status}`);
  const ids: string[] = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
  chosenModel = PREFERRED.find((p) => ids.includes(p)) ?? ids.find((id) => !/whisper|guard|tts|embed/i.test(id)) ?? null;
  if (!chosenModel) throw new Error("no chat model available");
  return chosenModel;
}

const describe = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(m)) return "timed out";
  if (/401|403/.test(m)) return "invalid GROQ_API_KEY";
  if (/429/.test(m)) return "rate limited";
  return "unavailable";
};

/** One JSON-mode chat call; returns parsed JSON or a skip reason. */
async function ask<T>(system: string, user: string, validate: (x: unknown) => x is T): Promise<{ ok: T } | { skip: string }> {
  if (!llmEnabled()) return { skip: "no GROQ_API_KEY" };
  try {
    const res = await call("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: await model(),
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\nRespond with a single JSON object only.` },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "null");
    return validate(parsed) ? { ok: parsed } : { skip: "unexpected response" };
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

const isCheck = (x: unknown): x is { contradiction: boolean; explanation: string } =>
  !!x && typeof (x as { contradiction?: unknown }).contradiction === "boolean" && typeof (x as { explanation?: unknown }).explanation === "string";
const isMerge = (x: unknown): x is { message: string } => !!x && typeof (x as { message?: unknown }).message === "string" && (x as { message: string }).message.length > 0;

export async function checkContradiction(w: World, contactId: string, queued: string): Promise<ContradictionCheck> {
  const name = w.contacts.find((c) => c.id === contactId)?.name ?? "the buyer";
  const r = await ask(
    'You review outbound sales messages before they are sent. Decide whether the queued message contradicts facts already established in the buyer\'s history (for example, asking whether they are still evaluating after they booked a meeting, re-pitching an intro after a deal is in progress, or ignoring their reply). Tone or style is not a contradiction. JSON shape: {"contradiction": boolean, "explanation": "one sentence that quotes the conflicting fact"}.',
    `Buyer: ${name}\n\nHistory (oldest first):\n${history(w, contactId)}\n\nQueued message:\n"${queued}"`,
    isCheck,
  );
  return "ok" in r ? { status: "ok", ...r.ok } : { status: "skipped", reason: r.skip };
}

export async function mergeMessages(w: World, contactId: string, ownerId: string, queued: string, other: string): Promise<MergedMessage> {
  const owner = w.senders.find((s) => s.id === ownerId);
  const name = w.contacts.find((c) => c.id === contactId)?.name ?? "the buyer";
  const r = await ask(
    'Two teammates were about to message the same buyer. Write ONE short message (under 90 words) from the named owner that keeps whatever is still useful from both, drops anything the buyer\'s history makes redundant or wrong, and reads as one coherent voice. Plain text, no subject line, no placeholders. JSON shape: {"message": "..."}.',
    `Buyer: ${name}\nOwner (the sender of the merged message): ${owner?.name ?? ownerId}, ${owner?.role ?? ""}\n\nHistory (oldest first):\n${history(w, contactId)}\n\nMessage A (queued):\n"${queued}"\n\nMessage B (from another sender):\n"${other}"`,
    isMerge,
  );
  return "ok" in r ? { status: "ok", ...r.ok } : { status: "skipped", reason: r.skip };
}
