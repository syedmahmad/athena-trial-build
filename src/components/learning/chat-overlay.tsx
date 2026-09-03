"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

type ChatOverlayProps = {
  isOpen: boolean;
  onClose: () => void;
  /** "chat" — student-driven Q&A. The "Resume lesson" pill is shown so
   *  the student can dismiss the conversation. The page footer carries
   *  the chat input form.
   *  "takeover" — agent fired automatically (e.g. on 2nd wrong); the
   *  pill is suppressed (the only exit is "Got it" in the footer). */
  mode?: "chat" | "takeover";
};

/** Floating affordances drawn over the right canvas pane while chat is
 *  active. The actual chat content (tutor's streamed steps) renders
 *  through the same WhiteboardCanvas pipeline as the lesson — see
 *  micro-lesson.tsx, where the canvas swaps its `steps` source between
 *  the lesson and `chat.chatWhiteboardSteps` based on `isChatting`.
 *
 *  Historically this overlay also rendered a chat-bubble thread with
 *  custom katex/visual renderers; that's been removed so the chat
 *  matches the visual fidelity of the main canvas (write_math morphs,
 *  geometry, plots, callouts, chain-aligned `=`s — all reused). */
export function ChatOverlay({ isOpen, onClose, mode = "chat" }: ChatOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && mode === "chat" && (
        <motion.button
          key="resume-lesson"
          onClick={onClose}
          className="absolute top-6 right-6 z-30 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors"
          style={{
            background: "oklch(0.22 0.06 275 / 0.85)",
            color: "oklch(0.92 0.02 285)",
            border: "1px solid oklch(0.45 0.10 275 / 0.55)",
          }}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronLeft className="h-4 w-4" />
          Resume lesson
        </motion.button>
      )}
    </AnimatePresence>
  );
}
