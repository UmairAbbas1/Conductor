"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ScoreDial } from "./ScoreDial.tsx";

interface Step {
  touch: { refId: string; channel: string; senderId: string; timestamp: string; snippet: string };
  inbound: boolean;
  kept: boolean;
  decision: { rule: string; decision: string; reason: string } | null;
  scoreWithout: number;
  scoreWith: number;
}

interface Props {
  contactName: string;
  steps: Step[];
  before: { touches: number; score: number };
  after: { touches: number; score: number };
  senders: Record<string, string>;
}

const DURATION_MS = 16_000; // the whole week plays in 16 seconds
const GHOST_MS = 9 * 3600_000; // a blocked touch stays visible for 9 simulated hours, then collapses

const CH: Record<string, { glyph: string; tint: string; label: string }> = {
  email: { glyph: "✉", tint: "#8ea8ff", label: "Email" },
  sms: { glyph: "💬", tint: "#5bd6a0", label: "SMS" },
  linkedin: { glyph: "in", tint: "#4f8fe6", label: "LinkedIn" },
  call: { glyph: "☎", tint: "#f2b45a", label: "Call" },
  voice_agent: { glyph: "◉", tint: "#c792ea", label: "AI call" },
  newsletter: { glyph: "▤", tint: "#9aa3b2", label: "Newsletter" },
  meeting: { glyph: "◷", tint: "#5bd6a0", label: "Calendar" },
};
const VERB: Record<string, string> = { hold: "Held", delay: "Delayed", reroute: "Rerouted", escalate: "Escalated" };

const dayTime = (iso: string | number) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function Card({ s, senders, ghost, fresh }: { s: Step; senders: Record<string, string>; ghost: boolean; fresh: boolean }) {
  const ch = CH[s.touch.channel] ?? CH.email;
  const anim = fresh ? "feed-in " : "";
  if (s.inbound)
    return (
      <div className={`${anim}flex justify-end`}>
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-good/15 px-3.5 py-2 ring-1 ring-good/35">
          <div className="text-[10px] uppercase tracking-wider text-good/80">You · {dayTime(s.touch.timestamp)}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-good">{s.touch.snippet}</div>
        </div>
      </div>
    );
  return (
    <div className={`${anim}rounded-2xl px-3 py-2.5 ring-1 transition-colors duration-300 ${ghost ? "bg-bad/15 ring-bad/60" : "bg-card ring-card-line"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold" style={{ background: `${ch.tint}26`, color: ch.tint }}>{ch.glyph}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[12.5px] font-medium ${ghost ? "text-bad line-through decoration-bad/70" : "text-text"}`}>{senders[s.touch.senderId] ?? s.touch.senderId}</span>
            <span className="shrink-0 text-[10px] text-mute">{dayTime(s.touch.timestamp)}</span>
          </div>
        </div>
      </div>
      <p className={`mt-1.5 line-clamp-2 text-[12px] leading-snug ${ghost ? "text-mute line-through decoration-bad/50" : "text-soft"}`}>{s.touch.snippet}</p>
      {ghost && s.decision && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bad">
          ⛔ {VERB[s.decision.decision] ?? s.decision.decision} · {s.decision.rule}
        </div>
      )}
    </div>
  );
}

