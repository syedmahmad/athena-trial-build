import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * E2E of the closed loop: generate (answer key split) → share link (no key
 * leak) → student submit by SIGNED-IN identity (roster-mismatch gated, then
 * added + accepted) → explicit grading (no auto-fire, response never
 * rewritten) → simulate badged → practice set auto-graded → print page →
 * redirects. Runs against whatever Supabase the dev server points at.
 *
 * Submitting requires a signed-in account whose email is on the roster, so the
 * "student" who turns work in is the signed-in test teacher itself — its email
 * is added to the roster mid-test (after the roster-mismatch check). STUDENT2
 * stays a plain un-submitting roster row for the "not turned in" + simulate
 * coverage.
 */

const OUT = ".local/playwright/snapshots/educators-loop";
const TEACHER_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";
const STUDENT = {
  name: "Quinn Testford",
  email: TEACHER_EMAIL,
  parent: "testford.parent@mail.test",
};
const STUDENT2 = {
  name: "Mara Demoson",
  email: "mara@school.test",
  parent: "demoson.parent@mail.test",
};
const TEXT_ANSWER =
  "1. Photosynthesis is how plants make food from sunlight.\n2. My own words, typed by a real student in a test.";

test.describe.configure({ mode: "serial" });

let textAssignmentUrl = "";
let textAssignmentId = "";
let practiceAssignmentUrl = "";
let printUrl = "";

/** Do a free-response quiz in the practice-quiz chrome: Start → fill each
 *  question → Turn in on the last. Generated ("Write with AI") homework renders
 *  here — the plain text turn-in form is only for verbatim/API text homework. */
async function answerFreeResponseQuiz(page: Page, answer: string) {
  await page.getByRole("button", { name: /^Start$/ }).click({ timeout: 30_000 });
  for (let i = 0; i < 12; i++) {
    const box = page.getByPlaceholder(/Type your work and answer/i);
    await expect(box).toBeVisible({ timeout: 15_000 });
    await box.fill(`${answer} (q${i + 1})`);
    const next = page.getByRole("button", { name: "Next problem" });
    if (await next.count()) {
      await next.click();
      continue;
    }
    await page.getByRole("button", { name: /^Turn in$/ }).click();
    break;
  }
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function rosterReset(page: Page) {
  const a = await page.request.get("/api/educators/assignments");
  expect(a.ok()).toBeTruthy();
  for (const row of (await a.json()).assignments as { id: string }[]) {
    await page.request.delete(`/api/educators/assignments/${row.id}`);
  }
  const s = await page.request.get("/api/educators/students");
  expect(s.ok()).toBeTruthy();
  for (const row of (await s.json()).students as { id: string }[]) {
    await page.request.delete(`/api/educators/students/${row.id}`);
  }
  // Seed only STUDENT2 (never submits). STUDENT (the teacher-as-student) is
  // added during the submit test, after the roster-mismatch check.
  const created = await page.request.post("/api/educators/students", {
    data: {
      name: STUDENT2.name,
      studentEmail: STUDENT2.email,
      parentEmail: STUDENT2.parent,
    },
  });
  expect(created.ok()).toBeTruthy();
}

test("reset educator data", async ({ page }) => {
  await rosterReset(page);
});

test("generate splits the answer key out of student content", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();
  await page
    .getByPlaceholder(/Create homework that is about/)
    .fill(
      "Create homework that is about photosynthesis in a short-answer style with 4 questions for grade 7. Include an answer key."
    );
  await page.getByRole("button", { name: /Generate homework/i }).click();
  await expect(page.getByText("EDIT BEFORE SAVING")).toBeVisible({
    timeout: 120_000,
  });

  const instructions = await page.locator("textarea").first().inputValue();
  const key = await page.locator("textarea").nth(1).inputValue();
  expect(instructions).not.toContain("ANSWER KEY");
  expect(instructions).not.toMatch(/Name:\s*_+/i); // no print-era headers
  expect(key.length).toBeGreaterThan(20); // key landed in its own field
  await page.screenshot({ path: `${OUT}/01-editor-key-split.png` });

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/UPCOMING · 1/)).toBeVisible({ timeout: 15_000 });

  const href = await page
    .getByRole("link", { name: /Student view/i })
    .first()
    .getAttribute("href");
  expect(href).toBeTruthy();
  textAssignmentUrl = href!;
  textAssignmentId = href!.match(/\/a\/([^/?]+)/)?.[1] ?? "";
  expect(textAssignmentId).toBeTruthy();
  const printHref = await page
    .getByRole("link", { name: /Print \/ PDF/i })
    .first()
    .getAttribute("href");
  printUrl = printHref!;
});

