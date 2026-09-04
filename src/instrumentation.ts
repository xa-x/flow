export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureJobLoop } = await import("@/lib/runs/worker");
    ensureJobLoop();
  }
}
