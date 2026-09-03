"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { TextStyle } from "@/types/whiteboard";
import { adaptWbColor, useIsDarkMode } from "../wb-color";

const FONT_SIZES: Record<string, number> = {
  sm: 14,
  md: 18,
  lg: 24,
  xl: 32,
};

/** Estimate average character width for a sans-serif font. */
function avgCharWidth(fontSize: number) {
  return fontSize * 0.55;
}

/** Word-wrap text to fit within maxWidth pixels. */
export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const cw = avgCharWidth(fontSize);
  const maxChars = Math.max(10, Math.floor(maxWidth / cw));

  const result: string[] = [];
  const explicitLines = text.split("\n");

  for (const line of explicitLines) {
    if (line === "") { result.push(""); continue; }
    const words = line.split(" ");
    let current = "";

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (test.length > maxChars && current) {
        result.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) result.push(current);
  }

  return result.length > 0 ? result : [""];
}

type WbTextProps = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: TextStyle;
  reveal?: "letter" | "word" | "line";
  progress: number;
  isAnimating: boolean;
};

export function WbText({ text, x, y, width, height, style, reveal, progress, isAnimating }: WbTextProps) {
  const isDark = useIsDarkMode();
  const fontSize = FONT_SIZES[style?.fontSize ?? "md"];
  const color = adaptWbColor(style?.color ?? "var(--foreground)", isDark);
  const fontWeight = style?.fontWeight ?? "normal";
  const lineHeight = fontSize * 1.5;

  const lines = useMemo(() => wrapText(text, width, fontSize), [text, width, fontSize]);

  // Center the text block vertically within allocated height
  const blockHeight = lines.length * lineHeight;
  const firstLineY = y + Math.max(0, (height - blockHeight) / 2) + lineHeight / 2;

  const common = {
    fontSize,
    style: { fill: color },
    fontWeight,
    fontFamily: "system-ui, sans-serif",
    dominantBaseline: "middle" as const,
  };

  if (reveal === "line" || !reveal || !isAnimating) {
    return (
      <motion.text
        x={x}
        y={firstLineY}
        {...common}
        initial={{ opacity: 0 }}
        animate={{ opacity: progress > 0 ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </motion.text>
    );
  }

  if (reveal === "word") {
    const allWords = text.split(" ");
    const visibleCount = Math.ceil(allWords.length * progress);
    // Build per-line word groups with global word index
    let globalIdx = 0;
    const lineWords = lines.map((line) => {
      const words = line.split(" ").filter(Boolean);
      return words.map((w) => ({ word: w, idx: globalIdx++ }));
    });

    return (
      <text x={x} y={firstLineY} {...common}>
        {lineWords.map((words, li) => (
          <tspan key={li} x={x} dy={li === 0 ? 0 : lineHeight}>
            {words.map((w, wi) => (
              <motion.tspan
                key={w.idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: w.idx < visibleCount ? 1 : 0 }}
                transition={{ duration: 0.15 }}
              >
                {wi > 0 ? " " : ""}
                {w.word}
              </motion.tspan>
            ))}
          </tspan>
        ))}
      </text>
    );
  }

  // letter-by-letter
  const allChars = text.split("");
  const visibleCount = Math.ceil(allChars.length * progress);
  let globalCharIdx = 0;
  const lineChars = lines.map((line) => {
    const chars = line.split("");
    return chars.map((c) => ({ char: c, idx: globalCharIdx++ }));
  });

  return (
    <text x={x} y={firstLineY} {...common}>
      {lineChars.map((chars, li) => (
        <tspan key={li} x={x} dy={li === 0 ? 0 : lineHeight}>
          {chars.map((c) => (
            <motion.tspan
              key={c.idx}
              initial={{ opacity: 0 }}
              animate={{ opacity: c.idx < visibleCount ? 1 : 0 }}
              transition={{ duration: 0.08 }}
            >
              {c.char}
            </motion.tspan>
          ))}
        </tspan>
      ))}
    </text>
  );
}
