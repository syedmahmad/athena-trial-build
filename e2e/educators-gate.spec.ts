import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * The learning paywall gate. `users.learning_access === false` makes the
 * (protected) layout render the LearningUpsell in place of the app (the single
 * chokepoint). We flip the test teacher's flag via the service role so the
 * spec is self-contained, and restore full access afterward so the gated flag
 * never leaks into another spec's dashboard.
 */

const OUT = ".local/playwright/snapshots/educators-gate";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL =
  process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";

// The gate is only enforced when the educator paywall is on (server-side
// EDUCATOR_PAYWALL=1). With it off — the default — learning_access=false is a
// no-op and everyone passes through, so there is nothing to assert. The test
// and the server read the same .env, so this guard tracks the live behavior.
const PAYWALL_ON = /^(1|true|on)$/i.test(process.env.EDUCATOR_PAYWALL ?? "");

async function setLearningAccess(
  request: APIRequestContext,
  value: boolean | null
) {
  const r = await request.patch(
    `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(EMAIL)}`,
    {
      headers: {
        apikey: SVC,
        Authorization: `Bearer ${SVC}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      data: { learning_access: value },
    }
  );
  expect(
    r.ok(),
    `set learning_access=${value} → ${r.status()} ${await r.text()}`
  ).toBeTruthy();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

test.afterAll(async ({ request }) => {
  // Restore full access — a leaked FALSE would gate the account on /dashboard
  // for every later spec that signs in as this teacher (when the paywall is on).
  await setLearningAccess(request, true);
});

test("gated account sees the learning upsell on /dashboard", async ({ page }) => {
  test.skip(
    !PAYWALL_ON,
    "educator paywall off (EDUCATOR_PAYWALL unset) — learning_access=false is a no-op"
  );
  await setLearningAccess(page.request, false);
  await page.goto("/dashboard");

  // The shared upsell block: title, the family price, honest need-based copy,
  // and the subscribe CTA — i.e. NOT the normal dashboard.
  await expect(page.getByText(/The full Athena experience/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/\$7\.99/)).toBeVisible();
  await expect(page.getByText(/need-based access/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /SUBSCRIBE/i })).toBeVisible();
  await page.screenshot({ path: `${OUT}/01-gated-upsell.png` });
});

test("signed-out share link shows the sign-in gate", async ({ page, browser }) => {
  // Create a real text assignment as the teacher, then open it signed-out.
  const created = await page.request.post("/api/educators/assignments", {
    data: {
      title: "Gate share-link test",
      instructions: "Do this homework.",
      dueDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    },
  });
  expect(created.ok(), `create assignment → ${created.status()}`).toBeTruthy();
  const id = ((await created.json()) as { assignment: { id: string } })
    .assignment.id;

  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const p = await ctx.newPage();
  await p.goto(`/educators/a/${id}`);
  await expect(p.getByText(/Sign in to do this homework/i)).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    p.getByRole("button", { name: /create a free account/i })
  ).toBeVisible();
  await p.screenshot({ path: `${OUT}/02-signin-gate.png` });
  await ctx.close();

  await page.request.delete(`/api/educators/assignments/${id}`);
});
