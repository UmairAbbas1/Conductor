import Link from "next/link";
import { notFound } from "next/navigation";
import { findContact } from "@/lib/world.ts";
import { currentWorld, ensureScanned } from "@/lib/engine.ts";
import { state } from "@/lib/store.ts";
import { buildMirror, type MirrorItem } from "@/lib/mirror.ts";
import { CONFIG } from "@/lib/config.ts";
import { ScoreDial, scoreColor } from "@/app/components/ScoreDial.tsx";
import { QueuedNext } from "@/app/components/QueuedNext.tsx";
import { ScrollToAnchor } from "@/app/components/ScrollToAnchor.tsx";

export const dynamic = "force-dynamic";

const RULE_NAMES: Record<string, string> = {
  R1: "Ignored a booked meeting or reply",
  R2: "Cold outreach during an open deal",
  R3: "Channel stacking (3+ in 24h)",
  R4: `Over the ${CONFIG.R4.maxTouches}-touch weekly budget`,
  R5: "Sender collision (2+ in 48h)",
};
const RULE_SHORT: Record<string, string> = { R1: "Ignored booking", R2: "Open deal", R3: "Channel stacking", R4: "Over budget", R5: "Sender collision" };
const KIND: Record<string, { label: string; cls: string }> = {
  allow: { label: "Allowed", cls: "bg-good/15 text-good" },
  hold: { label: "Held", cls: "bg-bad/15 text-bad" },
  delay: { label: "Delayed", cls: "bg-warn/15 text-warn" },
  reroute: { label: "Rerouted", cls: "bg-accent/15 text-accent" },
  escalate: { label: "Needs owner", cls: "bg-warn/20 text-warn" },
};

