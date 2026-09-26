import { client, write, type WriteLog } from "./graph8.ts";
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

  // 1. Sequence pauses (per contact, per sequence: never the whole sequence).
  for (const e of toPause) {
    const args = { path: { sequence_id: e.sequenceId, contact_id: contactId } };
    await write("sequences.pauseSequenceContact", args, () => g8.api.sequences.pauseSequenceContact(args), logs);
  }

  // 2. A note on the contact explaining why.
  const note = [
    `Conductor · ${RULE_TITLE[d.rule]}`,
    d.reason + ".",
    toPause.length ? `Paused: ${toPause.map((e) => e.sequenceName).join(", ")}.` : "",
    owner ? `Owner: ${owner.name} (${owner.role}).` : "",
    `Decision ${d.id} · ${d.autonomous ? "autonomous" : "waiting for a human"}.`,
  ].filter(Boolean).join("\n");
  await write("notes.create", { contactId, content: note }, () => g8.notes.create(contactId, note), logs);

  // 3. A task when someone else should act (reroute / R2 task / escalate).
  if (d.decision === "escalate" || d.instead?.type === "task" || d.instead?.type === "handoff") {
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
