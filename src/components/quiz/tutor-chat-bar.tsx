"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mic, Keyboard, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/lessons/message-bubble";
import { VoiceOrb } from "@/components/lessons/voice-orb";
import { ThinkingIndicator } from "@/components/lessons/thinking-indicator";
import { MathContent } from "@/components/quiz/math-content";

type Message = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
};

type TutorChatBarProps = {
  messages: Message[];
  isProcessing: boolean;
  isSpeaking: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  mode: "text" | "voice";
  onToggleMode: () => void;
  isRecording: boolean;
  amplitude: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  focusTrigger?: number;
};

export function TutorChatBar({
  messages,
  isProcessing,
  isSpeaking,
  input,
  onInputChange,
  onSubmit,
  mode,
  onToggleMode,
  isRecording,
  amplitude,
  onStartRecording,
  onStopRecording,
  onKeyDown,
  focusTrigger,
}: TutorChatBarProps) {
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 56) + "px";
  }, [input]);

  // Focus textarea when triggered externally
  useEffect(() => {
    if (focusTrigger && focusTrigger > 0) textareaRef.current?.focus();
  }, [focusTrigger]);

  // Scroll history to bottom when expanded or new messages
  useEffect(() => {
    if (historyExpanded && historyScrollRef.current) {
      historyScrollRef.current.scrollTo({ top: historyScrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [historyExpanded, messages]);

  const lastTutorMessage = [...messages].reverse().find((m) => m.role === "tutor");
  const voiceOrbState: "idle" | "listening" | "processing" | "speaking" =
    isRecording ? "listening" : isProcessing ? "processing" : isSpeaking ? "speaking" : "idle";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.15 }}
      className="fixed bottom-0 inset-x-0 z-[62]"
    >
      {/* Expandable message history */}
      <AnimatePresence>
        {historyExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div
              ref={historyScrollRef}
              className="max-h-[60vh] overflow-y-auto bg-card/95 backdrop-blur-md border-t p-4 space-y-3"
            >
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Sparkles className="h-6 w-6 text-athena-amber opacity-60" />
                  <p className="text-xs text-muted-foreground text-center">
                    Stuck on this question? Athena can help guide you through it.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <MessageBubble key={i} role={msg.role} content={msg.content} isStreaming={msg.isStreaming} />
              ))}
              <AnimatePresence>
                {isProcessing && !messages.some((m) => m.isStreaming) && <ThinkingIndicator />}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main bar */}
      <div className="bg-card/90 backdrop-blur-md border-t">
        {/* Latest message subtitle */}
        {(lastTutorMessage || isProcessing) && !historyExpanded && (
          <div className="px-4 pt-2 pb-1 flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-athena-amber shrink-0 mt-0.5" />
            {isProcessing && !lastTutorMessage ? (
              <span className="text-xs text-muted-foreground italic">Athena is thinking...</span>
            ) : lastTutorMessage ? (
              <div className="text-xs text-muted-foreground line-clamp-2 flex-1 [&_p]:my-0 [&_p]:leading-relaxed">
                <MathContent content={lastTutorMessage.content} />
              </div>
            ) : null}
          </div>
        )}

        {/* Input area */}
        <div className="px-4 py-2 flex items-end gap-2">
          {/* Expand/collapse history */}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            onClick={() => setHistoryExpanded((v) => !v)}
            disabled={messages.length === 0 && !isProcessing}
          >
            {historyExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>

          {mode === "text" ? (
            <form onSubmit={onSubmit} className="flex flex-1 items-end gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about this question..."
                className="flex-1 bg-muted/50 rounded-lg text-sm outline-none placeholder:text-muted-foreground resize-none min-h-[36px] max-h-[56px] py-2 px-3"
                rows={1}
                disabled={isProcessing}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0"
                onClick={onToggleMode}
                title="Switch to voice mode"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <motion.div
                whileTap={{ scale: 0.9, rotate: -12 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  disabled={!input.trim() || isProcessing}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </motion.div>
            </form>
          ) : (
            <div className="flex flex-1 items-center justify-center gap-3">
              <div className="scale-75 origin-center">
                <VoiceOrb
                  state={voiceOrbState}
                  amplitude={amplitude}
                  onTap={isRecording ? onStopRecording : onStartRecording}
                  disabled={isProcessing && !isRecording}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {isRecording
                  ? "Listening… tap to stop"
                  : isProcessing
                    ? "Processing…"
                    : isSpeaking
                      ? "Speaking…"
                      : "Tap to speak"}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5 text-xs"
                onClick={onToggleMode}
              >
                <Keyboard className="h-3.5 w-3.5" />
                Text
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
