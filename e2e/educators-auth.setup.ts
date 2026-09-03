import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Headless Supabase session capture. Replaces the old Clerk TICKET setup after
 * the Clerk -> Supabase auth migration (NEXT_PUBLIC_AUTH_PROVIDER=supabase).
 *
 * Provisions a confirmed, password-having teacher via the admin API
 * (idempotent — the dedicated test email is managed solely by this setup, so
 * the password stays deterministic), signs in through the real Supabase form,
 * and saves storage state for the authed specs. The on_auth_user_created
 * trigger inserts the matching public.users row, which the educator specs need
 * as their teacher_id.
 */

const AUTH_FILE = ".local/playwright/.auth/state.json";

const GOTRUE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || "playwright-teacher@example.test";
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || "test-Password-123!";

setup("authenticate", async ({ page }) => {
  setup.setTimeout(120_000);
  if (!GOTRUE) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing from env");
  if (!SVC) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing from env");

  // Provision a confirmed password user (idempotent). 200 = created;
  // 422 = already exists with the same deterministic password.
  const provision = await page.request.post(`${GOTRUE}/auth/v1/admin/users`, {
    headers: { apikey: SVC, Authorization: `Bearer ${SVC}` },
    data: { email: EMAIL, password: PASSWORD, email_confirm: true },
  });
  if (!provision.ok() && provision.status() !== 422) {
    throw new Error(
      `admin createUser failed: ${provision.status()} ${await provision.text()}`
    );
  }

  // Sign in through the real Supabase form.
  await page.goto("/sign-in");
  await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder("you@school.org").fill(EMAIL);
  await page.getByPlaceholder("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // The form hard-navigates to `next` (/dashboard) once the session cookie is
  // set. Landing there (not bounced back to /sign-in) proves the middleware
  // honored the Supabase session.
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/sign-in/);

  mkdirSync(".local/playwright/.auth", { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
