/**
 * npm run seed — idempotently create the Acme scenario in the graph8 demo workspace.
 * Every record is attached to the "conductor-demo" list (our tag). Re-running finds and reuses
 * existing records instead of duplicating them. CONDUCTOR_MODE=dry (default) only logs writes.
 * Only SDK methods listed in CAPABILITIES.md are used.
 */
import fs from "node:fs";
import dotenv from "dotenv";
import { SCENARIO, DEMO_TAG } from "./scenario.ts";
import { client, write, mode, describeError } from "../lib/graph8.ts";
import { DATA_DIR, SEED_STATE_FILE, readSeedState, type SeedState } from "../lib/world.ts";

dotenv.config({ path: ".env.local", quiet: true });

const FIELDS = ["harmony_score", "touch_budget_remaining", "conductor_hold"];
const emailOf = (c: (typeof SCENARIO.contacts)[number]) =>
  `${c.first}.${c.last}@${SCENARIO.companies.find((co) => co.key === c.company)!.domain}`.toLowerCase();
/** graph8 create calls return `{ data: record }`; list calls return `{ data: [...] }`. */
const one = (r: unknown): any => (r as any)?.data && !Array.isArray((r as any).data) ? (r as any).data : r;
const rows = (r: unknown): any[] => {
  const x = r as any;
  return Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : Array.isArray(x?.data?.items) ? x.data.items : Array.isArray(x?.items) ? x.items : [];
};

