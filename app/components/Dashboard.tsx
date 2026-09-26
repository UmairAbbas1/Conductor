"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { scoreColor } from "./ScoreDial.tsx";

interface WriteLog { op: string; mode: string; ok: boolean; error?: string }
interface FeedDecision {
  id: string;
  contactId: string;
  contactName: string;
  rule: string;
  decision: string;
  reason: string;
  autonomous: boolean;
  createdAt: string;
  origin: string;
  instead?: { type: string; ownerId: string };
  writeback: WriteLog[];
  llm?: { contradiction?: { status: string; contradiction?: boolean; explanation?: string; reason?: string }; merged?: { status: string; message?: string } };
}
interface Account {
  id: string;
  name: string;
  score: number;
  deal: { name: string; amount: number } | null;
  contacts: { id: string; name: string; title: string; score: number }[];
}
interface ApiState {
  mode: "dry" | "live";
  seeded: boolean;
  stats: { decisions: number; autonomousPct: number; touchesPrevented: number; pipelineProtected: number; pipelineSource: string };
  heatmap: Account[];
  senders: Record<string, string>;
  decisions: FeedDecision[];
  poll: { running: boolean; lastPollAt?: string; error?: string };
}

const SIM_KINDS: [string, string][] = [
  ["meeting.booked", "Books a meeting"],
  ["engagement.email_replied", "Replies"],
  ["sequence.contact_enrolled", "Enrolled in SDR sequence"],
  ["voice_ai.call_completed", "AI voice agent calls"],
  ["engagement.sms_sent", "Gets an SMS"],
];

/** Hidden demo fallback (press "." to toggle): injects graph8-shaped events through the real intake path. */
function Simulator({ contacts }: { contacts: { id: string; name: string }[] }) {
  const [contact, setContact] = useState(contacts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const fire = async (kind: string) => {
    setBusy(true);
    await fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, contact }) });
    setBusy(false);
  };
  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-2xl border border-line bg-panel p-4 shadow-2xl">
      <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-mute">Simulate graph8 event</div>
      <select value={contact} onChange={(e) => setContact(e.target.value)} className="mb-3 w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm">
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="grid gap-1.5">
        {SIM_KINDS.map(([k, label]) => (
          <button key={k} disabled={busy} onClick={() => fire(k)} className="rounded-lg border border-line px-3 py-1.5 text-left text-sm text-soft hover:bg-panel-2 hover:text-text disabled:opacity-50">
            {label}
          </button>
        ))}
        <button onClick={() => fetch("/api/state", { method: "DELETE" })} className="mt-1 rounded-lg px-3 py-1 text-left text-[11px] text-mute hover:text-bad">
          Reset demo state
        </button>
      </div>
    </div>
  );
}

