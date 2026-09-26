import { buildWorld, findContact } from "@/lib/world.ts";
import { replayWeek } from "@/lib/replay.ts";
import { ReplayPlayer } from "@/app/components/ReplayPlayer.tsx";

export const dynamic = "force-dynamic";

export default async function ReplayPage({ searchParams }: { searchParams: Promise<{ contact?: string; at?: string; autoplay?: string }> }) {
  const { contact: key = "sarah", at, autoplay } = await searchParams;
  const initialAt = at !== undefined && Number.isFinite(Number(at)) ? Number(at) : undefined;
  const world = buildWorld();
  const contact = findContact(world, key) ?? findContact(world, "sarah")!;
  const replay = replayWeek(world, contact.id);
  const senders = Object.fromEntries(world.senders.map((s) => [s.id, `${s.name} · ${s.role}`]));
  senders[contact.id] = contact.name;

  return (
    <div className="space-y-8 pt-4">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-mute">Replay</div>
        <h1 className="mt-2 font-display text-5xl">The same week, twice.</h1>
        <p className="mt-2 max-w-2xl text-soft">
          Left: what {contact.name} actually got from graph8. Right: the same week with Conductor preflighting every touch,
          seeing only what had been sent up to that moment.
        </p>
      </div>
      <ReplayPlayer
        contactName={contact.name.split(" ")[0]}
        steps={replay.steps}
        before={replay.before}
        after={replay.after}
        senders={senders}
        initialAt={initialAt}
        autoplay={autoplay !== undefined}
      />
    </div>
  );
}
