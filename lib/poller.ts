import { client, describeError } from "./graph8.ts";
import { handleEvent, textOf } from "./intake.ts";
import { readSeedState } from "./world.ts";
import { save, state } from "./store.ts";

/**
 * Fallback for webhooks that can't reach this machine: every 5s, read the org event feed
 * (`g8.api.events.listOrgEvents`) and each tagged contact's enrollments
 * (`g8.api.contacts.getContactSequences`). Stops after the same error 3 times in a row.
 */
const INTERVAL_MS = 5000;
const g = globalThis as unknown as { __poller?: NodeJS.Timeout; __pollFail?: { error: string; count: number } };

const rows = (r: unknown): Record<string, any>[] => {
  const x = r as any;
  const d = x?.data ?? x;
  return Array.isArray(d) ? d : Array.isArray(d?.events) ? d.events : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : [];
};

export interface PollStatus {
  running: boolean;
  lastPollAt?: string;
  error?: string;
}

export function pollStatus(): PollStatus {
  return { running: !!g.__poller, lastPollAt: state().lastPollAt, error: g.__pollFail && g.__pollFail.count >= 3 ? g.__pollFail.error : undefined };
}

export async function pollOnce(): Promise<number> {
  const seed = readSeedState();
  if (!seed?.listId || !process.env.G8_API_KEY) return 0;
  const g8 = client();
  const st = state();
  st.seenEvents ??= [];
  const tagged = new Set(Object.values(seed.contacts));
  let handled = 0;

  // 1. Org event feed since the last poll (first poll: since seeding).
  const since = st.lastPollAt ?? seed.seededAt;
  const feed = rows(await g8.api.events.listOrgEvents({ query: { since, limit: 100 } }));
  for (const ev of feed) {
    const id = ev.id ?? `${ev.name}-${ev.contact_id}-${ev.occurred_at}`;
    if (!ev.contact_id || !tagged.has(String(ev.contact_id)) || st.seenEvents.includes(id)) continue;
    st.seenEvents.push(id);
    handled += (await handleEvent({ id, name: ev.name ?? "", occurredAt: ev.occurred_at ?? new Date().toISOString(), contactId: String(ev.contact_id), sequenceId: ev.sequence_id, actorEmail: ev.actor_email, text: textOf(ev.message) }, "event")).length;
  }

  // 2. New sequence enrollments on tagged contacts (the enrollment itself may not be in the feed).
  st.knownEnrollments ??= [];
  for (const contactId of tagged) {
    for (const s of rows(await g8.api.contacts.getContactSequences({ path: { contact_id: Number(contactId) } }))) {
      const seqId = String(s.sequence_id ?? s.id ?? "");
      const key = `${contactId}|${seqId}`;
      if (!seqId || st.knownEnrollments.includes(key)) continue;
      st.knownEnrollments.push(key);
      // The first poll only learns the baseline; enrollments after that are new events.
      if (!st.lastPollAt) continue;
      handled += (await handleEvent({ id: `enroll-${key}`, name: "sequence.contact_enrolled", occurredAt: new Date().toISOString(), contactId, sequenceId: seqId, sequenceName: s.sequence_name ?? s.name ?? null }, "event")).length;
    }
  }

  st.lastPollAt = new Date().toISOString();
  save();
  return handled;
}

export function startPoller() {
  if (g.__poller) return;
  g.__poller = setInterval(async () => {
    try {
      await pollOnce();
      g.__pollFail = undefined;
    } catch (e) {
      const error = describeError(e);
      g.__pollFail = g.__pollFail?.error === error ? { error, count: g.__pollFail.count + 1 } : { error, count: 1 };
      console.error(`[poller] ${error} (${g.__pollFail.count}x)`);
      if (g.__pollFail.count >= 3) {
        console.error("[poller] same error 3 times: stopping. Fix the cause and restart the server.");
        clearInterval(g.__poller);
        g.__poller = undefined;
      }
    }
  }, INTERVAL_MS);
}
