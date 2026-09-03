import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * SAT brand surface (/sat) — positioning flow + progress dashboard.
 *
 * Exercises the restored onboarding APIs (/api/quiz/*, /api/onboarding/*),
 * the resurrected dashboard, and the learn/progress pages, as the signed-in
 * Playwright test user. Runs against the chromium project's storageState.
 */

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";

const SHOT_DIR =
  process.env.SAT_SHOT_DIR || ".local/playwright/.results/sat-surface";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin env missing");
  return createClient(url, key);
}

test.describe("SAT surface", () => {
  test.beforeAll(async () => {
    // Reset the test user's positioning state so the flow is deterministic
    // across runs (the account persists between runs).
    const db = admin();
    const { data: user } = await db
      .from("users")
      .select("id")
      .eq("email", EMAIL)
      .maybeSingle();
    if (user) {
      await db.from("onboarding_progress").delete().eq("user_id", user.id);
      await db
        .from("users")
        .update({ onboarding_completed: false, skill_score: null })
        .eq("id", user.id);
    }
  });

  test("user/me exposes onboarding state again", async ({ page }) => {
    const res = await page.request.get("/api/user/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toBeTruthy();
    expect(body.user.onboardingCompleted).toBe(false);
    expect("onboarding" in body).toBe(true);
  });

  test("onboarding hub routes a fresh user to the plan step", async ({ page }) => {
    await page.goto("/sat/onboarding");
    await page.waitForURL("**/sat/onboarding/plan", { timeout: 15_000 });
    // Plan wizard step 0 asks for the student's name.
    await expect(
      page.getByText(/name/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${SHOT_DIR}/plan.png` });
  });

  test("diagnostic quiz loads questions from the restored API", async ({ page }) => {
    const res = await page.request.get("/api/quiz/questions");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions.length).toBeGreaterThanOrEqual(10);
    // correctOption must never reach the client.
    expect(body.questions[0].correctOption).toBeUndefined();

    await page.goto("/sat/onboarding/quiz");
    await expect(page.getByText(body.questions[0].questionText.slice(0, 40))).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: `${SHOT_DIR}/quiz.png` });
  });

  test("attempt + complete produce a skill score (positioning)", async ({ page }) => {
    const questions = await (await page.request.get("/api/quiz/questions")).json();
    const q = questions.questions[0];

    const attempt = await page.request.post("/api/quiz/attempt", {
      data: {
        questionId: q.id,
        selectedOption: 0,
        timeSpentSeconds: 5,
        nextIndex: 1,
      },
    });
    expect(attempt.status()).toBe(200);
    const attemptBody = await attempt.json();
    expect(typeof attemptBody.isCorrect).toBe("boolean");
    expect(typeof attemptBody.correctOption).toBe("number");

    const complete = await page.request.post("/api/quiz/complete");
    expect(complete.status()).toBe(200);
    const completeBody = await complete.json();
    expect(typeof completeBody.skillScore).toBe("number");
    expect(completeBody.correctCount).toBeGreaterThanOrEqual(0);
  });

  test("schedule + finish flips onboardingCompleted", async ({ page }) => {
    const scheduled = await page.request.post("/api/schedule", {
      data: {
        slots: [{ dayOfWeek: "monday", startTime: "16:00", endTime: "17:00" }],
        timezone: "America/New_York",
      },
    });
    expect(scheduled.status()).toBe(200);

    // Regression check for the updateUser identity-column fix: the timezone
    // write goes through updateUser(externalId) and the test account is
    // Supabase-native (clerk_id NULL), so this row only changes if updateUser
    // matches auth_id in supabase mode.
    const db = admin();
    const { data: row } = await db
      .from("users")
      .select("timezone, clerk_id")
      .eq("email", EMAIL)
      .single();
    expect(row?.clerk_id).toBeNull();
    expect(row?.timezone).toBe("America/New_York");

    const done = await page.request.post("/api/onboarding/complete");
    expect(done.status()).toBe(200);

    const me = await (await page.request.get("/api/user/me")).json();
    expect(me.user.onboardingCompleted).toBe(true);
    expect(me.onboarding?.currentStep).toBe("completed");
  });

  test("restored dashboard renders rank, streak, and zones", async ({ page }) => {
    await page.goto("/sat/dashboard");
    // RankCard headline stat + the weekly streak card come from /api/dashboard.
    await expect(page.getByText(/battle zones/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: `${SHOT_DIR}/dashboard.png`, fullPage: true });
  });

  test("learn page lists SAT topics with sat-flagged launches", async ({ page }) => {
    await page.goto("/sat/learn");
    const topicButton = page.locator("main h2").first();
    await expect(topicButton).toBeVisible({ timeout: 20_000 });
    await topicButton.click();
    const lessonLink = page.getByRole("link", { name: /lesson/i }).first();
    await expect(lessonLink).toBeVisible();
    await expect(lessonLink).toHaveAttribute("href", /\/micro-lesson\?sat=1$/);
    await page.screenshot({ path: `${SHOT_DIR}/learn.png` });
  });

  test("main app /queue progress page is unchanged", async ({ page }) => {
    await page.goto("/queue");
    await expect(page.getByText("Your Progress")).toBeVisible({ timeout: 20_000 });
    // Default (non-SAT) subtitle — proves the shared component still renders
    // the unfiltered view for the main app.
    await expect(page.getByText("Across your subjects")).toBeVisible();
  });

  test("progress page renders the SAT progress suite", async ({ page }) => {
    await page.goto("/sat/progress");
    await expect(page.getByText(/reading.*writing/i).first()).toBeVisible({
      timeout: 20_000,
    });
    // Let the stagger-reveal animations finish before capturing.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOT_DIR}/progress.png`, fullPage: true });
  });
});
