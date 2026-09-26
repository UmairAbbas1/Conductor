"use client";

import { useEffect, useMemo, useState } from "react";
import { ScoreDial } from "./ScoreDial.tsx";

interface Step {
  touch: { refId: string; channel: string; senderId: string; timestamp: string; snippet: string };
  inbound: boolean;
  kept: boolean;
  decision: { rule: string; decision: string; reason: string } | null;
}

interface Props {
  contactName: string;
  steps: Step[];
  before: { touches: number; score: number };
  after: { touches: number; score: number };
  senders: Record<string, string>;
}

const DURATION_MS = 14_000; // the whole week plays in 14 seconds
const GHOST_MS = 10 * 3600_000; // a blocked touch stays visible for 10 simulated hours, then collapses

const CH: Record<string, string> = { email: "✉", sms: "💬", linkedin: "in", call: "☎", voice_agent: "◉", newsletter: "▤", meeting: "◷" };
const fmt = (ms: number) => new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

function Card({ s, senders, ghost }: { s: Step; senders: Record<string, string>; ghost?: boolean }) {
  if (s.inbound)
    return (
      <div className="feed-in flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-good/15 px-3 py-2 text-[12px] text-good ring-1 ring-good/30">{s.touch.snippet}</div>
      </div>
    );
  return (
    <div className={`feed-in rounded-xl px-3 py-2 ring-1 transition-all duration-500 ${ghost ? "bg-bad/5 ring-bad/40" : "bg-panel-2 ring-line"}`}>
      <div className="flex items-center justify-between text-[11px]">
        <span className={ghost ? "text-bad line-through" : "text-text"}>
          <span className="mr-1.5 opacity-70">{CH[s.touch.channel]}</span>
          {senders[s.touch.senderId] ?? s.touch.senderId}
        </span>
        {ghost && s.decision && <span className="rounded-full border border-bad/40 px-1.5 text-[9px] font-semibold uppercase text-bad">{s.decision.decision} {s.decision.rule}</span>}
      </div>
      <p className={`mt-0.5 line-clamp-2 text-[12px] ${ghost ? "text-mute line-through" : "text-soft"}`}>{s.touch.snippet}</p>
    </div>
  );
}

export function ReplayPlayer({ contactName, steps, before, after, senders }: Props) {
  const times = useMemo(() => steps.map((s) => new Date(s.touch.timestamp).getTime()), [steps]);
  const start = Math.min(...times) - 3 * 3600_000;
  const end = Math.max(...times) + GHOST_MS;
  const [t, setT] = useState(end);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const tick = setInterval(() => {
      setT((cur) => {
        const next = cur + ((end - start) / DURATION_MS) * 50;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
    }, 50);
    return () => clearInterval(tick);
  }, [playing, start, end]);

  const play = () => {
    setT(start);
    setPlaying(true);
  };

  const shown = steps.filter((_, i) => times[i] <= t);
  const left = shown;
  const right = steps.filter((s, i) => times[i] <= t && (s.kept || t - times[i] < GHOST_MS));
  const leftCount = left.filter((s) => !s.inbound).length;
  const rightCount = shown.filter((s) => s.kept && !s.inbound).length;
  const blocked = shown.filter((s) => !s.kept).length;
  const done = t >= end;
  const progress = (t - start) / (end - start);

  const Phone = ({ title, items, count, tone, ghosts }: { title: string; items: Step[]; count: number; tone: string; ghosts: boolean }) => (
    <div className="w-[340px]">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <span className="text-xs uppercase tracking-[0.2em] text-mute">{title}</span>
        <span className="font-display text-3xl" style={{ color: tone }}>{count}</span>
      </div>
      <div className="rounded-[44px] border border-line bg-black p-2.5">
        <div className="scroll-thin flex h-[560px] flex-col justify-end gap-2 overflow-hidden rounded-[36px] bg-ink p-4">
          {items.map((s) => <Card key={s.touch.refId} s={s} senders={senders} ghost={ghosts && !s.kept} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-6">
        <button onClick={play} disabled={playing} className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-60">
          {playing ? "Playing…" : "▶ Play the week"}
        </button>
        <div className="min-w-[260px] flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-accent transition-[width] duration-75" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-mute">{fmt(Math.min(t, end))}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-10">
        <Phone title="Without Conductor" items={left} count={leftCount} tone="var(--color-bad)" ghosts={false} />
        <Phone title="With Conductor" items={right} count={rightCount} tone="var(--color-good)" ghosts />
        <div className="w-[260px] space-y-6 pt-8">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-mute">{contactName}&apos;s week</div>
            <p className="mt-2 font-display text-3xl leading-snug">
              {before.touches} touches <span className="text-mute">→</span> {after.touches}
            </p>
            <p className="mt-1 text-sm text-mute">{blocked} held, delayed or rerouted automatically. The buyer&apos;s own actions and the owner&apos;s messages all got through.</p>
          </div>
          <div className="flex items-center gap-4">
            <ScoreDial score={before.score} size={110} label="before" />
            <ScoreDial score={done ? after.score : before.score} size={110} label="after" />
          </div>
        </div>
      </div>
    </div>
  );
}
