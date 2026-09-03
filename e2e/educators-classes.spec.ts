import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * E2E for class/section support: create two classes, assign students and
 * homework, verify the header switcher filters every page, and confirm
 * deleting a class leaves its work intact (just unassigned).
 */

const OUT = ".local/playwright/snapshots/educators-classes";

test.describe.configure({ mode: "serial" });

const P3 = "Period 3 Algebra";
const P5 = "Period 5 Geometry";

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function resetAll(page: Page) {
  for (const path of [
    "/api/educators/assignments",
    "/api/educators/students",
    "/api/educators/classes",
  ]) {
    const r = await page.request.get(path);
    expect(r.ok()).toBeTruthy();
    const key = path.split("/").pop()!;
    const rows = (await r.json())[key] as { id: string }[];
    for (const row of rows) {
      await page.request.delete(`${path}/${row.id}`);
    }
  }
}

async function createClass(page: Page, name: string): Promise<string> {
  const r = await page.request.post("/api/educators/classes", { data: { name } });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { class: { id: string } }).class.id;
}

test("seed classes, students, assignments via API", async ({ page }) => {
  await resetAll(page);
  const p3 = await createClass(page, P3);
  const p5 = await createClass(page, P5);

  // Two students per class + one unassigned.
  const roster = [
    { name: "Ada P3", email: "ada.p3@school.test", classId: p3 },
    { name: "Ben P3", email: "ben.p3@school.test", classId: p3 },
    { name: "Cara P5", email: "cara.p5@school.test", classId: p5 },
    { name: "Dan Unassigned", email: "dan@school.test", classId: null },
  ];
  for (const s of roster) {
    const r = await page.request.post("/api/educators/students", {
      data: {
        name: s.name,
        studentEmail: s.email,
        parentEmail: `parent.${s.email}`,
        classId: s.classId,
      },
    });
    expect(r.ok()).toBeTruthy();
  }

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  for (const a of [
    { title: "P3 Homework One", classId: p3 },
    { title: "P5 Homework One", classId: p5 },
    { title: "Whole-class notice", classId: null },
  ]) {
    const r = await page.request.post("/api/educators/assignments", {
      data: {
        title: a.title,
        instructions: "Do the thing.",
        dueDate: tomorrow,
        classId: a.classId,
      },
    });
    expect(r.ok()).toBeTruthy();
  }
});

// Each test gets its own browser context (no shared localStorage), so each
// selects the class it needs. Persistence-across-nav is covered within a
// single context below by navigating via the nav links (the layout — and its
// class state — survives route changes).
const selectClass = async (page: Page, name: string | RegExp) => {
  await page.getByRole("button", { name: /All classes|Period/ }).first().click();
  await page.getByRole("option", { name }).click();
};

test("switcher filters homework and persists across nav", async ({ page }) => {
  await page.goto("/educators/homework");
  // "All classes" view: every assignment + class chips visible.
  await expect(page.getByText("P3 Homework One")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("P5 Homework One")).toBeVisible();
  await expect(page.getByText("Whole-class notice")).toBeVisible();
  await expect(page.getByText(P3, { exact: true })).toBeVisible(); // class chip
  await page.screenshot({ path: `${OUT}/01-homework-all.png` });

  // Switch to Period 3 → only its homework remains.
  await selectClass(page, P3);
  await expect(page.getByText("P3 Homework One")).toBeVisible();
  await expect(page.getByText("P5 Homework One")).toHaveCount(0);
  await expect(page.getByText("Whole-class notice")).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/02-homework-p3.png` });

  // Navigate to Students via the nav — the layout (and class selection)
  // persists across the route change, so the roster is still P3-scoped.
  await page.getByRole("link", { name: "Students" }).click();
  await expect(page).toHaveURL(/\/educators\/students/);
  await expect(page.getByText(`${P3.toUpperCase()} · 2`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Ada P3")).toBeVisible();
  await expect(page.getByText("Cara P5")).toHaveCount(0);
  await expect(page.getByText("Dan Unassigned")).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/03-students-p3.png` });
});

test("grading is scoped to the selected class", async ({ page }) => {
  await page.goto("/educators/grading");
  await expect(page.getByText(/ASSIGNMENTS ·/)).toBeVisible({ timeout: 30_000 });
  await selectClass(page, P3);
  // Only the P3 assignment is gradable.
  await expect(page.getByText("P3 Homework One")).toBeVisible();
  await expect(page.getByText("P5 Homework One")).toHaveCount(0);

  await page.getByText("P3 Homework One").click();
  const drawer = page.getByRole("dialog", { name: "Assignment" });
  // Only the 2 P3 students appear in the grading drawer.
  await expect(drawer.getByText("Ada P3")).toBeVisible();
  await expect(drawer.getByText("Ben P3")).toBeVisible();
  await expect(drawer.getByText("Cara P5")).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/04-grading-p3.png` });
  await page.keyboard.press("Escape");
});

test("settings: reassign a student across classes", async ({ page }) => {
  await page.goto("/educators/students");
  // Fresh context defaults to All — the full roster shows in Settings.
  await page.getByRole("button", { name: /Settings/i }).click();
  const drawer = page.getByRole("dialog", { name: "Settings" });
  await expect(drawer.getByText(/CLASSES · 2/)).toBeVisible();

  // Reassign Dan (unassigned) to Period 5 via his row dropdown.
  await expect(drawer.getByText("Dan Unassigned")).toBeVisible();
  await drawer
    .getByLabel("Class for Dan Unassigned")
    .selectOption({ label: P5 });

  // The select's onChange fires an async mutation; poll the API until the
  // reassignment persists rather than racing a fixed delay (remote latency
  // made the old fixed 800ms wait flaky).
  await expect
    .poll(
      async () => {
        const r = await page.request.get("/api/educators/students");
        const dan = ((await r.json()).students as {
          name: string;
          classId: string | null;
        }[]).find((s) => s.name === "Dan Unassigned");
        return dan?.classId ?? null;
      },
      { timeout: 15_000 }
    )
    .toBeTruthy();
  await page.screenshot({ path: `${OUT}/05-settings.png` });
});

test("deleting a class unassigns its work, never deletes it", async ({ page }) => {
  // Count assignments before.
  const before = await page.request.get("/api/educators/assignments");
  const beforeCount = ((await before.json()).assignments as unknown[]).length;
  expect(beforeCount).toBe(3);

  const classesRes = await page.request.get("/api/educators/classes");
  const p3 = ((await classesRes.json()).classes as { id: string; name: string }[]).find(
    (c) => c.name === P3
  )!;
  const del = await page.request.delete(`/api/educators/classes/${p3.id}`);
  expect(del.ok()).toBeTruthy();

  // Assignments survive; the P3 one is now unassigned.
  const after = await page.request.get("/api/educators/assignments");
  const list = (await after.json()).assignments as {
    title: string;
    classId: string | null;
  }[];
  expect(list.length).toBe(3);
  expect(list.find((a) => a.title === "P3 Homework One")?.classId).toBeNull();

  // Students survive too.
  const studs = await page.request.get("/api/educators/students");
  expect(((await studs.json()).students as unknown[]).length).toBe(4);

  // UI: switcher now lists only Period 5.
  await page.goto("/educators/homework");
  await page.getByRole("button", { name: /classes|Period/i }).first().click();
  await expect(page.getByRole("option", { name: P5 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("option", { name: P3 })).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/06-after-delete.png` });
});
