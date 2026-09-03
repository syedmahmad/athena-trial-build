import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Batch 5: verbatim homework toggle (#1), Settings student edit (#4),
 * AI homework insight / glowing lightbulb (#3). Local Supabase clone.
 */

const OUT = ".local/playwright/snapshots/educators-batch5";
const MARK = "ZZ-batch5";
// Submit is by signed-in identity, so the graded submission is turned in by
// the signed-in test teacher itself (added to the roster under this MARK).
const TEACHER_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";

test.describe.configure({ mode: "serial" });

const ids = { classId: "", textId: "", studentId: "" };

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

// Idempotent: clear any ZZ-batch5 leftovers from a prior partial run so the
// locators stay unique. Only touches MARK-prefixed test data.
test("reset batch5 test data", async ({ page }) => {
  for (const [path, key] of [
    ["/api/educators/assignments", "assignments"],
    ["/api/educators/students", "students"],
    ["/api/educators/classes", "classes"],
  ] as const) {
    const rows = (await (await page.request.get(path)).json())[key] as {
      id: string;
      title?: string;
      name?: string;
    }[];
    for (const r of rows) {
      if ((r.title ?? r.name ?? "").startsWith(MARK)) {
        await page.request.delete(`${path}/${r.id}`);
      }
    }
  }
});

test("#1 verbatim toggle creates homework exactly as written", async ({ page }) => {
  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /New homework/i }).click();
  await page.getByRole("button", { name: /Use exactly as written/i }).click();

  const exact =
    `${MARK} Verbatim Worksheet\n` +
    "Solve each problem and show your work.\n\n" +
    "1. 12 x 8 = ?\n2. 144 / 12 = ?\n\n" +
    "=== ANSWER KEY ===\n1. 96\n2. 12";
  await page.getByPlaceholder(/Paste or type the homework exactly/).fill(exact);
  await page.getByRole("button", { name: /Use as homework/i }).click();

  // First line became the title; body is verbatim (no model rewrite); key split.
  await expect(page.getByText("EDIT BEFORE SAVING")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByPlaceholder("Title")).toHaveValue(
    `${MARK} Verbatim Worksheet`
  );
  const body = await page.locator("textarea").first().inputValue();
  expect(body).toContain("12 x 8 = ?");
  expect(body).not.toContain("ANSWER KEY");
  const key = await page.locator("textarea").nth(1).inputValue();
  expect(key).toContain("96");
  await page.screenshot({ path: `${OUT}/01-verbatim-draft.png` });

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`${MARK} Verbatim Worksheet`)).toBeVisible({
    timeout: 15_000,
  });
});

test("#4 Settings is the management hub — edit a student inline", async ({
  page,
}) => {
  // Seed a class + student via API.
  const c = await page.request.post("/api/educators/classes", {
    data: { name: `${MARK} Period` },
  });
  ids.classId = ((await c.json()) as { class: { id: string } }).class.id;
  const s = await page.request.post("/api/educators/students", {
    data: {
      name: `${MARK} Wrongname`,
      studentEmail: "typo@school.test",
      parentEmail: "p@mail.test",
      classId: ids.classId,
    },
  });
  ids.studentId = ((await s.json()) as { student: { id: string } }).student.id;

  await page.goto("/educators/students");
  await page.getByRole("button", { name: /Settings/i }).click();
  const drawer = page.getByRole("dialog", { name: "Settings" });
  await expect(drawer.getByText(`${MARK} Wrongname`)).toBeVisible({ timeout: 15_000 });

  // Edit the student's name + email inline (only possible in Settings now).
  // The Add-student form shares these placeholders, so target the edit row
  // (the last occurrence).
  await drawer.getByRole("button", { name: `Edit ${MARK} Wrongname` }).click();
  await drawer.getByPlaceholder("Full name").last().fill(`${MARK} Fixedname`);
  await drawer
    .getByPlaceholder("Student school email")
    .last()
    .fill("fixed@school.test");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer.getByText(`${MARK} Fixedname`)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/02-settings-edit.png` });

  // Verify the write landed.
  const roster = (await (await page.request.get("/api/educators/students")).json())
    .students as { id: string; name: string; studentEmail: string }[];
  const me = roster.find((r) => r.id === ids.studentId)!;
  expect(me.name).toBe(`${MARK} Fixedname`);
  expect(me.studentEmail).toBe("fixed@school.test");
});

test("#3 glowing-lightbulb class insight on a graded assignment", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // Self-contained: create the text assignment to grade via the API so this
  // test never depends on another test's assignment surviving.
  const title = `${MARK} Insight Worksheet`;
  const made = await page.request.post("/api/educators/assignments", {
    data: {
      title,
      instructions: "1. 12 x 8 = ?\n2. 144 / 12 = ?",
      answerKey: "1. 96\n2. 12",
      dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    },
  });
  expect(made.ok(), `create → ${made.status()}`).toBeTruthy();
  ids.textId = ((await made.json()) as { assignment: { id: string } })
    .assignment.id;

  // Submit is by signed-in identity, so ensure the test teacher is on the
  // roster and turn the (wrong-ish) work in as itself, then grade that row.
  const roster = (await (await page.request.get("/api/educators/students")).json())
    .students as { id: string; studentEmail: string }[];
  let mine = roster.find(
    (s) => s.studentEmail.toLowerCase() === TEACHER_EMAIL.toLowerCase()
  );
  if (!mine) {
    const c = await page.request.post("/api/educators/students", {
      data: {
        name: `${MARK} Teacher-Student`,
        studentEmail: TEACHER_EMAIL,
        parentEmail: "p@mail.test",
      },
    });
    mine = (await c.json()).student;
  }
  ids.studentId = mine!.id;

  const sub = await page.request.post(
    `/api/educators/assignments/${ids.textId}/submit`,
    { data: { response: "1. 96\n2. I wasn't sure, maybe 24?" } }
  );
  expect(sub.ok(), `submit → ${sub.status()}`).toBeTruthy();
  const graded = await page.request.post("/api/educators/grade", {
    data: { assignmentId: ids.textId, studentId: ids.studentId },
  });
  expect(graded.ok(), `grade → ${graded.status()}`).toBeTruthy();

  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await page.getByText(title).click();
  const drawer = page.getByRole("dialog", { name: "Assignment" });

  const bulb = drawer.getByRole("button", {
    name: /What did the class struggle with/i,
  });
  await expect(bulb).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/03-lightbulb-idle.png` });

  const t0 = Date.now();
  await bulb.click();
  // The insight card appears with a headline.
  await expect(drawer.getByText(/TRY/).first()).toBeVisible({ timeout: 90_000 });
  console.log(`[timing] class insight: ${Date.now() - t0}ms`);
  const card = await drawer.locator(".border-amber-400\\/25").innerText();
  console.log(`[insight]\n${card}`);
  expect(card.length).toBeGreaterThan(40);
  await page.screenshot({ path: `${OUT}/04-lightbulb-insight.png` });
});

test("cleanup", async ({ page }: { page: Page }) => {
  if (ids.textId)
    await page.request.delete(`/api/educators/assignments/${ids.textId}`);
  if (ids.studentId)
    await page.request.delete(`/api/educators/students/${ids.studentId}`);
  if (ids.classId)
    await page.request.delete(`/api/educators/classes/${ids.classId}`);
});
