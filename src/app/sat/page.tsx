import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ParticlesBackground } from "@/components/particles-background";
import { getAuthIdentity } from "@/lib/auth/current-user";
import { SAT_BRAND, SAT_ROUTES } from "@/lib/sat/brand";

export default async function SatLandingPage() {
  const { userId } = await getAuthIdentity();

  if (userId) {
    redirect(SAT_ROUTES.dashboard);
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <ParticlesBackground />
      {/* Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <span className="flex items-baseline gap-3">
          <span className="sat-serif text-2xl tracking-tight">
            {SAT_BRAND.name}
          </span>
          <span className="sat-micro text-muted-foreground">
            {SAT_BRAND.microLabel}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href={`/sign-in?redirect_url=${SAT_ROUTES.dashboard}`}>
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href={`/sign-up?redirect_url=${SAT_ROUTES.onboarding}`}>
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl space-y-6">
          <div className="sat-accent-pill inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {SAT_BRAND.tagline}
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Consistency beats
            <br />
            <span className="sat-accent-text">intensity.</span>
          </h1>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground">
            {SAT_BRAND.name} pins down your starting point with a level-setting
            diagnostic, then pairs adaptive AI lessons with structured
            accountability to build the study habits that actually raise your
            score.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <Link href={`/sign-up?redirect_url=${SAT_ROUTES.onboarding}`}>
              <Button size="lg" className="px-8">
                Start preparing
              </Button>
            </Link>
          </div>
        </div>

        {/* Feature grid */}
        <div className="mt-20 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            {
              title: "Know your level",
              desc: "A level-setting diagnostic that identifies your exact gaps and positions you on the score ladder.",
            },
            {
              title: "Learn what moves you",
              desc: "AI whiteboard lessons that build deep understanding, not rote memory.",
            },
            {
              title: "Watch it climb",
              desc: "Streaks, section scores, and score history that make progress visible week over week.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 text-left"
            >
              <h3 className="mb-1 font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-xs text-muted-foreground">
        {SAT_BRAND.name} &mdash; Built for students who show up.
      </footer>
    </div>
  );
}
