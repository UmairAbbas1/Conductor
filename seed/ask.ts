/**
 * npm run ask -- sarah voice_agent nova
 * Ask Conductor before acting, exactly like an AI agent would (POST /api/preflight, the same call the
 * conductor_preflight MCP tool makes). Prints the decision in plain words. Targets the live deployment
 * unless CONDUCTOR_URL is set (e.g. http://localhost:3000).
 */
const [contact = "sarah", channel = "voice_agent", sender = "nova"] = process.argv.slice(2);
const BASE = process.env.CONDUCTOR_URL ?? "https://conductor-graph8.vercel.app";
const SOURCE: Record<string, string> = { nova: "agent", bilal: "sequence", marketing: "campaign", ali: "human" };
const WHO: Record<string, string> = { nova: "Nova (AI voice agent)", bilal: "Bilal (SDR sequence)", marketing: "graph8 Marketing", ali: "Ali (AE)" };
const ACT: Record<string, string> = { voice_agent: "AI call", email: "email", sms: "SMS", linkedin: "LinkedIn message", call: "call", newsletter: "newsletter" };
const ICON: Record<string, string> = { allow: "✅ ALLOW", hold: "⛔ HOLD", delay: "⏳ DELAY", reroute: "↪️  REROUTE", escalate: "🙋 ESCALATE" };

async function main() {
  console.log(`\n  🤖 ${WHO[sender] ?? sender} asks: may I send an ${ACT[channel] ?? channel} to ${contact}?\n`);
  const res = await fetch(`${BASE}/api/preflight`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contactId: contact, action: "send", payload: { channel, source: SOURCE[sender] ?? "agent", senderId: sender } }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(d));
  console.log(`  Conductor: ${ICON[d.decision] ?? d.decision}  (${d.rule})`);
  console.log(`  Why: ${d.reason}.`);
  if (d.instead) console.log(`  Instead: ${d.instead.type.replace("_", " ")} → ${d.instead.ownerId}`);
  console.log(`  Decided ${d.autonomous ? "autonomously" : "— waiting for the owner"} · ${d.id}\n`);
}

main().catch((e) => {
  console.error(`  ✗ Conductor unreachable at ${BASE}: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
