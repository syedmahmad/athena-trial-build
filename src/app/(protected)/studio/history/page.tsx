"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Clock, ChevronRight } from "lucide-react";
import { fetchAllStudioSessions, fetchStudioAgents } from "@/lib/studio-api";
import type { StudioSessionSummary, StudioAgent } from "@/types/studio";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(secs: number | null): string {
  if (!secs) return "--";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function phaseLabel(phase: string): { text: string; color: string } {
  switch (phase) {
    case "completed":
      return { text: "Completed", color: "text-green-400" };
    case "teaching":
      return { text: "In Progress", color: "text-[#58a6ff]" };
    case "generating":
      return { text: "Generating", color: "text-yellow-400" };
    default:
      return { text: phase, color: "text-[#8b949e]" };
  }
}

export default function StudioHistoryPage() {
  const {
    data: sessions = [],
    isLoading,
    isError,
  } = useQuery<StudioSessionSummary[]>({
    queryKey: ["studio-all-sessions"],
    queryFn: () => fetchAllStudioSessions({ limit: 50 }),
    staleTime: 30_000,
  });

  const { data: agents = [] } = useQuery<StudioAgent[]>({
    queryKey: ["studio-agents-all"],
    queryFn: () => fetchStudioAgents(),
    staleTime: 60_000,
  });

  // Map agent_id -> agent for display
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  useEffect(() => {
    if (isError) toast.error("Failed to load session history");
  }, [isError]);

  return (
    <div className="min-h-screen bg-[#0d1117] p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <Link
              href="/studio"
              className="p-2 rounded-lg text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-[#f0f6fc]">
                Session History
              </h1>
              <p className="text-sm text-[#8b949e]">
                Review and resume past lessons
              </p>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-[#161b22] border border-[#30363d] animate-pulse"
                />
              ))}
            </div>
          )}

          {/* Empty */}
          {!isLoading && sessions.length === 0 && (
            <div className="text-center py-16">
              <Clock className="w-10 h-10 text-[#484f58] mx-auto mb-3" />
              <p className="text-[#8b949e] mb-4">No sessions yet</p>
              <Link
                href="/studio/lesson"
                className="inline-block px-5 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
              >
                Start a lesson
              </Link>
            </div>
          )}

          {/* Session List */}
          {!isLoading && sessions.length > 0 && (
            <div className="space-y-2">
              {sessions.map((session, i) => {
                const phase = phaseLabel(session.current_phase);
                const agent = agentMap.get(session.agent_id);
                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.03 }}
                  >
                    <Link
                      href={`/studio/lesson/${session.id}`}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-[#484f58] transition-all"
                    >
                      {/* Agent avatar */}
                      {agent && (
                        <div
                          className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-white font-bold text-xs"
                          style={{ backgroundColor: agent.avatar_color }}
                        >
                          {agent.display_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {agent && (
                            <span
                              className="text-xs font-semibold"
                              style={{ color: agent.avatar_color }}
                            >
                              {agent.display_name}
                            </span>
                          )}
                          <span className="text-sm font-medium text-[#f0f6fc] truncate">
                            {session.title ||
                              session.skill_name ||
                              "Untitled Session"}
                          </span>
                          <span className={`text-xs font-medium ${phase.color}`}>
                            {phase.text}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[#8b949e]">
                          <span>{formatDate(session.started_at)}</span>
                          <span>{formatTime(session.started_at)}</span>
                          {session.duration_secs != null && (
                            <span>
                              {formatDuration(session.duration_secs)}
                            </span>
                          )}
                          {session.score != null && (
                            <span className="text-[#58a6ff]">
                              Score: {session.score}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#484f58] group-hover:text-[#8b949e] shrink-0 transition-colors" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
