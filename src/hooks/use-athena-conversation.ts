"use client";

import { useState, useCallback, useRef } from "react";
import { useAudioAnalyzer } from "./use-audio-analyzer";
import type { WhiteboardStep } from "@/types/whiteboard";

export type Message = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
};

type Mode = "text" | "voice";

export type QuizContext = {
  topic: string;
  subtopic: string;
  questionText: string;
  options: string[];
  hint: string;
  solutionSteps: { step: number; instruction: string; math: string }[];
  correctOption: number;
  studentAnswer?: number;
};

type UseAthenaConversationOptions = {
  lessonTitle: string;
  lessonContent: string;
  variant?: "lesson" | "quiz";
  quizContext?: QuizContext;
  quizStreamUrl?: string;
};

import { sanitizeForTTS } from "@/lib/sanitize-for-tts";

export function useAthenaConversation({
  lessonTitle,
  lessonContent,
  variant = "lesson",
  quizContext,
  quizStreamUrl,
}: UseAthenaConversationOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [mode, setMode] = useState<Mode>("text");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Shared whiteboard — steps accumulate across the conversation
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>([]);
  const [isWhiteboardStreaming, setIsWhiteboardStreaming] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const nextStepIdRef = useRef(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenBufferRef = useRef("");
  const rafRef = useRef<number>(0);

  // Mutable ref so reset() can swap context without recreating streamChat
  const quizContextRef = useRef(quizContext);
  quizContextRef.current = quizContext;

  const {
    amplitude,
    connectStream: connectAudioStream,
    connectElement: connectAudioElement,
    disconnect: disconnectAudio,
  } = useAudioAnalyzer();

  const streamChat = useCallback(
    async (question: string): Promise<string> => {
      const endpoint =
        variant === "quiz"
          ? (quizStreamUrl ?? "/api/agent/quiz-chat/stream")
          : "/api/agent/chat/stream";
      const history = variant === "quiz"
        ? messagesRef.current
            .filter((m) => !m.isStreaming)
            .map((m) => ({ role: m.role === "tutor" ? "assistant" : "user", content: m.content }))
        : undefined;
      const body =
        variant === "quiz" && quizContextRef.current
          ? { question, ...quizContextRef.current, history }
          : { question, lessonTitle, lessonContent };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      // Add a streaming placeholder message
      setMessages((prev) => [
        ...prev,
        { role: "tutor", content: "", isStreaming: true },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let receivedWbSteps = false;

      // Batch token updates via RAF
      const flushTokens = () => {
        if (tokenBufferRef.current) {
          const pending = tokenBufferRef.current;
          tokenBufferRef.current = "";
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "tutor" && last.isStreaming) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + pending,
              };
            }
            return updated;
          });
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
                  // Clear previous board content — each response gets a fresh canvas
                  nextStepIdRef.current = 0;
                  setWhiteboardSteps([]);
                }
                const step = {
                  ...parsed.wb_step,
                  id: nextStepIdRef.current++,
                } as WhiteboardStep;
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
        // Final flush
        if (tokenBufferRef.current) {
          const remaining = tokenBufferRef.current;
          tokenBufferRef.current = "";
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "tutor" && last.isStreaming) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + remaining,
              };
            }
            return updated;
          });
        }
        // Mark streaming as complete
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "tutor" && last.isStreaming) {
            updated[updated.length - 1] = { ...last, isStreaming: false };
          }
          return updated;
        });
      }

      return fullContent;
    },
    [lessonTitle, lessonContent, variant, quizContext]
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
        // Audio analyzer is optional; don't break TTS if it fails
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

  const processVoiceInput = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);
      try {
        const transcription = await transcribeAudio(audioBlob);
        if (!transcription.trim()) return;

        setMessages((prev) => [
          ...prev,
          { role: "user", content: transcription },
        ]);

        // Use streaming endpoint so whiteboard delimiters are parsed out
        const response = await streamChat(transcription);

        // Strip whiteboard content and markdown/LaTeX before sending to TTS
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
                "Voice mode is currently unavailable. Switching to text mode to continue.",
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
    [transcribeAudio, streamChat, playTTS]
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

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setIsProcessing(true);

      try {
        await streamChat(text);
      } catch {
        setMessages((prev) => [
          ...prev,
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
    [isProcessing, streamChat]
  );

  /** Clear conversation history and whiteboard state, optionally replacing the quiz context. */
  const reset = useCallback((newContext?: QuizContext | null) => {
    if (newContext !== undefined) quizContextRef.current = newContext ?? undefined;
    setMessages([]);
    setWhiteboardSteps([]);
    nextStepIdRef.current = 0;
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
    reset,
  };
}
