import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * E2E: photo submissions + vision grading + AI parent reports.
 * Generates a "handwritten" work image in-browser, submits it through the
 * share link, has Claude vision grade it, then logs an AI parent report and
 * reads it back from the history drawer.
 */

const OUT = ".local/playwright/snapshots/educators-photos";
const IMG = `${OUT}/handwriting.png`;
// Submit is by signed-in identity now, so the roster student we grade carries
// the test teacher's email and the teacher turns the photo in as itself.
const TEACHER_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";
const STUDENT = { name: "Quinn Testford", email: TEACHER_EMAIL };

test.describe.configure({ mode: "serial" });

let assignmentId = "";

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function ensureStudent(page: Page) {
  const s = await page.request.get("/api/educators/students");
  expect(s.ok()).toBeTruthy();
  const students = (await s.json()).students as {
    id: string;
    studentEmail: string;
  }[];
  // The teacher email may already be on the roster under another spec's name;
  // drop those so the graded student is deterministically "Quinn Testford".
  for (const x of students) {
    if (x.studentEmail.toLowerCase() === STUDENT.email.toLowerCase()) {
      await page.request.delete(`/api/educators/students/${x.id}`);
    }
  }
  const created = await page.request.post("/api/educators/students", {
    data: {
      name: STUDENT.name,
      studentEmail: STUDENT.email,
      parentEmail: "testford.parent@mail.test",
    },
  });
  expect(created.ok()).toBeTruthy();
}

test("seed assignment + render handwriting image", async ({ page }) => {
  await ensureStudent(page);

  // Idempotent reruns: clear any prior copy of this test assignment.
  const existing = await page.request.get("/api/educators/assignments");
  for (const row of ((await existing.json()).assignments as {
    id: string;
    title: string;
  }[]) ?? []) {
    if (row.title === "Decimal word problems — photo test") {
      await page.request.delete(`/api/educators/assignments/${row.id}`);
    }
  }

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const created = await page.request.post("/api/educators/assignments", {
    data: {
      title: "Decimal word problems — photo test",
      instructions:
        "Solve each problem and show your work.\n\n1. Maya bought a notebook for $3.75, pencils for $1.49, and a folder for $2.20. How much did she spend in all?\n\n2. Carlos ran 4.6 miles on Monday and 3.85 miles on Wednesday. How many more miles did he run on Monday?",
      answerKey: "1. $7.44\n2. 0.75 miles",
      dueDate: tomorrow,
    },
  });
  expect(created.ok()).toBeTruthy();
  assignmentId = ((await created.json()) as { assignment: { id: string } })
    .assignment.id;

  // Render plausible handwritten work (one deliberate mistake in #2).
  await page.setContent(`
    <div style="width:600px;padding:36px;background:#fdfcf7;color:#22305a;
                font-family:'Bradley Hand','Comic Sans MS',cursive;font-size:24px;line-height:1.9">
      <div style="font-size:18px;color:#888;font-family:Georgia">Quinn T. — math hw</div>
      <p>1) 3.75 + 1.49 + 2.20<br>
         &nbsp;&nbsp;&nbsp;3.75 + 1.49 = 5.24<br>
         &nbsp;&nbsp;&nbsp;5.24 + 2.20 = <b>$7.44 total</b></p>
      <p>2) 4.6 − 3.85<br>
         &nbsp;&nbsp;&nbsp;4.60 − 3.85 = <b>1.25 miles more</b></p>
    </div>`);
  await page
    .locator("div")
    .first()
    .screenshot({ path: IMG });
});

test("student submits a photo of written work", async ({ page }) => {
  await page.goto(`/educators/a/${assignmentId}`);
  await expect(page.getByText("TURN IN YOUR WORK")).toBeVisible({
    timeout: 30_000,
  });

  await page.locator('input[type="file"]').setInputFiles(IMG);
  await expect(
    page.getByAltText("Photo of your work, page 1")
  ).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/01-photo-attached.png` });

  // Signed in as the teacher (whose email is on the roster) — no email input;
  // photo only, no typed answer.
  await page.getByRole("button", { name: /Turn in/i }).click();
  await expect(page.getByText(/Nice work, Quinn/)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: `${OUT}/02-photo-submitted.png` });
});

test("teacher sees the photo and vision-grades it", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await page
    .locator("button")
    .filter({ hasText: "Decimal word problems — photo test" })
    .first()
    .click();
  const drawer = page.locator("div.fixed");
  await expect(drawer.getByText("TURNED IN", { exact: true })).toBeVisible();

  const t0 = Date.now();
  await drawer.getByRole("button", { name: /Grade ungraded \(1\)/i }).click();
  await expect
    .poll(async () => drawer.getByText(/%$/).count(), { timeout: 180_000 })
    .toBeGreaterThan(0);
  console.log(`[timing] vision grade: ${Date.now() - t0}ms`);

  // The image contains a deliberate arithmetic error (problem 2: 1.25
  // instead of 0.75). With the answer key in context the grader must
  // catch it — full marks here means key-grounding regressed.
  const gradeText = await drawer.getByText(/%$/).first().innerText();
  const grade = Number(gradeText.replace("%", ""));
  console.log(`[vision grade] ${grade}%`);
  expect(grade).toBeGreaterThan(0);
  expect(grade).toBeLessThan(100);

  await drawer.getByText(STUDENT.name).click();
  await expect(drawer.getByText(/WORK PHOTOS · 1/)).toBeVisible();
  await expect(drawer.locator('img[alt="Student work photo 1"]')).toBeVisible();
  await expect(drawer.getByText("FEEDBACK")).toBeVisible();
  const feedback = await drawer
    .locator("p.mt-1")
    .first()
    .innerText();
  console.log(`[vision feedback] ${feedback}`);
  expect(feedback.trim().length).toBeGreaterThan(20);
  await page.screenshot({ path: `${OUT}/03-vision-graded.png` });
});

test("AI parent report logs and appears in history", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/educators/students");
  await expect(page.getByText(/ROSTER ·/)).toBeVisible({ timeout: 30_000 });
  await page.getByText(STUDENT.name).first().click();
  // Scope to the dialog itself — `div.fixed` would also match the toast
  // container and let stale/toast paragraphs satisfy the assertions.
  const drawer = page.getByRole("dialog", { name: "Student" });
  await expect(drawer.getByText("PARENT REPORTS")).toBeVisible();

  const summaries = () =>
    drawer.locator("p.text-\\[13px\\].leading-relaxed").allInnerTexts();
  const before = (await summaries()).length;

  const t0 = Date.now();
  await drawer.getByRole("button", { name: /Log parent report/i }).click();
  // A NEW AI note lands in the history list (longer than the bare fallback).
  await expect
    .poll(
      async () => {
        const texts = await summaries();
        return texts.length > before && texts.some((t) => t.length > 120)
          ? 1
          : 0;
      },
      { timeout: 60_000 }
    )
    .toBe(1);
  console.log(`[timing] parent report: ${Date.now() - t0}ms`);
  console.log(`[report] ${(await summaries())[0]}`);
  await page.screenshot({ path: `${OUT}/04-report-history.png` });
});
