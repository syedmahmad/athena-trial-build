"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { SAT_BRAND, SAT_ROUTES } from "@/lib/sat/brand";

const navItems = [
  { href: SAT_ROUTES.dashboard, label: "DASHBOARD" },
  { href: "/sat/learn", label: "LEARN" },
  { href: SAT_ROUTES.progress, label: "PROGRESS" },
];

// Auth is enforced server-side by the middleware (PROTECTED_PREFIXES in
// src/proxy.ts) — the shell renders unconditionally, same as /educators.
export default function SatAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="relative mx-auto flex h-14 max-w-6xl items-center px-6">
          <Link
            href={SAT_ROUTES.dashboard}
            className="flex items-baseline gap-2"
          >
            <span className="sat-serif text-xl tracking-tight">
              {SAT_BRAND.name}
            </span>
            <span className="sat-micro text-muted-foreground">
              {SAT_BRAND.microLabel}
            </span>
          </Link>
          <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-8">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative py-4 text-xs font-medium tracking-[0.2em] transition-colors",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
