/**
 * npm run enroll -- hina
 * Enroll one tagged demo contact into the demo sequence through graph8's API (g8.sequences.add),
 * the same way any tool or agent would. Used for the live on-stage catch. The sequence is a
 * draft with no channels, so nothing can be sent. Respects CONDUCTOR_MODE (dry only logs).
 */
import dotenv from "dotenv";
import { client, write, mode, describeError } from "../lib/graph8.ts";
import { readSeedState } from "../lib/world.ts";

dotenv.config({ path: ".env.local", quiet: true });

async function main() {
  const key = (process.argv[2] ?? "").toLowerCase();
  const seed = readSeedState();
  if (!seed?.listId || !seed.sequenceId) throw new Error("run npm run seed first");
  const id = seed.contacts[key];
  if (!id) throw new Error(`usage: npm run enroll -- <${Object.keys(seed.contacts).join("|")}>`);
  const config = { sequenceId: seed.sequenceId, contactIds: [Number(id)], listId: seed.listId };
  const res = await write("sequences.add", config, () => client().sequences.add(config, `conductor-demo-enroll-${key}-${Date.now()}`));
  if (mode() === "live") console.log(res ? `✓ ${key} (${id}) enrolled. Watch the dashboard: Conductor should hold them within ~10s.` : "✗ enrollment failed (see error above)");
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : describeError(e)}`);
  process.exit(1);
});
