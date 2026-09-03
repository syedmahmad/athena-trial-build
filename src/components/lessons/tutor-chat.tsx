"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, Mic, Keyboard, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAthenaConversation } from "@/hooks/use-athena-conversation";
import { MessageBubble } from "./message-bubble";
import { VoiceOrb } from "./voice-orb";
import { ThinkingIndicator } from "./thinking-indicator";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import { useLessonViewport } from "@/hooks/use-lesson-viewport";
import type { SelectedElement } from "@/types/whiteboard";

function buildQuestion(sels: SelectedElement[]): string {
  if (sels.length === 0) return "";
  if (sels.length === 1) {
    const el = sels[0];
    return el.type === "write_math"
      ? el.isTerm ? `Can you explain "${el.content}" in this expression?` : `Can you explain this step: $${el.content}$?`
      : el.isTerm ? `What does "${el.content}" mean here?` : `Can you explain this further: "${el.content}"?`;
  }
  const parts = sels.map(el =>
    el.type === "write_math" ? (el.isTerm ? `"${el.content}"` : `$${el.content}$`) : `"${el.content}"`
  );
  return `Can you explain ${parts.join(" and ")}?`;
}
import { WhiteboardToolbar } from "@/components/whiteboard/whiteboard-toolbar";
import { WhiteboardTimeline } from "@/components/whiteboard/whiteboard-timeline";
import { useWhiteboardPlayer } from "@/hooks/use-whiteboard-player";