function Phone({ title, subtitle, count, tone, items, senders, now, ghosts }: {
  title: string;
  subtitle: string;
  count: number;
  tone: string;
  items: Step[];
  senders: Record<string, string>;
  now: number;
  ghosts: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // A card animates in for 420ms after it first appears, then renders fully opaque forever,
  // so no re-render can ever leave it half-faded.
  const firstSeen = useRef<Map<string, number>>(new Map());
  const nowMs = typeof performance === "undefined" ? 0 : performance.now();
  const fresh = new Set<string>();
  for (const s of items) {
    const id = s.touch.refId;
    if (!firstSeen.current.has(id)) firstSeen.current.set(id, nowMs);
    if (nowMs - firstSeen.current.get(id)! < 420) fresh.add(id);
  }
  // Forget cards that left (so they animate again when replayed).
  for (const id of [...firstSeen.current.keys()]) if (!items.some((s) => s.touch.refId === id)) firstSeen.current.delete(id);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items.length]);

  return (
    <div className="w-[330px]">
      <div className="mb-3 flex items-end justify-between px-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-mute">{title}</div>
          <div className="text-[12px] text-soft">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl leading-none transition-colors" style={{ color: tone }}>{count}</div>
          <div className="text-[10px] uppercase tracking-wider text-mute">touches</div>
        </div>
      </div>
      <div className="rounded-[46px] border border-line bg-black p-2.5 shadow-[0_30px_80px_-40px_rgba(142,168,255,0.35)]">
        <div className="relative overflow-hidden rounded-[38px] bg-ink">
          <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-medium text-soft">
            <span>{clock(now)}</span>
            <span>●●● ▮</span>
          </div>
          <div className="border-b border-line px-5 pb-2.5 pt-3 text-[13px] font-semibold">Inbox</div>
          <div ref={scroller} className="scroll-thin h-[520px] space-y-2.5 overflow-y-auto px-3.5 py-3.5">
            {items.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-[12px] text-mute">No messages yet</div>
            ) : (
              items.map((s) => <Card key={s.touch.refId} s={s} senders={senders} ghost={ghosts && !s.kept} fresh={fresh.has(s.touch.refId)} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReplayPlayer({ contactName, steps, before, after, senders }: Props) {
  const times = useMemo(() => steps.map((s) => new Date(s.touch.timestamp).getTime()), [steps]);
  const start = Math.min(...times) - 4 * 3600_000;
  const end = Math.max(...times) + GHOST_MS;
  const [t, setT] = useState(end);
  const [playing, setPlaying] = useState(false);
  const clockRef = useRef(end); // the playhead, advanced once per animation frame

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const frame = (nowMs: number) => {
      const next = Math.min(end, clockRef.current + ((end - start) / DURATION_MS) * (nowMs - last));
      last = nowMs;
      clockRef.current = next;
      setT(next);
      if (next >= end) setPlaying(false);
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, start, end]);

  const toggle = () => {
    if (playing) return setPlaying(false);
    if (clockRef.current >= end) {
      clockRef.current = start;
      setT(start);
    }
    setPlaying(true);
  };

  const idx = times.filter((x) => x <= t).length - 1;
  const current = idx >= 0 ? steps[idx] : null;
  const sent = steps.slice(0, idx + 1);
  const withItems = sent.filter((s, i) => s.kept || t - times[i] < GHOST_MS);
  const blocked = sent.filter((s) => !s.kept);
  const lastBlock = blocked.at(-1);
  const progress = Math.min(1, Math.max(0, (t - start) / (end - start)));
  const outbound = (xs: Step[]) => xs.filter((s) => !s.inbound).length;

  // Day ticks for the scrubber.
  const days: { label: string; at: number }[] = [];
  for (let d = new Date(start); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    const midnight = new Date(d);
    midnight.setHours(0, 0, 0, 0);
    const at = (Math.max(midnight.getTime(), start) - start) / (end - start);
    days.push({ label: midnight.toLocaleDateString("en-US", { weekday: "short" }), at });
  }

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-6 rounded-3xl border border-line bg-panel/70 px-6 py-5">
        <button
          onClick={toggle}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-ink shadow-[0_0_30px_-8px_var(--color-accent)] transition hover:brightness-110"
        >
          {playing ? "❚❚ Pause" : t >= end ? "▶ Play the week" : "▶ Resume"}
        </button>
        <div className="min-w-[280px] flex-1">
          <div className="relative h-2 rounded-full bg-line">
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
            {steps.map((s, i) => (
              <span
                key={s.touch.refId}
                title={`${dayTime(s.touch.timestamp)} · ${senders[s.touch.senderId] ?? ""}`}
                className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full"
                style={{ left: `${((times[i] - start) / (end - start)) * 100}%`, background: s.inbound ? "var(--color-good)" : s.kept ? "var(--color-soft)" : "var(--color-bad)", opacity: times[i] <= t ? 1 : 0.35 }}
              />
            ))}
          </div>
          <div className="relative mt-2 h-4 text-[10px] uppercase tracking-wider text-mute">
            {days.map((d) => (
              <span key={d.label + d.at} className="absolute -translate-x-1/2" style={{ left: `${d.at * 100}%` }}>{d.label}</span>
            ))}
          </div>
        </div>
        <div className="w-28 text-right font-mono text-sm text-soft">{dayTime(Math.min(t, end))}</div>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-8">
        <Phone title="Without Conductor" subtitle={`What ${contactName} actually got`} count={outbound(sent)} tone="var(--color-bad)" items={sent} senders={senders} now={t} ghosts={false} />
        <Phone title="With Conductor" subtitle="Every touch preflighted" count={outbound(sent.filter((s) => s.kept))} tone="var(--color-good)" items={withItems} senders={senders} now={t} ghosts />

        {/* Live verdict */}
        <div className="w-[300px] space-y-6 pt-2">
          <div className="rounded-3xl border border-line bg-panel/70 p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-mute">Harmony score, live</div>
            <div className="mt-3 flex items-start justify-around">
              <ScoreDial score={current ? current.scoreWithout : 100} size={120} label="without" />
              <ScoreDial score={current ? current.scoreWith : 100} size={120} label="with" />
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-panel/70 p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-mute">Conductor, right now</div>
            {lastBlock?.decision ? (
              <div key={lastBlock.touch.refId} className="feed-in mt-3">
                <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bad">
                  {VERB[lastBlock.decision.decision] ?? lastBlock.decision.decision} · {lastBlock.decision.rule}
                </span>
                <p className="mt-2 text-[13px] leading-snug text-soft">
                  <span className="text-text">{senders[lastBlock.touch.senderId] ?? lastBlock.touch.senderId}:</span> {lastBlock.decision.reason}.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-mute">{playing ? "Watching every touch…" : "Press play to watch the week."}</p>
            )}
          </div>

          <div className="rounded-3xl border border-line bg-panel/70 p-5">
            <p className="font-display text-3xl leading-snug">
              {before.touches} <span className="text-mute">→</span> <span className="text-good">{after.touches}</span> <span className="text-xl text-soft">touches</span>
            </p>
            <p className="mt-2 text-[13px] leading-snug text-mute">
              {blocked.length} blocked automatically so far. {contactName}&apos;s own actions and the owner&apos;s messages always get through.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
