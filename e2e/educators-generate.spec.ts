import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Live generation smoke: full path UI → /api/educators/homework/quiz →
 * agents /educator/homework → Majordomo → Claude. "Write with AI" now builds
 * a structured per-question quiz (not a streamed prose draft), so we assert
 * the BUILDING QUIZ… indicator, then the review with a title + per-question
 * answer fields. No DB required (only Save touches the tables).
 */

const OUT = ".local/playwright/snapshots/educators";

test("homework generation builds a quiz in the editor", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();

  await page
    .getByPlaceholder(/Create homework that is about/)
    .fill(
      "Create homework that is about fractions in a problem set style with 5 problems for grade 5."
    );
  await page.getByRole("button", { name: /Generate homework/i }).click();

  // Building indicator appears, then the structured quiz lands in the review.
  await expect(page.getByText("BUILDING QUIZ…")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("EDIT BEFORE SAVING")).toBeVisible({
    timeout: 120_000,
  });
  const title = await page.getByPlaceholder("Title").inputValue();
  expect(title.length).toBeGreaterThan(4);
  // Per-question quiz: at least one teacher answer field is present.
  await expect(
    page.getByPlaceholder("Expected answer / solution").first()
  ).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${OUT}/10-editor-draft.png` });
});
