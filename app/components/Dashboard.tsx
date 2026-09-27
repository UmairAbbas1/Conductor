"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { scoreColor } from "./ScoreDial.tsx";

interface WriteLog { op: string; mode: string; ok: boolean; error?: string; args?: Record<string, unknown> }
interface FeedDecision {
  id: string;
  contactId: string;
  contactName: string;
  subject?: string;
  rule: string;
  decision: string;
  reason: string;
  autonomous: boolean;
  createdAt: string;
  origin: string;
  instead?: { type: string; ownerId: string };
  writeback: WriteLog[];
  llm?: { contradiction?: { status: string; contradiction?: boolean; explanation?: string }; merged?: { status: string; message?: string } };
}
interface Account {
  id: string;
  name: string;
  score: number;
  headline: string;
  held: number;
  deal: { name: string; amount: number } | null;
  contacts: { id: string; name: string; title: string; score: number }[];
}
interface Flow {
  touches: number;
  liveEvents: number;
  senders: number;
  decisions: number;
  byKind: Record<string, number>;
  writes: { notes: number; tasks: number; fields: number; pauses: number };
  live: boolean;
}
interface ApiState {
  mode: "dry" | "live";
  seeded: boolean;
  llm: boolean;
  stats: { decisions: number; autonomousPct: number; touchesPrevented: number; pipelineProtected: number; pipelineSource: string };
  heatmap: Account[];
  senders: Record<string, string>;
  decisions: FeedDecision[];
  poll: { running: boolean; lastPollAt?: string; error?: string };
  flow: Flow;
}

const RULES: Record<string, string> = {
  R1: "Buyer engaged",
  R2: "Open deal",
  R3: "Channel stacking",
  R4: "Touch budget",
  R5: "Sender collision",
  none: "No conflict",
};
const KIND: Record<string, { label: string; cls: string }> = {
  allow: { label: "Allowed", cls: "bg-good/15 text-good" },
  hold: { label: "Held", cls: "bg-bad/15 text-bad" },
  delay: { label: "Delayed", cls: "bg-warn/15 text-warn" },
  reroute: { label: "Rerouted", cls: "bg-accent/15 text-accent" },
  escalate: { label: "Needs owner", cls: "bg-warn/20 text-warn" },
};
const ORIGIN: Record<string, string> = { scan: "standing check", event: "live graph8 event", preflight: "preflight", simulate: "simulated event" };

const ago = (iso?: string) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

