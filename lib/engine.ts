import { buildWorld, readSeedState } from "./world.ts";
import { evaluateAction, evaluateContact, type ProposedAction } from "./policies.ts";
import { writeBack } from "./writeback.ts";
import { checkContradiction, mergeMessages } from "./llm.ts";
import { accountScore, harmonyScore } from "./score.ts";
import { addDecision, hasDecision, markPaused, save, state, type DecisionOrigin, type StoredDecision } from "./store.ts";
import type { Decision, Enrollment, Touch, World } from "./types.ts";

const CHANNEL_LABEL: Record<string, string> = { email: "email", sms: "SMS", linkedin: "LinkedIn", call: "call", voice_agent: "AI call", newsletter: "newsletter", meeting: "meeting" };

/** The world as Conductor currently sees it: scenario + seed ids + live events + its own pauses. */
export function currentWorld(now = new Date()): World {
  const st = state();
  return buildWorld(now, readSeedState(), { touches: st.liveTouches, enrollments: st.liveEnrollments, paused: st.paused, deals: st.dealSync });
}

/** Enrollments a decision pauses: the sequences named in its evidence that are still active. */
function toPause(w: World, d: Decision): Enrollment[] {
  if (d.decision !== "hold" || (d.rule !== "R1" && d.rule !== "R2")) return [];
  return w.enrollments.filter((e) => e.contactId === d.contactId && e.state === "active" && d.evidence.includes(e.sequenceId));
}

/**
 * Record a decision once, apply it (local pause + graph8 write-back), and return it.
 * The decision is stored BEFORE the slow graph8 calls, so a concurrent request for the same
 * situation sees it and never writes a second note or task.
 */
async function commit(w: World, d: Decision, origin: DecisionOrigin, subject?: string): Promise<StoredDecision | null> {
  if (hasDecision(d.id)) return null;
  const contact = w.contacts.find((c) => c.id === d.contactId);
  const pauses = toPause(w, d);
  for (const e of pauses) markPaused(e.contactId, e.sequenceId);
  const stored: StoredDecision = {
    ...d,
    origin,
    subject,
    contactName: contact?.name ?? d.contactId,
    companyId: contact?.companyId ?? "",
    writeback: [],
  };
  addDecision(stored);
  if (d.decision !== "allow") {
    stored.writeback = await writeBack(w, d, pauses, readSeedState());
    save();
  }
  return stored;
}

/** Evaluate every contact's standing situation and act on anything new. */
export async function scan(origin: DecisionOrigin = "scan", contactIds?: string[]): Promise<StoredDecision[]> {
  const w = currentWorld();
  const out: StoredDecision[] = [];
  for (const c of w.contacts) {
    if (contactIds && !contactIds.includes(c.id)) continue;
    for (const d of evaluateContact(w, c.id)) {
      const s = await commit(currentWorld(), d, origin);
      if (s) out.push(s);
    }
  }
  state().scannedAt = new Date().toISOString();
  save();
  return out;
}

/** Run the first scan once per process, so the dashboard is never empty. */
export async function ensureScanned() {
  if (!state().scannedAt) await scan();
}

/** A new touch arrived (webhook, poll or simulation): add it to the ledger, re-check the account. */
export async function ingestTouch(t: Touch, origin: DecisionOrigin = "event"): Promise<StoredDecision[]> {
  const st = state();
  if (!st.liveTouches.some((x) => x.refId === t.refId)) st.liveTouches.push(t);
  save();
  const w = currentWorld();
  const company = w.contacts.find((c) => c.id === t.contactId)?.companyId;
  const account = w.contacts.filter((c) => c.companyId === company).map((c) => c.id);
  return scan(origin, account);
}

/** Someone enrolled a contact in a sequence: preflight the enrollment and hold it if needed. */
export async function ingestEnrollment(e: Enrollment, origin: DecisionOrigin = "event"): Promise<StoredDecision | null> {
  const st = state();
  if (!st.liveEnrollments.some((x) => x.contactId === e.contactId && x.sequenceId === e.sequenceId)) st.liveEnrollments.push(e);
  save();
  const w = currentWorld();
  const d = evaluateAction(w, { contactId: e.contactId, action: "enroll", channel: "email", source: "sequence", senderId: e.ownerId, sequenceId: e.sequenceId });
  // A held enrollment is paused right away: put the new sequence in the evidence so commit() pauses it.
  const withSeq = d.decision === "hold" ? { ...d, evidence: [...new Set([...d.evidence, e.sequenceId])] } : d;
  return commit(w, withSeq, origin, `Enrolled in ${e.sequenceName}`);
}

/**
 * POST /api/preflight and the MCP tool: decide with the rules, record, apply. When the action carries
 * the message text, the LLM layer also (a) checks it against what the buyer already did and (b) for a
 * blocked message with an owner, merges it with the owner's last message into one voice.
 */
