import { NextResponse } from "next/server";
import { z } from "zod";
import { preflight } from "@/lib/engine.ts";
import { Channel, Source } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

const Body = z.object({
  contactId: z.union([z.string(), z.number()]).transform(String),
  action: z.enum(["enroll", "send"]),
  payload: z.object({
    channel: Channel.default("email"),
    source: Source.default("sequence"),
    senderId: z.string(),
    sequenceId: z.string().optional(),
    snippet: z.string().optional(),
  }),
});

/** POST /api/preflight { contactId, action, payload } → Decision. Any agent can ask before acting. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { contactId, action, payload } = parsed.data;
  return NextResponse.json(await preflight({ contactId, action, ...payload }));
}
