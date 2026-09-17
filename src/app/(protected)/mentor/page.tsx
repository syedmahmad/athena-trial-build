"use client";

import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Send, Mic, Keyboard, SkipBack, SkipForward, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";

import { useLessonChat } from "@/hooks/use-lesson-chat";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import { deriveVoiceListeningState } from "@/lib/voice/voice-listening-state";
import { ObservationOrb } from "@/components/learning/observation/observation-orb";
import { PresenceLayer } from "@/components/learning/observation/presence-layer";
import type { StepFocus } from "@/components/whiteboard/pen-tip";
import { ObservationFrame } from "@/components/learning/observation/observation-frame";
import { IsoContourFrame } from "@/components/learning/observation/iso-contour-frame";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import { useLessonViewport } from "@/hooks/use-lesson-viewport";
import type { WhiteboardStep } from "@/types/whiteboard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isAmbientNoiseTranscript } from "@/lib/voice/transcript-filters";
import { ImageAttachLauncher } from "@/components/image-attach/image-attach-launcher";
import { BoardDrawOverlay } from "@/components/image-attach/board-draw-overlay";
import { Paperclip, PenLine, X as XIcon } from "lucide-react";
import { MathContent } from "@/components/quiz/math-content";

/**
 * Mentor surface — same agent-takeover UX as the SAT-quiz tutor and the
 * micro-lesson chat overlay: a whiteboard canvas as the visual ground,
 * a single bottom input pane for text or voice, an `ObservationOrb` for
 * agent state. Initial canvas state is a write_text step asking
 * "What do you want to learn today?". On the first user message the
 * canvas swaps to the agent's streamed response.
 *
 * The mentor backend (system prompt with motivational tone, brevity
 * rules, redirect-to-learning-hub guardrails, content filters) is
 * unchanged — `useLessonChat({ variant: "mentor" })` posts to
 * `/api/agent/mentor-chat/stream`, which enriches with student progress
 * data server-side before forwarding to the agent. The hook's only
 * customization for mentor is the body shape (`{question, history}`)
 * and the endpoint.
 */

const INITIAL_PROMPT = "What do you want to learn today?";

/** Clamp a long caption for the pill, trimming back to a balanced `$`
 *  boundary so MathContent never receives a half-open math span. */
function clampCaption(s: string): string {
  const MAX = 220;
  if (s.length <= MAX) return s;
  let t = s.slice(0, MAX);
  if (((t.match(/\$/g) ?? []).length) % 2 === 1) {
    t = t.slice(0, t.lastIndexOf("$"));
  }
  return t.trimEnd() + "…";
}

const INITIAL_STEPS: WhiteboardStep[] = [
  {
    id: 0,
    delayMs: 0,
    durationMs: 400,
    action: {
      type: "write_text",
      text: INITIAL_PROMPT,
    },
  } as WhiteboardStep,
];

// Push-to-talk voice input mode is hidden for the demo (mirrors the
// micro-lesson surface): its mic icon duplicates the always-listening
// mic toggle and the hold-to-talk flow isn't part of the demo. Flip to
// `true` to restore the text/voice mode switch on the chat input.
const SHOW_VOICE_INPUT_MODE = false;

