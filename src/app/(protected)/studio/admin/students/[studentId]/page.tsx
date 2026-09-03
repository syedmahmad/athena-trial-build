"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type StudentPov = {
  id: string;
  student_id: string;
  markdown: string;
  sessions_incorporated: number;
  last_session_id: string | null;
  updated_at: string;
  created_at: string;
};

export default function StudentPovPage() {
  const params = useParams();
  const studentId = decodeURIComponent(params.studentId as string);

  const [pov, setPov] = useState<StudentPov | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPov = useCallback(() => {
    fetch(`/api/studio/agents/students/${encodeURIComponent(studentId)}/pov`)
      .then((r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("Failed to fetch");
        return r.json();
      })
      .then((data) => {
        if (data) setPov(data);
      })
      .catch(() => toast.error("Failed to load student POV"))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(() => {
    fetchPov();
  }, [fetchPov]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/studio/agents/students/${encodeURIComponent(studentId)}/pov/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = await res.json();
      if (data.markdown && pov) {
        setPov({ ...pov, markdown: data.markdown, sessions_incorporated: pov.sessions_incorporated + 1 });
      }
      toast.success("POV updated from latest session");
    } catch {
      toast.error("Failed to refresh POV");
    } finally {
      setRefreshing(false);
    }
  }, [studentId, pov]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-64 rounded-lg bg-[#161b22] animate-pulse border border-[#30363d]" />
      </div>
    );
  }

  if (!pov) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-[#f0f6fc] mb-4">{studentId}</h1>
        <div className="text-center py-16 text-[#8b949e]">
          <p>No POV document found for this student.</p>
          <p className="text-xs mt-2 text-[#484f58]">
            Complete a session to generate the first POV.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#f0f6fc]">{studentId}</h1>
          <p className="text-sm text-[#8b949e] mt-1">
            {pov.sessions_incorporated} session{pov.sessions_incorporated !== 1 ? "s" : ""} incorporated
            {" | "}Updated {new Date(pov.updated_at).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] border border-[#30363d] hover:bg-[#30363d] text-sm font-medium transition-colors disabled:opacity-50"
        >
          {refreshing ? "Updating..." : "Refresh POV"}
        </button>
      </div>

      {/* POV Document */}
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-6 prose prose-invert prose-sm max-w-none">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-xl font-bold text-[#f0f6fc] mt-6 mb-3 first:mt-0">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-lg font-semibold text-[#f0f6fc] mt-5 mb-2">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-base font-medium text-[#c9d1d9] mt-4 mb-2">{children}</h3>
            ),
            p: ({ children }) => (
              <p className="text-sm text-[#c9d1d9] mb-3 leading-relaxed">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="text-sm text-[#c9d1d9] space-y-1 mb-3 list-disc pl-5">{children}</ul>
            ),
            li: ({ children }) => (
              <li className="text-sm text-[#c9d1d9]">{children}</li>
            ),
            strong: ({ children }) => (
              <strong className="text-[#f0f6fc] font-semibold">{children}</strong>
            ),
            hr: () => <hr className="border-[#30363d] my-4" />,
          }}
        >
          {pov.markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
