"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import katex from "katex";
import type { TableAction } from "@/types/whiteboard";

/** Convert `$...$` math spans in a cell to KaTeX HTML, synchronously.
 *  Memoized by input text so the parent canvas's frequent re-renders
 *  (rAF tick → stepProgress → repaint) don't re-run KaTeX or hand
 *  React new __html strings to diff. */
const cellHtmlCache = new Map<string, string>();
function renderCellHtml(text: string): string {
  if (!text) return "";
  const cached = cellHtmlCache.get(text);
  if (cached !== undefined) return cached;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("$", i);
    if (open < 0) {
      out.push(esc(text.slice(i)));
      break;
    }
    out.push(esc(text.slice(i, open)));
    const close = text.indexOf("$", open + 1);
    if (close < 0) {
      out.push(esc(text.slice(open)));
      break;
    }
    const tex = text.slice(open + 1, close);
    try {
      out.push(
        katex.renderToString(tex, { throwOnError: false, output: "html" }),
      );
    } catch {
      out.push(esc(`$${tex}$`));
    }
    i = close + 1;
  }
  const html = out.join("");
  cellHtmlCache.set(text, html);
  return html;
}

type WbTableProps = {
  action: TableAction;
  width: number;
  progress: number;
  isAnimating: boolean;
};

function WbTableInner({ action, width, progress, isAnimating }: WbTableProps) {
  const { headers, rows, highlightCells } = action;
  // Guard against malformed table actions (missing headers / rows). The
  // eval's action-shape check flags these at lesson-author time, but
  // an existing lesson loaded before the check landed shouldn't crash
  // the entire whiteboard.
  if (!Array.isArray(headers) || !Array.isArray(rows)) return null;
  const totalRows = rows.length + 1; // +1 for header
  const visibleRows = isAnimating ? Math.ceil(totalRows * progress) : totalRows;

  const highlightMap = new Map<string, string>();
  if (highlightCells) {
    for (const cell of highlightCells) {
      highlightMap.set(`${cell.row}-${cell.col}`, cell.color ?? "#fbbf24");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      style={{ width: `${width}px`, padding: "4px 0" }}
    >
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          maxWidth: `${width}px`,
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
        }}
      >
        {visibleRows > 0 && (
          <thead>
            <tr>
              {headers.map((h, col) => (
                <th
                  key={col}
                  style={{
                    padding: "6px 12px",
                    borderBottom: "2px solid var(--secondary-foreground)",
                    textAlign: "left",
                    fontWeight: "bold",
                    color: "var(--foreground)",
                    backgroundColor: "var(--muted)",
                  }}
                >
                  <span dangerouslySetInnerHTML={{ __html: renderCellHtml(h ?? "") }} />
                </th>
              ))}
            </tr>
          </thead>
        )}

        <tbody>
          {rows.map((row, rowIdx) => {
            if (rowIdx + 1 >= visibleRows) return null;
            return (
              <motion.tr
                key={rowIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.15,
                  delay: isAnimating ? (rowIdx + 1) * 0.08 : 0,
                }}
              >
                {row.map((cell, col) => {
                  const hlColor = highlightMap.get(`${rowIdx}-${col}`);
                  return (
                    <td
                      key={col}
                      style={{
                        padding: "5px 12px",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--secondary-foreground)",
                        backgroundColor: hlColor ? `${hlColor}33` : "transparent",
                      }}
                    >
                      <span dangerouslySetInnerHTML={{ __html: renderCellHtml(cell ?? "") }} />
                    </td>
                  );
                })}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}

export const WbTable = memo(WbTableInner);
