/** Next.js server start hook: begin the 5s graph8 polling fallback (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // serverless: polling runs per request via maybePoll()
  const { startPoller } = await import("./lib/poller.ts");
  startPoller();
}
