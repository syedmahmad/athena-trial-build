import { test, expect, type Page } from "@playwright/test";

/**
 * A5 regression net for the portrait mobile lesson renderer (Workstream A).
 *
 * Targets the PUBLIC /dev/mobile harness, which drives MobileLessonRenderer
 * with real ideal-lesson fixtures via deterministic prev/next buttons. This
 * deliberately sidesteps the live MicroLesson lifecycle (narration-gated
 * auto-advance that never completes under webdriver) and auth — the harness is
 * the same renderer + the same IR, exercised deterministically. Runs under the
 * "mobile" project (iPhone viewport, no Clerk auth dependency).
 *
 * What it locks in: triplet morph (apply -> collapse -> state in one card),
 * the op-cancel mute during collapse, figure archetypes rendering as real SVG
 * islands, and the absence of console errors (notably the duplicate-key class
 * of bug that non-consecutive triplet phases caused).
 */

const HARNESS = "/dev/mobile";

/** Read the current 1-based step number from the harness counter. */
async function currentStep(page: Page): Promise<number> {
  const text = (await page.getByText(/step \d+ \/ \d+/).first().innerText()).trim();
  const m = text.match(/step (\d+) \/ (\d+)/);
  if (!m) throw new Error(`step counter not found in: ${text}`);
  return Number(m[1]);
}

/** Click prev/next until the harness sits on the target 1-based step. */
async function gotoStep(page: Page, target: number): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const cur = await currentStep(page);
    if (cur === target) return;
    await page.getByRole("button", { name: cur < target ? "Next →" : "← Prev" }).click();
  }
  throw new Error(`could not reach step ${target}`);
}

async function selectFixture(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label }).click();
}

test.describe("portrait mobile lesson renderer", () => {
  // Surface any console error as a test-visible array; duplicate-key warnings
  // (React) come through as errors and must stay empty.
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(HARNESS);
    await expect(page.locator("[data-step-id]").first()).toBeVisible();
  });

  test("collapses triplets into morph group cards", async ({ page }) => {
    await selectFixture(page, "1-var (morph)");
    // The 31-step lesson has 5 apply/collapse/state triplets -> 5 group cards.
    await expect(page.locator("[data-group-phase]")).toHaveCount(5);
    // Plenty of standalone teaching cards survive alongside the groups.
    expect(await page.locator("[data-step-id]").count()).toBeGreaterThanOrEqual(10);
    // Fully revealed, every group rests on its clean STATE result.
    const phases = await page.locator("[data-group-phase]").evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-group-phase"))
    );
    expect(phases.every((p) => p === "state")).toBe(true);
  });

  test("morphs a triplet apply -> collapse -> state in one card", async ({ page }) => {
    await selectFixture(page, "1-var (morph)");
    // Group g1 phases are at fixture steps 5 (apply), 6 (collapse), 7 (state).
    await gotoStep(page, 5);
    await expect(page.locator('[data-group-phase="apply"]').first()).toBeVisible();

    await gotoStep(page, 6);
    await expect(page.locator('[data-group-phase="collapse"]').first()).toBeVisible();
    // The cancelled terms run the shared per-operand animation (strike + fade),
    // the same engine the desktop board uses. Assert it actually fired rather
    // than a static opacity, since op-cancel now animates 1 -> 0.
    const cancel = page.locator(".op-cancel").first();
    await expect(cancel).toBeVisible();
    const fired = await cancel.evaluate(
      (el) =>
        (typeof el.getAnimations === "function" && el.getAnimations().length > 0) ||
        el.classList.contains("striking")
    );
    expect(fired).toBe(true);

    await gotoStep(page, 7);
    await expect(page.locator('[data-group-phase="state"]').first()).toBeVisible();
  });

  test("renders figure archetypes as real SVG islands", async ({ page }) => {
    await selectFixture(page, "figures (synthetic)");
    // Geometry + number_line both paint as SVGs inside cards...
    expect(await page.locator("[data-step-id] svg").count()).toBeGreaterThanOrEqual(2);
    // ...and the Phase-A1 placeholder is gone.
    await expect(page.getByText(/renderer pending/i)).toHaveCount(0);

    await selectFixture(page, "2-var (coord plane)");
    expect(await page.locator("[data-step-id] svg").count()).toBeGreaterThanOrEqual(1);
  });

  test("scales wide equations to fit the card (no horizontal clip)", async ({ page }) => {
    await selectFixture(page, "2-var (coord plane)");
    // KaTeX web fonts can widen an equation after first paint; the renderer
    // re-fits on fonts.ready, so wait for that before measuring.
    await page.evaluate(() =>
      document.fonts ? document.fonts.ready.then(() => undefined) : undefined
    );
    await page.waitForTimeout(400);
    const { wide, fits } = await page.evaluate(() => {
      const wraps = Array.from(document.querySelectorAll("[data-step-id] .overflow-hidden"));
      let wide = 0;
      let fits = 0;
      for (const w of wraps) {
        const inner = w.querySelector(".inline-block");
        if (!inner) continue;
        // scrollWidth is the untransformed (natural) width; > container = wide.
        if (inner.scrollWidth > w.clientWidth + 1) {
          wide++;
          const wr = w.getBoundingClientRect();
          const ir = inner.getBoundingClientRect(); // reflects the scale transform
          if (ir.left >= wr.left - 1.5 && ir.right <= wr.right + 1.5) fits++;
        }
      }
      return { wide, fits };
    });
    expect(wide).toBeGreaterThan(0); // fixture has equations wider than the card
    expect(fits).toBe(wide); // every one is scaled to fit, none clipped
  });

  test("fly-in substitution launches and resolves to substituted values", async ({ page }) => {
    await selectFixture(page, "2-var (coord plane)");
    // Rewind so the fly-in apply step is hidden, then reveal it fresh so the
    // flight fires on mount (the harness otherwise lands fully revealed).
    await gotoStep(page, 35);
    await page.getByRole("button", { name: "Next →" }).click();
    // Flight particles launch into a fixed portal...
    await expect(page.locator("[data-fly-in]")).toBeAttached({ timeout: 4000 });
    // ...and the card eventually resolves to the real equation, whose op-new
    // value spans (e.g. val-y2 = 8) are now present.
    await expect(page.locator(".val-y2").first()).toBeVisible({ timeout: 14000 });
  });

  test("drives every fixture with no console errors", async ({ page }) => {
    for (const label of ["1-var (morph)", "2-var (coord plane)", "figures (synthetic)"]) {
      await selectFixture(page, label);
      await expect(page.locator("[data-step-id]").first()).toBeVisible();
    }
    // Ignore network noise — the /dev harness sits under the (protected)
    // layout, which fires auth'd API probes that 401 without a session. We
    // only care about React render errors here (duplicate keys, exceptions).
    const renderErrors = consoleErrors.filter(
      (e) => !/Failed to load resource|401|net::ERR/i.test(e)
    );
    expect(renderErrors).toEqual([]);
  });
});
