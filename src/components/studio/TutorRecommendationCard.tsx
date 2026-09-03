"use client";

import { motion } from "framer-motion";
import type { HandoffData } from "@/hooks/use-triage-chat";

type TutorRecommendationCardProps = {
  recommendation: HandoffData;
  onConfirm: () => void;
  onDecline: () => void;
  agentColor?: string;
};

export function TutorRecommendationCard({
  recommendation,
  onConfirm,
  onDecline,
  agentColor = "#58a6ff",
}: TutorRecommendationCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex justify-start mt-3"
    >
      <div className="max-w-[85%] rounded-2xl border border-[#30363d] bg-[#161b22] overflow-hidden">
        {/* Color accent bar */}
        <div className="h-1" style={{ backgroundColor: agentColor }} />

        <div className="p-4 space-y-3">
          {/* Agent info */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ backgroundColor: agentColor }}
            >
              {recommendation.agent_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f0f6fc]">
                {recommendation.agent_name}
              </p>
              {recommendation.reason && (
                <p className="text-xs text-[#8b949e] mt-0.5">
                  {recommendation.reason}
                </p>
              )}
            </div>
          </div>

          {/* Context summary */}
          {recommendation.student_context?.topic && (
            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
              <svg
                className="w-3.5 h-3.5 text-[#58a6ff]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                />
              </svg>
              <span>Topic: {recommendation.student_context.topic}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onConfirm}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: agentColor }}
            >
              Start with {recommendation.agent_name}
            </button>
            <button
              onClick={onDecline}
              className="text-xs text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
            >
              Choose a different tutor
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
