import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Visual walk of the /educators surface: landing, homework list + editor,
 * the calendar view (a redirect into Homework), grading, the Students page
 * (real roster only — the old sample roster is gone) + Ask Athena chat, and
 * the share-link 404 state. Screenshots each shell for review.
 */

const OUT = ".local/playwright/snapshots/educators";

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test("landing", async ({ page }) => {
  await page.goto("/educators");
  await expect(page.getByText("FOR EDUCATORS")).toBeVisible();
  await expect(page.getByRole("link", { name: /Enter/i })).toBeVisible();
  await page.waitForTimeout(1200); // let ambient orbs paint
  await page.screenshot({ path: `${OUT}/01-landing.png` });
});

test("homework list and editor", async ({ page }) => {
  await page.goto("/educators/homework");
  await expect(page.getByPlaceholder("Search homework")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/02-homework.png` });

  await page.getByRole("button", { name: /New homework/i }).click();
  await expect(page.getByText("What would you like to assign?")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/03-editor.png` });
});

test("calendar view (redirects into Homework)", async ({ page }) => {
  await page.goto("/educators/calendar");
  // Calendar is now a view toggle inside Homework, reached via a redirect.
  await expect(page).toHaveURL(/\/educators\/homework/, { timeout: 30_000 });
  // The calendar view is active (the per-day cells also expose "New homework"
  // buttons, so target the toggle + the single top composer button exactly).
  await expect(page.getByRole("button", { name: "Calendar" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole("button", { name: "New homework", exact: true })
  ).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04-calendar.png` });
});

test("grading", async ({ page }) => {
  await page.goto("/educators/grading");
  await expect(page.getByText("ASSIGNMENTS ·")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/05-grading.png` });
});

test("students page: real roster, detail drawer, and live chat", async ({ page }) => {
  test.setTimeout(150_000); // the Ask Athena answer is a live AI call
  // The Students page shows real data only (no sample roster), so seed one
  // student to exercise the detail drawer + stats deterministically.
  const name = "Visual Demo Student";
  const email = "visual.demo@school.test";
  const s = await page.request.get("/api/educators/students");
  const list = (await s.json()).students as { studentEmail: string }[];
  if (!list.some((x) => x.studentEmail === email)) {
    await page.request.post("/api/educators/students", {
      data: { name, studentEmail: email, parentEmail: "p@demo.test" },
    });
  }

  await page.goto("/educators/reports");
  await expect(page).toHaveURL(/\/educators\/students/, { timeout: 20_000 });
  // ROSTER header is always present; CLASS HEALTH only renders once there are
  // graded submissions, which this shell walk doesn't create.
  await expect(page.getByText(/ROSTER ·/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(name)).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-students.png` });

  // Student detail drawer
  await page.getByText(name).first().click();
  const drawer = page.getByRole("dialog", { name: "Student" });
  await expect(drawer.getByText("PARENT REPORTS")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/07-student-detail.png` });
  await page.keyboard.press("Escape");

  // Ask Athena chat — send a question and await a real answer (the only
  // e2e coverage of the students chat loop, folded in from the old review walk).
  await page.getByRole("button", { name: /Ask Athena/i }).click();
  await expect(page.getByText("ASK ABOUT YOUR STUDENTS")).toBeVisible();
  await page.screenshot({ path: `${OUT}/08-chat-panel.png` });
  await page
    .getByPlaceholder("Ask about grades, students, trends...")
    .fill("Who is on my roster and how are they doing so far?");
  await page.keyboard.press("Enter");
  // A non-empty assistant bubble (`.mr-6`) lands.
  await expect
    .poll(
      async () => {
        const bubbles = page.locator("div.mr-6");
        const n = await bubbles.count();
        return n === 0 ? 0 : (await bubbles.last().innerText()).trim().length;
      },
      { timeout: 90_000 }
    )
    .toBeGreaterThan(20);
  await page.screenshot({ path: `${OUT}/09-chat-answer.png` });
});

test("student view 404 state", async ({ page }) => {
  await page.goto("/educators/a/00000000-0000-0000-0000-000000000099");
  await expect(page.getByText("Assignment not found")).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({ path: `${OUT}/09-student-view-404.png` });
});
