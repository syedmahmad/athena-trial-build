"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAudioAnalyzer } from "./use-audio-analyzer";
import type { WhiteboardStep } from "@/types/whiteboard";
import type { Problem } from "@/components/quiz/types";
import { checkOutputContract } from "@/lib/check-output-contract";

/**
 * Step-ID namespace for chat-emitted whiteboard steps. Lesson steps
 * are sequential 0..N (small numbers); chat steps are appended onto
 * the same canvas during chat takeover, so they need IDs that won't
 * collide with the lesson's. 1_000_000 is comfortably above any
 * realistic lesson length.
 */
export const CHAT_STEP_ID_OFFSET = 1_000_000;

/** Canned line spoken (and captioned) the instant a *spoken* utterance is
 *  dispatched to the LLM. The agent round-trip + first-step TTS takes a
 *  couple seconds; this fills that gap so the student gets an immediate
 *  acknowledgement instead of silence. Only the voice path triggers it —
 *  a typed message doesn't need an audible "give me a moment". */
export const ACKNOWLEDGEMENT_LINE =
  "No problem, I can help with that. Give me a moment.";

/** Shorter acknowledgement used on every voice turn AFTER the first one.
 *  The full line reassures the first time but grates when it repeats
 *  verbatim each turn — follow-ups drop the preamble and keep just the
 *  "give me a moment" beat. */
export const ACKNOWLEDGEMENT_LINE_SHORT = "Give me a moment.";

export type ChatMessage = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
  /** When true, the UI must skip rendering this message — the content
   *  is still sent to the agent and lives in history, but the student
   *  shouldn't see it. Used by the takeover flow to seed the agent
   *  with structured context (wrong answer + question + explanation)
   *  and by "Explain more" follow-ups, neither of which should appear
   *  as a chat bubble. */
  hidden?: boolean;
};

type SubtopicMetadata = {
  learningObjectives?: string[];
  keyFormulas?: { latex: string; description: string }[];
  commonMistakes?: { mistake: string; correction: string; why: string }[];
  tipsAndTricks?: string[];
  satFocused?: boolean;
};

/** Body shape expected by `/api/agent/quiz-chat/stream` — mirrors the
 *  fields the SAT quiz tutor agent reads to ground its response in the
 *  problem the student is stuck on. The quiz-chat endpoint ignores the
 *  lesson-specific fields (`lessonSummary`, `lessonSteps`, `metadata`)
 *  the lesson-chat endpoint reads. */
export type QuizChatContext = {
  questionText: string;
  options: string[];
  hint: string;
  solutionSteps: { step: number; instruction: string; math: string }[];
  correctOption: number;
  studentAnswer?: number;
};

type UseLessonChatOptions = {
  topic: string;
  subtopic: string;
  lessonContent: string;
  metadata?: SubtopicMetadata;
  whiteboardSteps?: WhiteboardStep[];
  currentStepIndex?: number;
  chatStreamUrl?: string;
  currentPracticeProblem?: Problem | null;
  /** "lesson" (default) — sends the lesson body to `/api/agent/micro-lesson/chat/stream`.
   *  "quiz" — sends the quiz body to `/api/agent/quiz-chat/stream` (or `chatStreamUrl`).
   *  The quiz variant sources its grounding from `quizContext` instead of
   *  `lessonSteps` / `metadata`.
   *  "mentor" — sends just `{question, history}` to
   *  `/api/agent/mentor-chat/stream` (or `chatStreamUrl`). The mentor
   *  route enriches the request with student progress data server-side
   *  before forwarding to the agent — see `route.ts` for the guardrail
   *  + context-injection layer. The hook deliberately doesn't pass
   *  topic/subtopic/lesson context; the mentor lives outside the
   *  per-subtopic teaching surfaces. */
  variant?: "lesson" | "quiz" | "mentor";
  /** Required when `variant === "quiz"`. Updated via ref so swapping the
   *  current problem doesn't recreate `sendChat`. */
  quizContext?: QuizChatContext;
  /** SAT surface opt-in — the agents service restores SAT-tutor prompt
   *  framing. Falls back to `metadata.satFocused` for the lesson variant. */
  satFocused?: boolean;
};

/**
 * Lightweight chat hook for mid-lesson Q&A.
 *
 * Completely independent from useMicroLesson — keeps its own message
 * and whiteboard state so the lesson player is never affected.
 *
 * Chat responses are whiteboard-step-only: each step has narration
 * (speech-friendly) + displayText (KaTeX) + action (canvas visual).
 * Steps are narrated one at a time via TTS, synced with display.
 */
