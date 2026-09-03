"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import katex from "katex";
import { motion } from "framer-motion";

import type { TextStyle } from "@/types/whiteboard";
import { adaptWbColor, useIsDarkMode } from "../wb-color";

const FONT_SIZES: Record<string, number> = { sm: 14, md: 18, lg: 24, xl: 32 };

/**
 * True when the text carries an inline `$...$` math span. The whiteboard's
 * SVG `write_text` path renders plain text only (no KaTeX), so steps that
 * mix prose with `$...$` math are routed to the HTML overlay and rendered
 * by `WbRichText` instead. A single-line guard (`[^$\n]`) avoids treating a
 * lone stray `$` across lines as a math opener.
 */
export function hasInlineMath(text: string | undefined | null): boolean {
  if (!text) return false;
  return /\$[^$\n]+\$/.test(text);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build an HTML string from a write_text body: plain runs are escaped (and
 * newlines become <br/>), `$...$` runs are KaTeX-rendered inline. KaTeX with
 * throwOnError:false degrades a malformed span to a readable error node
 * rather than throwing; we additionally fall back to the escaped literal.
 */
function buildHtml(text: string): string {
  let out = "";
  let last = 0;
  const re = /\$([^$\n]+)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index)).replace(/\n/g, "<br/>");
    try {
      out += katex.renderToString(m[1], { throwOnError: false, displayMode: false });
    } catch {
      out += escapeHtml(m[0]);
    }
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last)).replace(/\n/g, "<br/>");
  return out;
}

type WbRichTextProps = {
  text: string;
  /** Layout width in 1000-unit board space (the overlay wrapper scales it). */
  width: number;
  style?: TextStyle;
  /** Step progress; drives the fade-in, mirroring WbText. */
  progress: number;
  /** Reports the rendered DOM height so the layout engine can reflow. */
  onMeasure?: (height: number) => void;
};

/**
 * HTML-overlay renderer for a `write_text` step that contains inline math.
 * Lives as a sibling of the `<svg>` (positioned + canvas-scaled by the
 * caller) so KaTeX never renders inside `<foreignObject>` — the same
 * paint-drift workaround wb-math / wb-callout use. Styling matches WbText
 * (system sans, 1.5 line-height, foreground color) so a math-bearing line
 * looks identical to a plain one apart from the rendered math.
 */
export function WbRichText({ text, width, style, progress, onMeasure }: WbRichTextProps) {
  const isDark = useIsDarkMode();
  const fontSize = FONT_SIZES[style?.fontSize ?? "md"];
  const color = adaptWbColor(style?.color ?? "var(--foreground)", isDark);
  const fontWeight = style?.fontWeight ?? "normal";
  const html = useMemo(() => buildHtml(text), [text]);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current && onMeasure) onMeasure(ref.current.offsetHeight);
  }, [html, fontSize, width, onMeasure]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: progress > 0 ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      style={{
        width,
        fontSize,
        color,
        fontWeight,
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.5,
        whiteSpace: "normal",
        wordBreak: "break-word",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
