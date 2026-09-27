# Conductor: 5-minute demo script

**Before you go on stage (T-10 min)**

1. Open four tabs: the dashboard `/`, `/mirror/251` (Sarah), `/replay`, and **the graph8 app on Sarah's contact record**.
2. Reset the demo state: on the dashboard press `.`, then **Reset demo state**, and reload. Nothing in graph8 is duplicated: write-back skips notes and tasks graph8 already has.
3. Check the header chips: **graph8 synced Xs ago** (green) and **AI checks on** (needs `GROQ_API_KEY`).
4. Rehearse the Replay once with `/replay?autoplay`.

If graph8 or the network misbehaves on stage, every beat below still works: the simulator (press `.`) uses the same intake code as the live events.

---

### 0:00 – 0:45 · The pain (Mirror tab)

> "This is Sarah Khan, VP Ops at Acme. Acme has a $42K pilot open with our AE, Ali. This is her phone: everything graph8 sent her this week, from **her** side."

- The phone opens at her booking. Point at the green bubble: **she booked a meeting.**
- Point at the red cards right below it: Nova the AI agent asks "still evaluating for October?", and Bilal's sequence bumps her.
- Read the verdict line: *"After that, 3 automated touches acted as if nothing had happened."*

> "11 touches, 4 senders, 6 channels. Every tool did its job. Nobody conducted them. Her Harmony Score is **18**."

- Point at **Why the score is 18**: fixed penalties per rule. Same input, same score, every time.

### 0:45 – 1:45 · Conductor already acted (dashboard tab)

> "Conductor listens to everything graph8 sends, decides with five simple rules, and acts inside graph8. With no human."

- Walk the strip left to right: **1 Listen** (touches this week, senders), **2 Decide** (5 rules, N decisions), **3 Act in graph8** (notes, owner tasks, fields).
- Point at the four numbers: decisions made, **100% autonomous**, touches prevented, **pipeline protected** (live from graph8).
- Point at a feed card: *"HELD · Sarah Khan · Nova · AI call → Ali owns this buyer · ✓ in graph8: note · 3 fields."*
- **Switch to the graph8 tab** and show Sarah's record: the Conductor note, the task for the owner, and the `harmony_score` field. *"It's native, right there in graph8."*

### 1:45 – 2:50 · Live: someone breaks the rules

> "Now, live. An SDR enrolls Hina, Sarah's colleague, into a cold sequence in graph8."

- **In the VS Code terminal:** `npm run enroll -- hina`. This enrolls her through graph8's official API, exactly as any tool or agent would. Within about 5–10 seconds the dashboard feed shows **HELD · R1 · Hina Malik · Enrolled in Bilal — Ops Leaders Cold Outbound**.
- **In graph8:** open **Hina's contact record** (not the sequence's Contacts tab; see below). It shows the Conductor note and the task for the owner.
- **Fallback:** on the dashboard, press `.`, choose **Hina Malik**, then **Enrolled in SDR sequence**.

> "Her colleague already booked. Conductor stopped her before step one went out, removed her from the sequence in graph8, and left Ali a note and a task on her record."

⚠️ **Avoid graph8's sequence → Contacts tab.** graph8's own page currently crashes ("et.find is not a function") on a draft sequence that has a removed contact. The data is valid (graph8's API returns it correctly), so this is a graph8 UI bug. The sequence's **Overview** tab and the **contact records** work fine.

### 2:50 – 3:40 · The AI part (Mirror tab, scroll to "Queued next")

> "These are messages graph8 automations have queued for Sarah right now. Conductor checks each one before it goes."

- Bilal's "still evaluating for October?" email: **HELD**, with **✦ AI: contradiction** explaining which fact it contradicts.
- If a merged message appears, point at **One voice · from Ali**: the SDR's and AE's messages rewritten as one.

> "Rules decide; the model only reads language. If the AI is down, the card says *AI check off* and the rules still hold. The system never depends on the model."

### 3:40 – 4:20 · Any agent can ask first

- In a terminal: `npm run mcp` (or Claude Code with `.mcp.json`) → `conductor_preflight` for `sarah` / `voice_agent` / `nova`.
- The answer: `HOLD (R1): Sarah booked a meeting. Automated outreach is paused`.

> "Any AI agent, whether graph8's or yours, asks Conductor before it touches a buyer. `POST /api/preflight` does the same over HTTP."

### 4:20 – 5:00 · Replay (Replay tab)

- Click **▶ Play the week**. Each message gets its own beat.
- Narrate the right-hand panel as blocks appear ("Held · R1 · Nova: Sarah booked a meeting…").
- It ends at **11 → 3 touches, score 18 → 97**.

> "Same week, twice. Conductor only ever saw what had happened up to that moment. One voice per buyer, running on graph8 today, and your reps can use it Monday morning."

---

**Likely questions, one-line answers**

- *Why not just use graph8's "finish on reply"?* It stops one sequence. Conductor coordinates every sequence, campaign, dialer, AI agent and rep, across the whole account.
- *Why rules, not AI, for decisions?* Deterministic means explainable, testable (64 tests) and safe to run autonomously. AI only reads language.
- *What if two decisions race?* The decision is stored before any graph8 call, IDs are deterministic, and write-back checks graph8 first. Nothing is written twice.
- *Does it send anything?* No. It only holds, delays, reroutes or escalates, plus notes, tasks and fields. Everything it wrote is tagged demo data.

**Before the demo:** Omar was used for the live test on 27 Sep (caught in 4s, removed from the sequence, note and task on his record). Use **Hina** on stage.
