/** Next.js server start hook: begin the 5s graph8 polling fallback (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPoller } = await import("./lib/poller.ts");
  startPoller();
}
