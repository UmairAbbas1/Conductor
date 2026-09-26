import fs from "node:fs";
import path from "node:path";
import { SCENARIO, resolveRel } from "../seed/scenario.ts";
import type { Touch, World } from "./types.ts";

/** Written by `npm run seed`: scenario keys → real graph8 ids. */
export interface SeedState {
  mode: "dry" | "live";
  seededAt: string;
  listId?: number;
  sequenceId?: string;
  companies: Record<string, string>;
  contacts: Record<string, string>;
  deals: Record<string, string>;
  /** Sender key → graph8 team member id (for task assignment / deal ownership). */
  members: Record<string, string>;
  /** Custom field title → column id. */
  fields: Record<string, number>;
}

export const DATA_DIR = path.join(process.cwd(), "data");
export const SEED_STATE_FILE = path.join(DATA_DIR, "seed-state.json");

export function readSeedState(): SeedState | null {
  try {
    return JSON.parse(fs.readFileSync(SEED_STATE_FILE, "utf8")) as SeedState;
  } catch {
    return null;
  }
}

/**
 * Build the World from the scenario, using real graph8 ids where the seed created them.
 * `extraTouches` are live events already normalized by the ledger.
 */
export function buildWorld(now: Date = new Date(), state: SeedState | null = readSeedState(), extraTouches: Touch[] = []): World {
  const id = (map: Record<string, string> | undefined, key: string) => map?.[key] ?? key;
  const contactId = (key: string) => id(state?.contacts, key);
  const companyOf = new Map(SCENARIO.contacts.map((c) => [c.key, c.company]));

  const fixture: Touch[] = SCENARIO.touches.map((t) => ({
    contactId: contactId(t.contact),
    companyId: id(state?.companies, companyOf.get(t.contact)!),
    channel: t.channel,
    source: t.source,
    // inbound touches are "sent" by the contact themselves
    senderId: t.sender === t.contact ? contactId(t.contact) : t.sender,
    timestamp: resolveRel(t.when, now),
    snippet: t.snippet,
    refId: `fx-${t.ref}`,
  }));

  return {
    now: now.toISOString(),
    companies: SCENARIO.companies.map((c) => ({ id: id(state?.companies, c.key), key: c.key, name: c.name, domain: c.domain })),
    contacts: SCENARIO.contacts.map((c) => ({
      id: contactId(c.key),
      key: c.key,
      name: `${c.first} ${c.last}`,
      title: c.title,
      companyId: id(state?.companies, c.company),
      email: `${c.first}.${c.last}@${SCENARIO.companies.find((co) => co.key === c.company)!.domain}`.toLowerCase(),
    })),
    senders: SCENARIO.senders.map((s) => ({ id: s.key, name: s.name, role: s.role, memberId: state?.members[s.key] })),
    deals: SCENARIO.deals.map((d) => ({
      id: id(state?.deals, d.key),
      companyId: id(state?.companies, d.company),
      name: d.name,
      amount: d.amount,
      ownerId: d.owner,
      open: true,
      openedAt: resolveRel(d.openedAt, now),
    })),
    touches: [...fixture, ...extraTouches],
  };
}

/** Find a contact by graph8 id or scenario key (so /mirror/sarah also works). */
export function findContact(world: World, idOrKey: string) {
  return world.contacts.find((c) => c.id === idOrKey || c.key === idOrKey);
}
