"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Agents", href: "/studio/admin/agents" },
  { label: "Archetypes", href: "/studio/admin/archetypes" },
  { label: "Compare", href: "/studio/admin/agents/compare" },
  { label: "Students", href: "/studio/admin/students" },
  { label: "Evaluators", href: "/studio/admin/evaluators", disabled: true },
  { label: "Analytics", href: "/studio/admin/analytics", disabled: true },
];

export default function StudioAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#0d1117] flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-[#30363d] bg-[#0d1117] flex flex-col py-6 px-4 shrink-0">
        <Link
          href="/studio"
          className="flex items-center gap-2 text-[#8b949e] hover:text-[#f0f6fc] text-sm mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Studio
        </Link>

        <p className="text-[10px] uppercase tracking-wider text-[#484f58] font-semibold mb-3 px-2">
          Admin
        </p>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.disabled ? "#" : item.href}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  item.disabled
                    ? "text-[#484f58] cursor-not-allowed"
                    : isActive
                    ? "bg-[#161b22] text-[#f0f6fc] font-medium"
                    : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#161b22]/50"
                }`}
                onClick={(e) => { if (item.disabled) e.preventDefault(); }}
              >
                {item.label}
                {item.disabled && (
                  <span className="ml-2 text-[10px] text-[#484f58]">Soon</span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