async function main() {
  const g8 = client();
  console.log(`Seeding "${DEMO_TAG}" scenario — mode: ${mode()}`);
  const prev = readSeedState();
  const state: SeedState = {
    mode: mode(),
    seededAt: new Date().toISOString(),
    companies: {}, contacts: {}, deals: {}, members: {}, fields: {},
  };

  // 0. Probe auth once; stop cleanly instead of failing 20 times.
  try {
    await g8.lists.list(1, 100);
  } catch (e) {
    throw new Error(`graph8 read failed (${describeError(e)}). Check G8_API_KEY in .env.local.`);
  }

  // 1. The tag list.
  const lists = rows(await g8.lists.list(1, 100));
  let list = lists.find((l) => l.title === DEMO_TAG);
  if (!list) list = one(await write("lists.create", { title: DEMO_TAG }, () => g8.lists.create(DEMO_TAG, "contacts")));
  state.listId = list?.id ?? prev?.listId;
  console.log(`✓ list ${DEMO_TAG} → ${state.listId ?? "(dry)"}`);

  // 2. Team members → Ali (AE) / Bilal (SDR). Fall back to the key's own user if not found.
  const members = rows(await g8.api.teamMembers.listTeamMembers({ query: { limit: 100 } } as any));
  const nameOf = (m: any) => `${m.name ?? ""} ${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase();
  const fallback = members[0];
  for (const s of SCENARIO.senders) {
    const m = members.find((x) => new RegExp(`\\b${s.key}\\b`).test(nameOf(x))) ?? (s.role === "AE" || s.role === "SDR" ? fallback : undefined);
    const id = m?.id ?? m?.user_id;
    if (id) state.members[s.key] = String(id);
    if (m) state.members[`${s.key}:email`] = m.email;
  }
  console.log(`✓ members: ${members.length} found; ali → ${state.members.ali ?? "?"}, bilal → ${state.members.bilal ?? "?"}`);

  // 3. Companies (find by domain, else create).
  for (const c of SCENARIO.companies) {
    const found = rows(await g8.companies.list({ domain: c.domain })).find((x) => x.domain === c.domain);
    const co = found ?? one(await write("companies.create", { domain: c.domain, name: c.name }, () => g8.companies.create({ domain: c.domain, name: c.name })));
    if (co?.id) state.companies[c.key] = String(co.id);
  }
  console.log(`✓ companies: ${JSON.stringify(state.companies)}`);

  // 4. Contacts (find by email, else create), all added to the tag list.
  for (const c of SCENARIO.contacts) {
    const email = emailOf(c);
    const found = rows(await g8.contacts.list({ email })).find((x) => x.work_email?.toLowerCase() === email);
    const params = { work_email: email, first_name: c.first, last_name: c.last, job_title: c.title, company_domain: SCENARIO.companies.find((co) => co.key === c.company)!.domain, list_id: state.listId };
    const contact = found ?? one(await write("contacts.create", params, () => g8.contacts.create(params, `conductor-demo-${c.key}`)));
    if (contact?.id) {
      state.contacts[c.key] = String(contact.id);
      if (found && state.listId) await write("lists.addContacts", { listId: state.listId, ids: [contact.id] }, () => g8.lists.addContacts(state.listId!, [contact.id]));
    }
  }
  console.log(`✓ contacts: ${JSON.stringify(state.contacts)}`);

  // 5. Deals (find on the company by name, else create).
  for (const d of SCENARIO.deals) {
    const companyId = state.companies[d.company];
    const contactId = state.contacts[d.contact];
    const existing = companyId ? rows(await g8.deals.forCompany(Number(companyId))).find((x) => x.name === d.name) : undefined;
    const owner = state.members[d.owner];
    const params = { name: d.name, owner_id: owner ?? "", contact_ids: contactId ? [Number(contactId)] : [], amount: d.amount, currency: "USD" }; // company is derived from the contact
    const deal = existing ?? (owner && params.contact_ids.length ? one(await write("deals.create", params, () => g8.deals.create(params))) : null);
    const dealId = deal?.id ?? deal?.deal_id; // lookups return deal_id, creates return id
    if (dealId) state.deals[d.key] = String(dealId);
  }
  console.log(`✓ deals: ${JSON.stringify(state.deals)}`);

  // 6. Custom fields (text only — see CAPABILITIES.md).
  const fields = rows(await g8.fields.listContactFields());
  for (const title of FIELDS) {
    const f = fields.find((x) => x.title === title || x.name === title) ?? one(await write("fields.create", { title }, () => g8.fields.create({ title, entity: "contacts", data_type: "text" })));
    if (f?.id) state.fields[title] = Number(f.id);
  }
  console.log(`✓ fields: ${JSON.stringify(state.fields)}`);

  // 7. Bilal's cold sequence — created as a DRAFT and never run, so nothing is ever sent.
  const seqs = rows(await g8.sequences.list());
  const seq = seqs.find((s) => s.name === SCENARIO.sequence.name);
  const ownerEmail = state.members["bilal:email"];
  const seqParams = {
    name: SCENARIO.sequence.name,
    user_email: ownerEmail ?? "",
    description: `${DEMO_TAG}: demo sequence, never launched`,
    finish_on_reply: true,
    associated_list_id: state.listId,
    steps: [
      { step_order: 1, step_type: "EMAIL", input_type: "MANUAL_TEMPLATE", time_interval: 0, step_data: { subject: "Quick question about {{company_name}}'s ops stack", body: "Hi {{first_name}}, …" } },
      { step_order: 2, step_type: "EMAIL", input_type: "MANUAL_TEMPLATE", time_interval: 259200, step_data: { subject: "Re: quick question", body: "Bumping this. Still evaluating for October?" } },
    ],
  };
  const created = seq ?? (ownerEmail ? one(await write("sequences.create", seqParams, () => g8.sequences.create(seqParams, "conductor-demo-sequence"))) : null);
  state.sequenceId = created?.id ?? undefined;
  console.log(`✓ sequence: ${state.sequenceId ?? "(dry)"} ${seq ? `(existing, status ${seq.status})` : ""}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEED_STATE_FILE, JSON.stringify(state, null, 2));
  console.log(`\nWrote ${SEED_STATE_FILE}. Mirror: /mirror/${state.contacts.sarah ?? "sarah"}`);
}

main().catch((e) => {
  console.error(`✗ seed failed: ${e instanceof Error ? e.message : describeError(e)}`);
  process.exit(1);
});
