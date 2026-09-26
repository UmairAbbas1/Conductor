import { NextResponse } from "next/server";
import { z } from "zod";
import { currentWorld, preflight } from "@/lib/engine.ts";
import { QUEUED } from "@/seed/scenario.ts";

export const dynamic = "force-dynamic";

/** Preflight everything graph8 automations have queued for one buyer (the Mirror's "Queued next" panel). */
export async function POST(req: Request) {
  const parsed = z.object({ contactId: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "contactId required" }, { status: 400 });
  const w = currentWorld();
  const contact = w.contacts.find((c) => c.id === parsed.data.contactId || c.key === parsed.data.contactId);
  if (!contact) return NextResponse.json({ items: [] });
  const queued = QUEUED.filter((q) => q.contact === contact.key);
  const items = await Promise.all(
    queued.map(async (q) => ({
      queued: { ...q, senderName: w.senders.find((s) => s.id === q.sender)?.name ?? q.sender },
      decision: await preflight({ contactId: contact.id, action: "send", channel: q.channel, source: q.source, senderId: q.sender, snippet: q.snippet }),
    })),
  );
  return NextResponse.json({ items, senders: Object.fromEntries(w.senders.map((s) => [s.id, s.name])) });
}
