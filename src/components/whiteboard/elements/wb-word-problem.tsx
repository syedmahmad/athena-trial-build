"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import katex from "katex";
import type { WordProblemAction } from "@/types/whiteboard";

type WbWordProblemProps = {
  action: WordProblemAction;
  width: number;
  progress: number;
  isAnimating: boolean;
  onMeasure?: (height: number) => void;
};

/**
 * Renders a word problem as a single bordered card with three labeled
 * subsections: Word Problem (prose) / Define Variables (symbol →
 * meaning rows) / Equation Setup (LaTeX).
 *
 * Layout invariants live here so adding a new word-problem flavor
 * can't drift the structure — the type system guarantees the three
 * fields exist, and this component is the only place that lays them
 * out. The HTML-overlay sibling-of-SVG pattern (CLAUDE.md rule:
 * never `<foreignObject>`) ensures KaTeX paints reliably across
 * browsers.
 *
 * Math rendering uses katex.renderToString directly (mirrors
 * wb-table / wb-math). This avoids MathContent's wrapping `<div
 * class="prose">` which would break inline grid rows. `ProseWithMath`
 * below handles mixed text+math prose by splitting on `$...$` and
 * rendering each segment inline.
 */
export function WbWordProblem({
  action,
  width,
  progress,
  isAnimating,
  onMeasure,
}: WbWordProblemProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const onMeasureRef = useRef(onMeasure);
  useEffect(() => {
    onMeasureRef.current = onMeasure;
  });

  // Re-measure when the props that affect layout change.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const h = wrapperRef.current.scrollHeight;
    if (h > 0 && Math.abs(h - contentHeight) > 2) {
      setContentHeight(h);
      onMeasureRef.current?.(h);
    }
  }, [
    action.prose,
    action.variables.length,
    action.equation,
    contentHeight,
    width,
  ]);

  return (
    <motion.div
      ref={wrapperRef}
      initial={isAnimating ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: progress > 0 ? 1 : 0, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        position: "relative",
        width,
        padding: 16,
        borderRadius: 8,
        border:
          "1px solid color-mix(in oklch, var(--obs-border) 80%, transparent)",
        background:
          "color-mix(in oklch, var(--obs-surface) 70%, transparent)",
        // Explicit serif font for prose + variables. Without this the
        // card inherits whatever font the canvas context happens to
        // be in (sometimes monospace), which made variable rows look
        // like code.
        fontFamily:
          'var(--font-instrument-serif), "Times New Roman", serif',
        color: "var(--obs-fg)",
      }}
    >
      {/* ── Word Problem section ── */}
      <Eyebrow>Word Problem</Eyebrow>
      <div
        style={{
          fontSize: 18,
          lineHeight: 1.5,
          marginTop: 4,
          // Force prose wrap even for long unbroken tokens — the
          // single biggest source of historical clipping was a model
          // emitting a long no-space token (URL-like fragment) that
          // overflowed the canvas. `anywhere` makes this impossible.
          overflowWrap: "anywhere",
          wordBreak: "normal",
        }}
      >
        <ProseWithMath text={action.prose} />
      </div>

      {/* ── Define Variables section ── */}
      {action.variables.length > 0 && (
        <>
          <Eyebrow style={{ marginTop: 14 }}>Define Variables</Eyebrow>
          <ul
            style={{
              margin: "4px 0 0 0",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 12,
              rowGap: 4,
              fontSize: 16,
              lineHeight: 1.5,
            }}
          >
            {action.variables.map((v, i) => (
              <li
                key={i}
                style={{
                  display: "contents",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <InlineKatex latex={v.symbol} />
                </span>
                <span
                  style={{
                    overflowWrap: "anywhere",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ color: "var(--obs-muted)" }}>=</span>
                  <ProseWithMath text={v.meaning} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Equation Setup section ── */}
      <Eyebrow style={{ marginTop: 14 }}>Equation Setup</Eyebrow>
      <div
        style={{
          marginTop: 4,
          fontSize: 22,
          // KaTeX picks its own width; allow horizontal scroll for
          // pathologically wide equations so the card never overflows.
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        <InlineKatex latex={action.equation} />
      </div>
    </motion.div>
  );
}

function Eyebrow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        fontSize: 10,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: "var(--obs-muted)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Inline KaTeX render. Drops a `<span>` (display: inline) with the
 *  KaTeX HTML inside via dangerouslySetInnerHTML — same approach
 *  wb-table and wb-math use. Avoids MathContent's wrapping `<div
 *  class="prose">` which breaks inline contexts. */
function InlineKatex({ latex }: { latex: string }) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        throwOnError: false,
        output: "html",
      }),
    [latex],
  );
  return (
    <span
      style={{ display: "inline" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Renders text that may contain inline `$...$` math segments. Splits
 *  the input on a `$...$` regex and renders each math segment via
 *  InlineKatex while passing plain text through. Currency written as
 *  `\$N` is decoded to a literal `$` so authors don't have to think
 *  about which surface escapes the dollar.
 *
 *  Why not MathContent: that primitive wraps its output in `<div
 *  class="prose">` which is display:block and adds typography margins
 *  — fine for paragraph-level content but breaks inline flow inside
 *  the grid rows used by the variables list. This helper stays inline. */
function ProseWithMath({ text }: { text: string }) {
  // Split into alternating text / math segments. Math is `$...$`
  // pairs where neither $ is escaped with a preceding `\`. Currency
  // (e.g. `\$5`) is left alone here and decoded to a literal `$`
  // before rendering each text chunk.
  const segments = useMemo(() => splitTextAndMath(text), [text]);
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "math" ? (
          <InlineKatex key={i} latex={seg.value} />
        ) : (
          <span key={i}>{decodeCurrencyEscape(seg.value)}</span>
        ),
      )}
    </>
  );
}

type Segment =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string };

function splitTextAndMath(text: string): Segment[] {
  const segments: Segment[] = [];
  // Match $...$ where neither $ is preceded by a backslash. The inner
  // content can include any char EXCEPT a non-escaped $ or newline,
  // matching the convention used by sanitize-math-content.ts.
  const re = /(?<!\\)\$([^\n$]+?)(?<!\\)\$/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, m.index) });
    }
    segments.push({ kind: "math", value: m[1] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }
  return segments;
}

function decodeCurrencyEscape(text: string): string {
  // `\$` (escaped dollar) → `$` (literal). Authors write `\$5` for
  // currency in prose; we render the literal `$` here.
  return text.replace(/\\\$/g, "$");
}
