"use client";

import { AuthUserButton } from "@/components/auth/components";
import { ThemeToggle } from "@/components/theme-toggle";

export function NavUser() {
  return (
    <div className="flex items-center gap-3">
      <ThemeToggle />
      <AuthUserButton />
    </div>
  );
}