export function TutorChat({
  lessonTitle,
  lessonContent,
}: {
  lessonTitle: string;
  lessonContent: string;
}) {
  const isMobilePortrait = useLessonViewport() === "mobile-portrait";
  const [input, setInput] = useState("");
  const [selections, setSelections] = useState<SelectedElement[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);

  const {
    messages,
    mode,
    isRecording,
    isProcessing,
    isSpeaking,
    amplitude,
    whiteboardSteps,
    isWhiteboardStreaming,
    sendMessage,
    startRecording,
    stopRecording,
    toggleMode,
  } = useAthenaConversation({ lessonTitle, lessonContent });

  const {
    currentStepIndex,
    stepProgress,
    visibleStepIds,
    state: playerState,
    speed,
    play,
    pause,
    replay,
    seekToStep,
    changeSpeed,
  } = useWhiteboardPlayer(whiteboardSteps, isWhiteboardStreaming);

  const hasWhiteboard = whiteboardSteps.length > 0;

  // Smart auto-scroll: only when user is near bottom
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isProcessing]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  const handleElementSelect = useCallback((el: SelectedElement | null) => {
    if (!el) { setSelections([]); return; }
    const next = [el];
    setSelections(next);
    setInput(buildQuestion(next));
    if (mode === "voice") toggleMode();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [mode, toggleMode]);

  const handleElementToggle = useCallback((el: SelectedElement) => {
    setSelections(prev => {
      const key = `${el.stepId}:${el.content}`;
      const exists = prev.some(s => `${s.stepId}:${s.content}` === key);
      const next = exists ? prev.filter(s => `${s.stepId}:${s.content}` !== key) : [...prev, el];
      setInput(buildQuestion(next));
      if (next.length > 0) requestAnimationFrame(() => textareaRef.current?.focus());
      return next;
    });
  }, []);

  const handleElementsSelect = useCallback((els: SelectedElement[]) => {
    setSelections(els);
    setInput(buildQuestion(els));
    if (mode === "voice") toggleMode();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [mode, toggleMode]);

  useEffect(() => {
    if (isWhiteboardStreaming) setSelections([]);
  }, [isWhiteboardStreaming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    sendMessage(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const voiceOrbState: "idle" | "listening" | "processing" | "speaking" =
    isRecording
      ? "listening"
      : isProcessing
        ? "processing"
        : isSpeaking
          ? "speaking"
          : "idle";

  return (
    <div className="flex gap-4">
      {/* Chat panel */}
      <div className={`flex flex-col rounded-lg border bg-card ${hasWhiteboard ? "w-1/2" : "w-full"} transition-all duration-300`}>
        <div
          ref={scrollRef}
          onScroll={checkNearBottom}
          className="max-h-[60vh] min-h-[300px] overflow-y-auto p-4 space-y-3"
        >
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Sparkles className="h-8 w-8 text-athena-amber opacity-60" />
              <p className="text-sm text-muted-foreground text-center">
                Ask Athena anything about this lesson.
              </p>
              <p className="text-xs text-muted-foreground/60 text-center">
                {mode === "voice"
                  ? "Tap the orb and speak your question"
                  : "Type a question or switch to voice mode"}
              </p>
            </div>
          )}

          {/* Messages */}
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <MessageBubble
                  role={msg.role}
                  content={msg.content}
                  isStreaming={msg.isStreaming}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Thinking indicator */}
          <AnimatePresence>
            {isProcessing && !messages.some((m) => m.isStreaming) && (
              <ThinkingIndicator />
            )}
          </AnimatePresence>

          {/* Speaking indicator */}
          {isSpeaking && !isProcessing && (
            <motion.p
              className="text-xs text-muted-foreground px-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              Athena is speaking…
            </motion.p>
          )}
        </div>

        {mode === "text" ? (
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 border-t p-3"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up question..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground resize-none min-h-[36px] max-h-[120px] py-2"
              rows={1}
              disabled={isProcessing}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={toggleMode}
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
                className="h-8 w-8 shrink-0"
                disabled={!input.trim() || isProcessing}
              >
                <Send className="h-4 w-4" />
              </Button>
            </motion.div>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-4 border-t p-6">
            <VoiceOrb
              state={voiceOrbState}
              amplitude={amplitude}
              onTap={isRecording ? stopRecording : startRecording}
              disabled={isProcessing && !isRecording}
            />
            <p className="text-sm text-muted-foreground">
              {isRecording
                ? "Listening… tap to stop"
                : isProcessing
                  ? "Processing…"
                  : isSpeaking
                    ? "Speaking…"
                    : "Tap to speak"}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs"
              onClick={toggleMode}
            >
              <Keyboard className="h-3.5 w-3.5" />
              Switch to text
            </Button>
          </div>
        )}
      </div>

      {/* Whiteboard panel — beside the chat */}
      <AnimatePresence>
        {hasWhiteboard && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "50%" }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex flex-col rounded-lg border bg-card overflow-hidden"
          >
            {/* Toolbar */}
            <WhiteboardToolbar
              state={playerState}
              speed={speed}
              currentStep={currentStepIndex}
              totalSteps={whiteboardSteps.length}
              isStreaming={isWhiteboardStreaming}
              onPlay={play}
              onPause={pause}
              onReplay={replay}
              onSpeedChange={changeSpeed}
            />

            {/* Canvas */}
            <div className="flex-1 min-h-[300px]">
              {isMobilePortrait ? (
                <div className="h-full w-full overflow-y-auto">
                  <MobileLessonRenderer
                    steps={whiteboardSteps}
                    visibleStepIds={visibleStepIds}
                    currentStepIndex={currentStepIndex}
                    stepProgress={stepProgress}
                  />
                </div>
              ) : (
                <WhiteboardCanvas
                  steps={whiteboardSteps}
                  visibleStepIds={visibleStepIds}
                  currentStepIndex={currentStepIndex}
                  stepProgress={stepProgress}
                  selections={selections}
                  onElementSelect={handleElementSelect}
                  onElementToggle={handleElementToggle}
                  onElementsSelect={handleElementsSelect}
                />
              )}
            </div>

            {/* Timeline */}
            {whiteboardSteps.length > 1 && (
              <WhiteboardTimeline
                totalSteps={whiteboardSteps.length}
                currentStep={currentStepIndex}
                visibleStepIds={visibleStepIds}
                stepIds={whiteboardSteps.map((s) => s.id)}
                onSeek={seekToStep}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
