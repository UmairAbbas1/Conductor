import { NextResponse } from "next/server";
import { z } from "zod";
import { handleEvent } from "@/lib/intake.ts";
import { currentWorld } from "@/lib/engine.ts";
import { readSeedState } from "@/lib/world.ts";
import { SCENARIO } from "@/seed/scenario.ts";

export const dynamic = "force-dynamic";

/**
 * Last-resort demo fallback: inject a graph8-shaped event through the exact same intake path
 * as webhooks and polling. Decisions made here are labelled "simulate" in the feed.
 */
const Body = z.object({
  kind: z.enum(["meeting.booked", "engagement.email_replied", "sequence.contact_enrolled", "voice_ai.call_completed", "engagement.sms_sent"]),
  contact: z.string(),
});

const TEXT: Record<string, string> = {
  "meeting.booked": "Booked: intro call with Ali, Thursday 11:00",
  "engagement.email_replied": "Thanks. Can we talk next week? Loop in Ali.",
  "voice_ai.call_completed": "Nova: \"Hi, are you still evaluating ops tools for October?\"",
  "engagement.sms_sent": "Quick one: worth 10 minutes this week?",
};

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { kind, contact } = parsed.data;
  const c = currentWorld().contacts.find((x) => x.id === contact || x.key === contact);
  if (!c) return NextResponse.json({ error: "unknown contact" }, { status: 404 });
  const seed = readSeedState();
  const decisions = await handleEvent(
    {
      id: `sim-${kind}-${c.id}-${Date.now()}`,
      name: kind,
      occurredAt: new Date().toISOString(),
      contactId: c.id,
      sequenceId: kind === "sequence.contact_enrolled" || kind === "engagement.sms_sent" ? seed?.sequenceId ?? SCENARIO.sequence.key : null,
      sequenceName: kind === "sequence.contact_enrolled" ? SCENARIO.sequence.name : null,
      actorEmail: kind === "voice_ai.call_completed" ? "nova" : null,
      text: TEXT[kind] ?? null,
    },
    "simulate",
  );
  return NextResponse.json({ ok: true, decisions });
}
