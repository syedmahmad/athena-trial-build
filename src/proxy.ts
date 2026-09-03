import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Same protected surface under either provider.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/queue",
  "/my-learning",
  "/learning",
  "/profile",
  // Educator teacher surface — gated server-side here (not just by the client
  // SignedIn shim) so a cold-load client-session race can't bounce an
  // authenticated teacher to /sign-in. Public /educators landing,
  // /educators/a/[id] share links, and the calendar/reports redirects stay open.
  "/educators/homework",
  "/educators/grading",
  "/educators/students",
  "/educators/print",
  // SAT brand surface — public /sat landing stays open; the app + the
  // positioning flow require a session.
  "/sat/dashboard",
  "/sat/progress",
  "/sat/learn",
  "/sat/onboarding",
];
const isProtectedPath = (path: string) =>
  PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

// ─── Clerk path (default) ───────────────────────────────────────────────
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/queue(.*)",
  "/my-learning(.*)",
  "/learning(.*)",
  "/profile(.*)",
  "/educators/homework(.*)",
  "/educators/grading(.*)",
  "/educators/students(.*)",
  "/educators/print(.*)",
  "/sat/dashboard(.*)",
  "/sat/progress(.*)",
  "/sat/learn(.*)",
  "/sat/onboarding(.*)",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

// ─── Supabase path ──────────────────────────────────────────────────────
// Refreshes the auth cookie (the @supabase/ssr middleware contract) and
// redirects unauthenticated users away from protected routes — the Supabase
// equivalent of Clerk's auth.protect().
async function supabaseHandler(req: NextRequest) {
  const { createServerClient } = await import("@supabase/ssr");
  let res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() (not getSession) — it revalidates the token and
  // triggers the refresh that setAll persists.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(req.nextUrl.pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirect_url", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

// Flag is constant per deployment — pick the handler once at module load.
const useSupabase = process.env.NEXT_PUBLIC_AUTH_PROVIDER === "supabase";
export default useSupabase ? supabaseHandler : clerkHandler;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
