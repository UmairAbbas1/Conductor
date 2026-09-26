import { ingestEnrollment, ingestTouch, currentWorld } from "./engine.ts";
import { normalizeEvent } from "./ledger.ts";
import { readSeedState } from "./world.ts";
import { SCENARIO } from "../seed/scenario.ts";
import type { DecisionOrigin, StoredDecision } from "./store.ts";

/** One graph8 event, from a webhook, the org event feed, or the demo simulator. */
export interface IncomingEvent {
  id: string;
  name: string; // verified graph8 event name (see lib/ledger.ts EVENT_MAP)
  occurredAt: string;
  contactId: string;
  sequenceId?: string | null;
  sequenceName?: string | null;
  actorEmail?: string | null;
  text?: string | null;
}

/** Map a graph8 actor email or sequence to one of our senders. */
function senderFor(e: IncomingEvent): string | undefined {
  const seed = readSeedState();
  if (e.actorEmail && seed) {
    const hit = Object.entries(seed.members).find(([k, v]) => k.endsWith(":email") && v?.toLowerCase() === e.actorEmail!.toLowerCase());
    if (hit) return hit[0].replace(":email", "");
  }
  if (e.sequenceId && (e.sequenceId === seed?.sequenceId || e.sequenceId === SCENARIO.sequence.key)) return SCENARIO.sequence.owner;
  return e.actorEmail ?? undefined;
}

/** The single entry point for everything that happens in graph8. */
export async function handleEvent(e: IncomingEvent, origin: DecisionOrigin): Promise<StoredDecision[]> {
  const w = currentWorld();
  const contact = w.contacts.find((c) => c.id === e.contactId || c.key === e.contactId);
  if (!contact) return []; // not a contact Conductor coordinates

  if (e.name === "sequence.contact_enrolled") {
    const d = await ingestEnrollment(
      {
        contactId: contact.id,
        sequenceId: e.sequenceId ?? "unknown",
        sequenceName: e.sequenceName ?? "Sequence",
        ownerId: senderFor(e) ?? "sequence",
        cold: !/nurture/i.test(e.sequenceName ?? ""),
        state: "active",
      },
      origin,
    );
    return d ? [d] : [];
  }

  const touch = normalizeEvent({
    id: e.id,
    name: e.name,
    contactId: contact.id,
    companyId: contact.companyId,
    occurredAt: e.occurredAt,
    senderId: senderFor(e),
    message: e.text,
  });
  return touch ? ingestTouch(touch, origin) : [];
}

/** Pull a human-readable line out of an event's free-form message/data object. */
export function textOf(msg: unknown): string | null {
  if (!msg) return null;
  if (typeof msg === "string") return msg;
  const m = msg as Record<string, unknown>;
  for (const k of ["subject", "snippet", "body", "text", "summary", "title", "message"]) if (typeof m[k] === "string") return m[k] as string;
  return null;
}