test("share page shows no answer key, gates non-roster, then accepts a submission", async ({
  page,
}) => {
  await page.goto(textAssignmentUrl);
  // Generated homework renders in the quiz chrome (intro → Start → per-question).
  await expect(page.getByRole("button", { name: /^Start$/ })).toBeVisible({
    timeout: 30_000,
  });
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Answer Key");
  expect(body).not.toContain("ANSWER KEY");

  // Roster-mismatch is enforced on the signed-in identity: the teacher isn't on
  // the roster yet, so a submit posted as the session is rejected (a posted
  // email is never trusted anymore).
  const rejected = await page.request.post(
    `/api/educators/assignments/${textAssignmentId}/submit`,
    { data: { response: TEXT_ANSWER } }
  );
  const rejectedBody = await rejected.text();
  expect(rejected.status(), rejectedBody).toBe(404);
  expect(rejectedBody).toMatch(/isn't on the class roster/i);
  await page.screenshot({ path: `${OUT}/02-share-not-on-roster.png` });

  // Add the signed-in account to the roster, reload, and the same identity is
  // now accepted — do the quiz in the UI this time.
  const created = await page.request.post("/api/educators/students", {
    data: {
      name: STUDENT.name,
      studentEmail: STUDENT.email,
      parentEmail: STUDENT.parent,
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.reload();
  await answerFreeResponseQuiz(page, TEXT_ANSWER);
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Nice work, ${STUDENT.name.split(" ")[0]}`),
    })
  ).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/03-share-submitted.png` });
});

test("grading: no auto-fire, explicit grade, response preserved", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1\/2 TURNED IN/)).toBeVisible();

  await page
    .locator("button")
    .filter({ hasText: /TURNED IN/ })
    .first()
    .click();
  await expect(page.getByText("STUDENTS", { exact: true })).toBeVisible();

  // No auto-grading happened just from opening the drawer.
  await page.waitForTimeout(2500);
  const drawer = page.locator("div.fixed");
  expect(await drawer.getByText(/%$/).count()).toBe(0);
  await expect(drawer.getByText("TURNED IN", { exact: true })).toBeVisible();
  await expect(drawer.getByText("NO SUBMISSION")).toBeVisible();
  await page.screenshot({ path: `${OUT}/04-grading-before.png` });

  // Explicit batch grade — only the turned-in student gets graded.
  const t0 = Date.now();
  await drawer.getByRole("button", { name: /Grade ungraded \(1\)/i }).click();
  await expect
    .poll(async () => drawer.getByText(/%$/).count(), { timeout: 120_000 })
    .toBeGreaterThan(0);
  console.log(`[timing] explicit grade: ${Date.now() - t0}ms`);

  // The student's response text was preserved verbatim.
  await drawer.getByText(STUDENT.name).click();
  await expect(drawer.getByText(/typed by a real student in a test/)).toBeVisible();
  await expect(drawer.getByText("FEEDBACK")).toBeVisible();
  await page.screenshot({ path: `${OUT}/05-grading-after.png` });
});

test("simulate is explicit and badged", async ({ page }) => {
  test.setTimeout(180_000);
  // Simulate only applies to text homework — a quiz's students answer directly,
  // so the route rejects assignments with questions. Create a plain text
  // assignment for STUDENT2 to be simulated against, then remove it so the
  // later UPCOMING count is unaffected.
  const simTitle = "Reflection — simulate demo";
  const made = await page.request.post("/api/educators/assignments", {
    data: {
      title: simTitle,
      instructions: "Write one paragraph about what you learned this week.",
      dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    },
  });
  expect(made.ok()).toBeTruthy();
  const simId = ((await made.json()) as { assignment: { id: string } })
    .assignment.id;

  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await page.locator("button").filter({ hasText: simTitle }).first().click();
  const drawer = page.locator("div.fixed");
  await expect(drawer.getByText(STUDENT2.name)).toBeVisible({ timeout: 15_000 });

  await drawer.getByText(STUDENT2.name).click();
  await drawer.getByRole("button", { name: /Simulate \(demo\)/i }).click();
  await expect(drawer.getByText("SIMULATED")).toBeVisible({ timeout: 120_000 });
  // Row stays expanded after simulating — the provenance notice is shown.
  await expect(
    drawer.getByText(/This response was AI-invented/i)
  ).toBeVisible();
  await page.screenshot({ path: `${OUT}/06-simulated-badge.png` });

  // Escape closes the drawer (a11y).
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();

  // Remove the demo assignment so the practice test's UPCOMING count holds.
  await page.request.delete(`/api/educators/assignments/${simId}`);
});

