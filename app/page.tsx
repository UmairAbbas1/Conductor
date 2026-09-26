import Link from "next/link";
import { buildWorld } from "@/lib/world.ts";
import { accountScore, harmonyScore } from "@/lib/score.ts";
import { scoreColor } from "@/app/components/ScoreDial.tsx";

export const dynamic = "force-dynamic";

export default function Home() {
  const world = buildWorld();
  const accounts = world.companies
    .map((co) => ({
      co,
      score: accountScore(world, co.id),
      deal: world.deals.find((d) => d.companyId === co.id && d.open),
      people: world.contacts
        .filter((c) => c.companyId === co.id)
        .map((c) => ({ c, score: harmonyScore(world, c.id).score }))
        .sort((a, b) => a.score - b.score),
    }))
    .sort((a, b) => a.score - b.score);

  return (
    <div className="pt-6">
      <h1 className="font-display text-5xl">One voice per buyer.</h1>
      <p className="mt-2 max-w-xl text-soft">Every account, sorted by how it feels to be on the receiving end of graph8.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {accounts.map(({ co, score, deal, people }) => (
          <div key={co.id} className="rounded-3xl border border-line bg-panel/70 p-6" style={{ boxShadow: `inset 0 1px 0 0 ${scoreColor(score)}33` }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-medium">{co.name}</div>
                <div className="text-xs text-mute">{deal ? `Open deal · $${deal.amount.toLocaleString()}` : "No open deal"}</div>
              </div>
              <div className="font-display text-5xl leading-none" style={{ color: scoreColor(score) }}>{score}</div>
            </div>
            <ul className="mt-5 space-y-2">
              {people.map(({ c, score: s }) => (
                <li key={c.id}>
                  <Link href={`/mirror/${c.id}`} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-panel-2">
                    <span><span className="text-text">{c.name}</span> <span className="text-mute">· {c.title}</span></span>
                    <span className="font-mono" style={{ color: scoreColor(s) }}>{s}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
