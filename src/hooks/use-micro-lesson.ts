"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAudioAnalyzer } from "./use-audio-analyzer";
import type { WhiteboardStep } from "@/types/whiteboard";

export type Message = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
};

type Phase = "generating" | "ready" | "error";
type Mode = "text" | "voice";

import { sanitizeForTTS } from "@/lib/sanitize-for-tts";

type SubtopicMetadata = {
  description?: string;
  learningObjectives?: string[];
  keyFormulas?: { latex: string; description: string }[];
  commonMistakes?: { mistake: string; correction: string; why: string }[];
  tipsAndTricks?: string[];
  conceptualOverview?: {
    definition: string;
    realWorldExample: string;
    satContext: string;
  };
  /** Set by the SAT surface (?sat=1) — the agents service restores the
   *  SAT-instructor prompt framing for math / reading-writing lessons. */
  satFocused?: boolean;
};

type UseMicroLessonOptions = {
  topic: string;
  subtopic: string;
  metadata: SubtopicMetadata;
  streamUrl?: string;
  chatStreamUrl?: string;
  existingLesson?: { lessonContent: string; whiteboardSteps: WhiteboardStep[] } | null;
  subtopicApiPath?: string;
  /** IDs for session tracking (optional — if not provided, no tracking) */
  tracking?: {
    microLessonId: string;
    subtopicId: string;
  };
};

