import "server-only";
import type { Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      return chromium.launch({
        args: ["--no-sandbox", "--font-render-hinting=none"],
      });
    })();
  }
  return browserPromise;
}

/** Pre-warm the singleton from instrumentation.ts on container start
 * so the first PDF in a fresh deployment doesn't pay the launch cost.
 * Fire-and-forget — caller doesn't await. */
export function warmBrowser(): void {
  void getBrowser().catch((err) => {
    console.error("[pdf-renderer] failed to pre-warm browser:", err);
  });
}

export async function renderReportPdf({
  token,
  origin,
}: {
  token: string;
  origin: string;
}): Promise<Uint8Array> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    viewport: { width: 816, height: 1056 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${origin}/reports/print?t=${encodeURIComponent(token)}`, {
      waitUntil: "networkidle",
      timeout: 15_000,
    });
    await page.waitForSelector("[data-report-ready]", { timeout: 8_000 });
    await page.emulateMedia({ media: "print" });
    const buf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return new Uint8Array(buf);
  } finally {
    await ctx.close().catch(() => {});
  }
}
