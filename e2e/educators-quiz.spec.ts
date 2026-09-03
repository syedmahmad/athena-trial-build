import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * The per-question free-response quiz, end to end:
 *   "Write with AI" → structured quiz (questions + teacher answers) → save →
 *   student answers each question inline on the share link → teacher AI-grades.
 * Submitting requires a signed-in identity matched to the roster, so the test
 * teacher account is added to its own roster and turns the work in as itself
 * (no email input exists anymore). Cleans up the assignment + roster row it adds.
 */

const OUT = ".local/playwright/snapshots/educators-quiz";
const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";

test("generate a quiz, do it per-question, then AI-grade it", async ({
  page,
}) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });

  // Clear prior test assignments so the grading drawer resolves to this one
  // (local clone; matches the loop spec's reset pattern). Cascade clears their
  // submissions.
  const existing = await page.request.get("/api/educators/assignments");
  for (const a of (await existing.json()).assignments as { id: string }[]) {
    await page.request.delete(`/api/educators/assignments/${a.id}`);
  }

  // Make sure the signed-in account is on the roster (submit identity match).
  const sres = await page.request.get("/api/educators/students");
  const students = (await sres.json()).students as {
    id: string;
    studentEmail: string;
  }[];
  let rosterId = students.find(
    (s) => s.studentEmail.toLowerCase() === EMAIL.toLowerCase()
  )?.id;
  let createdStudent = false;
  if (!rosterId) {
    const c = await page.request.post("/api/educators/students", {
      data: { name: "Quiz Demo", studentEmail: EMAIL, parentEmail: "p@demo.test" },
    });
    rosterId = (await c.json()).student.id;
    createdStudent = true;
  }

  // 1) Generate the homework as a per-question quiz.
  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();
  await page
    .getByPlaceholder(/Create homework that is about/)
    .fill(
      "Create a 4-question grade 7 homework on one-step equations. Short answer."
    );
  await page.getByRole("button", { name: /Generate homework/i }).click();
  await expect(page.getByText("BUILDING QUIZ…")).toBeVisible({ timeout: 20_000 });
  // Questions (with teacher-only answer fields) land in the review.
  await expect(
    page.getByPlaceholder("Expected answer / solution").first()
  ).toBeVisible({ timeout: 150_000 });
  const title = await page.getByPlaceholder("Title").inputValue();
  expect(title.length).toBeGreaterThan(2);
  await page.screenshot({ path: `${OUT}/30-quiz-editor.png` });

  // 2) Save it.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/UPCOMING/)).toBeVisible({ timeout: 15_000 });

  const ares = await page.request.get("/api/educators/assignments");
  const assignments = (await ares.json()).assignments as {
    id: string;
    title: string;
  }[];
  const assignmentId = assignments.find((a) => a.title === title)?.id;
  expect(assignmentId, "created assignment should be listed").toBeTruthy();

  // 3) The student does it on the share link — the full-screen practice-quiz
  // chrome renders one problem at a time (intro → answer each → Turn in).
  await page.goto(`/educators/a/${assignmentId}`);
  await page.getByRole("button", { name: /^Start$/ }).click({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/31-quiz-doing.png` });
  for (let i = 0; i < 12; i++) {
    const answer = page.getByPlaceholder(/Type your work and answer/i);
    await expect(answer).toBeVisible({ timeout: 15_000 });
    await answer.fill(`x = ${i + 3} (my work for question ${i + 1})`);
    const next = page.getByRole("button", { name: "Next problem" });
    if (await next.count()) {
      await next.click();
      continue;
    }
    await page.getByRole("button", { name: /^Turn in$/ }).click();
    break;
  }
  await expect(page.getByRole("heading", { name: /Nice work/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: `${OUT}/32-quiz-submitted.png` });

  // 4) Teacher AI-grades the per-question answers against the answer key.
  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await page.locator("button").filter({ hasText: title }).first().click();
  const drawer = page.locator("div.fixed");
  await expect(drawer.getByText(/QUIZ · AI-GRADED/)).toBeVisible({
    timeout: 15_000,
  });
  await drawer
    .getByRole("button", { name: /Grade ungraded \(\d+\)/i })
    .click();
  await expect
    .poll(async () => drawer.getByText(/%$/).count(), { timeout: 150_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: `${OUT}/33-quiz-graded.png` });

  // Cleanup what this test created.
  await page.request.delete(`/api/educators/assignments/${assignmentId}`);
  if (createdStudent && rosterId) {
    await page.request.delete(`/api/educators/students/${rosterId}`);
  }
});
