"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

type SessionReportScreenProps = {
  sessionReport?: {
    summary?: string;
    recommendation?: string;
    score?: number;
  } | null;
  agentName?: string;
  agentColor?: string;
  sessionId?: string | null;
  onContinueWithTutor: () => void;
  onNewTopic: () => void;
};

export function SessionReportScreen({
  sessionReport,
  agentName,
  agentColor,
  sessionId,
  onContinueWithTutor,
  onNewTopic,
}: SessionReportScreenProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const submitFeedback = () => {
    if (rating === 0) return;

    // Fire-and-forget
    if (sessionId) {
      fetch(`/api/studio/agents/sessions/${sessionId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_rating: rating,
          feedback_text: feedbackText,
        }),
      }).catch(() => {});
    }

    setFeedbackSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-lg w-full p-8 rounded-2xl border border-[#30363d] bg-[#161b22] space-y-6"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#f0f6fc]">
            Session Complete
          </h2>
          {sessionReport?.summary && (
            <p className="text-sm text-[#8b949e]">{sessionReport.summary}</p>
          )}
          {sessionReport?.recommendation && (
            <p className="text-xs text-[#58a6ff]">
              {sessionReport.recommendation}
            </p>
          )}
        </div>

        {/* Feedback */}
        {!feedbackSubmitted ? (
          <div className="space-y-4 border-t border-[#30363d] pt-6">
            <p className="text-sm font-medium text-[#f0f6fc] text-center">
              How was your session{agentName ? ` with ${agentName}` : ""}?
            </p>

            {/* Star rating */}
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className="w-8 h-8 transition-colors"
                    fill={star <= (hoverRating || rating) ? "#f7c948" : "transparent"}
                    stroke={star <= (hoverRating || rating) ? "#f7c948" : "#484f58"}
                    strokeWidth={1.5}
                  />
                </button>
              ))}
            </div>

            {/* Feedback text */}
            {rating > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3"
              >
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={
                    rating >= 4
                      ? "What did you like about this session? (optional)"
                      : "What could be improved? (optional)"
                  }
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-[#f0f6fc] text-sm placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] resize-none"
                />
                <button
                  onClick={submitFeedback}
                  className="w-full px-4 py-2 rounded-lg bg-[#58a6ff] text-white text-sm font-medium hover:bg-[#4c8ed9] transition-colors"
                >
                  Submit Feedback
                </button>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="border-t border-[#30363d] pt-6 text-center">
            <p className="text-sm text-green-400">Thanks for your feedback!</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col items-center gap-3 pt-2">
          {agentName && (
            <button
              onClick={onContinueWithTutor}
              className="w-full px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: agentColor ? `${agentColor}15` : "rgba(88,166,255,0.1)",
                color: agentColor || "#58a6ff",
                border: `1px solid ${agentColor ? `${agentColor}30` : "rgba(88,166,255,0.2)"}`,
              }}
            >
              Continue with {agentName}
            </button>
          )}
          <button
            onClick={onNewTopic}
            className="px-6 py-2.5 rounded-lg bg-[#21262d] text-[#f0f6fc] text-sm font-medium border border-[#30363d] hover:bg-[#30363d] transition-colors w-full"
          >
            New topic
          </button>
          <a
            href="/studio"
            className="text-xs text-[#8b949e] hover:text-[#f0f6fc] transition-colors"
          >
            Back to Studio
          </a>
        </div>
      </motion.div>
    </div>
  );
}