const KIND: Record<string, string> = {
  allow: "text-good border-good/40",
  hold: "text-bad border-bad/40",
  delay: "text-warn border-warn/40",
  reroute: "text-accent border-accent/40",
  escalate: "text-warn border-warn/60 bg-warn/10",
};

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/70 px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-mute">{label}</div>
      <div className="mt-1 font-display text-4xl">{value}</div>
      {hint && <div className="text-[11px] text-mute">{hint}</div>}
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<ApiState | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [sim, setSim] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(location.search).has("sim")) setSim(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "." && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) setSim((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const next: ApiState = await res.json();
        if (!alive) return;
        const ids = next.decisions.map((d) => d.id);
        if (seen.current) setFresh(new Set(ids.filter((id) => !seen.current!.has(id))));
        seen.current = new Set(ids);
        setData(next);
      } catch {
        /* keep last good state */
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!data) return <div className="pt-24 text-center text-mute">Conductor is reading the ledger…</div>;
  const { stats, heatmap, decisions, senders } = data;

  return (
    <div className="space-y-8 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl">One voice per buyer.</h1>
          <p className="mt-2 max-w-xl text-soft">Every sequence, campaign, dialer, AI agent and rep, coordinated before the buyer feels it.</p>
        </div>
        {!data.seeded && <div className="rounded-full border border-warn/40 px-3 py-1 text-xs text-warn">Scenario only · run npm run seed to connect graph8 records</div>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Decisions made" value={String(stats.decisions)} />
        <Stat label="Autonomous" value={`${stats.autonomousPct}%`} hint="no human needed" />
        <Stat label="Touches prevented" value={String(stats.touchesPrevented)} />
        <Stat label="Pipeline protected" value={`$${stats.pipelineProtected.toLocaleString()}`} hint={`open deals on affected accounts · ${stats.pipelineSource}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
        {/* Heatmap */}
        <section className="rounded-3xl border border-line bg-panel/70 p-6">
          <div className="mb-4 text-xs uppercase tracking-[0.2em] text-mute">Accounts · worst first</div>
          <div className="space-y-3">
            {heatmap.map((a) => (
              <div key={a.id} className="grid grid-cols-[160px_1fr_56px] items-center gap-4">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-[11px] text-mute">{a.deal ? `$${a.deal.amount.toLocaleString()} open` : "no open deal"}</div>
                </div>
                <div className="flex gap-1.5">
                  {a.contacts.map((c) => (
                    <Link
                      key={c.id}
                      href={`/mirror/${c.id}`}
                      title={`${c.name} · ${c.title} · ${c.score}`}
                      className="group relative h-12 flex-1 rounded-xl transition hover:scale-[1.03]"
                      style={{ background: scoreColor(c.score), opacity: 0.25 + (1 - c.score / 100) * 0.65 }}
                    >
                      <span className="absolute inset-x-2 bottom-1 truncate text-[10px] font-medium text-ink/90">{c.name.split(" ")[0]} · {c.score}</span>
                    </Link>
                  ))}
                </div>
                <div className="text-right font-display text-4xl leading-none" style={{ color: scoreColor(a.score) }}>{a.score}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Live decision feed */}
        <section className="rounded-3xl border border-line bg-panel/70 p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-[0.2em] text-mute">Decision feed</span>
            {data.poll.error ? (
              <span className="text-[11px] text-bad" title={data.poll.error}>graph8 polling stopped</span>
            ) : (
              <span className="flex items-center gap-1.5 text-[11px] text-good" title={data.poll.lastPollAt ? `last graph8 poll ${ago(data.poll.lastPollAt)}` : "waiting for seed"}>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
                {data.seeded && data.poll.running ? "live · graph8 every 5s" : "live"}
              </span>
            )}
          </div>
          <ol className="scroll-thin max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {decisions.map((d) => (
              <li key={d.id} className={`rounded-2xl border border-line bg-panel-2 p-4 ${fresh.has(d.id) ? "feed-in ring-1 ring-accent/50" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wider ${KIND[d.decision]}`}>{d.decision}</span>
                    <span className="font-mono text-[11px] text-mute">{d.rule}</span>
                    <Link href={`/mirror/${d.contactId}`} className="text-sm font-medium hover:underline">{d.contactName}</Link>
                  </div>
                  <span className="text-[10px] text-mute">{ago(d.createdAt)}</span>
                </div>
                <p className="mt-2 text-[13px] leading-snug text-soft">{d.reason}</p>
                {d.llm?.contradiction?.status === "ok" && d.llm.contradiction.contradiction && (
                  <p className="mt-1.5 text-[12px] text-bad">✦ LLM: {d.llm.contradiction.explanation}</p>
                )}
                {d.llm?.contradiction?.status === "skipped" && <p className="mt-1.5 text-[11px] text-mute">✦ LLM check skipped ({d.llm.contradiction.reason})</p>}
                {d.llm?.merged?.status === "ok" && <p className="mt-1.5 text-[12px] text-accent">✦ Merged into one message from the owner</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-mute">
                  {d.instead && <span>→ {d.instead.type.replace("_", " ")}: {senders[d.instead.ownerId] ?? d.instead.ownerId}</span>}
                  <span>{d.autonomous ? "autonomous" : "waiting for owner"}</span>
                  <span>via {d.origin}</span>
                  {d.writeback.length > 0 && (
                    <span title={d.writeback.map((w) => `${w.mode}: ${w.op}${w.ok ? "" : ` ✗ ${w.error}`}`).join("\n")}>
                      graph8: {d.writeback.filter((w) => w.op !== "skip").length || "skipped"} {d.writeback[0]?.mode === "dry" && d.writeback[0]?.op !== "skip" ? "(dry)" : ""}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {decisions.length === 0 && <li className="py-10 text-center text-sm text-mute">No conflicts right now.</li>}
          </ol>
        </section>
      </div>
      {sim && <Simulator contacts={heatmap.flatMap((a) => a.contacts)} />}
    </div>
  );
}
