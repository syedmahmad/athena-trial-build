import { test, expect } from "@playwright/test";

/**
 * Full browser sign-in → session → app loop in Supabase-auth mode
 * (NEXT_PUBLIC_AUTH_PROVIDER=supabase). Self-provisions its own auth user and
 * overrides storageState to start unauthenticated, so it exercises the real
 * sign-in form independent of the shared teacher session.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const GOTRUE = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = "supabase-e2e@example.test";
const PASSWORD = "test-Password-123!";

test("email+password sign-in reaches the app and resolves the user", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Provision a confirmed, password-having auth user (idempotent). The
  // on_auth_user_created trigger inserts the matching public.users row.
  await page.request.post(`${GOTRUE}/auth/v1/admin/users`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    data: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });

  // Sign in through the real Supabase form.
  await page.goto("/sign-in");
  await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder("you@school.org").fill(EMAIL);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // The form hard-navigates to `next` (/dashboard) once the session cookie is
  // set. Landing there (not bounced to /sign-in) proves the middleware honored
  // the Supabase session.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/sign-in/);

  // And the server resolves the app user from the session (getCurrentUser).
  const me = await page.request.get("/api/user/me");
  expect(me.ok(), `/api/user/me → ${me.status()}`).toBeTruthy();
  const body = (await me.json()) as { user?: { email?: string } };
  expect(body.user?.email).toBe(EMAIL);
});