test("practice set: pull from bank, student auto-graded on submit", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();
  await page
    .getByRole("button", { name: /From Athena's problem bank/i })
    .click();
  await page.locator("select").first().selectOption({ label: "Advanced Math" });
  await page
    .locator("select")
    .nth(1)
    .selectOption({ label: "Function transformations" });
  await page.getByRole("button", { name: /Pull problems/i }).click();
  await expect(page.getByText(/6 QUESTIONS · AUTO-GRADED/)).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({ path: `${OUT}/07-practice-editor.png` });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/UPCOMING · 2/)).toBeVisible({ timeout: 15_000 });

  // Resolve the practice set from the API — it's the only assignment with
  // multiple-choice questions (`options`), vs the generated free-response quiz.
  // (Locating by the AUTO-GRADED chip in the list is fragile when a second
  // question-based assignment is also upcoming.)
  const assignments = (await (
    await page.request.get("/api/educators/assignments")
  ).json()).assignments as {
    id: string;
    title: string;
    questions: { options?: string[] }[] | null;
  }[];
  const practice = assignments.find((a) =>
    a.questions?.some((q) => Array.isArray(q.options))
  );
  expect(practice, "MC practice assignment should exist").toBeTruthy();
  practiceAssignmentUrl = `/educators/a/${practice!.id}`;
  const practiceTitle = practice!.title;

  // Student does the MC practice set in the full-screen quiz chrome, one
  // problem at a time: pick option A on each, advance, Turn in on the last.
  // (The audio toggle also has aria-pressed but carries an aria-label, so the
  // answer options are the aria-pressed buttons without one.)
  await page.goto(practiceAssignmentUrl);
  await page.getByRole("button", { name: /^Start$/ }).click({ timeout: 30_000 });
  for (let i = 0; i < 12; i++) {
    const options = page.locator('button[aria-pressed]:not([aria-label])');
    await expect(options.first()).toBeVisible({ timeout: 15_000 });
    await options.first().click();
    const next = page.getByRole("button", { name: "Next problem" });
    if (await next.count()) {
      await next.click();
      continue;
    }
    await page.getByRole("button", { name: /^Turn in$/ }).click();
    break;
  }
  await expect(page.getByText(/You got \d+ of 6 correct/)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: `${OUT}/08-practice-scored.png` });

  // Teacher sees the auto-grade + per-question chips without any LLM call.
  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await page
    .locator("button")
    .filter({ hasText: practiceTitle })
    .first()
    .click();
  const drawer = page.locator("div.fixed");
  await expect(drawer.getByText(/PRACTICE SET · AUTO-GRADED/)).toBeVisible();
  await drawer.getByText(STUDENT.name).click();
  await expect(drawer.getByText("ANSWERS")).toBeVisible();
  await page.screenshot({ path: `${OUT}/09-practice-grading.png` });
});

test("print page renders worksheet with toggleable key", async ({ page }) => {
  await page.goto(printUrl);
  await expect(page.getByRole("button", { name: /Print \/ Save as PDF/i })).toBeVisible(
    { timeout: 30_000 }
  );
  await expect(page.getByText(/Answer Key/)).toBeVisible();
  await expect(page.getByText("Name", { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/10-print-with-key.png`, fullPage: true });

  await page.getByLabel(/Include answer key/i).uncheck();
  await expect(page.getByText(/— Answer Key/)).not.toBeVisible();
  await page.screenshot({ path: `${OUT}/11-print-student-copy.png`, fullPage: true });
});

test("redirects and students page", async ({ page }) => {
  await page.goto("/educators/calendar");
  await expect(page).toHaveURL(/\/educators\/homework/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /June|July|May/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: `${OUT}/12-calendar-view.png` });

  await page.goto("/educators/reports");
  await expect(page).toHaveURL(/\/educators\/students/, { timeout: 20_000 });
  await expect(page.getByText(/ROSTER · 2/)).toBeVisible({ timeout: 30_000 });
  // Real stats only — class health reflects graded real work.
  await expect(page.getByText("CLASS HEALTH")).toBeVisible();
  await page.screenshot({ path: `${OUT}/13-students-page.png` });
});
