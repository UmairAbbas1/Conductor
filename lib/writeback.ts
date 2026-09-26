import { client, mode, write, type WriteLog } from "./graph8.ts";
import { harmonyScore } from "./score.ts";
import { touchBudgetRemaining } from "./policies.ts";
import type { SeedState } from "./world.ts";
import type { Decision, Enrollment, World } from "./types.ts";

const RULE_TITLE: Record<string, string> = {
  R1: "Buyer engaged: automation paused",
  R2: "Open deal: cold outreach held",
  R3: "Channel stacking: touch delayed",
  R4: "Touch budget reached: automation held",
  R5: "Sender collision: rerouted to one owner",
  none: "Cleared",
};

/**
 * Sequence ids graph8 says this contact is enrolled in (g8.api.contacts.getContactSequences).
 * Returns an empty set in dry mode or if the read fails, which means "don't filter".
 */
async function enrolledIn(contactId: number): Promise<Set<string>> {
  if (mode() === "dry") return new Set();
  try {
    const r = (await client().api.contacts.getContactSequences({ path: { contact_id: contactId } })) as any;
    const list: any[] = Array.isArray(r?.data) ? r.data : Array.isArray(r?.data?.items) ? r.data.items : [];
    const ids = new Set(list.map((s) => String(s.sequence_id ?? s.id ?? "")).filter(Boolean));
    return ids.size ? ids : new Set(["__none__"]); // enrolled in nothing → skip every pause
  } catch {
    return new Set();
  }
}

/** Does graph8 already hold a Conductor note / task for this decision? (Dry mode or a failed read: assume no.) */
async function existingFor(contactId: number, decisionId: string): Promise<{ note: boolean; task: boolean }> {
  if (mode() === "dry") return { note: false, task: false };
  const g8 = client();
  const list = (r: unknown): any[] => {
    const x = r as any;
    return Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : Array.isArray(x?.data?.items) ? x.data.items : [];
  };
  const [notes, tasks] = await Promise.all([
    g8.notes.list(contactId).then(list).catch(() => []),
    g8.tasks.listForContact(contactId).then(list).catch(() => []),
  ]);
  return {
    note: notes.some((n) => String(n.content ?? "").includes(decisionId)),
    task: tasks.some((t) => String(t.description ?? "").includes(decisionId)),
  };
}

/**
 * Make a decision native in graph8: a note explaining why, a task for the owner when someone
 * else should act, the Conductor custom fields, and sequence pauses. Only touches contacts the seed
 * tagged. In dry mode every call is logged instead of sent (see lib/graph8.ts).
 */
export async function writeBack(world: World, d: Decision, toPause: Enrollment[], seed: SeedState | null): Promise<WriteLog[]> {
  const logs: WriteLog[] = [];
  const tagged = seed ? Object.values(seed.contacts).includes(d.contactId) : false;
  const contactId = Number(d.contactId);
  if (!tagged || !Number.isFinite(contactId)) {
    logs.push({ at: new Date().toISOString(), mode: "dry", op: "skip", args: { reason: "contact is not tagged conductor-demo data (run npm run seed)" }, ok: true });
    return logs;
  }
  const g8 = client();
  const owner = d.instead ? world.senders.find((s) => s.id === d.instead!.ownerId) : undefined;

  // 1. Sequence pauses (per contact, per sequence: never the whole sequence). Only pause what graph8
  //    confirms the contact is actually enrolled in; scenario-only enrollments are logged, not faked.
  const enrolled = toPause.length ? await enrolledIn(contactId) : new Set<string>();
  for (const e of toPause) {
    if (enrolled.size && !enrolled.has(e.sequenceId)) {
      logs.push({ at: new Date().toISOString(), mode: "dry", op: "skip", args: { pause: e.sequenceId, reason: "not enrolled in graph8 (scenario history)" }, ok: true });
      continue;
    }
    const args = { path: { sequence_id: e.sequenceId, contact_id: contactId } };
    await write("sequences.pauseSequenceContact", args, () => g8.api.sequences.pauseSequenceContact(args), logs);
  }

  // Idempotency across restarts/resets: every note and task carries the decision id, so skip
  // anything graph8 already has for this decision.
  const already = await existingFor(contactId, d.id);

  // 2. A note on the contact explaining why.
  const note = [
    `Conductor · ${RULE_TITLE[d.rule]}`,
    d.reason + ".",
    toPause.length ? `Paused: ${toPause.map((e) => e.sequenceName).join(", ")}.` : "",
    owner ? `Owner: ${owner.name} (${owner.role}).` : "",
    `Decision ${d.id} · ${d.autonomous ? "autonomous" : "waiting for a human"}.`,
  ].filter(Boolean).join("\n");
  if (already.note) logs.push({ at: new Date().toISOString(), mode: mode(), op: "skip", args: { note: "already in graph8" }, ok: true });
  else await write("notes.create", { contactId, content: note }, () => g8.notes.create(contactId, note), logs);

  // 3. A task when someone else should act (reroute / R2 task / escalate).
  const wantsTask = d.decision === "escalate" || d.instead?.type === "task" || d.instead?.type === "handoff";
  if (wantsTask && already.task) logs.push({ at: new Date().toISOString(), mode: mode(), op: "skip", args: { task: "already in graph8" }, ok: true });
  if (wantsTask && !already.task) {
    const task = {
      title: d.decision === "escalate" ? `Approve or override: ${RULE_TITLE[d.rule]}` : `You own this buyer now: ${RULE_TITLE[d.rule]}`,
      description: `${d.reason}.\nConductor decision ${d.id}.`,
      assignee_id: owner?.memberId,
      priority: d.decision === "escalate" ? 1 : 2,
      due_date: new Date(Date.now() + 24 * 3600_000).toISOString(),
    };
    await write("tasks.create", { contactId, ...task }, () => g8.tasks.create(contactId, task), logs);
  }

  // 4. Custom fields (text-only in graph8).
  const values: Record<string, string> = {
    harmony_score: String(harmonyScore(world, d.contactId).score),
    touch_budget_remaining: String(touchBudgetRemaining(world, d.contactId)),
    conductor_hold: d.decision === "allow" ? "" : `${d.decision}:${d.rule}`,
  };
  for (const [title, value] of Object.entries(values)) {
    const columnId = seed?.fields[title];
    if (!columnId) continue;
    const params = { record_id: contactId, value, entity: "contacts" as const };
    await write("fields.setValue", { columnId, ...params }, () => g8.fields.setValue(columnId, params), logs);
  }
  return logs;
}
