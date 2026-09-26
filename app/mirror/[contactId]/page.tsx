import Link from "next/link";
import { notFound } from "next/navigation";
import { buildWorld, findContact } from "@/lib/world.ts";
import { buildMirror, type MirrorItem } from "@/lib/mirror.ts";
import { CONFIG } from "@/lib/config.ts";
import { ScoreDial } from "@/app/components/ScoreDial.tsx";
import { QueuedNext } from "@/app/components/QueuedNext.tsx";

export const dynamic = "force-dynamic";

const RULE_NAMES: Record<string, string> = {
  R1: "Ignored a booked meeting or reply",
  R2: "Cold outreach during an open deal",
  R3: "Channel stacking (3+ in 24h)",
  R4: `Over the ${CONFIG.R4.maxTouches}-touch weekly budget`,
  R5: "Sender collision (2+ in 48h)",
};

const CHANNEL: Record<string, { label: string; glyph: string; tint: string }> = {
  email: { label: "Email", glyph: "✉", tint: "#8ea8ff" },
  sms: { label: "SMS", glyph: "💬", tint: "#5bd6a0" },
  linkedin: { label: "LinkedIn", glyph: "in", tint: "#4f8fe6" },
  call: { label: "Phone", glyph: "☎", tint: "#f2b45a" },
  voice_agent: { label: "AI voice call", glyph: "◉", tint: "#c792ea" },
  newsletter: { label: "Newsletter", glyph: "▤", tint: "#7d8592" },
  meeting: { label: "Calendar", glyph: "◷", tint: "#5bd6a0" },
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

function Item({ item }: { item: MirrorItem }) {
  const ch = CHANNEL[item.touch.channel];
  if (item.inbound) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-good/15 px-3.5 py-2.5 text-[13px] text-good ring-1 ring-good/30">
          <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-80">You · {ch.label} · {fmtTime(item.touch.timestamp)}</div>
          {item.touch.snippet}
        </div>
      </div>
    );
  }
  const bad = item.contradiction;
  return (
    <div className={`rounded-2xl bg-panel-2 px-3.5 py-3 ring-1 ${bad ? "ring-bad/70 shadow-[0_0_24px_-8px_var(--color-bad)]" : "ring-line"}`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold" style={{ background: `${ch.tint}22`, color: ch.tint }}>
          {ch.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13px] font-medium">{item.senderName}</span>
            <span className="shrink-0 text-[10px] text-mute">{fmtTime(item.touch.timestamp)}</span>
          </div>
          <div className="text-[10px] text-mute">{ch.label} · {item.senderRole}</div>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-snug text-soft">{item.touch.snippet}</p>
      {bad && <div className="mt-2 text-[11px] font-medium text-bad">⚠ Contradiction: {item.violations.find((v) => v.rule === "R1")!.reason}</div>}
      {item.violations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {[...new Set(item.violations.map((v) => v.rule))].map((r) => (
            <span key={r} title={RULE_NAMES[r]} className="rounded-full border border-line px-1.5 py-px text-[9px] text-mute">{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function MirrorPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const world = buildWorld();
  const contact = findContact(world, decodeURIComponent(contactId));
  if (!contact) notFound();
  const m = buildMirror(world, contact.id)!;

  const days: { day: string; items: MirrorItem[] }[] = [];
  for (const it of m.items) {
    const day = fmtDay(it.touch.timestamp);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1)!.items.push(it);
  }
  const colleagues = world.contacts.filter((c) => c.companyId === contact.companyId && c.id !== contact.id);

  return (
    <div className="grid gap-10 pt-4 lg:grid-cols-[400px_1fr]">
      {/* The buyer's phone */}
      <div className="mx-auto w-[380px]">
        <div className="relative rounded-[52px] border border-line bg-black p-3 shadow-[0_40px_120px_-40px_rgba(142,168,255,0.35)]">
          <div className="absolute left-1/2 top-5 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-black" />
          <div className="h-[760px] overflow-hidden rounded-[42px] bg-ink">
            <div className="flex items-center justify-between px-7 pb-2 pt-4 text-[11px] font-medium text-soft">
              <span>9:41</span>
              <span>●●● ᯤ ▮</span>
            </div>
            <div className="border-b border-line px-5 pb-3 pt-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-mute">{contact.name.split(" ")[0]}&apos;s week</div>
              <div className="mt-0.5 text-lg font-semibold">Everything graph8 sent me</div>
            </div>
            <div className="scroll-thin h-[640px] space-y-4 overflow-y-auto px-4 py-4">
              {days.map((d) => (
                <section key={d.day} className="space-y-2.5">
                  <div className="sticky top-0 z-[1] -mx-4 bg-ink/90 px-4 py-1 text-center text-[10px] uppercase tracking-[0.18em] text-mute backdrop-blur">
                    {d.day}
                  </div>
                  {d.items.map((it) => <Item key={it.touch.refId} item={it} />)}
                </section>
              ))}
              {days.length === 0 && <p className="pt-20 text-center text-sm text-mute">No touches in the last 7 days.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* The verdict */}
      <div className="space-y-8 pt-2">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-mute">Buyer Mirror</div>
          <h1 className="mt-2 font-display text-5xl leading-tight">{contact.name}</h1>
          <div className="mt-1 text-soft">{contact.title} · {m.company?.name}</div>
        </div>

        <div className="flex flex-wrap items-center gap-10 rounded-3xl border border-line bg-panel/70 p-8">
          <ScoreDial score={m.score} />
          <div className="space-y-4">
            <p className="font-display text-3xl leading-snug text-text">{m.summaryLine}</p>
            <p className="max-w-md text-sm text-mute">
              What {contact.name.split(" ")[0]} experienced in the last 7 days, across every graph8 sequence, campaign, dialer, AI agent and rep.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-line bg-panel/70 p-6">
          <div className="mb-4 text-xs uppercase tracking-[0.2em] text-mute">Why the score is {m.score}</div>
          <ul className="space-y-2.5">
            {Object.entries(m.deductions).map(([rule, pts]) => (
              <li key={rule} className="flex items-center justify-between text-sm">
                <span className="text-soft"><span className="mr-2 font-mono text-mute">{rule}</span>{RULE_NAMES[rule]}</span>
                <span className={pts ? "font-mono text-bad" : "font-mono text-mute"}>{pts ? `−${pts}` : "0"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-mute">Starts at 100. Fixed penalty per violation in the last 7 days, capped per rule (lib/config.ts).</p>
        </div>

        <QueuedNext contactId={contact.id} />

        {colleagues.length > 0 && (
          <div className="text-sm text-mute">
            Colleagues at {m.company?.name}:{" "}
            {colleagues.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link className="text-soft underline decoration-line underline-offset-4 hover:text-text" href={`/mirror/${c.id}`}>{c.name}</Link>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
