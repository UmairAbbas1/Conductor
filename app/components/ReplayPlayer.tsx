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
  /** Freeze the playhead at this position (in steps), e.g. ?at=7.5. For screenshots and rehearsal. */
  initialAt?: number;
  autoplay?: boolean;
}

/**
 * Pacing: the replay advances ONE MESSAGE PER BEAT, not by wall-clock time. Real touches cluster
 * (several in an afternoon), so a time-based playhead dumps them all at once. Here every touch gets
 * the same calm beat; the clock label glides between real timestamps.
 */
const BEAT_MS = 1300;
const GHOST_EXIT = 0.8; // a blocked card starts collapsing 80% into its beat

const CH: Record<string, { glyph: string; tint: string }> = {
  email: { glyph: "✉", tint: "#8ea8ff" },
  sms: { glyph: "💬", tint: "#5bd6a0" },
  linkedin: { glyph: "in", tint: "#4f8fe6" },
  call: { glyph: "☎", tint: "#f2b45a" },
  voice_agent: { glyph: "◉", tint: "#c792ea" },
  newsletter: { glyph: "▤", tint: "#9aa3b2" },
  meeting: { glyph: "◷", tint: "#5bd6a0" },
};
const VERB: Record<string, string> = { hold: "Held", delay: "Delayed", reroute: "Rerouted", escalate: "Escalated" };