export function useLessonChat({
  topic,
  subtopic,
  lessonContent,
  metadata,
  whiteboardSteps: lessonStepsRaw,
  currentStepIndex = 0,
  chatStreamUrl,
  currentPracticeProblem,
  variant = "lesson",
  quizContext,
  satFocused,
}: UseLessonChatOptions) {
  const satFocusedResolved = satFocused ?? metadata?.satFocused ?? false;
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatWhiteboardSteps, setChatWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsFailed, setTtsFailed] = useState(false);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [isRecording, setIsRecording] = useState(false);
  // Caption text for the spoken acknowledgement ("Give me a moment.") that
  // plays while a voice utterance is in flight to the LLM. Held until the
  // tutor's first real narration step starts speaking (or the turn ends).
  const [acknowledgement, setAcknowledgement] = useState<string | null>(null);

  // Per-step narration state
  const [chatNarrationIndex, setChatNarrationIndex] = useState(-1);
  const [isChatNarrating, setIsChatNarrating] = useState(false);
  const [chatStreamDone, setChatStreamDone] = useState(false);

  // ── Narration transport controls (play/pause, volume, mute) ──────────
  // Exposed so a surface (e.g. the mentor footer) can offer the same
  // play/pause/volume transport the micro-lesson has. Defaults (not
  // paused, full volume, unmuted) keep every other consumer's behavior
  // unchanged — they simply never call the setters. The refs let the
  // narration effect read the latest values without re-binding.
  const [narrationPaused, setNarrationPaused] = useState(false);
  const [narrationVolume, setNarrationVolume] = useState(1);
  const [narrationMuted, setNarrationMuted] = useState(false);
  // Hard disable — distinct from `narrationMuted` (which keeps playing at
  // volume 0). When true, the per-step effect skips the TTS fetch entirely
  // and advances the cursor instantly, so no audio is generated and the orb
  // stays idle. Used by the SAT quiz's master "audio off" toggle to silence
  // the tutor takeover without burning ElevenLabs quota. The mentor's
  // volume-mute (narrationMuted) is left untouched — it never sets this.
  const [narrationDisabled, setNarrationDisabled] = useState(false);
  const narrationPausedRef = useRef(narrationPaused);
  narrationPausedRef.current = narrationPaused;
  const narrationVolumeRef = useRef(narrationVolume);
  narrationVolumeRef.current = narrationVolume;
  const narrationMutedRef = useRef(narrationMuted);
  narrationMutedRef.current = narrationMuted;
  const narrationDisabledRef = useRef(narrationDisabled);
  narrationDisabledRef.current = narrationDisabled;

  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = chatMessages;
  // Index in chatWhiteboardSteps where the CURRENT tutor turn's steps
  // begin. 0 for the default "fresh canvas" sendChat. When sendChat is
  // called with `{ appendCanvas: true }` (used by `explainMore`), this
  // is set to the existing step count so prior canvas content is
  // preserved and only new steps are narrated / combined into the new
  // tutor message body.
  const turnStartIdxRef = useRef(0);
  // Index where the IMMEDIATELY PRIOR tutor turn began. Used by the
  // history builder to slice out only that turn's steps when the
  // prior tutor message body hasn't been finalized yet (e.g. user
  // clicks "Explain more" mid-narration).
  const prevTurnStartIdxRef = useRef(0);
  // Keep quizContext in a ref so callers can swap problems (e.g. the
  // SAT quiz advancing to the next question) without recreating
  // `sendChat`. The fetch reads from the ref at call time.
  const quizContextRef = useRef<QuizChatContext | undefined>(quizContext);
  quizContextRef.current = quizContext;
  const nextStepIdRef = useRef(CHAT_STEP_ID_OFFSET);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Separate audio element for the acknowledgement line so it doesn't
  // collide with `audioRef` (the per-step narration audio). When the
  // tutor's first real step begins speaking we stop this explicitly.
  const ackAudioRef = useRef<HTMLAudioElement | null>(null);
  const chatStepsRef = useRef<WhiteboardStep[]>([]);
  chatStepsRef.current = chatWhiteboardSteps;
  // Read latest isProcessing inside `acknowledge` without re-binding it.
  const isProcessingRef = useRef(isProcessing);
  isProcessingRef.current = isProcessing;
  // Whether the spoken acknowledgement has already fired once for this hook
  // instance (= this voice session). First turn gets the full line; every
  // follow-up gets the shorter one. Resets on remount — desired per-surface.
  const hasAcknowledgedRef = useRef(false);

  const {
    amplitude,
    connectStream: connectAudioStream,
    connectElement: connectAudioElement,
    disconnect: disconnectAudio,
  } = useAudioAnalyzer();

  // ── Spoken acknowledgement ("Give me a moment.") ─────────────────
  // Stop + clear the in-flight acknowledgement audio and caption. Called
  // when the tutor's first real narration step takes over, when the turn
  // ends, and on barge-in. Idempotent.
  const stopAcknowledgement = useCallback(() => {
    if (ackAudioRef.current) {
      ackAudioRef.current.pause();
      ackAudioRef.current = null;
    }
    setAcknowledgement((prev) => (prev === null ? prev : null));
  }, []);

  // Play the canned acknowledgement line + surface its caption. Routed
  // through the same TTS endpoint and amplitude analyzer as step
  // narration so the orb pulses while it speaks. Fire-and-forget — the
  // caller kicks off `sendChat` immediately after; this just fills the
  // round-trip gap. No-op if a turn is already processing (sendChat
  // would no-op too) or under automated browsers (Playwright sets
  // navigator.webdriver — keep TTS quota for real sessions).
  const acknowledge = useCallback(() => {
    if (isProcessingRef.current) return;
    // First turn keeps the full reassuring line; every follow-up shortens it.
    const line = hasAcknowledgedRef.current ? ACKNOWLEDGEMENT_LINE_SHORT : ACKNOWLEDGEMENT_LINE;
    hasAcknowledgedRef.current = true;
    // Show the caption immediately, even if TTS is unavailable.
    setAcknowledgement(line);
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    setIsSpeaking(true);
    (async () => {
      try {
        const res = await fetch("/api/agent/text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: line }),
        });
        if (!res.ok) {
          setIsSpeaking(false);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = narrationMutedRef.current ? 0 : narrationVolumeRef.current;
        ackAudioRef.current = audio;
        try { connectAudioElement(audio); } catch { /* optional */ }
        const finish = () => {
          URL.revokeObjectURL(url);
          if (ackAudioRef.current === audio) {
            ackAudioRef.current = null;
            disconnectAudio();
            setIsSpeaking(false);
          }
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      } catch {
        setIsSpeaking(false);
      }
    })();
  }, [connectAudioElement, disconnectAudio]);

  // ── SSE stream parser (text + whiteboard steps) ──────────────────

  const parseStream = useCallback(
    async (res: Response, onToken: (token: string) => void) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";
      let sawDone = false;

      // Helper — process one decoded line. Returns true when the
      // sentinel `[DONE]` event arrives so the outer loop can stop
      // reading immediately instead of waiting for the connection
      // close (which can lag behind the marker on some networks).
      const handleLine = (line: string): boolean => {
        if (!line.startsWith("data: ")) return false;
        const data = line.slice(6);
        if (data === "[DONE]") return true;

        try {
          const parsed = JSON.parse(data);
          if (parsed.token) {
            fullContent += parsed.token;
            onToken(parsed.token);
          }
          if (parsed.wb_step) {
            const step = {
              ...parsed.wb_step,
              id: nextStepIdRef.current++,
            } as WhiteboardStep;
            // Runtime contract check: log warnings when the agent
            // emits a step that violates the displayText/narration
            // contract. Non-blocking — the step still renders, but
            // the violation surfaces in dev console so we catch
            // bad output before students see broken UI.
            const violation = checkOutputContract(step.displayText, step.narration);
            if (violation) {
              console.warn(
                "[chat] output-contract violation on step",
                step.id,
                violation.reasons,
                { displayText: step.displayText, narration: step.narration },
              );
            }
            setChatWhiteboardSteps((prev) => [...prev, step]);
          }
        } catch (e) {
          // Ignore JSON syntax errors — partial-line buffer fallback
          // will reassemble on the next chunk.
          if (!(e instanceof SyntaxError)) throw e;
        }
        return false;
      };

      try {
        while (!sawDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (handleLine(line)) {
              sawDone = true;
              break;
            }
          }
        }
        // Flush any trailing buffered line (e.g. server-side close
        // without a final newline). Important for catching a [DONE]
        // that lands without a trailing \n.
        if (!sawDone && buffer.length > 0) {
          handleLine(buffer);
        }
      } finally {
        if (sawDone) {
          // Cancel the underlying read pump so the caller doesn't sit
          // waiting on a connection that's effectively finished.
          try {
            await reader.cancel();
          } catch {
            /* already closed — ignore */
          }
        }
      }

      return fullContent;
    },
    [],
  );

  // ── Send chat message ────────────────────────────────────────────

  const sendChat = useCallback(
    async (
      text: string,
      options?: {
        hidden?: boolean;
        appendCanvas?: boolean;
        /** When set, this string is prepended to the backend payload
         *  but NOT shown in the chat UI or stored in messagesRef. Used
         *  by `askFollowup` to anchor the agent on the prior tutor
         *  turn while the visible chat bubble shows just the
         *  student's typed text. */
        anchorPrompt?: string;
        /** Image attachment for the multimodal turn. When provided,
         *  the blob is base64-encoded and shipped alongside the
         *  question; the agents service forwards it to Claude as a
         *  vision content block. One-shot — only this turn sees the
         *  image. (Multi-turn vision persistence is a follow-up if
         *  students need to ask multiple questions about the same
         *  image without re-uploading.) Currently honored by the
         *  mentor variant; quiz / lesson variants ignore it. */
        image?: Blob;
      },
    ) => {
      if (!text.trim() || isProcessing) return;

      // Encode the optional image up-front so the rest of the function
      // sees a plain (data, mediaType) pair. FileReader is the
      // browser's canonical async base64 encoder for Blobs.
      let imageBase64: string | null = null;
      let imageMediaType: string | null = null;
      if (options?.image) {
        try {
          const encoded = await new Promise<{ data: string; mediaType: string }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const [meta, data] = dataUrl.split(",");
                const mediaType =
                  meta.match(/data:(.*?);/)?.[1] || options.image?.type || "image/png";
                resolve({ data, mediaType });
              };
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(options.image!);
            },
          );
          imageBase64 = encoded.data;
          imageMediaType = encoded.mediaType;
        } catch {
          // Encoding failure means we send the message without the
          // image rather than failing the whole turn. The tutor
          // responds to text alone — degraded but functional.
          imageBase64 = null;
          imageMediaType = null;
        }
      }

      const append = options?.appendCanvas === true;
      // Hidden anchor that's prepended to the backend payload only.
      // Does NOT appear in chatMessages, so the visible bubble shows
      // just `text`. History on subsequent turns derives the agent's
      // grounding from the natural conversation arc — the anchor is
      // a one-shot context boost, not persisted state.
      const anchor = options?.anchorPrompt ?? "";
      // Mark where this turn's steps will start. Default mode wipes the
      // canvas (turn starts at index 0); append mode preserves prior
      // tutor-turn content and starts after it. Capture the prior
      // turn's start before overwriting so the history-builder can
      // attribute already-streamed steps to the right tutor message.
      prevTurnStartIdxRef.current = turnStartIdxRef.current;
      const turnStartIdx = append ? chatStepsRef.current.length : 0;
      turnStartIdxRef.current = turnStartIdx;

      if (!append) {
        // Default behavior — fresh canvas for the new turn.
        setChatWhiteboardSteps([]);
        nextStepIdRef.current = CHAT_STEP_ID_OFFSET;
      }
      setTtsFailed(false);
      setChatStreamDone(false);
      if (!append) {
        // Fresh-canvas turn: reset narration cursor so the per-step
        // narration effect fires for the new turn's first step.
        setChatNarrationIndex(-1);
        setIsChatNarrating(false);
      }
      // Append mode: leave chatNarrationIndex and isChatNarrating
      // alone. Prior-turn narration continues to play, and once the
      // narration cursor naturally ticks past the last prior step it
      // rolls into the new turn's first step (which is at index
      // turnStartIdxRef.current). The narration-bootstrap effect below
      // also catches up if narration was already done before append
      // started — its guard uses `< turnStartIdxRef.current`, not
      // `=== -1`, so it advances the cursor regardless of where it sat.

      setChatMessages((prev) => [
        ...prev,
        { role: "user", content: text, ...(options?.hidden ? { hidden: true } : {}) },
      ]);
      setIsProcessing(true);

      // Add streaming placeholder
      setChatMessages((prev) => [
        ...prev,
        { role: "tutor", content: "", isStreaming: true },
      ]);

      // Build history from accumulated chat messages. Include partially-
      // streamed tutor turns as long as they have non-empty content —
      // dropping them entirely on `isStreaming` was a bug that surfaced
      // when the user clicked "Explain more" while the previous tutor
      // turn was still narrating: the backend would receive an empty
      // history and re-explain from scratch instead of building on the
      // prior turn. We also fall back to live narration text from
      // chatStepsRef when the tutor message body hasn't been finalized
      // yet (content is finalized in a separate effect after narration
      // completes).
      //
      // Slice from `prevTurnStartIdxRef.current` so multi-turn flows
      // (Explain more → ...) attribute only the IMMEDIATELY PRIOR
      // tutor turn's steps to its message — earlier accumulated steps
      // already live in their own (finalized) tutor messages.
      const liveTutorTranscript = chatStepsRef.current
        .slice(prevTurnStartIdxRef.current)
        .map((s) => s.displayText || s.narration || "")
        .filter(Boolean)
        .join("\n");
      const history = messagesRef.current
        .map((m, i) => {
          if (m.role !== "tutor") return m;
          const isLastTutor = i === messagesRef.current.length - 1;
          // For the most recent tutor turn, prefer the live narration
          // transcript when the message body is still empty / partial.
          const content =
            isLastTutor && liveTutorTranscript && liveTutorTranscript.length > (m.content?.length ?? 0)
              ? liveTutorTranscript
              : m.content;
          return { ...m, content };
        })
        .filter((m) => (m.content ?? "").trim().length > 0)
        .map((m) => ({
          role: m.role === "tutor" ? "assistant" : "user",
          content: m.content,
        }));

      // The quiz variant grounds its response in the SAT problem the
      // student is stuck on (`quiz-chat/stream` reads
      // `question_text` / `options` / `solution_steps` / etc.). The
      // lesson variant grounds its response in the lesson summary +
      // step trace + metadata. Body shapes are intentionally disjoint —
      // each backend ignores the other's fields.
      const endpoint =
        chatStreamUrl ??
        (variant === "quiz"
          ? "/api/agent/quiz-chat/stream"
          : variant === "mentor"
            ? "/api/agent/mentor-chat/stream"
            : "/api/agent/micro-lesson/chat/stream");
      // Backend payload is `anchor + text` when anchorPrompt is set.
      // The visible message in chatMessages stays as just `text`.
      const backendQuestion = anchor ? `${anchor}\n\n${text}` : text;
      const requestBody =
        variant === "mentor"
          ? {
              // The mentor route enriches with student_context server-side
              // before forwarding; the hook only ships question + history.
              question: backendQuestion,
              history,
              // Optional vision-LLM image attachment. The agents
              // service translates this to a Claude `image` content
              // block. Omitted (or null) → plain text turn, same
              // behaviour as before this feature shipped.
              ...(imageBase64 && imageMediaType
                ? {
                    imageBase64,
                    imageMediaType,
                  }
                : {}),
            }
          : variant === "quiz"
          ? {
              question: backendQuestion,
              topic,
              subtopic,
              questionText: quizContextRef.current?.questionText ?? "",
              options: quizContextRef.current?.options ?? [],
              hint: quizContextRef.current?.hint ?? "",
              solutionSteps: quizContextRef.current?.solutionSteps ?? [],
              correctOption: quizContextRef.current?.correctOption ?? 0,
              studentAnswer: quizContextRef.current?.studentAnswer,
              history,
              ...(satFocusedResolved ? { satFocused: true } : {}),
            }
          : {
              question: backendQuestion,
              topic,
              subtopic,
              lessonSummary: lessonContent,
              lessonSteps: lessonStepsRaw?.map((step, i) => ({
                index: i,
                type: step.action.type === "check_in" ? "check_in" : "teaching",
                narration: step.narration || "",
                actionType: step.action.type,
                ...(step.action.type === "check_in"
                  ? {
                      question: (step.action as { question: string }).question,
                      options: (step.action as { options: string[] }).options,
                      correctOption: (step.action as { correctOption: number }).correctOption,
                      hint: (step.action as { hint?: string }).hint,
                    }
                  : {}),
              })),
              metadata: metadata || {},
              currentStepIndex,
              history,
              ...(satFocusedResolved ? { satFocused: true } : {}),
              // Optional vision image attachment, same shape the
              // mentor variant uses. Agents service decodes and
              // passes through to Claude vision via Agno's
              // `images=[Image(...)]` kwarg on agent.arun().
              ...(imageBase64 && imageMediaType
                ? { imageBase64, imageMediaType }
                : {}),
              ...(currentPracticeProblem ? {
                currentPracticeProblem: {
                  questionText: currentPracticeProblem.questionText,
                  options: currentPracticeProblem.options,
                  correctOption: currentPracticeProblem.correctOption,
                  hint: currentPracticeProblem.hint,
                  explanation: currentPracticeProblem.explanation,
                  solutionSteps: currentPracticeProblem.solutionSteps,
                },
              } : {}),
            };

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok || !res.body) throw new Error("Stream failed");

        await parseStream(res, (token) => {
          setChatMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "tutor" && last.isStreaming) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + token,
              };
            }
            return updated;
          });
        });

        // Fallback: if no whiteboard steps arrived, synthesize one from the text
        // so the per-step TTS narration system still fires.
        if (chatStepsRef.current.length === 0) {
          const lastMsg = messagesRef.current[messagesRef.current.length - 1];
          const fallbackText = lastMsg?.content?.trim();
          if (fallbackText) {
            const syntheticStep: WhiteboardStep = {
              id: nextStepIdRef.current++,
              delayMs: 0,
              narration: fallbackText,
              displayText: fallbackText,
              durationMs: 0,
              action: { type: "write_text", text: fallbackText, style: { fontSize: "md" } },
            };
            setChatWhiteboardSteps([syntheticStep]);
          }
        }

        // Mark streaming done
        setChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "tutor" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, isStreaming: false };
          }
          return updated;
        });
        setChatStreamDone(true);
      } catch {
        setChatMessages((prev) => [
          ...prev.filter((m) => !m.isStreaming),
          {
            role: "tutor",
            content: "I'm having trouble connecting right now. Please try again.",
          },
        ]);
      } finally {
        setIsProcessing(false);
        // Safety net: if the reply emitted no narratable steps (e.g. a
        // prose-only mentor turn), the narration effect never ran to
        // clear the acknowledgement caption — drop it here.
        stopAcknowledgement();
      }
    },
    [isProcessing, topic, subtopic, lessonContent, metadata, lessonStepsRaw, currentStepIndex, chatStreamUrl, parseStream, currentPracticeProblem, variant, stopAcknowledgement, satFocusedResolved],
  );

  // ── Per-step narration ─────────────────────────────────────────

  // Start narrating this turn's first step when it arrives. In default
  // (fresh canvas) mode, turnStartIdxRef.current is 0 and the cursor
  // starts at -1; in append mode it points at the index where the new
  // turn's steps begin. The guard `chatNarrationIndex < turnStartIdx`
  // covers both cases: -1 < 0 in fresh mode, and the cursor sitting at
  // end-of-prior-turn (turnStartIdx - 1) in append mode after prior
  // narration finished. If prior narration is still mid-stream when
  // append fires, `isChatNarrating` is true and we wait for the
  // natural prev+1 tick (line 467/475/513) to roll into the new turn.
  useEffect(() => {
    if (
      chatWhiteboardSteps.length > turnStartIdxRef.current &&
      chatNarrationIndex < turnStartIdxRef.current &&
      !isChatNarrating
    ) {
      setChatNarrationIndex(turnStartIdxRef.current);
    }
  }, [chatWhiteboardSteps.length, chatNarrationIndex, isChatNarrating]);

  // Stable identity for the step currently at the cursor. Used as an
  // effect dep so the per-step narration effect re-fires when a step
  // arrives at the cursor index AFTER the cursor was last set —
  // covers two cases:
  //   (1) Within a single turn, if the SSE stream stalls between
  //       narration finishing on step N and step N+1 arriving, the
  //       cursor sits at N+1 with no step. When N+1 arrives later,
  //       this id transitions from null to a number and re-fires the
  //       effect so narration resumes.
  //   (2) On a followup turn (`appendCanvas: true`) after prior
  //       narration completed, the cursor sits at `chatWhiteboardSteps
  //       .length` (one past end). The bootstrap effect below uses
  //       strict `<` and won't advance the cursor here — but as soon
  //       as the new turn's first step arrives at the cursor index,
  //       this key transitions and the effect plays it.
  // Identity is the step's `.id` (stable integer) rather than the
  // step object itself so within a single narration we don't re-fire
  // spuriously on unrelated array updates.
  const narrationStepKey =
    chatWhiteboardSteps[chatNarrationIndex]?.id ?? null;

  // Play TTS for the current chat step
  useEffect(() => {
    if (chatNarrationIndex < 0) return;
    const step = chatStepsRef.current[chatNarrationIndex];
    if (!step) return;

    const narration = step.narration?.trim();
    if (!narration) {
      // No narration on this step — advance immediately
      setChatNarrationIndex((prev) => prev + 1);
      return;
    }
    // Suppress live ElevenLabs calls when (a) under automated browsers so
    // test runs (Playwright sets navigator.webdriver) don't burn the quota,
    // or (b) narration is hard-disabled by the surface's audio toggle. Both
    // skip the fetch and advance the cursor so the walkthrough still steps
    // through silently — the canvas already shows every step.
    if (
      (typeof navigator !== "undefined" && navigator.webdriver) ||
      narrationDisabledRef.current
    ) {
      setIsChatNarrating(false);
      setIsSpeaking(false);
      setChatNarrationIndex((prev) => prev + 1);
      return;
    }

    let cancelled = false;
    // The tutor's first real step is about to speak — silence and clear
    // the acknowledgement so the two voices don't overlap.
    stopAcknowledgement();
    setIsChatNarrating(true);
    setIsSpeaking(true);

    // Safety timeout: if NONE of the completion paths fire
    // (audio.onended / onerror, play().catch, browser-fallback
    // onend/onerror, or the response error branches), we'd freeze
    // the cursor on this step forever. Estimate the utterance
    // duration from word count + buffer; if that elapses with no
    // completion signal, force-advance so the chat keeps moving.
    const wordCount = narration.split(/\s+/).filter(Boolean).length;
    const estimatedMs = Math.max(3000, (wordCount / 150) * 60_000);
    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      // Don't force-advance while the student has paused narration —
      // resuming will let the audio's own onended drive the advance.
      if (narrationPausedRef.current) return;
      console.warn(`[chat narration] safety timeout fired on step ${chatNarrationIndex}`);
      setIsSpeaking(false);
      setIsChatNarrating(false);
      setChatNarrationIndex((prev) => prev + 1);
    }, estimatedMs * 2 + 5000);
    const clearSafety = () => clearTimeout(safetyTimer);

    /**
     * Browser SpeechSynthesis fallback for when ElevenLabs is
     * unavailable (quota_exceeded, 503, etc.). Mirrors the fallback
     * in micro-lesson.tsx's playNarration. State machine matches the
     * ElevenLabs path: setIsSpeaking + setIsChatNarrating around the
     * utterance, and crucially `setChatNarrationIndex(prev+1)` on
     * end so the takeover walkthrough actually advances through its
     * steps. State transitions are synchronous around speak() rather
     * than via `onstart` because Chrome/Safari don't fire that event
     * reliably (autoplay policy, short utterances).
     */
    const speakViaBrowserFallback = () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return false;
      }
      try {
        const utt = new SpeechSynthesisUtterance(narration);
        utt.rate = 1.0;
        utt.pitch = 1.0;
        const finish = () => {
          clearSafety();
          if (cancelled) return;
          setIsSpeaking(false);
          setIsChatNarrating(false);
          setChatNarrationIndex((prev) => prev + 1);
        };
        utt.onend = finish;
        utt.onerror = finish;
        window.speechSynthesis.speak(utt);
        return true;
      } catch {
        return false;
      }
    };

    (async () => {
      try {
        const res = await fetch("/api/agent/text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: narration }),
        });
        if (cancelled) return;
        if (!res.ok) {
          // ElevenLabs unavailable — fall back to the browser's native
          // speechSynthesis so the takeover narration still plays AND
          // the chat narration index advances. Without this, ttsFailed
          // would set true and the walkthrough would freeze on step 0.
          if (!speakViaBrowserFallback()) {
            clearSafety();
            setIsChatNarrating(false);
            setIsSpeaking(false);
            setTtsFailed(true);
            // Advance anyway so the lesson doesn't hang on a step
            // we have no way to play.
            setChatNarrationIndex((prev) => prev + 1);
          }
          return;
        }

        const blob = await res.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = narrationMutedRef.current ? 0 : narrationVolumeRef.current;
        audioRef.current = audio;

        try { connectAudioElement(audio); } catch { /* optional */ }

        audio.onended = () => {
          clearSafety();
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (cancelled) return;
          setIsSpeaking(false);
          disconnectAudio();
          setIsChatNarrating(false);
          setChatNarrationIndex((prev) => prev + 1);
        };
        audio.onerror = () => {
          clearSafety();
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (cancelled) return;
          setIsSpeaking(false);
          disconnectAudio();
          setIsChatNarrating(false);
          setChatNarrationIndex((prev) => prev + 1);
        };

        if (cancelled) return;
        // Honor a pause that was toggled before this step's audio
        // arrived — leave it loaded but unplayed; the pause/resume
        // effect plays it when the student resumes.
        if (narrationPausedRef.current) return;
        audio.play().catch(() => {
          clearSafety();
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (!cancelled) {
            setIsSpeaking(false);
            setIsChatNarrating(false);
            setChatNarrationIndex((prev) => prev + 1);
          }
        });
      } catch {
        clearSafety();
        if (!cancelled) {
          // CRITICAL: must advance the cursor here too. Without this,
          // any thrown error during the fetch (network blip, JSON
          // parse fail, etc.) parks the cursor on the failed step
          // forever — the canvas freezes mid-response, no further
          // steps render, and the only way to recover is a new chat
          // turn. The matching !res.ok branch above also advances.
          setIsChatNarrating(false);
          setIsSpeaking(false);
          setTtsFailed(true);
          setChatNarrationIndex((prev) => prev + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
      clearSafety();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      disconnectAudio();
    };
  }, [chatNarrationIndex, narrationStepKey, connectAudioElement, disconnectAudio, stopAcknowledgement]);

  // ── Transport: react volume/mute + pause/resume onto the live audio ──
  // Propagate volume/mute to the in-flight narration audio so a slider
  // drag takes effect immediately.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = narrationMuted ? 0 : narrationVolume;
    }
  }, [narrationVolume, narrationMuted]);

  // Pause/resume the in-flight audio. On resume, `play()` continues from
  // the paused position; the audio's own onended still drives the advance.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (narrationPaused) {
      a.pause();
    } else {
      a.play().catch(() => { /* autoplay/raced — onended/next step recovers */ });
    }
  }, [narrationPaused]);

  const toggleNarrationPaused = useCallback(() => {
    setNarrationPaused((p) => !p);
  }, []);

  // Skip to the previous / next narration step. Stops the current audio,
  // clears pause (skipping implies "go there and play"), and moves the
  // narration cursor — the narration effect re-fires and plays the target
  // step (re-narrating on skip-back). Bounded to the step list.
  const skipNarration = useCallback((dir: -1 | 1) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    disconnectAudio();
    setNarrationPaused(false);
    setChatNarrationIndex((i) => {
      const last = chatStepsRef.current.length - 1;
      if (last < 0) return i;
      const base = i < 0 ? 0 : i;
      return Math.min(Math.max(base + dir, 0), last);
    });
  }, [disconnectAudio]);

  const skipNarrationBack = useCallback(() => skipNarration(-1), [skipNarration]);
  const skipNarrationForward = useCallback(() => skipNarration(1), [skipNarration]);

  // When all steps for THIS turn are narrated, populate the tutor
  // message for history. We slice from turnStartIdxRef so an "Explain
  // more" follow-up that appended to the existing canvas only writes
  // its own new steps into the message body — not the entire
  // accumulated canvas (which would conflate prior turns into history).
  useEffect(() => {
    if (
      chatStreamDone &&
      !isChatNarrating &&
      chatWhiteboardSteps.length > turnStartIdxRef.current &&
      chatNarrationIndex >= chatWhiteboardSteps.length
    ) {
      const combined = chatWhiteboardSteps
        .slice(turnStartIdxRef.current)
        .map((s) => s.displayText || s.narration || "")
        .join("\n");
      setChatMessages((prev) => {
        const updated = [...prev];
        const lastTutorIdx = updated.findLastIndex((m) => m.role === "tutor");
        if (lastTutorIdx >= 0) {
          updated[lastTutorIdx] = {
            ...updated[lastTutorIdx],
            content: combined,
            isStreaming: false,
          };
        }
        return updated;
      });
    }
  }, [chatStreamDone, isChatNarrating, chatNarrationIndex, chatWhiteboardSteps]);

  // ── Voice recording ──────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      try { connectAudioStream(stream); } catch { /* optional */ }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        disconnectAudio();

        // Transcribe and send
        setIsProcessing(true);
        try {
          const form = new FormData();
          form.append("audio", blob);
          const res = await fetch("/api/agent/speech-to-text", {
            method: "POST",
            body: form,
          });
          if (!res.ok) throw new Error("Transcription failed");
          const { text } = await res.json();
          if (text?.trim()) {
            await sendChat(text.trim());
          }
        } catch {
          setChatMessages((prev) => [
            ...prev,
            { role: "tutor", content: "I couldn't hear that. Please try again." },
          ]);
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      // Microphone access denied
    }
  }, [sendChat, connectAudioStream, disconnectAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const toggleMode = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setIsChatNarrating(false);
    disconnectAudio();
    if (isRecording) stopRecording();
    setMode((prev) => (prev === "text" ? "voice" : "text"));
  }, [isRecording, stopRecording, disconnectAudio]);

  /** Sends an "explain more" follow-up that prompts the agent to
   *  CONTINUE FORWARD in the explanation — pick up where the last turn
   *  left off, advance to the next beat, build toward the answer.
   *  Tracks how many times Explain more has been hit in the current
   *  takeover so we can land the answer when the explanation has been
   *  unpacked (3+ clicks signals "exhausted — just give the answer").
   *
   *  Conversation context already flows through `sendChat` via the
   *  `history` payload; this prompt rides on top with the explicit
   *  continuation anchor.
   *
   *  Used by both the micro-lesson takeover and the SAT-quiz takeover
   *  so the behavior is identical across surfaces.
   */
  const explainMoreCountRef = useRef(0);
  const explainMore = useCallback(() => {
    explainMoreCountRef.current += 1;
    const turn = explainMoreCountRef.current;

    // Slice from the current turn's start so we anchor on what the
    // tutor JUST said (this turn's steps) — not on accumulated canvas
    // content from earlier "Explain more" turns.
    const liveTutorTranscript = chatStepsRef.current
      .slice(turnStartIdxRef.current)
      .map((s) => s.displayText || s.narration || "")
      .filter(Boolean)
      .join("\n");
    const lastTutorMsg = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === "tutor");
    const lastTutorText =
      (liveTutorTranscript && liveTutorTranscript.length > (lastTutorMsg?.content?.length ?? 0)
        ? liveTutorTranscript
        : lastTutorMsg?.content) ?? "";
    const anchorBlock = lastTutorText
      ? `Your previous turn ended with:\n"""${lastTutorText.slice(-1200)}"""\n\n`
      : "";

    // After ~3 explain-more clicks the explanation has been unpacked;
    // student is asking for the answer at this point. Land it directly
    // (one-sentence rationale + the answer) instead of inventing more
    // explanation. The model is also told to make this judgment for
    // itself even on earlier turns if there's genuinely nothing left
    // to explain.
    const landAnswer = turn >= 3;
    const continuation = landAnswer
      ? "The student has now asked you to explain " + turn + " times. The " +
        "explanation has been thoroughly unpacked. Stop explaining and just " +
        "GIVE THE ANSWER directly: state the final answer in one sentence, " +
        "followed by one sentence of rationale. Do not introduce a new angle. " +
        "Do not say 'let me explain again.' Land the plane."
      : "Continue your explanation forward — pick up from where you just " +
        "left off and advance to the next beat. Do NOT restate or rephrase " +
        "what you already said. Move the explanation toward the answer: " +
        "the next sub-step, the next concept, the next inference. If the " +
        "explanation is already complete and there is nothing meaningful " +
        "left to add, stop explaining and give the actual answer in one " +
        "sentence with a one-sentence rationale. Keep it short (2-4 sentences).";

    const prompt = anchorBlock + continuation;
    // appendCanvas: keep the prior turn's whiteboard content visible
    // and add the new turn's steps onto the same canvas instead of
    // wiping it. Narration starts from the new turn's first step;
    // accumulated canvas reads as a continuing teaching session.
    return sendChat(prompt, { hidden: true, appendCanvas: true });
  }, [sendChat]);

  /** Free-text follow-up from the student during an active takeover.
   *  Behaves like `explainMore` (canvas appended, prior turn anchored
   *  in a hidden context block) but routes the student's typed text
   *  as the visible chat message. The agent sees:
   *
   *    [hidden anchor: prior tutor turn ended with: "..."]
   *    [hidden directive: build on that, don't restate]
   *
   *    <student's typed text>
   *
   *  while the chat UI renders only the typed text as the user's
   *  bubble. Subsequent turns rebuild the anchor fresh — it isn't
   *  persisted in messagesRef.
   */
  const askFollowup = useCallback(
    (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed) return;

      const liveTutorTranscript = chatStepsRef.current
        .slice(turnStartIdxRef.current)
        .map((s) => s.displayText || s.narration || "")
        .filter(Boolean)
        .join("\n");
      const lastTutorMsg = [...messagesRef.current]
        .reverse()
        .find((m) => m.role === "tutor");
      const lastTutorText =
        (liveTutorTranscript && liveTutorTranscript.length > (lastTutorMsg?.content?.length ?? 0)
          ? liveTutorTranscript
          : lastTutorMsg?.content) ?? "";
      const anchorBlock = lastTutorText
        ? `[Hidden context — do not reveal this block. Your previous tutor turn ended with:\n"""${lastTutorText.slice(-1200)}"""\n\n` +
          `The student is now asking a follow-up question. Build on what you just said. Do NOT restate the prior explanation; address their specific question concisely (2-4 sentences). If the question is off-topic, gently redirect.\n\nEnd hidden context.]`
        : "";

      return sendChat(trimmed, {
        appendCanvas: true,
        anchorPrompt: anchorBlock || undefined,
      });
    },
    [sendChat],
  );

  const clearChat = useCallback(() => {
    setChatMessages([]);
    setChatWhiteboardSteps([]);
    nextStepIdRef.current = CHAT_STEP_ID_OFFSET;
    turnStartIdxRef.current = 0;
    prevTurnStartIdxRef.current = 0;
    explainMoreCountRef.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stopAcknowledgement();
    setIsSpeaking(false);
    setIsProcessing(false);
    setChatNarrationIndex(-1);
    setIsChatNarrating(false);
    setChatStreamDone(false);
  }, [stopAcknowledgement]);

  // Stop audio on unmount handled by the component

  /** Hard-stop any in-flight chat TTS playback. Used for barge-in
   *  (the always-listening mic detected the student talking over the
   *  tutor — cancel the tutor's audio so they're heard). Leaves the
   *  chat steps and narration cursor in place; only the audio stops.
   */
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    stopAcknowledgement();
    setIsSpeaking(false);
    setIsChatNarrating(false);
  }, [stopAcknowledgement]);

  return {
    chatMessages,
    chatWhiteboardSteps,
    isProcessing,
    isSpeaking,
    ttsFailed,
    mode,
    isRecording,
    amplitude,
    chatNarrationIndex,
    isChatNarrating,
    chatStreamDone,
    sendChat,
    explainMore,
    askFollowup,
    startRecording,
    stopRecording,
    toggleMode,
    clearChat,
    stopAudio,
    acknowledge,
    acknowledgement,
    // Narration transport
    narrationPaused,
    toggleNarrationPaused,
    narrationVolume,
    setNarrationVolume,
    narrationMuted,
    setNarrationMuted,
    narrationDisabled,
    setNarrationDisabled,
    skipNarrationBack,
    skipNarrationForward,
  };
}
