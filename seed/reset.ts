/**
 * npm run reset — delete ONLY records the seed created (ids in data/seed-state.json that are also
 * members of the "conductor-demo" list). Deals and the sequence are only deleted if their name matches
 * the scenario. CONDUCTOR_MODE=dry (default) only logs what would be deleted.
 */
import fs from "node:fs";
import dotenv from "dotenv";
import { SCENARIO, DEMO_TAG } from "./scenario.ts";
import { client, write, mode, describeError } from "../lib/graph8.ts";
import { SEED_STATE_FILE, readSeedState } from "../lib/world.ts";

dotenv.config({ path: ".env.local", quiet: true });
const rows = (r: unknown): any[] => {
  const x = r as any;
  return Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : Array.isArray(x?.items) ? x.items : [];
};

async function main() {
  const state = readSeedState();
  if (!state?.listId) {
    console.log("Nothing to reset (no data/seed-state.json with a list id).");
    return;
  }
  const g8 = client();
  console.log(`Reset — mode: ${mode()}`);

  const tagged = new Set(rows(await g8.lists.contacts(state.listId, 1, 500)).map((c) => String(c.contact_id ?? c.id)));

  for (const d of SCENARIO.deals) {
    const id = state.deals[d.key];
    if (!id) continue;
    const deal = await g8.deals.get(id).catch(() => null);
    if (deal && (deal as any).name === d.name) await write("deals.delete", { id }, () => g8.deals.delete(id));
  }
  if (state.sequenceId) {
    const seq = await g8.sequences.get(state.sequenceId).catch(() => null);
    if (seq && (seq as any).name === SCENARIO.sequence.name) await write("sequences.delete", { id: state.sequenceId }, () => g8.sequences.delete(state.sequenceId!));
  }
  for (const [key, id] of Object.entries(state.contacts)) {
    if (!tagged.has(id)) {
      console.log(`skip ${key} (${id}): not in ${DEMO_TAG} list`);
      continue;
    }
    await write("contacts.delete", { id }, () => g8.contacts.delete(Number(id)));
  }
  await write("lists.delete", { id: state.listId }, () => g8.lists.delete(state.listId!));
  // Companies and custom fields are left in place: companies may be shared with real contacts,
  // and fields are org-wide schema, not demo records.

  if (mode() === "live") fs.rmSync(SEED_STATE_FILE, { force: true });
  console.log("Done.");
}

main().catch((e) => {
  console.error(`✗ reset failed: ${e instanceof Error ? e.message : describeError(e)}`);
  process.exit(1);
});