const dayTime = (ms: number) => new Date(ms).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function Card({ s, senders, ghost, leaving }: { s: Step; senders: Record<string, string>; ghost: boolean; leaving: boolean }) {
  const ch = CH[s.touch.channel] ?? CH.email;
  const at = new Date(s.touch.timestamp).getTime();
  // Wrapper handles the smooth exit (height + fade); the card itself fades in once on mount.
  return (
    <div className="grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out" style={{ gridTemplateRows: leaving ? "0fr" : "1fr", opacity: leaving ? 0 : 1, marginBottom: leaving ? -10 : 0 }}>
      <div className="overflow-hidden">
        {s.inbound ? (
          <div className="feed-in flex justify-end pb-0.5">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-good/20 px-3.5 py-2 ring-1 ring-good/40">
              <div className="text-[10px] font-medium uppercase tracking-wider text-good">You · {dayTime(at)}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-text">{s.touch.snippet}</div>
            </div>
          </div>
        ) : (
          <div className={`feed-in rounded-2xl px-3 py-2.5 ring-1 ${ghost ? "bg-bad/15 ring-bad/60" : "bg-card ring-card-line"}`}>
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold" style={{ background: `${ch.tint}2e`, color: ch.tint }}>{ch.glyph}</span>
              <span className={`min-w-0 flex-1 truncate text-[12.5px] font-medium ${ghost ? "text-bad line-through decoration-bad/70" : "text-text"}`}>{senders[s.touch.senderId] ?? s.touch.senderId}</span>
              <span className="shrink-0 text-[10px] text-mute">{dayTime(at)}</span>
            </div>
            <p className={`mt-1.5 line-clamp-2 text-[12px] leading-snug ${ghost ? "text-soft/70 line-through decoration-bad/50" : "text-soft"}`}>{s.touch.snippet}</p>
            {ghost && s.decision && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bad/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bad">
                ⛔ {VERB[s.decision.decision] ?? s.decision.decision} · {s.decision.rule}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Phone({ title, subtitle, count, tone, cards, now }: {
  title: string;
  subtitle: string;
  count: number;
  tone: string;
  cards: React.ReactNode[];
  now: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [cards.length]);

  return (
    <div className="w-[330px]">
      <div className="mb-3 flex items-end justify-between px-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-mute">{title}</div>
          <div className="text-[12px] text-soft">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl leading-none" style={{ color: tone }}>{count}</div>
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
          <div className="border-b border-line px-5 pb-2.5 pt-3 text-[13px] font-semibold text-text">Inbox</div>
          <div ref={scroller} className="scroll-thin h-[520px] space-y-2.5 overflow-y-auto px-3.5 py-3.5">
            {cards.length === 0 ? <div className="grid h-full place-items-center text-center text-[12px] text-mute">No messages yet</div> : cards}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReplayPlayer({ contactName, steps, before, after, senders, initialAt, autoplay }: Props) {
  const n = steps.length;
  const times = useMemo(() => steps.map((s) => new Date(s.touch.timestamp).getTime()), [steps]);
  const [pos, setPos] = useState(initialAt ?? n); // playhead in steps: 0 = nothing yet, n = whole week
  const [playing, setPlaying] = useState(false);
  const posRef = useRef(pos);

  // The playhead is derived from elapsed wall-clock time since Play, so it never drifts or runs
  // backwards. Animation frames drive it (smooth, synced to the display); a light timer is the
  // backup when frames are throttled (background tab, headless).
  useEffect(() => {
    if (!playing) return;
    const startedAt = performance.now();
    const from = posRef.current;
    let raf = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const next = Math.max(0, Math.min(n, from + (performance.now() - startedAt) / BEAT_MS));
      posRef.current = next;
      setPos(next);
      if (next >= n) {
        stopped = true;
        setPlaying(false);
      }
    };
    const frame = () => {
      tick();
      if (!stopped) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const backup = setInterval(tick, 100);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(backup);
    };
  }, [playing, n]);

  const play = () => {
    if (playing) return setPlaying(false);
    if (posRef.current >= n) {
      posRef.current = 0;
      setPos(0);
    }
    setPlaying(true);
  };
  useEffect(() => {
    if (autoplay) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step i appears when the playhead reaches i (a whole beat to read it before the next).
  const visible = Math.min(n, Math.floor(pos + 0.0001)); // how many steps have arrived
  const frac = pos - Math.floor(pos);
  const cur = visible > 0 ? visible - 1 : -1;
  const clockMs = visible === 0 ? times[0] - 3600_000 : visible >= n ? times[n - 1] : times[cur] + (times[cur + 1] - times[cur]) * frac;
  const sent = steps.slice(0, visible);

  const withoutCards = sent.map((s) => <Card key={s.touch.refId} s={s} senders={senders} ghost={false} leaving={false} />);
  const withCards = sent.flatMap((s, i) => {
    if (s.kept) return [<Card key={s.touch.refId} s={s} senders={senders} ghost={false} leaving={false} />];
    const age = pos - (i + 1); // 0 when it just arrived, 1 when the next beat lands
    if (age >= 1 || (pos >= n && !playing)) return []; // at rest, show only what the buyer received
    return [<Card key={s.touch.refId} s={s} senders={senders} ghost leaving={age > GHOST_EXIT} />];
  });

  const now = cur >= 0 ? steps[cur] : null;
  const blocked = sent.filter((s) => !s.kept);
  const lastBlock = blocked.at(-1);
  const outbound = (xs: Step[]) => xs.filter((s) => !s.inbound).length;
  const done = pos >= n;

  return (
    <div className="space-y-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-6 rounded-3xl border border-line bg-panel/70 px-6 py-5">
        <button
          onClick={play}
          className="w-40 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-ink shadow-[0_0_30px_-8px_var(--color-accent)] transition hover:brightness-110"
        >
          {playing ? "❚❚ Pause" : done ? "▶ Play the week" : pos > 0 ? "▶ Resume" : "▶ Play"}
        </button>
        <div className="min-w-[280px] flex-1">
          <div className="relative h-2 rounded-full bg-line">
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(pos / n) * 100}%` }} />
            {steps.map((s, i) => (
              <span
                key={s.touch.refId}
                title={`${dayTime(times[i])} · ${senders[s.touch.senderId] ?? ""}`}
                className="absolute top-1/2 h-3.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-300"
                style={{ left: `${((i + 1) / n) * 100}%`, background: s.inbound ? "var(--color-good)" : s.kept ? "var(--color-soft)" : "var(--color-bad)", opacity: i < visible ? 1 : 0.3 }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] uppercase tracking-wider text-mute">
            <span>{dayTime(times[0])}</span>
            <span>{dayTime(times[n - 1])}</span>
          </div>
        </div>
        <div className="w-32 text-right font-mono text-sm text-text">{dayTime(clockMs)}</div>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-8">
        <Phone title="Without Conductor" subtitle={`What ${contactName} actually got`} count={outbound(sent)} tone="var(--color-bad)" cards={withoutCards} now={clockMs} />
        <Phone title="With Conductor" subtitle="Every touch preflighted" count={outbound(sent.filter((s) => s.kept))} tone="var(--color-good)" cards={withCards} now={clockMs} />

        {/* Live verdict */}
        <div className="w-[300px] space-y-5 pt-2">
          <div className="rounded-3xl border border-line bg-panel/70 p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-mute">Harmony score, live</div>
            <div className="mt-3 flex items-start justify-around">
              <ScoreDial score={now ? now.scoreWithout : 100} size={120} label="without" />
              <ScoreDial score={now ? now.scoreWith : 100} size={120} label="with" />
            </div>
          </div>

          <div className="min-h-[132px] rounded-3xl border border-line bg-panel/70 p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-mute">Conductor, right now</div>
            {now && !now.kept && now.decision ? (
              <div key={now.touch.refId} className="feed-in mt-3">
                <span className="rounded-full bg-bad/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-bad">
                  ⛔ {VERB[now.decision.decision] ?? now.decision.decision} · {now.decision.rule}
                </span>
                <p className="mt-2 text-[13px] leading-snug text-soft">
                  <span className="text-text">{senders[now.touch.senderId] ?? now.touch.senderId}:</span> {now.decision.reason}.
                </p>
              </div>
            ) : now ? (
              <div key={now.touch.refId} className="feed-in mt-3">
                <span className="rounded-full bg-good/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-good">✓ {now.inbound ? "Buyer action" : "Delivered"}</span>
                <p className="mt-2 text-[13px] leading-snug text-soft">
                  <span className="text-text">{senders[now.touch.senderId] ?? now.touch.senderId}:</span> {now.inbound ? "always gets through, and changes what everyone else may send." : "no conflict, sent as planned."}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-mute">Press play to watch the week, one message at a time.</p>
            )}
          </div>

          <div className="rounded-3xl border border-line bg-panel/70 p-5">
            <p className="font-display text-3xl leading-snug text-text">
              {before.touches} <span className="text-mute">→</span> <span className="text-good">{after.touches}</span> <span className="text-xl text-soft">touches</span>
            </p>
            <p className="mt-2 text-[13px] leading-snug text-mute">
              {blocked.length} of {outbound(sent)} blocked so far. {contactName}&apos;s own actions and the owner&apos;s messages always get through.
            </p>
            {lastBlock && done && <p className="mt-2 text-[12px] text-good">Score {before.score} → {after.score}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
