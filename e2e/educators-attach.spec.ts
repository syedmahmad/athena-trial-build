import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Teacher homework uploads: attach a doc/image in the editor, see chips, and
 * generate with NO typed prompt (files-only path) → /api/educators/homework/
 * quiz → agents → Claude. Screenshots the composer-with-chips and the draft.
 */

const OUT = ".local/playwright/snapshots/educators";

// A tiny but valid PNG (worksheet-ish) so the image chip renders a thumbnail.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAACWMwO2AAAAJklEQVR4nO3BAQ0AAADC" +
  "oPdPbQ8HFAAAAAAAAAAAAAAAAAAAAADwGxsAAAEm6mImAAAAAElFTkSuQmCC";

test("editor: attach files and generate with no prompt", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });

  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();

  // ATTACH affordance is present in the AI / generate composer.
  await expect(page.getByRole("button", { name: /ATTACH/i })).toBeVisible();

  // Attach a text worksheet + an image directly onto the hidden file input.
  await page.setInputFiles('input[type="file"]', [
    {
      name: "worksheet.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "Worksheet: 1) 7 + 5 = ___   2) 9 + 6 = ___. Mirror these for grade 2 with an answer key.",
      ),
    },
    {
      name: "scan.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_B64, "base64"),
    },
  ]);

  // Both chips appear (text chip + image thumbnail chip).
  await expect(page.getByText("worksheet.txt")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("scan.png")).toBeVisible();
  await page.screenshot({ path: `${OUT}/20-attach-chips.png` });

  // Remove-chip works; drop the throwaway image fixture (too small for the
  // vision API) so the files-only generation runs on the text worksheet alone.
  await page.getByRole("button", { name: "Remove scan.png" }).click();
  await expect(page.getByText("scan.png")).toHaveCount(0);

  // Generate with NO typed prompt — the files-only path must be enabled.
  const genBtn = page.getByRole("button", { name: /Generate homework/i });
  await expect(genBtn).toBeEnabled();
  await genBtn.click();

  await expect(page.getByText("BUILDING QUIZ…")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("EDIT BEFORE SAVING")).toBeVisible({
    timeout: 120_000,
  });
  const title = await page.getByPlaceholder("Title").inputValue();
  expect(title.length).toBeGreaterThan(3);
  await page.screenshot({ path: `${OUT}/21-attach-generated.png` });
});
