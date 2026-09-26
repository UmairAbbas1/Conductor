import { buildWorld, readSeedState } from "./world.ts";
import { evaluateAction, evaluateContact, type ProposedAction } from "./policies.ts";
import { writeBack } from "./writeback.ts";
import { accountScore, harmonyScore } from "./score.ts";
import { addDecision, hasDecision, markPaused, save, state, type DecisionOrigin, type StoredDecision } from "./store.ts";
import type { Decision, Enrollment, Touch, World } from "./types.ts";

/** The world as Conductor currently sees it: scenario + seed ids + live events + its own pauses. */
export function currentWorld(now = new Date()): World {
  const st = state();
  return buildWorld(now, readSeedState(), { touches: st.liveTouches, enrollments: st.liveEnrollments, paused: st.paused });
}

/** Enrollments a decision pauses: the sequences named in its evidence that are still active. */
function toPause(w: World, d: Decision): Enrollment[] {
  if (d.decision !== "hold" || (d.rule !== "R1" && d.rule !== "R2")) return [];
  return w.enrollments.filter((e) => e.contactId === d.contactId && e.state === "active" && d.evidence.includes(e.sequenceId));
}

/** Record a decision once, apply it (local pause + graph8 write-back), and return it. */
async function commit(w: World, d: Decision, origin: DecisionOrigin): Promise<StoredDecision | null> {
  if (hasDecision(d.id)) return null;
  const contact = w.contacts.find((c) => c.id === d.contactId);
  const pauses = toPause(w, d);
  for (const e of pauses) markPaused(e.contactId, e.sequenceId);
  const stored: StoredDecision = {
    ...d,
    origin,
    contactName: contact?.name ?? d.contactId,
    companyId: contact?.companyId ?? "",
    writeback: d.decision === "allow" ? [] : await writeBack(w, d, pauses, readSeedState()),
  };
  addDecision(stored);
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
  return commit(w, withSeq, origin);
}

/** POST /api/preflight and the MCP tool: decide, record, apply. */
export async function preflight(a: ProposedAction): Promise<StoredDecision | Decision> {
  const w = currentWorld();
  const d = evaluateAction(w, a);
  return (await commit(w, d, "preflight")) ?? d;
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
  const seed = readSeedState();
  return {
    decisions: ds.length,
    autonomousPct: ds.length ? Math.round((100 * ds.filter((d) => d.autonomous).length) / ds.length) : 100,
    touchesPrevented: acted.filter((d) => d.decision !== "escalate").length,
    pipelineProtected: pipeline,
    pipelineSource: seed && Object.keys(seed.deals).length ? "graph8" : "scenario",
  };
}

export function heatmap(w: World = currentWorld()) {
  return w.companies
    .map((co) => ({
      id: co.id,
      name: co.name,
      score: accountScore(w, co.id),
      deal: w.deals.find((d) => d.companyId === co.id && d.open) ?? null,
      contacts: w.contacts
        .filter((c) => c.companyId === co.id)
        .map((c) => ({ id: c.id, name: c.name, title: c.title, score: harmonyScore(w, c.id).score }))
        .sort((a, b) => a.score - b.score),
    }))
    .sort((a, b) => a.score - b.score);
}
