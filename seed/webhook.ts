/**
 * npm run webhook -- https://<public-url>
 * Subscribes graph8 webhooks to <public-url>/api/webhooks/graph8 (g8.api.webhooks.createWebhook) and
 * stores the signing secret in .env.local as G8_WEBHOOK_SECRET. The secret is never printed.
 * Only needed if this machine is reachable from the internet (e.g. a tunnel); polling works without it.
 */
import fs from "node:fs";
import dotenv from "dotenv";
import { client, describeError, mode } from "../lib/graph8.ts";

dotenv.config({ path: ".env.local", quiet: true });

const EVENTS = [
  "sequence.contact_enrolled", "sequence.contact_removed", "sequence.step_completed",
  "engagement.email_sent", "engagement.email_replied", "engagement.sms_sent", "engagement.sms_replied",
  "engagement.linkedin_message_sent", "engagement.linkedin_connection_sent", "engagement.linkedin_reply_received",
  "engagement.call_completed", "engagement.voicemail_left", "voice_ai.call_completed", "voice_ai.voicemail_left",
  "meeting.booked", "meeting.cancelled", "deal.created", "deal.stage_changed", "deal.won",
];

async function main() {
  const base = process.argv[2];
  if (!base?.startsWith("https://")) throw new Error("usage: npm run webhook -- https://<public-url>");
  const url = `${base.replace(/\/$/, "")}/api/webhooks/graph8`;
  if (mode() === "dry") {
    console.log(`[dry] webhooks.createWebhook ${url} (${EVENTS.length} events). Set CONDUCTOR_MODE=live to subscribe.`);
    return;
  }
  const res = (await client().api.webhooks.createWebhook({ body: { url, events: EVENTS, name: "Conductor" } })) as any;
  const hook = res?.data ?? res;
  if (!hook?.secret) throw new Error("graph8 returned no signing secret");
  const env = fs.readFileSync(".env.local", "utf8").replace(/^G8_WEBHOOK_SECRET=.*\r?\n?/m, "");
  fs.writeFileSync(".env.local", `${env.replace(/\s*$/, "\n")}G8_WEBHOOK_SECRET=${hook.secret}\n`);
  console.log(`✓ webhook ${hook.id} → ${url}. Signing secret saved to .env.local (restart the app).`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : describeError(e)}`);
  process.exit(1);
});
