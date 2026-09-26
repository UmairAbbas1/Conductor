# Conductor: 5-minute demo script

**Before you go on stage (T-10 min)**

1. `npm run dev`, then open three tabs: `localhost:3000`, `localhost:3000/mirror/sarah`, `localhost:3000/replay`.
2. Reset the demo state: press `.` on the dashboard, then **Reset demo state**. Reload.
3. Open the graph8 app on Sarah's contact record in a fourth tab (live mode only).
4. Check the feed header. It should say **live · graph8 every 5s** (live) or **live** (scenario only). If it says **graph8 polling stopped**, use the simulator for the live beat. Nothing else changes.

---

### 0:00 – 0:40 · The problem (Mirror tab)

> "This is Sarah Khan, VP Ops at Acme. Acme has a $42K pilot open with our AE, Ali. This is what graph8 sent her last week, from **her** side."

- Scroll the phone slowly.
- Point at the summary: **11 touches · 4 senders · 6 channels · 3 contradictions**.
- Point at Wednesday: *she booked a meeting.* Then point at the red cards right after it: Nova the AI agent asks whether she's "still evaluating for October", and Bilal's sequence bumps her twice.

> "Every tool did its job. Nobody conducted them. Her Harmony Score is **18**."

- Point at **Why the score is 18**: fixed, deterministic penalties for each rule she was hit by.

### 0:40 – 1:40 · What Conductor already did (dashboard tab)

> "Conductor read that ledger and acted, with no human involved."

- Point at the heatmap: Acme is red at 18, Initech is amber, Globex is green.
- Point at the feed:
  - **HOLD R1 Sarah**: sequence paused, Ali owns her now.
  - **HOLD R1 Hina**: her colleague's cold sequence paused.
  - **HOLD R2 Marco**: Initech has an open deal, so the owner gets a task.
- Point at the stats: decisions made, **100% autonomous**, touches prevented, **pipeline protected**.

> "Every one of those is written into graph8: a note saying why, a task for the owner, and the contact paused in that sequence."

*(Live mode: switch to the graph8 tab and show the Conductor note, the task, and `harmony_score` on Sarah's record.)*

### 1:40 – 2:50 · Live: someone breaks the rules

> "Now, live. Someone enrolls Omar, Sarah's colleague, into a cold sequence."

- **Live mode:** in the graph8 app, add Omar to *Bilal — Ops Leaders Cold Outbound*. Within 5–10 seconds the feed shows **HOLD R1 Omar Farooq** sliding in.
- **Fallback:** press `.`, choose **Omar Farooq**, then **Enrolled in SDR sequence**.

> "A colleague just booked, so Conductor paused the enrollment before step 1 went out."

- Then choose **Lina Chen**, then **Books a meeting**. The feed shows **HOLD R1 Lina**, and her sequence is paused.

### 2:50 – 3:40 · Queued messages + the AI (Mirror tab, scroll to "Queued next")

> "Here's what graph8 automations have queued for Sarah right now."

- Bilal's "still evaluating for October?" email: **HOLD R1**.
  - ✦ **LLM: contradiction** ("she booked a pilot review…").
  - **One voice · from Ali**: the merged message Ali can send instead.
- Nova's AI call: **HOLD R1**.

> "Rules decide; the model only reads language. With no Anthropic key, you'd see *LLM check skipped*, and the rules still hold."

### 3:40 – 4:30 · Any agent can ask first

- In a terminal (or Claude Code with `.mcp.json`), call `conductor_preflight` for `sarah` / `voice_agent` / `nova`.
- The result: `HOLD (R1): Sarah booked a meeting. Automated outreach is paused`.

> "Any agent, whether graph8's or yours, asks Conductor before it touches a buyer. `POST /api/preflight` does the same thing over HTTP."

### 4:30 – 5:00 · Replay (Replay tab)

- Click **▶ Play the week**.

> "Same week, twice. Left: what she got. Right: Conductor on. It only sees what had happened up to that moment."

- Blocked touches flash red with their rule, then collapse. The count lands at **11 → 3**, and the score dial goes from 18 to above 90.

> "One voice per buyer. It runs on graph8 today, and your reps can use it on Monday morning."

---

**If something breaks:** everything shown also works in dry mode off the local scenario. The simulator uses the same intake code as webhooks and polling. `DELETE /api/state` (or **Reset demo state**) restarts the story.
