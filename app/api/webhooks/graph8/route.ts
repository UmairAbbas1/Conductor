import { NextResponse } from "next/server";
import { constructEvent } from "@graph8/sdk";
import { handleEvent, textOf } from "@/lib/intake.ts";

export const dynamic = "force-dynamic";

/**
 * graph8 webhook receiver. Deliveries are signed: HMAC-SHA256 over `${timestamp}.${rawBody}`,
 * headers X-Studio-Signature / X-Studio-Timestamp, verified by the SDK's constructEvent
 * (see CAPABILITIES.md). Unsigned or badly signed deliveries are rejected.
 */
export async function POST(req: Request) {
  const secret = process.env.G8_WEBHOOK_SECRET;
  const signature = req.headers.get("x-studio-signature");
  const timestamp = req.headers.get("x-studio-timestamp");
  const raw = await req.text();
  if (!signature || !timestamp) return NextResponse.json({ error: "unsigned delivery rejected" }, { status: 401 });
  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });

  let event: ReturnType<typeof constructEvent>;
  try {
    event = constructEvent(raw, signature, timestamp, secret, { toleranceSeconds: 300 });
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const e = event as unknown as { id?: string; event: string; timestamp?: string; data?: Record<string, any> };
  const data = e.data ?? {};
  const contactId = data.contact_id ?? data.contact?.id;
  if (!contactId) return NextResponse.json({ ok: true, ignored: "no contact" });

  const decisions = await handleEvent(
    {
      id: e.id ?? req.headers.get("x-studio-delivery-id") ?? `${e.event}-${contactId}-${e.timestamp}`,
      name: e.event,
      occurredAt: e.timestamp ?? new Date().toISOString(),
      contactId: String(contactId),
      sequenceId: data.sequence_id ?? data.sequence?.id ?? null,
      sequenceName: data.sequence_name ?? data.sequence?.name ?? null,
      actorEmail: data.actor_email ?? data.sender_email ?? data.user_email ?? null,
      text: textOf(data.message ?? data),
    },
    "event",
  );
  return NextResponse.json({ ok: true, decisions: decisions.map((d) => d.id) });
}