export default function MentorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?debug=orb — roaming "living" orb (Clicky-style). Off = fixed corner orb.
  const debugOrb = (searchParams.get("debug") ?? "").split(",").map((s) => s.trim()).includes("orb");
  // Captured once on entry, same pattern as the quiz layout's satFocused —
  // the SAT dashboard's companion card links here with ?sat=1 so BACK
  // returns to /sat/dashboard instead of the old /dashboard.
  const [satFocused] = useState(() => searchParams.get("sat") === "1");
  // Current step location, so the resting orb can hover beside the latest step.
  const stepFocusRef = useRef<StepFocus | null>(null);
  const handleStepFocus = useCallback((f: StepFocus | null) => {
    stepFocusRef.current = f;
  }, []);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  // In-canvas "Draw on the board" overlay toggle — the inline
  // handwriting input that morphs ink into typeset LaTeX and auto-sends.
  const [drawingInline, setDrawingInline] = useState(false);
  const [volumePopoverOpen, setVolumePopoverOpen] = useState(false);
  const volumePopoverWrapRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Object-URL lifecycle for the pending-image thumbnail.
  useEffect(() => {
    if (!pendingImage) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  // Close the volume popover on outside-click.
  useEffect(() => {
    if (!volumePopoverOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!volumePopoverWrapRef.current?.contains(e.target as Node)) {
        setVolumePopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [volumePopoverOpen]);

  // Ref-mirror of pendingImage so the always-listening voice
  // dispatcher (defined with empty deps below) can read the current
  // value when it fires. Without the mirror, `dispatchUtterance`
  // would close over a stale `pendingImage`.
  const pendingImageRef = useRef<Blob | null>(null);
  pendingImageRef.current = pendingImage;

  const chat = useLessonChat({
    variant: "mentor",
    // Topic / subtopic / lesson context are ignored on the mentor path
    // — the route enriches with the student's progress data server-side.
    topic: "",
    subtopic: "",
    lessonContent: "",
  });

  // ── Always-listening voice → chat dispatch ───────────────────────────
  // Mic-on with Silero VAD detects when the student speaks; each
  // utterance gets transcribed via /api/agent/speech-to-text and
  // dispatched into the chat as a regular message. Mute toggle exposed
  // via the mic chip near the input. Suppressed while the tutor is
  // speaking so we don't loop on echo.
  const chatSendRef = useRef(chat.sendChat);
  chatSendRef.current = chat.sendChat;
  const acknowledgeRef = useRef(chat.acknowledge);
  acknowledgeRef.current = chat.acknowledge;
  const chatSpeakingRef = useRef(chat.isSpeaking || chat.isChatNarrating);
  chatSpeakingRef.current = chat.isSpeaking || chat.isChatNarrating;
  const sttInFlightRef = useRef(false);

  const dispatchUtterance = useCallback(async (audio: Blob) => {
    if (sttInFlightRef.current) return;
    sttInFlightRef.current = true;
    try {
      const fd = new FormData();
      fd.append("audio", audio, "utterance.wav");
      const res = await fetch("/api/agent/speech-to-text", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`STT ${res.status}`);
      const { text } = (await res.json()) as { text?: string };
      const trimmed = (text ?? "").trim();
      // Filter empty / single-word / "thank you for watching" type
      // STT false positives — these come from ElevenLabs / Whisper
      // hallucinating on background noise.
      if (trimmed.length < 4) return;
      // Drop ambient-sound annotations the STT model emits on near
      // silence — "(upbeat music)", "[Music]", "(coughs)", etc.
      if (isAmbientNoiseTranscript(trimmed)) {
        console.debug("[voice→chat] dropped ambient transcript:", trimmed);
        return;
      }
      // Include the pending image attachment (if any) and clear it
      // — same behaviour as a typed submit. `appendCanvas: true` keeps
      // prior turns on the board (see handleSubmit).
      const img = pendingImageRef.current;
      // Immediate spoken acknowledgement — fills the LLM round-trip gap
      // with "Give me a moment." + caption so the student isn't met with
      // silence after they finish speaking.
      acknowledgeRef.current();
      chatSendRef.current(trimmed, { appendCanvas: true, ...(img ? { image: img } : {}) });
      if (img) setPendingImage(null);
    } catch (err) {
      console.error("[voice→chat] STT failed:", err);
      toast.error("Couldn't hear that — try again.");
    } finally {
      sttInFlightRef.current = false;
    }
  }, []);

  // Voice listening state — mentor only ever has chat-active or
  // idle (no lesson narration, no multiple-choice interaction). The
  // derive function maps these signals to the right threshold; the
  // hook applies it via the policy in voice-listening-state.ts.
  const voiceListeningState = deriveVoiceListeningState({
    micActive: true,
    isChatting: chat.chatMessages.length > 0 || chat.isProcessing,
    isChatProcessing: chat.isProcessing,
    isChatSpeaking: chat.isSpeaking,
    isChatNarrating: chat.isChatNarrating,
    isLessonNarrating: false,
    isLessonTtsLoading: false,
    isAwaitingInteractionAnswer: false,
  });

  const voice = useVoiceActivity({
    onSpeechEnd: (audio) => {
      // Drop the utterance if the tutor was talking when it landed —
      // probably echo-bleed from the tutor's own voice.
      if (chatSpeakingRef.current) return;
      dispatchUtterance(audio);
    },
    onError: (err) => {
      console.error("[voice-activity]", err);
      if (err.name === "NotAllowedError") {
        toast.error("Microphone access denied. Enable it in your browser to talk to Athena.");
      }
    },
    listeningState: voiceListeningState,
    // Boot the mic OFF (muted). Stream still opens so turning it on is
    // instant, but VAD stays gated until the user clicks the mic —
    // keeps a noisy room from misfiring the always-listening matcher.
    initialMuted: true,
  });

  // Boot the mic on mount; tear down on unmount.
  useEffect(() => {
    voice.start();
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasStarted = chat.chatWhiteboardSteps.length > 0 || chat.isProcessing;

  // Canvas source: until the student sends their first message, show the
  // single "What do you want to learn today?" prompt. Once the agent
  // starts streaming a response, swap to its whiteboard steps.
  const canvasSteps = hasStarted ? chat.chatWhiteboardSteps : INITIAL_STEPS;
  const isMobilePortrait = useLessonViewport() === "mobile-portrait";
  // Progressive reveal synced with narration — steps (incl. solve-triplet
  // morphs) appear one at a time as the tutor speaks each, rather than all
  // at once. Mirrors the in-lesson tutor takeover (micro-lesson.tsx). Before
  // the first message, the initial prompt is fully visible. Iterate the full
  // list so clear/erase semantics apply against every id, then gate by the
  // narration cursor.
  const visibleStepIds = useMemo(() => {
    if (!hasStarted) return new Set(INITIAL_STEPS.map((s) => s.id));
    const ids = new Set<number>();
    const upTo = Math.min(
      Math.max(chat.chatNarrationIndex, 0),
      chat.chatWhiteboardSteps.length - 1,
    );
    for (let i = 0; i <= upTo; i++) {
      const step = chat.chatWhiteboardSteps[i];
      if (!step) continue;
      if (step.action.type === "clear") {
        ids.clear();
      } else if (step.action.type === "erase" && step.action.targetStepIndices) {
        for (const idx of step.action.targetStepIndices) {
          const target = chat.chatWhiteboardSteps[idx];
          if (target) ids.delete(target.id);
        }
      }
      ids.add(step.id);
    }
    return ids;
  }, [hasStarted, chat.chatWhiteboardSteps, chat.chatNarrationIndex]);

  // Auto-grow the textarea as the student types.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || chat.isProcessing) return;
      // `appendCanvas: true` so follow-up turns accumulate on the board
      // instead of wiping it — matches the in-lesson tutor takeover. The
      // default (wipe) blanks the canvas on prose-only mentor replies
      // (which emit no whiteboard steps), reverting to the initial prompt.
      // Image attachment (if present) flows to Claude vision via the
      // agents service — see C3/C4 wiring.
      chat.sendChat(text, { appendCanvas: true, ...(pendingImage ? { image: pendingImage } : {}) });
      setInput("");
      if (pendingImage) setPendingImage(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    },
    [input, chat, pendingImage],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Orb state — mirrors useLessonChat's voice/processing/speaking flags.
  const orbState: "idle" | "thinking" | "speaking" | "listening" = chat.isRecording
    ? "listening"
    : chat.isProcessing
      ? "thinking"
      : chat.isSpeaking || chat.isChatNarrating
        ? "speaking"
        : "idle";

  // Caption — the streaming tutor message body, rendered with MathContent
  // (KaTeX) so inline `$...$` math shows as real math, matching the quiz
  // takeover and micro-lesson orb captions (the displayed-caption pattern
  // app-wide; stripTtsNoise is for the spoken/TTS path only). Status words
  // ("Listening…" / "Thinking…") go through MathContent's plain-text fast
  // path. We pass the raw content (NOT stripped) so the `$...$` survives.
  const lastTutorMsg = chat.chatMessages.findLast((m) => m.role === "tutor");
  const caption = (() => {
    if (chat.isRecording) return "Listening…";
    // The spoken acknowledgement caption wins over the streaming-reply
    // body / "Thinking…" until the tutor's first real step takes over.
    if (chat.acknowledgement) return chat.acknowledgement;
    if (lastTutorMsg?.content) return clampCaption(lastTutorMsg.content);
    if (chat.isProcessing) return "Thinking…";
    return null;
  })();

  return (
    <div className="dark">
      <ObservationFrame
        onBack={() => router.push(satFocused ? "/sat/dashboard" : "/dashboard")}
      >
        {/* Canvas area — mirrors the micro-lesson layout: a full-bleed
            canvas (wrapped in the IsoContourFrame chrome) with the orb +
            caption floating as an ambient indicator in the top-left corner
            rather than a reserved strip pushing the canvas down. */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          {/* Floating orb + caption. Container is pointer-events-none so
              the caption never blocks canvas interaction; the orb core
              re-enables clicks for the character/voice picker. */}
          {debugOrb ? (
            <PresenceLayer
              orbState={orbState}
              amplitude={chat.amplitude}
              size={isMobilePortrait ? 60 : 100}
              captionText={caption}
              mode="rest"
              restAnchor={isMobilePortrait ? { x: 40, y: 40 } : { x: 62, y: 62 }}
              stepFocusRef={stepFocusRef}
            />
          ) : (
          <div className="absolute top-3 left-3 z-20 flex w-[220px] flex-col items-center gap-2 pointer-events-none origin-top-left scale-[0.65] sm:scale-100">
            <div className="pointer-events-auto">
              <ObservationOrb state={orbState} amplitude={chat.amplitude} size={isMobilePortrait ? 60 : 100} />
            </div>
            <AnimatePresence mode="wait">
              {caption && (
                <motion.div
                  key={caption.slice(0, 64)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="obs-serif max-w-[640px] rounded-xl border border-white/5 px-4 py-2 text-center text-base leading-snug text-[var(--obs-fg)] shadow-lg shadow-black/10 backdrop-blur-md"
                  style={{
                    background:
                      "color-mix(in oklch, var(--obs-surface) 70%, transparent)",
                  }}
                >
                  <MathContent content={caption} size="base" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            <IsoContourFrame bottomCenterLabel="" bottomRightLabel="">
              <div className="relative h-full w-full">
                {isMobilePortrait ? (
                  <div className="h-full w-full overflow-y-auto pt-20">
                    <MobileLessonRenderer
                      steps={canvasSteps}
                      visibleStepIds={visibleStepIds}
                      currentStepIndex={Math.max(0, canvasSteps.length - 1)}
                      stepProgress={1}
                    />
                  </div>
                ) : (
                  <WhiteboardCanvas
                    steps={canvasSteps}
                    visibleStepIds={visibleStepIds}
                    currentStepIndex={Math.max(0, canvasSteps.length - 1)}
                    stepProgress={1}
                    equalScaleCoords
                    sequentialDiagrams={debugOrb}
                    onStepFocus={debugOrb ? handleStepFocus : undefined}
                  />
                )}
                {/* Waiting symbol — centered over the canvas while a
                    spoken utterance is in flight to the tutor. The
                    spoken acknowledgement caption shows the words under
                    the orb; this is the silent "working" visual. */}
                <AnimatePresence>
                  {chat.acknowledgement && (
                    <motion.div
                      key="thinking-indicator"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
                    >
                      <ThinkingIndicator size={64} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* In-canvas "Draw on the board" overlay — ink morphs to
                    typeset LaTeX, then auto-sends to the mentor. */}
                <AnimatePresence>
                  {drawingInline && (
                    <BoardDrawOverlay
                      key="board-draw-overlay"
                      onSuppressVoice={voice.setSuppressed}
                      onClose={() => setDrawingInline(false)}
                      onAttachImage={(blob) => setPendingImage(blob)}
                      onRecognized={(recognized) =>
                        chat.sendChat(`$${recognized}$`, { appendCanvas: true })
                      }
                    />
                  )}
                </AnimatePresence>
              </div>
            </IsoContourFrame>
          </div>
        </div>

        {/* Bottom input pane — same pattern as the SAT-quiz takeover and
            micro-lesson chat. Text or voice; Enter sends. The mic-status
            chip above the form shows whether always-listening is hot. */}
        <div className="border-t border-[var(--obs-border)] bg-[var(--obs-surface)]/30 px-4 py-3">
          <div className="mx-auto mb-2 flex w-full max-w-[640px] items-center justify-end">
            <button
              type="button"
              onClick={voice.muted ? voice.unmute : voice.mute}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
                voice.state === "denied" || voice.state === "error"
                  ? "border-red-500/50 text-red-400"
                  : voice.muted
                    ? "border-[var(--obs-border)] text-[var(--obs-muted)] hover:text-[var(--obs-fg)]"
                    : voice.state === "hearing"
                      ? "border-[var(--obs-glow-mid)] bg-[var(--obs-glow-mid)]/10 text-[var(--obs-fg)]"
                      : "border-[var(--obs-border)] text-[var(--obs-fg)] hover:border-[var(--obs-glow-mid)]",
              )}
              aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
              title={voice.muted ? "Mic off — click to turn on" : "Mic On — click to mute"}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  voice.state === "denied" || voice.state === "error"
                    ? "bg-red-500"
                    : voice.muted
                      ? "bg-[var(--obs-dim)]"
                      : voice.state === "hearing"
                        ? "bg-[var(--obs-glow-mid)] animate-pulse"
                        : voice.state === "listening"
                          ? "bg-[var(--obs-glow-mid)]/70"
                          : "bg-[var(--obs-dim)]",
                )}
              />
              {voice.state === "denied"
                ? "Mic blocked"
                : voice.state === "error"
                  ? "Mic error"
                  : voice.muted
                    ? "Mic off"
                    : voice.state === "hearing"
                      ? "Hearing you"
                      : voice.state === "listening"
                        ? "Mic On"
                        : "Mic starting…"}
            </button>
          </div>
          {/* Pending image attachment strip. Mirror of the chat-bar
              version. C3 will wire `pendingImage` into the next
              `chat.sendChat()` call so the tutor sees the image. */}
          {pendingImage && pendingPreviewUrl && (
            <div className="mx-auto mb-2 flex w-full max-w-[640px] items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingPreviewUrl}
                alt="Pending attachment"
                className="h-10 w-10 rounded border border-[var(--obs-border)] object-cover"
              />
              <span className="text-xs text-[var(--obs-muted)]">
                Image will attach to your next message
              </span>
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                title="Remove attachment"
                aria-label="Remove attachment"
                className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--obs-muted)] hover:text-[var(--obs-fg)]"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* Narration transport — skip-back / play-pause / skip-forward
              + volume, mirroring the micro-lesson. Wired to the chat
              narration audio via useLessonChat. Shown once a response is
              on the board so there's something to play. */}
          {hasStarted && (
            <div className="mx-auto mb-2 flex w-full max-w-[640px] items-center justify-center gap-2">
              <button
                type="button"
                onClick={chat.skipNarrationBack}
                disabled={chat.chatNarrationIndex <= 0}
                aria-label="Previous step"
                title="Previous step"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={chat.toggleNarrationPaused}
                aria-label={chat.narrationPaused ? "Play" : "Pause"}
                title={chat.narrationPaused ? "Play" : "Pause"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
              >
                {chat.narrationPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={chat.skipNarrationForward}
                disabled={chat.chatNarrationIndex >= chat.chatWhiteboardSteps.length - 1}
                aria-label="Next step"
                title="Next step"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <div className="relative" ref={volumePopoverWrapRef}>
                <button
                  type="button"
                  onClick={() => setVolumePopoverOpen((o) => !o)}
                  aria-label={chat.narrationMuted ? "Unmute narration" : "Mute narration"}
                  aria-expanded={volumePopoverOpen}
                  title="Volume"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                >
                  {chat.narrationMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                {volumePopoverOpen && (
                  <div
                    role="dialog"
                    aria-label="Volume controls"
                    className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-30 w-44 rounded-md border border-[var(--obs-border)] bg-[var(--obs-surface)] p-3 shadow-lg"
                  >
                    <label className="flex flex-col gap-1.5">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--obs-muted)]">
                        Volume {Math.round(chat.narrationVolume * 100)}%
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={chat.narrationVolume}
                        onChange={(e) => chat.setNarrationVolume(parseFloat(e.target.value))}
                        disabled={chat.narrationMuted}
                        className="w-full accent-[var(--obs-glow-mid)] disabled:opacity-40"
                        aria-label="Narration volume"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => chat.setNarrationMuted(!chat.narrationMuted)}
                      className={cn(
                        "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
                        chat.narrationMuted
                          ? "border-[var(--obs-glow-mid)] bg-[var(--obs-glow-mid)]/10 text-[var(--obs-fg)]"
                          : "border-[var(--obs-border)] text-[var(--obs-muted)] hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]",
                      )}
                    >
                      {chat.narrationMuted ? (
                        <>
                          <Volume2 className="h-3.5 w-3.5" />
                          Unmute
                        </>
                      ) : (
                        <>
                          <VolumeX className="h-3.5 w-3.5" />
                          Mute
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-[640px] flex-wrap items-center justify-center gap-3"
          >
            {SHOW_VOICE_INPUT_MODE && (
              <button
                type="button"
                onClick={chat.toggleMode}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                title={chat.mode === "voice" ? "Switch to keyboard" : "Switch to voice"}
                aria-label={chat.mode === "voice" ? "Switch to keyboard" : "Switch to voice"}
              >
                {chat.mode === "voice" ? (
                  <Keyboard className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}
            {SHOW_VOICE_INPUT_MODE && chat.mode === "voice" ? (
              <button
                type="button"
                onMouseDown={chat.startRecording}
                onMouseUp={chat.stopRecording}
                onTouchStart={chat.startRecording}
                onTouchEnd={chat.stopRecording}
                disabled={chat.isProcessing}
                className={`flex h-10 flex-1 items-center justify-center rounded-full border text-sm transition-colors ${
                  chat.isRecording
                    ? "border-[var(--obs-glow-mid)] bg-[var(--obs-glow-mid)]/10 text-[var(--obs-fg)]"
                    : "border-[var(--obs-border)] bg-[var(--obs-bg)]/30 text-[var(--obs-muted)] hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                }`}
              >
                {chat.isRecording ? "Listening… release to send" : "Hold to talk"}
              </button>
            ) : (
              <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-1">
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Athena anything…"
                    className="w-full resize-none rounded-full border border-[var(--obs-border)] bg-[var(--obs-bg)]/30 px-5 py-2.5 text-sm text-[var(--obs-fg)] outline-none placeholder:text-[var(--obs-dim)] focus:border-[var(--obs-glow-mid)]"
                    rows={1}
                    style={{ minHeight: 40, maxHeight: 120 }}
                    disabled={chat.isProcessing}
                  />
                </div>
                <ImageAttachLauncher
                  onAttach={(image) => setPendingImage(image)}
                  onSuppressVoice={voice.setSuppressed}
                  disabled={chat.isProcessing}
                  renderTrigger={(open, disabled) => (
                    <button
                      type="button"
                      onClick={open}
                      disabled={disabled}
                      title="Attach an image (⌘⇧M)"
                      aria-label="Attach an image"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                  )}
                />
                <button
                  type="button"
                  onClick={() => setDrawingInline(true)}
                  disabled={chat.isProcessing || drawingInline}
                  title="Draw on the board"
                  aria-label="Draw on the board"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                >
                  <PenLine className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || chat.isProcessing}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
          </form>
        </div>
      </ObservationFrame>
    </div>
  );
}


