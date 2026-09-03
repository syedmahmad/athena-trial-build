import { ThemeToggle } from "@/components/theme-toggle";
import { SAT_BRAND } from "@/lib/sat/brand";

export default function SatOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="flex items-baseline gap-2">
          <span className="sat-serif text-xl tracking-tight">
            {SAT_BRAND.name}
          </span>
          <span className="sat-micro text-muted-foreground">
            {SAT_BRAND.microLabel}
          </span>
        </span>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
