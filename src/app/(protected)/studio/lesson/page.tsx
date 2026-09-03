"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { TriageChat } from "@/components/studio/TriageChat";
import { TutorRecommendationCard } from "@/components/studio/TutorRecommendationCard";
import { StudioLessonPlayer } from "@/components/studio/StudioLessonPlayer";
import { SessionReportScreen } from "@/components/studio/SessionReportScreen";
import { useTriageChat } from "@/hooks/use-triage-chat";
import { fetchStudioAgents } from "@/lib/studio-api";
import type { StudioAgent } from "@/types/studio";

export default function StudioLessonPage() {
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  // Fetch available agents
  const { data: agents = [] } = useQuery<StudioAgent[]>({
    queryKey: ["studio-agents-active"],
    queryFn: () => fetchStudioAgents({ status: "active" }),
    staleTime: 60_000,
  });

  // Map agents to the format the triage hook expects
  const availableAgents = useMemo(
    () =>
      agents.map((a) => ({
        id: a.id,
        display_name: a.display_name,
        tagline: a.tagline || undefined,
        domain: a.domain,
      })),
    [agents]
  );

  const {
    messages,
    state,
    isProcessing,
    currentRecommendation,
    sessionReport,
    send,
    confirmHandoff,
    declineHandoff,
    startSession,
    endSession,
    continueAfterReport,
  } = useTriageChat(availableAgents);

  // When state transitions to "confirmed", auto-start session after brief delay
  useEffect(() => {
    if (state === "confirmed") {
      const timer = setTimeout(() => startSession(), 1200);
      return () => clearTimeout(timer);
    }
  }, [state, startSession]);

  // Find agent color for the recommendation card
  const recommendedAgentColor = useMemo(() => {
    if (!currentRecommendation) return "#58a6ff";
    const agent = agents.find((a) => a.id === currentRecommendation.agent_id);
    return agent?.avatar_color || "#58a6ff";
  }, [currentRecommendation, agents]);

  // ─── Phase: In Session ───────────────────────────────────────────────────────
  if (state === "in_session" && currentRecommendation) {
    const agent = agents.find((a) => a.id === currentRecommendation.agent_id);
    return (
      <StudioLessonPlayer
        agentId={currentRecommendation.agent_id}
        agentName={currentRecommendation.agent_name}
        agentColor={agent?.avatar_color || recommendedAgentColor}
        skillName={currentRecommendation.student_context.topic}
        skillDescription={currentRecommendation.student_context.struggle_areas || undefined}
        studentContext={currentRecommendation.student_context as Record<string, unknown>}
        onSessionCreated={(sid) => {
          // Once the session is created, update the URL without a full navigation
          if (!hasRedirectedRef.current) {
            hasRedirectedRef.current = true;
            window.history.replaceState(null, "", `/studio/lesson/${sid}`);
          }
        }}
        onComplete={(report, sessionId) => {
          // Generate AI report + update student POV (fire-and-forget)
          if (sessionId) {
            fetch(`/api/studio/agents/sessions/${sessionId}/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                student_id: (currentRecommendation.student_context as Record<string, unknown>).email
                  || (currentRecommendation.student_context as Record<string, unknown>).student_id
                  || "anonymous",
              }),
            }).catch(() => {});
          }
          endSession(report);
        }}
      />
    );
  }

  // ─── Phase: Report (with feedback) ──────────────────────────────────────────
  if (state === "report") {
    return <SessionReportScreen
      sessionReport={sessionReport}
      agentName={currentRecommendation?.agent_name}
      agentColor={agents.find(a => a.id === currentRecommendation?.agent_id)?.avatar_color}
      sessionId={currentRecommendation ? undefined : undefined}
      onContinueWithTutor={() => {
        // Go back to the same tutor, not triage
        if (currentRecommendation) {
          startSession();
        }
      }}
      onNewTopic={continueAfterReport}
    />;
  }

  // ─── Phase: Triage Chat (default) ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col">
      <AnimatePresence mode="wait">
        {state === "confirmed" ? (
          <motion.div
            key="transition"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center space-y-3">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white font-bold text-xl animate-pulse"
                style={{ backgroundColor: recommendedAgentColor }}
              >
                {currentRecommendation?.agent_name.charAt(0).toUpperCase()}
              </div>
              <p className="text-sm text-[#8b949e]">
                Connecting you with {currentRecommendation?.agent_name}...
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 flex flex-col max-w-2xl mx-auto w-full"
          >
            <TriageChat
              messages={messages}
              isProcessing={isProcessing}
              onSend={send}
            >
              {/* Show all tutors as equal-prominence cards when recommendation arrives */}
              {state === "recommending" && currentRecommendation && (
                <div className="space-y-3 py-2">
                  <p className="text-xs font-medium text-[#8b949e] uppercase tracking-wider px-1">
                    Choose your tutor
                  </p>
                  <div className="grid gap-3">
                    {agents.map((agent) => {
                      const isRecommended = agent.id === currentRecommendation.agent_id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => {
                            // Override the recommendation with the selected agent
                            confirmHandoff({
                              ...currentRecommendation,
                              agent_id: agent.id,
                              agent_name: agent.display_name,
                            });
                          }}
                          className="relative flex items-start gap-3 p-4 rounded-xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                          style={{
                            borderColor: isRecommended ? `${agent.avatar_color}40` : "rgba(255,255,255,0.06)",
                            backgroundColor: isRecommended ? `${agent.avatar_color}08` : "rgba(22,27,34,0.95)",
                          }}
                        >
                          {/* Color bar */}
                          <div
                            className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
                            style={{ backgroundColor: agent.avatar_color }}
                          />

                          {/* Avatar */}
                          <div
                            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold"
                            style={{
                              backgroundColor: `${agent.avatar_color}20`,
                              color: agent.avatar_color,
                            }}
                          >
                            {agent.display_name.charAt(0)}
                          </div>

                          <div className="flex-1 min-w-0 pl-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[#f0f6fc]">
                                {agent.display_name}
                              </span>
                              {isRecommended && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#58a6ff]/10 text-[#58a6ff]">
                                  Suggested
                                </span>
                              )}
                              <span className="text-[10px] font-medium uppercase tracking-wide text-white/20">
                                {agent.domain}
                              </span>
                            </div>
                            {agent.tagline && (
                              <p className="text-xs text-white/40 mt-0.5">{agent.tagline}</p>
                            )}
                            {agent.description && (
                              <p className="text-xs text-white/25 mt-1 line-clamp-2">{agent.description}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </TriageChat>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
