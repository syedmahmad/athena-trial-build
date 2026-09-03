"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

type StudentPovSummary = {
  id: string;
  student_id: string;
  sessions_incorporated: number;
  updated_at: string;
  created_at: string;
};

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentPovSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/studio/agents/students")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then(setStudents)
      .catch(() => toast.error("Failed to load students"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-[#161b22] animate-pulse border border-[#30363d]"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-2">Students</h1>
      <p className="text-sm text-[#8b949e] mb-6">
        Living POV documents maintained across sessions.
      </p>

      {students.length === 0 ? (
        <div className="text-center py-16 text-[#8b949e]">
          <p>No student POVs created yet.</p>
          <p className="text-xs mt-2 text-[#484f58]">
            POVs are generated after sessions complete.
          </p>
        </div>
      ) : (
        <div className="border border-[#30363d] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#30363d] bg-[#161b22]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">
                  Student
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">
                  Sessions
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#8b949e] uppercase tracking-wider">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[#30363d] last:border-0 hover:bg-[#161b22] transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/studio/admin/students/${encodeURIComponent(s.student_id)}`}
                      className="text-sm text-[#58a6ff] hover:underline font-medium"
                    >
                      {s.student_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-[#8b949e]">
                    {s.sessions_incorporated}
                  </td>
                  <td className="px-4 py-3 text-sm text-[#8b949e]">
                    {new Date(s.updated_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
