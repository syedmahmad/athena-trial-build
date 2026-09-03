import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Visual check of the UX batch:
 *  1. EduDrawer panels are full-screen pages (grading detail, student, settings)
 *  2. ungraded assignments show red (list badge + per-student status)
 *  3. AI feedback and teacher feedback render separately
 *  4. the roster list has no email button
 * Creates a text assignment (verbatim, no LLM), submits ungraded, then grades.
 */

const OUT = ".local/playwright/snapshots/educators-ux";
// Submit is by signed-in identity, so the student we turn work in as is the
// test teacher itself (added to its own roster below).
const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";
const TITLE = "Reading Response Check";

test("full-page panels, red ungraded, split feedback, no roster email button", async ({
  page,
}) => {
  test.setTimeout(240_000);
  mkdirSync(OUT, { recursive: true });

  // Clean slate + ensure the signed-in account is on the roster.
  const ex = await page.request.get("/api/educators/assignments");
  for (const a of (await ex.json()).assignments as { id: string }[]) {
    await page.request.delete(`/api/educators/assignments/${a.id}`);
  }
  const sres = await page.request.get("/api/educators/students");
  let students = (await sres.json()).students as {
    id: string;
    name: string;
    studentEmail: string;
  }[];
  let me = students.find(
    (s) => s.studentEmail.toLowerCase() === EMAIL.toLowerCase()
  );
  let createdStudent = false;
  if (!me) {
    const c = await page.request.post("/api/educators/students", {
      data: { name: "Demo Student", studentEmail: EMAIL, parentEmail: "p@demo.test" },
    });
    me = (await c.json()).student;
    createdStudent = true;
  }
  const studentName = me!.name;

  // Create a text assignment with the verbatim path (no model call).
  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();
  await page.getByRole("button", { name: /Use exactly as written/i }).click();
  await page
    .getByPlaceholder(/Paste or type the homework/)
    .fill(`${TITLE}\n\nWrite one paragraph about the chapter you read.`);
  await page.getByRole("button", { name: /Use as homework/i }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/UPCOMING/)).toBeVisible({ timeout: 15_000 });

  const a2 = await page.request.get("/api/educators/assignments");
  const aid = ((await a2.json()).assignments as { id: string; title: string }[]).find(
    (x) => x.title === TITLE
  )!.id;

  // Student turns in text → ungraded.
  await page.goto(`/educators/a/${aid}`);
  await expect(page.getByText(/TURN IN YOUR WORK/)).toBeVisible({ timeout: 30_000 });
  await page
    .getByPlaceholder(/Type your work/)
    .fill("The chapter was about migration. My paragraph, as a student.");
  await page.getByRole("button", { name: /Turn in/i }).click();
  await expect(page.getByRole("heading", { name: /Nice work/i })).toBeVisible({
    timeout: 20_000,
  });

  // (2) Grading list: ungraded shows red.
  await page.goto("/educators/grading");
  await expect(page.getByText(/1 TO GRADE/)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${OUT}/40-grading-list-red.png` });

  // (1) Open the assignment → full-screen page (role=dialog covers the viewport).
  await page.locator("button").filter({ hasText: TITLE }).first().click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("STUDENTS", { exact: true })).toBeVisible();
  const box = await panel.boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.width).toBeGreaterThan(vp.width - 2); // truly full-width (not a sidebar)
  await page.screenshot({ path: `${OUT}/41-grading-detail-fullpage.png` });

  // AI-grade, then add teacher feedback → both render separately.
  await panel.getByRole("button", { name: /Grade ungraded \(\d+\)/i }).click();
  await expect
    .poll(async () => panel.getByText(/%$/).count(), { timeout: 150_000 })
    .toBeGreaterThan(0);
  await panel.getByText(studentName).first().click();
  await expect(panel.getByText("AI FEEDBACK").first()).toBeVisible();
  await panel.getByRole("button", { name: /^Edit$/ }).click();
  await panel
    .getByPlaceholder(/your own comment/)
    .fill("Nice start. Add one example next time. - Teacher");
  await panel.getByRole("button", { name: /^Save$/ }).click();
  await expect(panel.getByText("TEACHER FEEDBACK")).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText("AI FEEDBACK").first()).toBeVisible();
  await page.screenshot({ path: `${OUT}/42-feedback-split.png` });
  await page.keyboard.press("Escape");

  // (4) Roster list has no email button. (1) Student + Settings are full pages.
  await page.goto("/educators/students");
  await expect(page.getByText(/ROSTER|·/).first()).toBeVisible({ timeout: 30_000 });
  expect(await page.getByRole("button", { name: "Log parent report" }).count()).toBe(0);
  await page.screenshot({ path: `${OUT}/43-roster-no-email-btn.png` });

  await page.getByText(studentName).first().click();
  const studentPanel = page.getByRole("dialog");
  await expect(studentPanel.getByText("PARENT REPORTS", { exact: false })).toBeVisible();
  expect((await studentPanel.boundingBox())!.width).toBeGreaterThan(vp.width - 2);
  await page.screenshot({ path: `${OUT}/44-student-detail-fullpage.png` });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /Settings/i }).click();
  const settingsPanel = page.getByRole("dialog");
  await expect(settingsPanel.getByText("ADD STUDENT", { exact: false })).toBeVisible();
  expect((await settingsPanel.boundingBox())!.width).toBeGreaterThan(vp.width - 2);
  await page.screenshot({ path: `${OUT}/45-settings-fullpage.png` });

  // Cleanup.
  await page.request.delete(`/api/educators/assignments/${aid}`);
  if (createdStudent) await page.request.delete(`/api/educators/students/${me!.id}`);
});