function writtenSummary(w: WriteLog[]): string | null {
  // A note skipped because graph8 already has it still counts as present on the record.
  const done = w
    .filter((x) => x.ok && (x.op !== "skip" || x.args?.note || x.args?.task))
    .map((x) => (x.op === "skip" ? { ...x, op: x.args?.note ? "notes.create" : "tasks.create" } : x));
  if (!done.length) return null;
  const n = (op: string) => done.filter((x) => x.op === op).length;
  const parts = [
    n("sequences.pauseSequenceContact") && `paused in ${n("sequences.pauseSequenceContact")} sequence${n("sequences.pauseSequenceContact") > 1 ? "s" : ""}`,
    n("contacts.withdrawContactsFromSequences") && "removed from sequence",
    n("notes.create") && "note",
    n("tasks.create") && "task for owner",
    n("fields.setValue") && `${n("fields.setValue")} fields`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${accent ? "border-accent/40 bg-gradient-to-br from-accent/15 to-panel/70" : "border-line bg-panel/70"}`}>
      <div className="font-display text-[46px] leading-none text-text">{value}</div>
      <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-mute">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-accent">{hint}</div>}
    </div>
  );
}

function FlowStep({ n, title, big }: { n: number; title: string; big: string }) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-2xl border border-line bg-panel/70 px-4 py-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-semibold text-accent">{n}</span>
      <span className="text-[11px] uppercase tracking-[0.16em] text-mute">{title}</span>
      <span className="ml-auto text-[14px] font-medium text-text">{big}</span>
    </div>
  );
}

function Arrow() {
  return <div className="hidden shrink-0 items-center text-lg text-mute lg:flex">→</div>;
}

function AccountRow({ a }: { a: Account }) {
  const color = scoreColor(a.score);
  return (
    <div className="rounded-2xl border border-line bg-panel-2/60 p-4 transition hover:border-card-line">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium text-text">{a.name}</span>
            {a.deal && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">${a.deal.amount.toLocaleString()} open deal</span>}
            {a.held > 0 && <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] text-bad">{a.held} held</span>}
          </div>
          <div className="mt-1 text-[12.5px] text-soft">{a.headline}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-[40px] leading-none" style={{ color }}>{a.score}</div>
          <div className="text-[10px] uppercase tracking-wider text-mute">harmony</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {a.contacts.map((c) => (
          <Link key={c.id} href={`/mirror/${c.id}`} className="group rounded-xl border border-line bg-ink/60 px-3 py-2 transition hover:border-accent/50">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12.5px] text-text group-hover:text-accent">{c.name}</span>
              <span className="font-mono text-[12px]" style={{ color: scoreColor(c.score) }}>{c.score}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DecisionCard({ d, senders, fresh }: { d: FeedDecision; senders: Record<string, string>; fresh: boolean }) {
  const kind = KIND[d.decision] ?? KIND.hold;
  const written = writtenSummary(d.writeback);
  const dry = d.writeback.some((w) => w.mode === "dry" && w.op !== "skip");
  const owner = d.instead ? senders[d.instead.ownerId] ?? d.instead.ownerId : null;
  const c = d.llm?.contradiction;
  return (
    <li className={`rounded-2xl border bg-panel-2/70 p-4 ${fresh ? "feed-in border-accent/60 shadow-[0_0_30px_-12px_var(--color-accent)]" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${kind.cls}`}>{kind.label}</span>
          <span className="text-[11px] text-mute" title={RULES[d.rule]}>{d.rule} · {RULES[d.rule]}</span>
        </div>
        <span className="text-[10.5px] text-mute">{ago(d.createdAt)}</span>
      </div>
      <div className="mt-2 text-[14px] text-text">
        <Link href={`/mirror/${d.contactId}`} className="font-medium hover:text-accent">{d.contactName}</Link>
        {d.subject && <span className="text-soft"> · {d.subject}</span>}
      </div>
      <p className="mt-1 line-clamp-1 text-[12.5px] text-soft" title={d.reason}>{d.reason}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
        {owner && <span className="rounded-full bg-ink/70 px-2 py-0.5 text-soft ring-1 ring-line">→ {owner.split(" ")[0]}</span>}
        {written && <span className={`rounded-full px-2 py-0.5 ring-1 ${dry ? "text-warn ring-warn/30" : "text-good ring-good/30"}`} title={written}>{dry ? "◌ dry run" : "✓ in graph8"}</span>}
        {c?.status === "ok" && c.contradiction && <span className="rounded-full px-2 py-0.5 text-bad ring-1 ring-bad/30" title={c.explanation}>✦ AI: contradiction</span>}
        {d.llm?.merged?.status === "ok" && <span className="rounded-full px-2 py-0.5 text-accent ring-1 ring-accent/30">✦ merged</span>}
      </div>
    </li>
  );
}

const SIM_KINDS: [string, string][] = [
  ["meeting.booked", "Books a meeting"],
  ["engagement.email_replied", "Replies"],
  ["sequence.contact_enrolled", "Enrolled in SDR sequence"],
  ["voice_ai.call_completed", "AI voice agent calls"],
  ["engagement.sms_sent", "Gets an SMS"],
];

/** Hidden demo fallback (press "." to toggle): injects graph8-shaped events through the real intake path. */
function Simulator({ contacts, onClose }: { contacts: { id: string; name: string }[]; onClose: () => void }) {
  const [contact, setContact] = useState(contacts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const fire = async (kind: string) => {
    setBusy(true);
    await fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, contact }) });
    setBusy(false);
  };
  return (
    <div className="fixed bottom-5 right-5 z-50 w-80 rounded-2xl border border-line bg-panel p-4 shadow-2xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Simulate graph8 event</span>
        <button onClick={onClose} className="text-mute hover:text-text">×</button>
      </div>
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

  if (!data) {
    return (
      <div className="grid place-items-center pt-40 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        <p className="mt-4 text-sm text-mute">Conductor is reading the ledger…</p>
      </div>
    );
  }
  const { stats, heatmap, decisions, senders, flow } = data;
  const wrote = flow.writes.notes + flow.writes.tasks + flow.writes.fields + flow.writes.pauses;

  return (
    <div className="space-y-6 pt-2">
      {/* Title + system status */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[52px] leading-none">One voice per buyer.</h1>
          <p className="mt-3 text-[15px] text-soft">Every graph8 tool, coordinated before the buyer feels it.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11.5px]">
          {data.poll.error ? (
            <span className="rounded-full border border-bad/40 px-3 py-1 text-bad" title={data.poll.error}>● graph8 sync stopped</span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full border border-good/40 px-3 py-1 text-good">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
              {data.seeded ? `graph8 synced ${ago(data.poll.lastPollAt)}` : "scenario only"}
            </span>
          )}
          <span className={`rounded-full border px-3 py-1 ${data.llm ? "border-accent/40 text-accent" : "border-line text-mute"}`}>
            {data.llm ? "✦ AI checks on" : "✦ AI checks off · rules only"}
          </span>
        </div>
      </div>

      {/* Outcome numbers */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Decisions" value={String(stats.decisions)} />
        <Stat label="Autonomous" value={`${stats.autonomousPct}%`} />
        <Stat label="Touches prevented" value={String(stats.touchesPrevented)} />
        <Stat label="Pipeline protected" value={`$${stats.pipelineProtected.toLocaleString()}`} hint={stats.pipelineSource === "graph8" ? "live from graph8" : undefined} accent />
      </div>

      {/* How it works, live */}
      <div className="flex flex-col gap-2 lg:flex-row">
        <FlowStep n={1} title="Listen" big={`${flow.touches} touches`} />
        <Arrow />
        <FlowStep n={2} title="Decide" big={`${flow.decisions} decisions`} />
        <Arrow />
        <FlowStep n={3} title="Act in graph8" big={`${wrote} actions`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
        {/* Accounts */}
        <section className="rounded-3xl border border-line bg-panel/70 p-5">
          <div className="mb-4 text-[11px] uppercase tracking-[0.2em] text-mute">Accounts</div>
          <div className="space-y-3">
            {heatmap.map((a) => <AccountRow key={a.id} a={a} />)}
          </div>
        </section>

        {/* Live decision feed */}
        <section className="rounded-3xl border border-line bg-panel/70 p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.2em] text-mute">Decision feed</span>
            <span className="flex items-center gap-1.5 text-[11px] text-good"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />live</span>
          </div>
          <ol className="scroll-thin max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {decisions.map((d) => <DecisionCard key={d.id} d={d} senders={senders} fresh={fresh.has(d.id)} />)}
            {decisions.length === 0 && <li className="py-12 text-center text-sm text-mute">All buyers hear one voice right now.</li>}
          </ol>
        </section>
      </div>
      {sim && <Simulator contacts={heatmap.flatMap((a) => a.contacts)} onClose={() => setSim(false)} />}
    </div>
  );
}
