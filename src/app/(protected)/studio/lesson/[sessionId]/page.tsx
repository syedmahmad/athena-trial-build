"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { StudioLessonPlayer } from "@/components/studio/StudioLessonPlayer";
import { fetchStudioSession } from "@/lib/studio-api";
import { GenerationProgress } from "@/components/lessons/generation-progress";
import type { WhiteboardStep } from "@/types/whiteboard";

export default function StudioSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const {
    data: session,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["studio-session", sessionId],
    queryFn: () => fetchStudioSession(sessionId),
    staleTime: 60_000,
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load session");
    }
  }, [isError]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">
              Loading session...
            </h2>
          </div>
          <GenerationProgress />
        </motion.div>
      </div>
    );
  }

  // Error / not found state
  if (isError || !session) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full p-8 rounded-2xl border border-[#30363d] bg-[#161b22] text-center space-y-4"
        >
          <h2 className="text-lg font-semibold text-[#f0f6fc]">
            Session not found
          </h2>
          <p className="text-sm text-[#8b949e]">
            This session may have been deleted or the link is invalid.
          </p>
          <button
            onClick={() => router.push("/studio/lesson")}
            className="px-5 py-2 rounded-lg bg-[#21262d] text-[#f0f6fc] border border-[#30363d] hover:bg-[#30363d] text-sm transition-colors"
          >
            Start a new lesson
          </button>
        </motion.div>
      </div>
    );
  }

  // Parse whiteboard steps from session data
  const steps: WhiteboardStep[] = (session.steps || []).map(
    (s: Record<string, unknown>, i: number) => ({
      id: (s.id as number) ?? i,
      delayMs: (s.delayMs as number) ?? 0,
      durationMs: (s.durationMs as number) ?? 800,
      narration: (s.narration as string) || undefined,
      displayText: (s.displayText as string) || undefined,
      action: s.action as WhiteboardStep["action"],
    })
  );

  // If session is still generating (no steps yet), show generating state
  if (steps.length === 0 && session.current_phase !== "completed" && session.current_phase !== "complete") {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-[#f0f6fc]">
              Session is still generating...
            </h2>
            <p className="text-sm text-[#8b949e]">
              {session.skill_name || "Lesson"}
            </p>
          </div>
          <GenerationProgress />
        </motion.div>
      </div>
    );
  }

  // Determine agent info from session metadata or snapshot
  const agentConfig = session.agent_config_snapshot || {};
  const agentName =
    (agentConfig.display_name as string) ||
    session.title ||
    "Tutor";
  const agentColor =
    (agentConfig.avatar_color as string) || "#58a6ff";

  // Completed session with no steps (pre-fix sessions) — show summary
  if (steps.length === 0 && (session.current_phase === "completed" || session.current_phase === "complete")) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full p-8 rounded-2xl border border-[#30363d] bg-[#161b22] text-center space-y-4"
        >
          <div
            className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: agentColor }}
          >
            {agentName.charAt(0)}
          </div>
          <h2 className="text-lg font-semibold text-[#f0f6fc]">
            Session with {agentName}
          </h2>
          <p className="text-sm text-[#8b949e]">
            {session.skill_name || "Lesson"} — Completed
          </p>
          <p className="text-xs text-[#484f58]">
            Session steps were not saved (pre-update session).
          </p>
          <button
            onClick={() => router.push("/studio/lesson")}
            className="px-5 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
          >
            Start a new lesson
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <StudioLessonPlayer
      agentId={session.agent_id}
      agentName={agentName}
      agentColor={agentColor}
      skillName={session.skill_name || "Lesson"}
      existingSession={{
        sessionId: session.id,
        steps,
        lessonContent: undefined,
      }}
      onComplete={(report) => {
        // Fire-and-forget completion
        fetch(`/api/studio/agents/sessions/${sessionId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ student_id: "anonymous" }),
        }).catch(() => {});

        router.push("/studio");
      }}
    />
  );
}
