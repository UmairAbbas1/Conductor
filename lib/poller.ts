import { client, describeError } from "./graph8.ts";
import { handleEvent, textOf } from "./intake.ts";
import { readSeedState } from "./world.ts";
import { save, state } from "./store.ts";

/**
 * Fallback for webhooks that can't reach this machine: read the org event feed
 * (`g8.api.events.listOrgEvents`) and each tagged contact's enrollments
 * (`g8.api.contacts.getContactSequences`) every 5s. Stops after the same error 3 times in a row.
 *
 * Two drivers, same pollOnce(): a background interval on a long-running server (npm run dev/start),
 * and maybePoll() on each dashboard request for serverless hosts (Vercel), throttled to one poll per 5s.
 * Every decision id is deterministic and graph8 write-back is idempotent, so re-seeing an event or an
 * enrollment on a fresh instance never double-acts.
 */
const INTERVAL_MS = 5000;
const g = globalThis as unknown as { __poller?: NodeJS.Timeout; __pollFail?: { error: string; count: number }; __pollInFlight?: Promise<void> | null };

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

const stopped = () => !!g.__pollFail && g.__pollFail.count >= 3;

export function pollStatus(): PollStatus {
  const last = state().lastPollAt;
  const recent = !!last && Date.now() - new Date(last).getTime() < 30_000;
  return { running: !stopped() && (!!g.__poller || recent), lastPollAt: last, error: stopped() ? g.__pollFail!.error : undefined };
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

  // 2. Sequence enrollments on tagged contacts (the enrollment itself may not be in the feed).
  //    Each one is preflighted once per instance; decisions dedupe by id across instances.
  st.knownEnrollments ??= [];
  for (const contactId of tagged) {
    for (const s of rows(await g8.api.contacts.getContactSequences({ path: { contact_id: Number(contactId) } }))) {
      const seqId = String(s.sequence_id ?? s.id ?? "");
      const key = `${contactId}|${seqId}`;
      if (!seqId || st.knownEnrollments.includes(key)) continue;
      st.knownEnrollments.push(key);
      handled += (await handleEvent({ id: `enroll-${key}`, name: "sequence.contact_enrolled", occurredAt: new Date().toISOString(), contactId, sequenceId: seqId, sequenceName: s.sequence_name ?? s.name ?? null }, "event")).length;
    }
  }

  // 3. Deal amounts and stages, so "pipeline protected" is real graph8 data (every ~30s is plenty).
  const lastSync = Object.values(st.dealSync ?? {})[0]?.at;
  if (!lastSync || Date.now() - new Date(lastSync).getTime() > 30_000) {
    st.dealSync ??= {};
    for (const dealId of Object.values(seed.deals)) {
      const d = (await g8.deals.get(dealId)) as any;
      const deal = d?.data ?? d;
      const stage = String(deal?.stage_name ?? deal?.stage ?? "");
      st.dealSync[dealId] = {
        amount: Number(deal?.amount ?? deal?.value ?? 0),
        open: !/closed|won|lost/i.test(stage),
        stage,
        at: new Date().toISOString(),
      };
    }
  }

  st.lastPollAt = new Date().toISOString();
  save();
  return handled;
}

/** Run one poll, tracking repeated identical failures (3 in a row stops polling). */
async function guardedPoll() {
  try {
    await pollOnce();
    g.__pollFail = undefined;
  } catch (e) {
    const error = describeError(e);
    g.__pollFail = g.__pollFail?.error === error ? { error, count: g.__pollFail.count + 1 } : { error, count: 1 };
    console.error(`[poller] ${error} (${g.__pollFail.count}x)`);
    if (stopped()) console.error("[poller] same error 3 times: stopping. Fix the cause and restart.");
  }
}

/** Serverless driver: poll at most once per 5s, called from dashboard requests. */
export async function maybePoll() {
  if (stopped()) return;
  const last = state().lastPollAt;
  if (last && Date.now() - new Date(last).getTime() < INTERVAL_MS) return;
  g.__pollInFlight ??= guardedPoll().finally(() => (g.__pollInFlight = null));
  await g.__pollInFlight;
}

/** Long-running server driver. */
export function startPoller() {
  if (g.__poller) return;
  g.__poller = setInterval(async () => {
    if (stopped()) {
      clearInterval(g.__poller);
      g.__poller = undefined;
      return;
    }
    await guardedPoll();
  }, INTERVAL_MS);
}