export async function preflight(a: ProposedAction): Promise<StoredDecision | Decision> {
  const w = currentWorld();
  const d = evaluateAction(w, a);
  const sender = w.senders.find((x) => x.id === a.senderId)?.name ?? a.senderId;
  const stored = (await commit(w, d, "preflight", `${sender} · ${CHANNEL_LABEL[a.channel] ?? a.channel}`)) ?? state().decisions.find((x) => x.id === d.id);
  if (!stored || !a.snippet || stored.llm) return stored ?? d;

  const ownerId = d.instead?.ownerId;
  const ownerLast = ownerId && ownerId !== a.senderId
    ? w.touches.filter((t) => t.contactId === a.contactId && t.senderId === ownerId).sort((x, y) => y.timestamp.localeCompare(x.timestamp))[0]
    : undefined;
  const [contradiction, merged] = await Promise.all([
    checkContradiction(w, a.contactId, a.snippet),
    d.decision !== "allow" && ownerId && ownerLast ? mergeMessages(w, a.contactId, ownerId, a.snippet, ownerLast.snippet) : Promise.resolve(undefined),
  ]);
  stored.llm = { contradiction, ...(merged ? { merged: { ...merged, ownerId } } : {}) };
  save();
  return stored;
}

export interface Stats {
  decisions: number;
  autonomousPct: number;
  touchesPrevented: number;
  pipelineProtected: number;
  pipelineSource: "graph8" | "scenario";
}

export function stats(w: World = currentWorld()): Stats {
  const ds = state().decisions;
  const acted = ds.filter((d) => d.decision !== "allow");
  const affected = new Set(acted.map((d) => d.companyId));
  const pipeline = w.deals.filter((d) => d.open && affected.has(d.companyId)).reduce((s, d) => s + d.amount, 0);
  const synced = Object.keys(state().dealSync ?? {}).length > 0;
  return {
    decisions: ds.length,
    autonomousPct: ds.length ? Math.round((100 * ds.filter((d) => d.autonomous).length) / ds.length) : 100,
    touchesPrevented: acted.filter((d) => d.decision !== "escalate").length,
    pipelineProtected: pipeline,
    pipelineSource: synced ? "graph8" : "scenario",
  };
}

/** Live counts for the dashboard's Listen → Decide → Act strip. */
export function flow(w: World = currentWorld()) {
  const ds = state().decisions;
  // Count what is on the graph8 record: fresh writes plus notes/tasks graph8 already had for a decision.
  const ops = ds.flatMap((d) =>
    d.writeback
      .filter((x) => x.ok)
      .map((x) => {
        const a = x.args as { note?: string; task?: string } | undefined;
        if (x.op !== "skip") return x;
        return a?.note ? { ...x, op: "notes.create" } : a?.task ? { ...x, op: "tasks.create" } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x),
  );
  const count = (op: string) => ops.filter((x) => x.op === op).length;
  const week = Date.now() - 7 * 24 * 3600_000;
  return {
    touches: w.touches.filter((t) => new Date(t.timestamp).getTime() >= week).length,
    liveEvents: state().liveTouches.length,
    senders: new Set(w.touches.map((t) => t.senderId)).size,
    decisions: ds.length,
    byKind: Object.fromEntries(["hold", "delay", "reroute", "escalate", "allow"].map((k) => [k, ds.filter((d) => d.decision === k).length])),
    writes: { notes: count("notes.create"), tasks: count("tasks.create"), fields: count("fields.setValue"), pauses: count("sequences.pauseSequenceContact") },
    live: ops.some((x) => x.mode === "live"),
  };
}

export function heatmap(w: World = currentWorld()) {
  const week = Date.now() - 7 * 24 * 3600_000;
  return w.companies
    .map((co) => {
      const people = w.contacts.filter((c) => c.companyId === co.id);
      const ids = new Set(people.map((c) => c.id));
      const recent = w.touches.filter((t) => ids.has(t.contactId) && new Date(t.timestamp).getTime() >= week);
      const engaged = recent.filter((t) => t.senderId === t.contactId).at(-1);
      const who = engaged && people.find((c) => c.id === engaged.contactId)?.name.split(" ")[0];
      const outbound = recent.filter((t) => t.senderId !== t.contactId);
      const headline = engaged
        ? `${who} ${engaged.channel === "meeting" ? "booked a meeting" : "replied"} · ${outbound.length} touches this week`
        : `${outbound.length} touches this week from ${new Set(outbound.map((t) => t.senderId)).size} senders`;
      return {
        id: co.id,
        name: co.name,
        score: accountScore(w, co.id),
        headline,
        held: state().decisions.filter((d) => d.companyId === co.id && d.decision !== "allow").length,
        deal: w.deals.find((d) => d.companyId === co.id && d.open) ?? null,
        contacts: people
          .map((c) => ({ id: c.id, name: c.name, title: c.title, score: harmonyScore(w, c.id).score }))
          .sort((a, b) => a.score - b.score),
      };
    })
    .sort((a, b) => a.score - b.score);
}
