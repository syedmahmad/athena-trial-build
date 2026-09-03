import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Post-migration smoke against whatever Supabase the server points at
 * (run with the managed dev server → the REAL project). Confirms every new
 * column/table/bucket from migrations 2 (real-loop) and 3 (images) is live.
 *
 * NON-DESTRUCTIVE: reads assert shape only; writes use a unique marker and
 * delete exactly what they create. Existing educator data is never touched.
 */

const MARK = "ZZ-smoke-delete-me";
// Submit is by signed-in identity, so the roster student that turns work in
// carries the signed-in test teacher's email.
const TEACHER_EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";

test.describe.configure({ mode: "serial" });

// IDs created during the run, torn down at the end.
const created = { classId: "", textId: "", practiceId: "", studentId: "" };

test("reads: every new column is selectable (no 500s)", async ({ page }) => {
  for (const path of [
    "/api/educators/classes",
    "/api/educators/assignments",
    "/api/educators/students",
    "/api/educators/submissions",
  ]) {
    const r = await page.request.get(path);
    expect(r.ok(), `${path} → ${r.status()}`).toBeTruthy();
  }
});

test("classes table accepts writes (RLS + columns)", async ({ page }) => {
  const r = await page.request.post("/api/educators/classes", {
    data: { name: `${MARK} Period` },
  });
  expect(r.ok(), `create class → ${r.status()}`).toBeTruthy();
  created.classId = ((await r.json()) as { class: { id: string } }).class.id;

  const list = await page.request.get("/api/educators/classes");
  const classes = (await list.json()).classes as { id: string }[];
  expect(classes.some((c) => c.id === created.classId)).toBeTruthy();
});

test("assignment answer_key + questions + class_id round-trip", async ({ page }) => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  // Text homework with a teacher-only answer key, in the smoke class.
  const text = await page.request.post("/api/educators/assignments", {
    data: {
      title: `${MARK} Text`,
      instructions: "Smoke test. Solve 2 + 2.",
      answerKey: "4",
      classId: created.classId,
      dueDate: tomorrow,
    },
  });
  expect(text.ok(), `create text → ${text.status()}`).toBeTruthy();
  const textA = (await text.json()).assignment as {
    id: string;
    answerKey: string | null;
    classId: string | null;
  };
  created.textId = textA.id;
  expect(textA.answerKey).toBe("4"); // teacher GET includes it
  expect(textA.classId).toBe(created.classId);

  // The PUBLIC projection must NOT leak the answer key.
  const pub = await page.request.get(`/api/educators/assignments/${created.textId}`);
  const pubA = (await pub.json()).assignment as Record<string, unknown>;
  expect(JSON.stringify(pubA)).not.toContain("answerKey");
  expect(JSON.stringify(pubA)).not.toContain('"4"');

  // Practice set: questions jsonb with a correct index.
  const practice = await page.request.post("/api/educators/assignments", {
    data: {
      title: `${MARK} Practice`,
      instructions: "Pick the right answer.",
      classId: created.classId,
      dueDate: tomorrow,
      source: "athena",
      questions: [
        {
          id: "q1",
          prompt: "2 + 2 = ?",
          options: ["3", "4", "5"],
          correctIndex: 1,
          explanation: "Basic addition.",
        },
      ],
    },
  });
  expect(practice.ok(), `create practice → ${practice.status()}`).toBeTruthy();
  created.practiceId = (await practice.json()).assignment.id;

  // Public projection strips correctIndex/explanation.
  const pubP = await page.request.get(
    `/api/educators/assignments/${created.practiceId}`
  );
  const pubPjson = JSON.stringify(await pubP.json());
  expect(pubPjson).not.toContain("correctIndex");
  expect(pubPjson).not.toContain("explanation");
});

test("student + practice submit (answers column + auto-grade)", async ({ page }) => {
  // The signed-in identity (test teacher) is the submitter, so its email must
  // be on the roster (find-or-create under the smoke class).
  const roster = (await (await page.request.get("/api/educators/students")).json())
    .students as { id: string; studentEmail: string }[];
  let mine = roster.find(
    (r) => r.studentEmail.toLowerCase() === TEACHER_EMAIL.toLowerCase()
  );
  if (!mine) {
    const s = await page.request.post("/api/educators/students", {
      data: {
        name: `${MARK} Student`,
        studentEmail: TEACHER_EMAIL,
        parentEmail: `parent.${TEACHER_EMAIL}`,
        classId: created.classId,
      },
    });
    expect(s.ok(), `create student → ${s.status()}`).toBeTruthy();
    mine = (await s.json()).student;
  }
  created.studentId = mine!.id;

  // Submit the practice set (exercises submitStudentWork + answers jsonb).
  const sub = await page.request.post(
    `/api/educators/assignments/${created.practiceId}/submit`,
    { data: { answers: [1] } }
  );
  expect(sub.ok(), `practice submit → ${sub.status()}`).toBeTruthy();
  const graded = (await sub.json()).graded as { grade: number };
  expect(graded.grade).toBe(100); // chose the correct option
});

test("photo submit lands in the educator-work bucket + signs a URL", async ({
  page,
}) => {
  // A real (tiny) JPEG rendered in-browser.
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(0, 0, 40, 40);
    ctx.fillStyle = "#222";
    ctx.fillText("hi", 6, 22);
    return c.toDataURL("image/jpeg", 0.8);
  });
  const b64 = dataUrl.split(",")[1];

  // Submit as the signed-in teacher (already on the roster from the prior
  // test); the posted body carries no email — identity is the session.
  const sub = await page.request.post(
    `/api/educators/assignments/${created.textId}/submit`,
    { data: { images: [{ data: b64, mediaType: "image/jpeg" }] } }
  );
  expect(sub.ok(), `photo submit → ${sub.status()}`).toBeTruthy();

  // Teacher list mints a signed URL → bucket exists and is readable.
  const subs = (await (await page.request.get("/api/educators/submissions")).json())
    .submissions as {
    assignmentId: string;
    images: string[] | null;
    imageUrls?: string[];
  }[];
  const mine = subs.find((x) => x.assignmentId === created.textId);
  expect(mine?.images?.length, "image path stored").toBeGreaterThan(0);
  expect(mine?.imageUrls?.[0], "signed URL minted").toContain("educator-work");
});

test("cleanup: delete exactly what we created", async ({ page }) => {
  const del = async (req: APIRequestContext, path: string) =>
    (await req.delete(path)).ok();
  if (created.textId)
    await del(page.request, `/api/educators/assignments/${created.textId}`);
  if (created.practiceId)
    await del(page.request, `/api/educators/assignments/${created.practiceId}`);
  if (created.studentId)
    await del(page.request, `/api/educators/students/${created.studentId}`);
  if (created.classId)
    await del(page.request, `/api/educators/classes/${created.classId}`);

  // Verify the smoke data is gone.
  const a = (await (await page.request.get("/api/educators/assignments")).json())
    .assignments as { title: string }[];
  expect(a.some((x) => x.title.startsWith(MARK))).toBeFalsy();
  const c = (await (await page.request.get("/api/educators/classes")).json())
    .classes as { name: string }[];
  expect(c.some((x) => x.name.startsWith(MARK))).toBeFalsy();
});
