import { NextResponse } from "next/server";
import { currentWorld, ensureScanned, flow, heatmap, stats } from "@/lib/engine.ts";
import { resetState, state } from "@/lib/store.ts";
import { mode } from "@/lib/graph8.ts";
import { readSeedState } from "@/lib/world.ts";
import { maybePoll, pollStatus } from "@/lib/poller.ts";
import { llmEnabled } from "@/lib/llm.ts";

export const dynamic = "force-dynamic";

/** Everything the dashboard needs, in one poll. */
export async function GET() {
  await ensureScanned();
  await maybePoll();
  const w = currentWorld();
  const senders = Object.fromEntries(w.senders.map((s) => [s.id, `${s.name} (${s.role})`]));
  return NextResponse.json({
    mode: mode(),
    seeded: !!readSeedState()?.listId,
    stats: stats(w),
    heatmap: heatmap(w),
    senders,
    decisions: state().decisions.slice(0, 40),
    poll: pollStatus(),
    flow: flow(w),
    llm: llmEnabled(),
  });
}

/** Demo reset: forget decisions, live events and pauses (graph8 records are untouched). */
export async function DELETE() {
  resetState();
  return NextResponse.json({ ok: true });
}
