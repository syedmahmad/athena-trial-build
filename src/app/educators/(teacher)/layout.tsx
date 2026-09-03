"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardCheck, GraduationCap } from "lucide-react";
import { EduClassProvider } from "@/components/educators/class-context";
import { ClassSwitcher } from "@/components/educators/class-switcher";

const nav = [
  { to: "/educators/homework", label: "Homework", icon: BookOpen },
  { to: "/educators/grading", label: "Grading", icon: ClipboardCheck },
  { to: "/educators/students", label: "Students", icon: GraduationCap },
];

export default function TeacherShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [glowPath, setGlowPath] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("athena.glowHomework") !== "1") return;
    sessionStorage.removeItem("athena.glowHomework");
    // Deferred so the state updates land outside the synchronous effect body.
    let clear: number | undefined;
    const start = window.setTimeout(() => {
      setGlowPath("/educators/homework");
      clear = window.setTimeout(() => setGlowPath(null), 2800);
    }, 0);
    return () => {
      window.clearTimeout(start);
      if (clear !== undefined) window.clearTimeout(clear);
    };
  }, [pathname]);

  // Auth is enforced server-side by the middleware (PROTECTED_PREFIXES). The
  // shell renders unconditionally — the old client SignedIn/SignedOut gate
  // bounced authenticated teachers to /sign-in when the browser session lost a
  // cold-load refresh race.
  return (
    <EduClassProvider>
      <main className="relative flex min-h-screen flex-col bg-background px-10 py-8">
        <header className="font-mono-hud relative z-10 flex items-center justify-between">
          <Link href="/educators" className="flex items-baseline gap-3">
            <span className="edu-serif text-xl tracking-tight text-foreground">
              Athena
            </span>
            <span className="hud-dim text-[10px] tracking-[0.3em]">
              EDUCATORS
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ClassSwitcher />
            <nav className="flex items-center gap-1">
              {nav.map((n) => {
                const Icon = n.icon;
                const isActive = pathname === n.to;
                const glow = glowPath === n.to;
                return (
                  <Link
                    key={n.to}
                    href={n.to}
                    className={`font-mono-hud hud-text flex h-9 items-center gap-2 rounded-full border px-4 transition ${
                      isActive
                        ? "border-foreground/40 text-foreground"
                        : "border-foreground/10 text-foreground/70 hover:border-foreground/25 hover:text-foreground"
                    } ${glow ? "nav-glow" : ""}`}
                  >
                    <Icon size={13} />
                    <span>{n.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <section className="relative z-10 mt-10 flex-1">{children}</section>
      </main>
    </EduClassProvider>
  );
}
