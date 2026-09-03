"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";

type MessageBubbleProps = {
  role: "user" | "tutor";
  content: string;
  isStreaming?: boolean;
};

export function MessageBubble({ role, content, isStreaming }: MessageBubbleProps) {
  if (role === "user") {
    return (
      <div className="text-sm text-right">
        <div className="inline-block rounded-lg px-3 py-2 max-w-[85%] bg-primary text-primary-foreground">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm text-left">
      <div
        className="inline-block rounded-lg px-3 py-2 bg-muted max-w-[85%] prose prose-sm dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-pre:rounded-md prose-pre:p-4 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none"
      >
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
        >
          {content}
        </ReactMarkdown>
        {isStreaming && (
          <span className="streaming-cursor" />
        )}
      </div>
    </div>
  );
}
