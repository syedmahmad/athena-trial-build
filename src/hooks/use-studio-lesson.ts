"use client";

import { useState, useCallback, useRef } from "react";
import type { WhiteboardStep } from "@/types/whiteboard";

export type StudioMessage = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
};

type Phase = "generating" | "ready" | "error";

type UseStudioLessonOptions = {
  agentId: string;
  skillName: string;
  skillDescription?: string;
  studentContext?: Record<string, unknown>;
  existingSession?: {
    sessionId: string;
    steps: WhiteboardStep[];
    lessonContent?: string;
  };
};

/** Fire-and-forget event recording */
function recordEvent(
  sessionId: string,
  eventType: string,
  eventData: Record<string, unknown>
) {
  fetch("/api/studio/agents/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      event_type: eventType,
      event_data: eventData,
    }),
  }).catch(() => {}); // fire and forget
}

export function useStudioLesson({
  agentId,
  skillName,
  skillDescription,
  studentContext,
  existingSession,
}: UseStudioLessonOptions) {
  const isHydrated = !!existingSession;
  const [phase, setPhase] = useState<Phase>(isHydrated ? "ready" : "generating");
  const [lessonContent, setLessonContent] = useState(existingSession?.lessonContent || "");
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [whiteboardSteps, setWhiteboardSteps] = useState<WhiteboardStep[]>(
    existingSession?.steps || []
  );
  const [isWhiteboardStreaming, setIsWhiteboardStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(
    existingSession?.sessionId || null
  );

  const lessonContentRef = useRef(existingSession?.lessonContent || "");
  const whiteboardStepsRef = useRef<WhiteboardStep[]>(existingSession?.steps || []);
  const messagesRef = useRef<StudioMessage[]>([]);
  messagesRef.current = messages;
  const nextStepIdRef = useRef(existingSession?.steps?.length || 0);
  const tokenBufferRef = useRef("");
  const rafRef = useRef(0);
  const hasStartedRef = useRef(isHydrated);

  /** Parse SSE stream, updating content/messages and whiteboard steps */
  const parseStream = useCallback(
    async (
      res: Response,
      onToken: (token: string) => void,
      onFlush: () => void,
      onSessionId?: (id: string) => void,
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
              if (parsed.session_id && onSessionId) {
                onSessionId(parsed.session_id);
              }
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

  /** Generate the lesson */
  const generateLesson = useCallback(async () => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setPhase("generating");
    lessonContentRef.current = "";
    whiteboardStepsRef.current = [];

    try {
      const res = await fetch("/api/studio/lesson/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          skill_name: skillName,
          skill_description: skillDescription || null,
          student_context: studentContext || null,
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
        },
        (id) => {
          setSessionId(id);
          recordEvent(id, "session_started", {
            agent_id: agentId,
            skill_name: skillName,
          });
        }
      );

      lessonContentRef.current = content;
      setLessonContent(content);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [agentId, skillName, skillDescription, studentContext, parseStream]);

  /** Follow-up chat */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;

      // Record outgoing message event
      if (sessionId) {
        recordEvent(sessionId, "message_sent", { content: text });
      }

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
        const res = await fetch("/api/studio/lesson/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: agentId,
            session_id: sessionId,
            question: text,
            lesson_summary: lessonContentRef.current,
            lesson_steps: whiteboardStepsRef.current.slice(0, 10),
            history,
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
                // Record the complete tutor response
                if (sessionId) {
                  recordEvent(sessionId, "message_received", {
                    content: last.content,
                  });
                }
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
    [isProcessing, agentId, sessionId, parseStream]
  );

  /** Record event helper — exposed for StudioLessonPlayer interactions */
  const recordSessionEvent = useCallback(
    (eventType: string, eventData: Record<string, unknown>) => {
      if (sessionId) {
        recordEvent(sessionId, eventType, eventData);
      }
    },
    [sessionId]
  );

  return {
    phase,
    lessonContent,
    messages,
    isProcessing,
    whiteboardSteps,
    isWhiteboardStreaming,
    sessionId,
    generateLesson,
    sendMessage,
    recordSessionEvent,
  };
}