const CHANNEL: Record<string, { label: string; glyph: string; tint: string }> = {
  email: { label: "Email", glyph: "✉", tint: "#8ea8ff" },
  sms: { label: "SMS", glyph: "💬", tint: "#5bd6a0" },
  linkedin: { label: "LinkedIn", glyph: "in", tint: "#4f8fe6" },
  call: { label: "Phone", glyph: "☎", tint: "#f2b45a" },
  voice_agent: { label: "AI voice call", glyph: "◉", tint: "#c792ea" },
  newsletter: { label: "Newsletter", glyph: "▤", tint: "#9aa3b2" },
  meeting: { label: "Calendar", glyph: "◷", tint: "#5bd6a0" },
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long" });

function Item({ item, anchor }: { item: MirrorItem; anchor?: boolean }) {
  const ch = CHANNEL[item.touch.channel];
  if (item.inbound) {
    return (
      <div id={anchor ? "mirror-anchor" : undefined} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-good/20 px-3.5 py-2.5 ring-1 ring-good/40">
          <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-good">You · {ch.label} · {fmtTime(item.touch.timestamp)}</div>
          <div className="text-[13px] text-text">{item.touch.snippet}</div>
        </div>
      </div>
    );
  }
  const bad = item.contradiction;
  const rules = [...new Set(item.violations.map((v) => v.rule))];
  return (
    <div className={`rounded-2xl px-3.5 py-3 ring-1 ${bad ? "bg-bad/10 ring-bad/70 shadow-[0_0_24px_-10px_var(--color-bad)]" : "bg-card ring-card-line"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold" style={{ background: `${ch.tint}2e`, color: ch.tint }}>
          {ch.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-text">{item.senderName}</span>
            <span className="shrink-0 text-[10px] text-mute">{fmtTime(item.touch.timestamp)}</span>
          </div>
          <div className="text-[10px] text-mute">{ch.label} · {item.senderRole}</div>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-soft">{item.touch.snippet}</p>
      {bad && <div className="mt-2 text-[11.5px] font-medium text-bad">⚠ Contradiction: {lowerFirst(item.violations.find((v) => v.rule === "R1")!.reason)}</div>}
      {rules.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {rules.map((r) => (
            <span key={r} title={RULE_NAMES[r]} className="rounded-full bg-ink/70 px-2 py-0.5 text-[9.5px] text-mute ring-1 ring-line">{RULE_SHORT[r]}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ value, label, bad }: { value: number; label: string; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-ink/50 px-4 py-3">
      <div className={`font-display text-[36px] leading-none ${bad && value > 0 ? "text-bad" : "text-text"}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.04em] text-mute">{label}</div>
    </div>
  );
}

export default async function MirrorPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  await ensureScanned(); // serverless: this instance may not have scanned yet
  const world = currentWorld();
  const contact = findContact(world, decodeURIComponent(contactId));
  if (!contact) notFound();
  const m = buildMirror(world, contact.id)!;
  const first = contact.name.split(" ")[0];

  const days: { day: string; items: MirrorItem[] }[] = [];
  for (const it of m.items) {
    const day = fmtDay(it.touch.timestamp);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(it);
  }
  const engaged = m.items.find((i) => i.inbound);
  const verdict = engaged
    ? `${first} ${engaged.touch.channel === "meeting" ? "booked a meeting" : "replied"} on ${weekday(engaged.touch.timestamp)}. After that, ${m.summary.contradictions} automated touch${m.summary.contradictions === 1 ? "" : "es"} acted as if nothing had happened.`
    : m.summary.touches > 0
      ? `${m.summary.senders} different senders reached ${first} across ${m.summary.channels} channels this week.`
      : `Quiet week: graph8 has not contacted ${first}.`;
  const colleagues = world.contacts.filter((c) => c.companyId === contact.companyId && c.id !== contact.id);
  const did = state().decisions.filter((d) => d.contactId === contact.id && d.decision !== "allow");
  const senders = Object.fromEntries(world.senders.map((s) => [s.id, `${s.name} (${s.role})`]));

  return (
    <div className="grid gap-10 pt-2 lg:grid-cols-[400px_1fr]">
      {/* The buyer's phone */}
      <div className="mx-auto w-[380px] lg:sticky lg:top-6 lg:self-start">
        <div className="relative rounded-[52px] border border-line bg-black p-3 shadow-[0_40px_120px_-40px_rgba(142,168,255,0.35)]">
          <div className="absolute left-1/2 top-5 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-black" />
          <div className="h-[760px] overflow-hidden rounded-[42px] bg-ink">
            <div className="flex items-center justify-between px-7 pb-2 pt-4 text-[11px] font-medium text-soft">
              <span>9:41</span>
              <span>●●● ▮</span>
            </div>
            <div className="border-b border-line px-5 pb-3 pt-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-mute">{first}&apos;s week</div>
              <div className="mt-0.5 text-lg font-semibold text-text">Everything graph8 sent me</div>
            </div>
            <div id="mirror-scroll" className="scroll-thin h-[640px] space-y-4 overflow-y-auto px-4 py-4">
              {days.map((d) => (
                <section key={d.day} className="space-y-2.5">
                  <div className="sticky top-0 z-[1] -mx-4 bg-ink/90 px-4 py-1 text-center text-[10px] uppercase tracking-[0.18em] text-mute backdrop-blur">{d.day}</div>
                  {d.items.map((it) => <Item key={it.touch.refId} item={it} anchor={it === engaged} />)}
                </section>
              ))}
              {days.length === 0 && <p className="pt-20 text-center text-sm text-mute">No touches in the last 7 days.</p>}
            </div>
          </div>
        </div>
        <ScrollToAnchor container="mirror-scroll" anchor="mirror-anchor" />
      </div>

      {/* The verdict */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-mute">Buyer Mirror · what the buyer experienced</div>
            <h1 className="mt-2 font-display text-[52px] leading-none">{contact.name}</h1>
            <div className="mt-2 text-soft">{contact.title} · {m.company?.name}</div>
          </div>
          <Link href={`/replay?contact=${contact.id}`} className="rounded-full border border-accent/50 px-4 py-2 text-sm text-accent transition hover:bg-accent/10">
            ▶ Replay this week with Conductor
          </Link>
        </div>

        <div className="rounded-3xl border border-line bg-panel/70 p-6">
          <div className="flex flex-wrap items-center gap-8">
            <ScoreDial score={m.score} size={200} />
            <div className="min-w-[260px] flex-1 space-y-4">
              <p className="text-[17px] leading-snug text-text">{verdict}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric value={m.summary.touches} label="touches" />
                <Metric value={m.summary.senders} label="senders" />
                <Metric value={m.summary.channels} label="channels" />
                <Metric value={m.summary.contradictions} label="contradictions" bad />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-line bg-panel/70 p-6">
            <div className="mb-4 text-[11px] uppercase tracking-[0.2em] text-mute">Why the score is {m.score}</div>
            <ul className="space-y-3">
              {Object.entries(m.deductions).map(([rule, pts]) => {
                const cap = CONFIG.penalties[rule as keyof typeof CONFIG.penalties].cap;
                return (
                  <li key={rule}>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-soft">{RULE_NAMES[rule]}</span>
                      <span className={`font-mono ${pts ? "text-bad" : "text-mute"}`}>{pts ? `−${pts}` : "0"}</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                      <div className="h-full rounded-full bg-bad/80" style={{ width: `${(pts / cap) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[11.5px] text-mute">Starts at 100. Fixed penalty per violation in the last 7 days, capped per rule. Same input, same score, every time.</p>
          </div>

          <div className="rounded-3xl border border-line bg-panel/70 p-6">
            <div className="mb-4 text-[11px] uppercase tracking-[0.2em] text-mute">What Conductor did</div>
            {did.length === 0 ? (
              <p className="text-[13px] text-mute">Nothing needed. {first} hears one voice.</p>
            ) : (
              <ul className="space-y-3">
                {did.slice(0, 5).map((d) => {
                  const k = KIND[d.decision] ?? KIND.hold;
                  const inGraph8 = d.writeback.some((w) => w.ok && w.mode === "live" && w.op !== "skip") || d.writeback.some((w) => w.op === "skip" && (w.args as { note?: string })?.note);
                  return (
                    <li key={d.id} className="rounded-2xl border border-line bg-ink/50 p-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${k.cls}`}>{k.label}</span>
                        <span className="truncate text-[12.5px] text-text">{d.subject ?? RULE_SHORT[d.rule] ?? d.rule}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-snug text-soft">{d.reason}.</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
                        {d.instead && <span className="text-soft">→ {senders[d.instead.ownerId] ?? d.instead.ownerId}</span>}
                        {inGraph8 && <span className="text-good">✓ note on the record in graph8</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <QueuedNext contactId={contact.id} />

        {colleagues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-mute">
            <span>Colleagues at {m.company?.name}:</span>
            {colleagues.map((c) => (
              <Link key={c.id} className="rounded-full border border-line px-3 py-1 text-soft transition hover:border-accent/50 hover:text-text" href={`/mirror/${c.id}`}>
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
