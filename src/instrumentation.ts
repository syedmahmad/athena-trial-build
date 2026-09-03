/**
 * Next.js instrumentation hook — runs once per server process at
 * startup. We use it to pre-warm the Playwright Chromium instance so
 * the first PDF report after a deploy doesn't pay the ~1.5s launch
 * cost. The warm-up is fire-and-forget; report requests await the
 * same singleton promise regardless of whether the warm-up has
 * resolved yet.
 *
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SKIP_REPORT_BROWSER_WARMUP === "1") return;

  try {
    const { warmBrowser } = await import("@/lib/reports/pdf-renderer");
    warmBrowser();
  } catch (err) {
    console.error("[instrumentation] PDF browser warm-up failed:", err);
  }
}
