"use client";

import { useState, useCallback, useRef } from "react";

export type TriageMessage = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

export type HandoffData = {
  action: "recommend_tutor" | "start_session";
  agent_id: string;
  agent_name: string;
  reason?: string;
  student_context: {
    topic: string;
    struggle_areas?: string;
    notes?: string;
  };
};

export type TriageState =
  | "chatting"
  | "recommending"
  | "confirmed"
  | "in_session"
  | "report";

type AvailableAgent = {
  id: string;
  display_name: string;
  tagline?: string;
  domain?: string;
};

type SessionReport = {
  score?: number;
  phases_completed?: string[];
  areas_of_struggle?: string[];
  recommendation?: string;
  summary?: string;
};

export function useTriageChat(availableAgents: AvailableAgent[]) {
  const [messages, setMessages] = useState<TriageMessage[]>([]);
  const [state, setState] = useState<TriageState>("chatting");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRecommendation, setCurrentRecommendation] =
    useState<HandoffData | null>(null);
  const [sessionReport, setSessionReport] = useState<SessionReport | null>(
    null
  );

  const messagesRef = useRef<TriageMessage[]>([]);
  messagesRef.current = messages;
  const tokenBufferRef = useRef("");
  const rafRef = useRef<number>(0);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;

      const userMessage: TriageMessage = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);

      // Build history from existing messages (exclude streaming)
      const history = [...messagesRef.current, userMessage]
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }));
      // Remove the last user message from history since we pass it as `message`
      history.pop();

      // Add streaming placeholder
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", isStreaming: true },
      ]);

      try {
        const res = await fetch("/api/studio/triage/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            available_agents: availableAgents,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error("Stream failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let handoffReceived: HandoffData | null = null;

        // Batch token updates via RAF
        const flushTokens = () => {
          if (tokenBufferRef.current) {
            const pending = tokenBufferRef.current;
            tokenBufferRef.current = "";
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant" && last.isStreaming) {
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
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.token) {
                  tokenBufferRef.current += parsed.token;
                }
                if (parsed.handoff) {
                  handoffReceived = parsed.handoff as HandoffData;
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
          // Final flush
          if (tokenBufferRef.current) {
            const remaining = tokenBufferRef.current;
            tokenBufferRef.current = "";
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant" && last.isStreaming) {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + remaining,
                };
              }
              return updated;
            });
          }
          // Mark streaming complete
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "assistant" && last.isStreaming) {
              updated[updated.length - 1] = { ...last, isStreaming: false };
            }
            return updated;
          });
        }

        // Handle handoff data
        if (handoffReceived) {
          setCurrentRecommendation(handoffReceived);
          if (handoffReceived.action === "recommend_tutor") {
            setState("recommending");
          } else if (handoffReceived.action === "start_session") {
            setState("confirmed");
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev.filter((m) => !m.isStreaming),
          {
            role: "assistant",
            content:
              "I'm having trouble connecting right now. Please try again in a moment.",
            isStreaming: false,
          },
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, availableAgents]
  );

  const confirmHandoff = useCallback((override?: { agent_id: string; agent_name: string }) => {
    const rec = override
      ? { ...currentRecommendation!, agent_id: override.agent_id, agent_name: override.agent_name }
      : currentRecommendation;
    if (!rec) return;
    if (override) setCurrentRecommendation(rec);
    // Send a confirmation message that will trigger start_session
    send(`Yes, let's go with ${rec.agent_name}!`);
  }, [currentRecommendation, send]);

  const declineHandoff = useCallback(() => {
    setCurrentRecommendation(null);
    setState("chatting");
    send("I'd like to try a different tutor instead.");
  }, [send]);

  const startSession = useCallback(() => {
    setState("in_session");
  }, []);

  const endSession = useCallback((report?: SessionReport) => {
    if (report) {
      setSessionReport(report);
    }
    setState("report");
  }, []);

  const continueAfterReport = useCallback(() => {
    setCurrentRecommendation(null);
    setSessionReport(null);
    setState("chatting");
    // Don't clear messages — preserve conversation history
  }, []);

  return {
    messages,
    state,
    isProcessing,
    currentRecommendation,
    sessionReport,
    send,
    confirmHandoff,
    declineHandoff,
    startSession,
    endSession,
    continueAfterReport,
  };
}
