"use client";

import { useEffect, useState } from "react";

interface Llm {
  contradiction?: { status: "ok"; contradiction: boolean; explanation: string } | { status: "skipped"; reason: string };
  merged?: ({ status: "ok"; message: string } | { status: "skipped"; reason: string }) & { ownerId?: string };
}
interface Item {
  queued: { ref: string; channel: string; senderName: string; snippet: string };
  decision: { decision: string; rule: string; reason: string; instead?: { type: string; ownerId: string }; llm?: Llm };
}

const KIND: Record<string, string> = {
  allow: "text-good border-good/40",
  hold: "text-bad border-bad/40",
  delay: "text-warn border-warn/40",
  reroute: "text-accent border-accent/40",
  escalate: "text-warn border-warn/60",
};

/** What graph8 automations are about to send this buyer, and what Conductor decided. */
export function QueuedNext({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [senders, setSenders] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/queued", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId }) })
      .then((r) => r.json())
      .then((j) => {
        setItems(j.items ?? []);
        setSenders(j.senders ?? {});
      })
      .catch(() => setItems([]));
  }, [contactId]);

  if (items === null) return <div className="rounded-3xl border border-line bg-panel/70 p-6 text-sm text-mute">Preflighting queued touches…</div>;
  if (items.length === 0) return null;

  return (
    <div className="rounded-3xl border border-line bg-panel/70 p-6">
      <div className="mb-4 text-xs uppercase tracking-[0.2em] text-mute">Queued next by graph8 automations</div>
      <ul className="space-y-4">
        {items.map(({ queued: q, decision: d }) => {
          const c = d.llm?.contradiction;
          const m = d.llm?.merged;
          return (
            <li key={q.ref} className="feed-in rounded-2xl border border-line bg-panel-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm"><span className="font-medium">{q.senderName}</span> <span className="text-mute">· {q.channel.replace("_", " ")}</span></span>
                <span className={`rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wider ${KIND[d.decision]}`}>{({ allow: "Allowed", hold: "Held", delay: "Delayed", reroute: "Rerouted", escalate: "Needs owner" } as Record<string, string>)[d.decision] ?? d.decision}</span>
              </div>
              <p className="mt-2 text-[13px] italic leading-snug text-soft">&ldquo;{q.snippet}&rdquo;</p>
              <p className="mt-2 text-[12px] text-mute">{d.reason}.</p>
              {c?.status === "ok" && c.contradiction && <p className="mt-2 text-[12px] text-bad">✦ AI: contradiction. {c.explanation}</p>}
              {c?.status === "ok" && !c.contradiction && <p className="mt-2 text-[12px] text-good">✦ AI: consistent with what the buyer already did.</p>}
              {c?.status === "skipped" && <p className="mt-2 text-[11px] text-mute">✦ AI check off ({c.reason}). The rules decided on their own.</p>}
              {m?.status === "ok" && (
                <div className="mt-3 rounded-xl border border-accent/30 bg-accent/5 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-accent">One voice · from {senders[m.ownerId ?? ""] ?? m.ownerId}</div>
                  <p className="text-[13px] leading-snug text-text">{m.message}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
