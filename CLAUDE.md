# Conductor — project rules (read every session)

Hackathon project for graph8 "Programmable Revenue". Conductor coordinates every autonomous touch
(sequences, campaigns, SMS, LinkedIn, dialer, AI agents, reps) aimed at the same buyer so graph8
speaks with one voice. Code freeze: **Sun 27 Sept 2026, 5:30 PM PKT**. Must run LIVE on the demo workspace.

Judging: live technical execution, Monday-morning usefulness, AI autonomy, revenue impact,
breadth of graph8 platform use, 5-minute live demo. Every decision serves these.

## Secret handling (highest priority, never violate)
- `G8_API_KEY` (full scope) lives ONLY in `.env.local`. Never print/log/echo/cat it, never write it elsewhere.
- Check existence only with value-safe commands, e.g. `grep -c '^G8_API_KEY=' .env.local`. Never `cat .env.local`.
- `.gitignore` covers `.env*`, `node_modules`. `.mcp.json` must contain no secrets.
- Before every commit: `git status`, confirm nothing with a key is staged.
- No git remotes, no push. The user handles the repo.

## graph8 environment
- Demo org: **Hackathon Umair Abbas** (`org_05cbf5680891`). MCP server name: `graph8`.
- NEVER invent graph8 methods, endpoints, fields or webhook event names. Only use what is in
  `CAPABILITIES.md` (verified against `node_modules/@graph8/sdk` .d.ts or the MCP tool list).
- `CONDUCTOR_MODE=dry|live` (default dry). Dry mode logs intended writes instead of performing them.
- All seeded records are tagged (list `conductor-demo`). Write only to tagged records unless the user approves.
- Verify webhook signatures; reject unsigned deliveries.

## Locked product decisions (do not redesign)
1. **Touch Ledger** — per-contact & per-company timeline. Normalized event:
   `contactId, companyId, channel (email|sms|linkedin|call|voice_agent|newsletter|meeting),
   source (sequence|campaign|agent|dialer|human|booking), senderId, timestamp, snippet, refId`.
2. **Buyer Mirror** — `/mirror/[contactId]`: the ledger as the BUYER experienced it (phone/inbox feed, their POV),
   summary line ("11 touches · 4 senders · 3 channels · 2 contradictions"), Harmony Score dial. Hero screen.
3. **Harmony Score** — start 100, subtract fixed documented penalties per violation in last 7 days. Deterministic, unit-tested.
4. **Policy engine** — deterministic rules → Decision
   `{ id, contactId, rule, decision: allow|hold|delay|reroute|escalate, reason, evidence: refIds[], instead?: {type, ownerId}, autonomous, createdAt }`.
   - R1 Booked meeting or reply → pause all sequences for that contact + all cold sequences for colleagues at same company.
   - R2 Open deal on company → hold cold enrollment of any contact there; create task for deal owner instead.
   - R3 Channel stacking: 3+ channels to one person within 24h → delay later touches.
   - R4 Touch budget: >6 touches per person per 7 days → hold.
   - R5 Sender collision: 2+ distinct senders to one person within 48h → reroute to single owner (deal owner, else earliest sender).
   - All thresholds in ONE config file.
5. **Write-back** — every decision written to graph8: note on contact (why), task for owner when rerouted,
   custom fields `harmony_score` + `touch_budget_remaining`, pause/removal from sequences.
   Only `escalate` waits for a human (graph8 approvals if they exist, else a task).
6. **LLM layer** (Groq via fetch, `GROQ_API_KEY`; switched from Anthropic at the user's request on 2026-09-27) — only: (a) flag queued message contradicting known context;
   (b) merge two colliding queued messages into one from the chosen owner. MUST degrade gracefully:
   no key / failure → rules still run, UI shows "AI check off".
7. **Preflight API** — `POST /api/preflight { contactId, action, payload }` → Decision. Plus `conductor_preflight` MCP tool (stdio script).
8. **Dashboard** — account heatmap sorted by Harmony Score, real-time decision feed, stats: decisions made,
   % autonomous, touches prevented, pipeline protected (sum of open deal amounts on affected accounts, real data only).
9. **Replay** — Sarah's messy week, then same week with Conductor on, time-lapse: 11 touches collapse to ~4.

## Stack
Next.js App Router + TypeScript + Tailwind, single app. Business logic in `/lib` as plain TS. zod, vitest.
Pre-approved deps ONLY: next, react, react-dom, typescript, tailwindcss, @graph8/sdk, zod,
vitest, @modelcontextprotocol/sdk, dotenv. Ask before anything else (incl. tunnels like ngrok/cloudflared).
UI: dark, calm, premium. Mirror looks like a real phone/inbox. Score = large dial. Feed animates new decisions in.

## Process
- Phases 0–4 (see brief); app demoable + local git commit after every phase.
- Stop and ask before: leaving Phase 0; new deps; writing untagged / deleting any graph8 record;
  first switch to live mode; changing a locked decision; any graph8 call failing the same way 3×.
- No auth, accounts, extra pages or abstractions beyond the brief. Boring, reliable code.
- Cut order if short on time: Replay → MCP tool → LLM merge. Never cut Mirror, R1, R2, write-back.
- Never run `next build` while `next dev` is running in this folder: both use `.next` and the dev workers crash ("Jest worker encountered child process exceptions"). Fix: stop dev, delete `.next`, restart.
- Deploy: Vercel CLI. `.vercelignore` keeps `.env*` and `data/` out of uploads; secrets go to Vercel env vars only.
- Progress format: `✅ [what] — [files]`; end of phase: shipped / next / blocked.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