export function useMicroLesson({ topic, subtopic, metadata, streamUrl, chatStreamUrl, existingLesson, subtopicApiPath, tracking }: UseMicroLessonOptions) {
  const [phase, setPhase] = useState<Phase>("generating");
  const [lessonContent, setLessonContent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [isWhiteboardStreaming, setIsWhiteboardStreaming] = useState(false);
  const [mode, setMode] = useState<Mode>("text");
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const lessonContentRef = useRef("");
  const whiteboardStepsRef = useRef<WhiteboardStep[]>([]);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const nextStepIdRef = useRef(0);
  const tokenBufferRef = useRef("");
  const rafRef = useRef(0);
  const hasStartedRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Session tracking ──────────────────────────────────────────────
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const chatMessageCountRef = useRef(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Mutable counters updated by the parent component via updateTracking()
  const trackingCountsRef = useRef({ stepsViewed: 0, totalSteps: 0, checkinsCorrect: 0, checkinsTotal: 0 });

  const sendHeartbeat = useCallback((ended = false) => {
    if (!sessionIdRef.current) return;
    const durationSeconds = Math.round((Date.now() - sessionStartRef.current) / 1000);
    const counts = trackingCountsRef.current;
    const body = JSON.stringify({
      sessionId: sessionIdRef.current,
      durationSeconds,
      stepsViewed: counts.stepsViewed,
      checkinsCorrect: counts.checkinsCorrect,
      checkinsTotal: counts.checkinsTotal,
      chatMessages: chatMessageCountRef.current,
      ...(ended && { ended: true, completed: counts.totalSteps > 0 && counts.stepsViewed >= counts.totalSteps }),
    });

    if (ended && typeof navigator.sendBeacon === "function") {
      // sendBeacon defaults the Content-Type to text/plain when passed a
      // raw string, which makes the route's req.json() fail to parse —
      // sessionId comes back undefined and the route returns 400. Wrap
      // in a Blob with an explicit application/json type so the server
      // parses it as JSON.
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/tracking/micro-lesson-session", blob);
    } else {
      fetch("/api/tracking/micro-lesson-session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
      }).catch(() => {});
    }
  }, []);

  const startSession = useCallback(async (totalSteps: number) => {
    if (!tracking || sessionIdRef.current) return;
    try {
      const res = await fetch("/api/tracking/micro-lesson-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          microLessonId: tracking.microLessonId,
          subtopicId: tracking.subtopicId,
          totalSteps,
        }),
      });
      if (res.ok) {
        const { sessionId } = await res.json();
        sessionIdRef.current = sessionId;
        sessionStartRef.current = Date.now();
        trackingCountsRef.current.totalSteps = totalSteps;
        // Start 30s heartbeat
        heartbeatIntervalRef.current = setInterval(() => sendHeartbeat(), 30_000);
      }
    } catch {
      // Non-fatal
    }
  }, [tracking, sendHeartbeat]);

  const updateTracking = useCallback((counts: { stepsViewed?: number; checkinsCorrect?: number; checkinsTotal?: number }) => {
    if (counts.stepsViewed !== undefined) trackingCountsRef.current.stepsViewed = counts.stepsViewed;
    if (counts.checkinsCorrect !== undefined) trackingCountsRef.current.checkinsCorrect = counts.checkinsCorrect;
    if (counts.checkinsTotal !== undefined) trackingCountsRef.current.checkinsTotal = counts.checkinsTotal;
  }, []);

  // Cleanup: send final heartbeat on unmount
  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      sendHeartbeat(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    amplitude,
    connectStream: connectAudioStream,
    connectElement: connectAudioElement,
    disconnect: disconnectAudio,
  } = useAudioAnalyzer();

  // Hydrate from DB on mount if existingLesson is provided
  useEffect(() => {
    if (!existingLesson) return;
    hasStartedRef.current = true;
    lessonContentRef.current = existingLesson.lessonContent;
    setLessonContent(existingLesson.lessonContent);
    const steps = existingLesson.whiteboardSteps.map((s, i) => ({ ...s, id: i }));
    whiteboardStepsRef.current = steps;
    setWhiteboardSteps(steps);
    setPhase("ready");
    startSession(steps.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Parse SSE stream, updating content/messages and whiteboard steps */
  const parseStream = useCallback(
    async (
      res: Response,
      onToken: (token: string) => void,
      onFlush: () => void,
    ): Promise<string> => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let receivedWbSteps = false;

      const flushTokens = () => {
        if (tokenBufferRef.current) {
          const pending = tokenBufferRef.current;
          tokenBufferRef.current = "";
          onToken(pending);
        }
        rafRef.current = requestAnimationFrame(flushTokens);
      };
      rafRef.current = requestAnimationFrame(flushTokens);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") {
              setIsWhiteboardStreaming(false);
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                fullContent += parsed.token;
                tokenBufferRef.current += parsed.token;
              }
              if (parsed.wb_step) {
                if (!receivedWbSteps) {
                  receivedWbSteps = true;
                  setIsWhiteboardStreaming(true);
                  nextStepIdRef.current = 0;
                  whiteboardStepsRef.current = [];
                  setWhiteboardSteps([]);
                }
                const step = {
                  ...parsed.wb_step,
                  id: nextStepIdRef.current++,
                } as WhiteboardStep;
                whiteboardStepsRef.current = [...whiteboardStepsRef.current, step];
                setWhiteboardSteps((prev) => [...prev, step]);
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } finally {
        cancelAnimationFrame(rafRef.current);
        setIsWhiteboardStreaming(false);
        if (tokenBufferRef.current) {
          const remaining = tokenBufferRef.current;
          tokenBufferRef.current = "";
          onToken(remaining);
        }
        onFlush();
      }

      return fullContent;
    },
    []
  );

  /** Phase 1: Generate the lesson */
  const generateLesson = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Claim DB lock before streaming
    if (subtopicApiPath) {
      const lockRes = await fetch(subtopicApiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const { acquired } = await lockRes.json();
      if (!acquired) {
        // Someone else is generating — reset so page polling takes over
        hasStartedRef.current = false;
        return;
      }
    }

    setPhase("generating");
    lessonContentRef.current = "";
    whiteboardStepsRef.current = [];

    try {
      const res = await fetch(streamUrl ?? "/api/agent/micro-lesson/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          subtopic,
          ...metadata,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      const content = await parseStream(
        res,
        (token) => {
          lessonContentRef.current += token;
          setLessonContent(lessonContentRef.current);
        },
        () => {
          // no-op flush for lesson generation
        }
      );

      lessonContentRef.current = content;
      setLessonContent(content);
      setPhase("ready");
      startSession(whiteboardStepsRef.current.length);

      // Save to DB (fire-and-forget, non-fatal)
      if (subtopicApiPath) {
        fetch(subtopicApiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            lessonContent: lessonContentRef.current,
            whiteboardSteps: whiteboardStepsRef.current,
          }),
        }).catch(() => {});
      }
    } catch {
      setPhase("error");
    }
  }, [topic, subtopic, metadata, parseStream, subtopicApiPath, startSession]);

  /** Phase 2: Follow-up chat */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;

      chatMessageCountRef.current++;
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setIsProcessing(true);

      // Add streaming placeholder
      setMessages((prev) => [
        ...prev,
        { role: "tutor", content: "", isStreaming: true },
      ]);

      const history = messagesRef.current
        .filter((m) => !m.isStreaming)
        .map((m) => ({
          role: m.role === "tutor" ? "assistant" : "user",
          content: m.content,
        }));

      try {
        const res = await fetch(chatStreamUrl ?? "/api/agent/micro-lesson/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: text,
            topic,
            subtopic,
            lessonSummary: lessonContentRef.current,
            history,
            ...(metadata.satFocused ? { satFocused: true } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Stream failed");
        }

        await parseStream(
          res,
          (token) => {
            setMessages((prev) => {
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
          },
          () => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "tutor" && last.isStreaming) {
                updated[updated.length - 1] = { ...last, isStreaming: false };
              }
              return updated;
            });
          }
        );
      } catch {
        setMessages((prev) => [
          ...prev.filter((m) => !m.isStreaming),
          {
            role: "tutor",
            content:
              "I'm having trouble connecting right now. Please try again in a moment.",
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, topic, subtopic, parseStream, metadata.satFocused]
  );

  const transcribeAudio = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append("audio", blob);
    const res = await fetch("/api/agent/speech-to-text", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.detail?.includes?.("quota") || data.detail?.status === "quota_exceeded") {
        throw new Error("QUOTA_EXCEEDED");
      }
      throw new Error("Transcription failed");
    }
    const data = await res.json();
    return data.text;
  }, []);

  const playTTS = useCallback(
    async (text: string): Promise<void> => {
      // Suppress the live ElevenLabs call under automated browsers
      // (Playwright sets navigator.webdriver) so test runs don't burn
      // through the TTS quota.
      if (typeof navigator !== "undefined" && navigator.webdriver) return;
      const res = await fetch("/api/agent/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const audioBlob = await res.blob();
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsSpeaking(true);

      try {
        connectAudioElement(audio);
      } catch {
        // Audio analyzer is optional
      }

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          setIsSpeaking(false);
          disconnectAudio();
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          disconnectAudio();
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.play();
      });
    },
    [connectAudioElement, disconnectAudio]
  );

  /** Stream chat for voice: sends message, returns full response for TTS */
  const streamChatForVoice = useCallback(
    async (text: string): Promise<string> => {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setMessages((prev) => [
        ...prev,
        { role: "tutor", content: "", isStreaming: true },
      ]);

      const history = messagesRef.current
        .filter((m) => !m.isStreaming)
        .map((m) => ({
          role: m.role === "tutor" ? "assistant" : "user",
          content: m.content,
        }));

      const res = await fetch("/api/agent/micro-lesson/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          topic,
          subtopic,
          lessonSummary: lessonContentRef.current,
          history,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      const fullContent = await parseStream(
        res,
        (token) => {
          setMessages((prev) => {
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
        },
        () => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "tutor" && last.isStreaming) {
              updated[updated.length - 1] = { ...last, isStreaming: false };
            }
            return updated;
          });
        }
      );

      return fullContent;
    },
    [topic, subtopic, parseStream]
  );

  const processVoiceInput = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);
      try {
        const transcription = await transcribeAudio(audioBlob);
        if (!transcription.trim()) return;

        const response = await streamChatForVoice(transcription);

        const rawText = response.split("<<<WHITEBOARD>>>")[0].trim();
        const ttsText = sanitizeForTTS(rawText);
        if (ttsText) await playTTS(ttsText);
      } catch (err) {
        if (err instanceof Error && err.message === "QUOTA_EXCEEDED") {
          setMessages((prev) => [
            ...prev,
            {
              role: "tutor",
              content:
                "Voice mode is currently unavailable. Switching to text mode.",
            },
          ]);
          setMode("text");
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: "tutor",
              content:
                "I'm having trouble connecting right now. Please try again in a moment.",
            },
          ]);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [transcribeAudio, streamChatForVoice, playTTS]
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      try {
        connectAudioStream(stream);
      } catch {
        // Audio analyzer is optional
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        disconnectAudio();
        processVoiceInput(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "tutor",
          content:
            "Microphone access is required for voice mode. Please allow microphone access and try again.",
        },
      ]);
    }
  }, [processVoiceInput, connectAudioStream, disconnectAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const toggleMode = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
    disconnectAudio();
    if (isRecording) stopRecording();
    setMode((prev) => (prev === "text" ? "voice" : "text"));
  }, [isRecording, stopRecording, disconnectAudio]);

  return {
    phase,
    lessonContent,
    messages,
    isProcessing,
    whiteboardSteps,
    isWhiteboardStreaming,
    mode,
    isRecording,
    isSpeaking,
    amplitude,
    generateLesson,
    sendMessage,
    startRecording,
    stopRecording,
    toggleMode,
    updateTracking,
    /** Read the current tracking session id. Read at call-time
     * (not closure-captured) so consumers can grab it right when
     * the user clicks "Download report" rather than baking in a
     * stale value. */
    getSessionId: () => sessionIdRef.current,
  };
}
