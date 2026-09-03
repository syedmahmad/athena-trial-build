"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import { useLessonViewport } from "@/hooks/use-lesson-viewport";
import { WhiteboardToolbar } from "@/components/whiteboard/whiteboard-toolbar";
import { WhiteboardTimeline } from "@/components/whiteboard/whiteboard-timeline";
import { TutorQuestionCard } from "@/components/quiz/tutor-question-card";
import { TutorChatBar } from "@/components/quiz/tutor-chat-bar";
import type { Problem } from "@/components/quiz/types";
import type { FeedbackState } from "@/components/quiz/answer-panel";
import type { WhiteboardStep, SelectedElement } from "@/types/whiteboard";
import type { PlayerState, PlaybackSpeed } from "@/hooks/use-whiteboard-player";

type Message = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
};

type TutorModeOverlayProps = {
  // Question
  problem: Problem;
  questionNumber: number;
  selectedOption?: number;
  feedbackState?: FeedbackState;
  onSelectAnswer: (optionIndex: number) => void;

  // Chat
  messages: Message[];
  isProcessing: boolean;
  isSpeaking: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  mode: "text" | "voice";
  onToggleMode: () => void;
  isRecording: boolean;
  amplitude: number;
  onStartRecording: () => void;
  onStopRecording: () => void;

  // Whiteboard
  whiteboardSteps: WhiteboardStep[];
  isWhiteboardStreaming: boolean;
  currentStepIndex: number;
  stepProgress: number;
  visibleStepIds: Set<number>;
  playerState: PlayerState;
  speed: PlaybackSpeed;
  onPlay: () => void;
  onPause: () => void;
  onReplay: () => void;
  onSeekToStep: (index: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
  selections?: SelectedElement[];
  onElementSelect?: (el: SelectedElement | null) => void;
  onElementToggle?: (el: SelectedElement) => void;
  onElementsSelect?: (els: SelectedElement[]) => void;
  focusTrigger?: number;

  // Optional slot to replace the floating question card (e.g. practice problems)
  practiceContent?: React.ReactNode;

  // Close
  onClose: () => void;
};

export function TutorModeOverlay({
  problem,
  questionNumber,
  selectedOption,
  feedbackState,
  onSelectAnswer,
  messages,
  isProcessing,
  isSpeaking,
  input,
  onInputChange,
  onSubmit,
  onKeyDown,
  mode,
  onToggleMode,
  isRecording,
  amplitude,
  onStartRecording,
  onStopRecording,
  whiteboardSteps,
  isWhiteboardStreaming,
  currentStepIndex,
  stepProgress,
  visibleStepIds,
  playerState,
  speed,
  onPlay,
  onPause,
  onReplay,
  onSeekToStep,
  onChangeSpeed,
  selections,
  onElementSelect,
  onElementToggle,
  onElementsSelect,
  focusTrigger,
  practiceContent,
  onClose,
}: TutorModeOverlayProps) {
  const isMobilePortrait = useLessonViewport() === "mobile-portrait";
  const isPractice = !!practiceContent;
  const hasWhiteboard = whiteboardSteps.length > 0;
  // In practice phase keep the canvas visible (blank) even when no steps yet
  const showCanvas = isPractice || hasWhiteboard;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[60] flex flex-col bg-background"
    >
      {/* Whiteboard canvas (full background, fades in when steps exist or in practice mode) */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: showCanvas ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      >
        {showCanvas && (
          isMobilePortrait ? (
            <div className="h-full w-full overflow-y-auto pt-16">
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
              onElementSelect={onElementSelect}
              onElementToggle={onElementToggle}
              onElementsSelect={onElementsSelect}
            />
          )
        )}
      </motion.div>

      {/* Top toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.05 }}
        className="relative z-[63]"
      >
        {hasWhiteboard ? (
          <WhiteboardToolbar
            state={playerState}
            speed={speed}
            currentStep={currentStepIndex}
            totalSteps={whiteboardSteps.length}
            isStreaming={isWhiteboardStreaming}
            onPlay={onPlay}
            onPause={onPause}
            onReplay={onReplay}
            onSpeedChange={onChangeSpeed}
            onClose={onClose}
          />
        ) : (
          <div className="flex items-center justify-end px-4 py-2 bg-card/80 backdrop-blur-sm border-b">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </motion.div>

      {/* Spacer to push content area */}
      <div className="flex-1 relative pointer-events-none" />

      {/* Timeline (above chat bar, only when whiteboard has multiple steps) */}
      {hasWhiteboard && whiteboardSteps.length > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="relative z-[62]"
        >
          <WhiteboardTimeline
            totalSteps={whiteboardSteps.length}
            currentStep={currentStepIndex}
            visibleStepIds={visibleStepIds}
            stepIds={whiteboardSteps.map((s) => s.id)}
            onSeek={onSeekToStep}
          />
        </motion.div>
      )}

      {/* Question card (floating, left side) — replaced by practiceContent during practice phase */}
      {practiceContent ?? (
        <TutorQuestionCard
          problem={problem}
          questionNumber={questionNumber}
          selectedOption={selectedOption}
          feedbackState={feedbackState}
          onSelect={onSelectAnswer}
        />
      )}

      {/* Chat bar (bottom) */}
      <TutorChatBar
        messages={messages}
        isProcessing={isProcessing}
        isSpeaking={isSpeaking}
        input={input}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        onKeyDown={onKeyDown}
        mode={mode}
        onToggleMode={onToggleMode}
        isRecording={isRecording}
        amplitude={amplitude}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        focusTrigger={focusTrigger}
      />
    </motion.div>
  );
}
