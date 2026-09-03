"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { fetchStudioSessions } from "@/lib/studio-api";
import type { StudioSessionSummary } from "@/types/studio";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";

export default function AgentSessionsPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [sessions, setSessions] = useState<StudioSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Record<string, string>>({});
  const [expandedReports, setExpandedReports] = useState<Set<string>>(new Set());
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  useEffect(() => {
    fetchStudioSessions(agentId, { limit: 50 })
      .then(setSessions)
      .catch(() => toast.error("Failed to load sessions"))
      .finally(() => setLoading(false));
  }, [agentId]);

  const generateReport = useCallback(async (sessionId: string) => {
    setGeneratingReport(sessionId);
    try {
      const res = await fetch(`/api/studio/agents/sessions/${sessionId}/ai-report`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate report");
      const data = await res.json();
      setReports((prev) => ({ ...prev, [sessionId]: data.report }));
      setExpandedReports((prev) => new Set([...prev, sessionId]));
      toast.success("Report generated");
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setGeneratingReport(null);
    }
  }, []);

  const fetchReport = useCallback(async (sessionId: string) => {
    // If already loaded, just toggle
    if (reports[sessionId]) {
      setExpandedReports((prev) => {
        const next = new Set(prev);
        if (next.has(sessionId)) {
          next.delete(sessionId);
        } else {
          next.add(sessionId);
        }
        return next;
      });
      return;
    }

    // Try to fetch existing report
    try {
      const res = await fetch(`/api/studio/agents/sessions/${sessionId}/ai-report`);
      if (res.ok) {
        const data = await res.json();
        setReports((prev) => ({ ...prev, [sessionId]: data.report }));
        setExpandedReports((prev) => new Set([...prev, sessionId]));
      } else {
        // No report exists, generate one
        await generateReport(sessionId);
      }
    } catch {
      toast.error("Failed to load report");
    }
  }, [reports, generateReport]);

  function formatDuration(secs: number | null) {
    if (secs == null) return "--";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-[#161b22] animate-pulse border border-[#30363d]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[#f0f6fc] mb-6">Sessions</h1>

      {sessions.length === 0 ? (
        <div className="text-center py-16 text-[#8b949e]">
          <p>No sessions recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="border border-[#30363d] rounded-xl overflow-hidden bg-[#0d1117]"
            >
              {/* Session row */}
              <div className="flex items-center px-4 py-3 hover:bg-[#161b22] transition-colors">
                <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                  <div className="text-sm text-[#f0f6fc]">
                    {new Date(session.started_at).toLocaleString()}
                  </div>
                  <div className="text-sm text-[#8b949e]">
                    {session.skill_name || session.skill_id}
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded text-xs bg-[#21262d] text-[#8b949e] border border-[#30363d]">
                      {session.current_phase}
                    </span>
                  </div>
                  <div className="text-sm text-[#8b949e]">
                    {formatDuration(session.duration_secs)}
                  </div>
                  <div className="text-sm text-[#f0f6fc]">
                    {session.score != null ? `${session.score}%` : "--"}
                  </div>
                </div>
                <button
                  onClick={() => fetchReport(session.id)}
                  disabled={generatingReport === session.id}
                  className="ml-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] border border-[#30363d] transition-colors disabled:opacity-50"
                >
                  {generatingReport === session.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  {reports[session.id] ? (
                    expandedReports.has(session.id) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )
                  ) : (
                    "Report"
                  )}
                </button>
              </div>

              {/* Expanded report */}
              {expandedReports.has(session.id) && reports[session.id] && (
                <div className="px-4 pb-4 border-t border-[#30363d]">
                  <div className="mt-3 p-4 rounded-lg bg-[#161b22] border border-[#30363d] prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => (
                          <h1 className="text-base font-bold text-[#f0f6fc] mt-4 mb-2 first:mt-0">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-sm font-semibold text-[#f0f6fc] mt-3 mb-1">{children}</h2>
                        ),
                        p: ({ children }) => (
                          <p className="text-xs text-[#c9d1d9] mb-2 leading-relaxed">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="text-xs text-[#c9d1d9] space-y-0.5 mb-2 list-disc pl-4">{children}</ul>
                        ),
                        li: ({ children }) => (
                          <li className="text-xs text-[#c9d1d9]">{children}</li>
                        ),
                        strong: ({ children }) => (
                          <strong className="text-[#f0f6fc] font-semibold">{children}</strong>
                        ),
                      }}
                    >
                      {reports[session.id]}
                    </ReactMarkdown>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => generateReport(session.id)}
                      disabled={generatingReport === session.id}
                      className="text-xs text-[#484f58] hover:text-[#8b949e] transition-colors"
                    >
                      {generatingReport === session.id ? "Regenerating..." : "Regenerate"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
