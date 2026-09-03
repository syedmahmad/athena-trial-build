import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import katex from "katex";
import type { Overlay, OverlayPosition } from "../types/manifest";
import { fadeOpacity } from "../utils/timing";

// Visual constants — keep in sync across overlay kinds for a consistent feel.
const CAPTION_FONT_SIZE = 36;
const CAPTION_MAX_WIDTH = 0.78; // fraction of viewport width
const CAPTION_BG_OPACITY = 0.0; // transparent — captions are big enough to read on black
const MATH_FONT_SIZE = 44;
const CALLOUT_FONT_SIZE = 18;

const POS_STYLES: Record<OverlayPosition, React.CSSProperties> = {
  bottom_center: {
    left: "50%",
    bottom: "8%",
    transform: "translateX(-50%)",
    textAlign: "center",
  },
  bottom_left: { left: "4%", bottom: "6%" },
  bottom_right: { right: "4%", bottom: "6%" },
  top_center: { left: "50%", top: "8%", transform: "translateX(-50%)" },
  top_left: { left: "4%", top: "6%" },
  top_right: { right: "4%", top: "6%" },
  center: { left: "50%", top: "50%", transform: "translate(-50%, -50%)" },
  anchor: { left: "50%", top: "50%", transform: "translate(-50%, -50%)" },
};

/** Render a caption — clean prose at bottom_center by default. */
function Caption({ overlay, opacity }: { overlay: Overlay; opacity: number }) {
  const pos = POS_STYLES[overlay.position ?? "bottom_center"];
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        opacity,
        color: "white",
        fontSize: CAPTION_FONT_SIZE,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        fontWeight: 500,
        letterSpacing: "0.01em",
        maxWidth: `${CAPTION_MAX_WIDTH * 100}%`,
        lineHeight: 1.25,
        textShadow: "0 0 12px rgba(0,0,0,0.7)",
        background:
          CAPTION_BG_OPACITY > 0
            ? `rgba(0,0,0,${CAPTION_BG_OPACITY})`
            : "transparent",
        padding: "8px 14px",
      }}
    >
      {overlay.content}
    </div>
  );
}

/** Render LaTeX math via KaTeX. */
function MathOverlay({
  overlay,
  opacity,
}: {
  overlay: Overlay;
  opacity: number;
}) {
  const pos = POS_STYLES[overlay.position ?? "top_right"];
  const html = katex.renderToString(overlay.content, {
    throwOnError: false,
    displayMode: true,
    output: "html",
  });
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        opacity,
        color: "white",
        fontSize: MATH_FONT_SIZE,
      }}
    >
      <div
        // KaTeX produces semantic HTML — render as-is. Force color: white via parent.
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ color: "white" }}
      />
    </div>
  );
}

/** Render a single label (small text tag, e.g. line label). */
function LabelOverlay({
  overlay,
  opacity,
}: {
  overlay: Overlay;
  opacity: number;
}) {
  const pos = POS_STYLES[overlay.position ?? "center"];
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        opacity,
        color: "white",
        fontSize: 24,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "3px 8px",
        background: "rgba(0,0,0,0.5)",
        border: "1px solid rgba(255,255,255,0.4)",
        borderRadius: 4,
      }}
    >
      {overlay.content}
    </div>
  );
}

/** Render a corner callout — bordered text block. Used for outro beat. */
function CalloutOverlay({
  overlay,
  opacity,
}: {
  overlay: Overlay;
  opacity: number;
}) {
  const pos = POS_STYLES[overlay.position ?? "top_left"];
  // Callouts often have a TITLE — REST format, split on " — "
  const [title, ...rest] = overlay.content.split(" — ");
  const body = rest.join(" — ");
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        opacity,
        color: "white",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        maxWidth: 240,
        padding: "10px 12px",
        border: "1px solid rgba(255,255,255,0.5)",
        background: "rgba(0,0,0,0.3)",
      }}
    >
      <div
        style={{
          fontSize: CALLOUT_FONT_SIZE,
          fontWeight: 700,
          letterSpacing: "0.06em",
          marginBottom: body ? 4 : 0,
        }}
      >
        {title}
      </div>
      {body ? (
        <div style={{ fontSize: 13, lineHeight: 1.35, opacity: 0.9 }}>
          {body}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders all overlays for a beat. Each overlay's fade-in/out timing is
 * resolved against the current frame.
 *
 * `beatStartFrame` is the absolute frame at which the beat begins, used to
 * compute frames-since-beat-start for fade timing.
 *
 * `beatEndS` (relative to beat start, in seconds) is used as the implicit
 * disappear time when no explicit `disappear_s` is set.
 */
export function OverlayLayer({
  overlays,
  beatEndS,
}: {
  overlays: Overlay[];
  beatEndS: number;
}) {
  // useCurrentFrame() inside a <Sequence> is already beat-relative.
  const framesSinceBeatStart = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <>
      {overlays.map((overlay, i) => {
        const opacity = fadeOpacity({
          framesSinceBeatStart,
          fps,
          appear_s: overlay.appear_s,
          disappear_s: overlay.disappear_s ?? beatEndS,
        });
        if (opacity <= 0.001) return null;
        switch (overlay.kind) {
          case "caption":
            return <Caption key={i} overlay={overlay} opacity={opacity} />;
          case "math":
            return <MathOverlay key={i} overlay={overlay} opacity={opacity} />;
          case "label":
            return <LabelOverlay key={i} overlay={overlay} opacity={opacity} />;
          case "callout":
            return (
              <CalloutOverlay key={i} overlay={overlay} opacity={opacity} />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
