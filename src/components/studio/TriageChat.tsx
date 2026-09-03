"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TriageMessage } from "@/hooks/use-triage-chat";

type TriageChatProps = {
  messages: TriageMessage[];
  isProcessing: boolean;
  onSend: (message: string) => void;
  children?: React.ReactNode; // For inline recommendation cards
};

export function TriageChat({
  messages,
  isProcessing,
  onSend,
  children,
}: TriageChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, children]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-4rem)]">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {/* Welcome message if no messages yet */}
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex justify-center"
          >
            <div className="max-w-lg text-center space-y-3 pt-16">
              <div className="w-12 h-12 rounded-full bg-[#58a6ff]/10 flex items-center justify-center mx-auto">
                <svg
                  className="w-6 h-6 text-[#58a6ff]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[#f0f6fc]">
                What shall we work on today?
              </h2>
              <p className="text-sm text-[#8b949e]">
                Tell me what you'd like to learn or practice, and I'll match you
                with the perfect tutor.
              </p>
            </div>
          </motion.div>
        )}

        {/* Message bubbles */}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#58a6ff] text-white rounded-br-md"
                    : "bg-[#161b22] border border-[#30363d] text-[#f0f6fc] rounded-bl-md"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-[#58a6ff] rounded-sm ml-0.5 animate-pulse" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Inline children (recommendation cards, etc.) */}
        {children}
      </div>

      {/* Input bar */}
      <div className="border-t border-[#30363d] px-4 py-3 bg-[#0d1117]">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isProcessing ? "Thinking..." : "Type your message..."
            }
            disabled={isProcessing}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#161b22] border border-[#30363d] text-[#f0f6fc] placeholder-[#484f58] text-sm focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff] transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="p-2.5 rounded-xl bg-[#58a6ff] text-white hover:bg-[#4c8ed9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
